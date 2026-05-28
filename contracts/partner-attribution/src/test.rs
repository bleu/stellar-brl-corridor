#![cfg(test)]
use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env, Symbol,
};

/// Register the contract over a real Stellar Asset Contract (the USDC SAC
/// archetype), funding a payer with 100 USDC. Returns the env, contract client,
/// the funded payer `from`, and the SEP-41 token client for balance assertions.
fn setup() -> (
    Env,
    PartnerAttributionClient<'static>,
    Address,
    TokenClient<'static>,
) {
    let env = Env::default();
    // The SAC `transfer` from `from` is a sub-invocation under settle_split, so
    // its auth is not tied to the root call — allow non-root auth in tests.
    env.mock_all_auths_allowing_non_root_auth();
    let admin = Address::generate(&env);

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let sac_addr = sac.address();
    let sac_admin = StellarAssetClient::new(&env, &sac_addr);
    let token = TokenClient::new(&env, &sac_addr);

    let id = env.register(PartnerAttribution, (admin, sac_addr.clone()));
    let client = PartnerAttributionClient::new(&env, &id);

    let from = Address::generate(&env);
    sac_admin.mint(&from, &1_000_000_000); // 100 USDC (7dp) to the payer

    (env, client, from, token)
}

fn dom(env: &Env) -> Symbol {
    Symbol::new(env, "acct_xyz")
}

// ---- Σ bps ≤ 10_000 invariant + partner registry (admin-gated) ----

#[test]
fn set_partners_and_track_total() {
    let (env, c, _, _) = setup();
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    c.set_partner(&p1, &3000, &p1, &dom(&env));
    c.set_partner(&p2, &5000, &p2, &dom(&env));
    assert_eq!(c.total_bps(), 8000);
    assert_eq!(c.get_partner(&p1).unwrap().fee_bps, 3000);
}

#[test]
fn cannot_exceed_100_percent() {
    let (env, c, _, _) = setup();
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    let p3 = Address::generate(&env);
    c.set_partner(&p1, &3000, &p1, &dom(&env));
    c.set_partner(&p2, &5000, &p2, &dom(&env));

    let err = c
        .try_set_partner(&p3, &3000, &p3, &dom(&env))
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::BpsCapExceeded);
    assert_eq!(c.total_bps(), 8000); // unchanged
}

#[test]
fn updating_a_partner_recomputes_total() {
    let (env, c, _, _) = setup();
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    c.set_partner(&p1, &6000, &p1, &dom(&env));
    c.set_partner(&p2, &4000, &p2, &dom(&env));
    assert_eq!(c.total_bps(), 10000);

    c.set_partner(&p1, &2000, &p1, &dom(&env));
    assert_eq!(c.total_bps(), 6000);
}

#[test]
fn single_partner_over_cap_rejected() {
    let (env, c, _, _) = setup();
    let p1 = Address::generate(&env);
    let err = c
        .try_set_partner(&p1, &10001, &p1, &dom(&env))
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::BpsCapExceeded);
}

#[test]
fn freeing_room_then_adding_third_partner_succeeds() {
    let (env, c, _, _) = setup();
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    let p3 = Address::generate(&env);
    c.set_partner(&p1, &6000, &p1, &dom(&env));
    c.set_partner(&p2, &4000, &p2, &dom(&env));
    assert_eq!(c.total_bps(), 10000);

    assert_eq!(
        c.try_set_partner(&p3, &1000, &p3, &dom(&env))
            .err()
            .unwrap()
            .unwrap(),
        Error::BpsCapExceeded
    );

    c.set_partner(&p1, &5000, &p1, &dom(&env));
    c.set_partner(&p3, &1000, &p3, &dom(&env));
    assert_eq!(c.total_bps(), 10000);
    assert_eq!(c.get_partner(&p3).unwrap().fee_bps, 1000);
}

#[test]
fn remove_partner_frees_bps() {
    let (env, c, _, _) = setup();
    let p1 = Address::generate(&env);
    c.set_partner(&p1, &7000, &p1, &dom(&env));
    assert_eq!(c.total_bps(), 7000);
    c.remove_partner(&p1);
    assert_eq!(c.total_bps(), 0);
    assert!(c.get_partner(&p1).is_none());
}

// ---- Real SAC transfer split (the composition under test) ----

#[test]
fn settle_split_moves_real_balance_to_partners() {
    let (env, c, from, token) = setup();
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    c.set_partner(&p1, &3000, &p1, &dom(&env)); // 30%
    c.set_partner(&p2, &2000, &p2, &dom(&env)); // 20%

    let amount = 100_000_000i128; // 10 USDC
    let total_paid = c.settle_split(
        &from,
        &amount,
        &vec![&env, p1.clone(), p2.clone()],
        &BytesN::from_array(&env, &[7u8; 32]),
    );

    // 30% + 20% of 10 USDC = 3 + 2 = 5 USDC moved; residual stays with `from`.
    assert_eq!(token.balance(&p1), 30_000_000); // 3 USDC
    assert_eq!(token.balance(&p2), 20_000_000); // 2 USDC
    assert_eq!(total_paid, 50_000_000); // 5 USDC
    assert_eq!(token.balance(&from), 1_000_000_000 - 50_000_000); // residual
}

#[test]
fn settle_split_with_unknown_partner_reverts_atomically() {
    let (env, c, from, token) = setup();
    let p1 = Address::generate(&env);
    let ghost = Address::generate(&env);
    c.set_partner(&p1, &3000, &p1, &dom(&env));

    let before = token.balance(&from);
    let err = c
        .try_settle_split(
            &from,
            &100_000_000,
            &vec![&env, p1.clone(), ghost.clone()],
            &BytesN::from_array(&env, &[1u8; 32]),
        )
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::PartnerNotFound);
    // Atomic: no balance moved because the whole invocation reverted.
    assert_eq!(token.balance(&from), before);
    assert_eq!(token.balance(&p1), 0);
}

#[test]
fn settle_split_rejects_combined_bps_over_100() {
    let (env, c, from, _token) = setup();
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    c.set_partner(&p1, &6000, &p1, &dom(&env));
    c.set_partner(&p2, &4000, &p2, &dom(&env));
    // Listing p1 twice double-counts to 12000 > 10000 — rejected by the
    // per-call running cap (defense in depth on the registry invariant).
    let err = c
        .try_settle_split(
            &from,
            &100_000_000,
            &vec![&env, p1.clone(), p2.clone(), p1.clone()],
            &BytesN::from_array(&env, &[2u8; 32]),
        )
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::SplitExceedsTotal);
}

#[test]
fn settle_split_rejects_nonpositive_amount() {
    let (env, c, from, _token) = setup();
    let p1 = Address::generate(&env);
    c.set_partner(&p1, &3000, &p1, &dom(&env));
    let tx = BytesN::from_array(&env, &[3u8; 32]);
    assert_eq!(
        c.try_settle_split(&from, &0, &vec![&env, p1.clone()], &tx)
            .err()
            .unwrap()
            .unwrap(),
        Error::InvalidAmount
    );
}

#[test]
fn sac_address_is_the_wrapped_usdc() {
    let (_env, c, _from, token) = setup();
    assert_eq!(c.sac_address(), token.address);
}
