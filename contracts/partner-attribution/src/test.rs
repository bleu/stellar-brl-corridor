#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, Symbol};

fn setup() -> (Env, PartnerAttributionClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let id = env.register(PartnerAttribution, (admin,));
    (env.clone(), PartnerAttributionClient::new(&env, &id))
}

#[test]
fn set_partners_and_track_total() {
    let (env, c) = setup();
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    let dom = Symbol::new(&env, "acct_xyz");

    c.set_partner(&p1, &3000, &p1, &dom);
    c.set_partner(&p2, &5000, &p2, &dom);
    assert_eq!(c.total_bps(), 8000);
    assert_eq!(c.get_partner(&p1).unwrap().fee_bps, 3000);
}

#[test]
fn cannot_exceed_100_percent() {
    let (env, c) = setup();
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    let p3 = Address::generate(&env);
    let dom = Symbol::new(&env, "d");
    c.set_partner(&p1, &3000, &p1, &dom);
    c.set_partner(&p2, &5000, &p2, &dom);

    let err = c
        .try_set_partner(&p3, &3000, &p3, &dom)
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::BpsCapExceeded);
    assert_eq!(c.total_bps(), 8000); // unchanged
}

#[test]
fn updating_a_partner_recomputes_total() {
    let (env, c) = setup();
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    let dom = Symbol::new(&env, "d");
    c.set_partner(&p1, &6000, &p1, &dom);
    c.set_partner(&p2, &4000, &p2, &dom);
    assert_eq!(c.total_bps(), 10000);

    // Lower p1 to free room, then a previously-impossible write succeeds.
    c.set_partner(&p1, &2000, &p1, &dom);
    assert_eq!(c.total_bps(), 6000);
}

#[test]
fn single_partner_over_cap_rejected() {
    let (env, c) = setup();
    let p1 = Address::generate(&env);
    let dom = Symbol::new(&env, "d");
    let err = c
        .try_set_partner(&p1, &10001, &p1, &dom)
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::BpsCapExceeded);
}

#[test]
fn record_attribution_computes_fee() {
    let (env, c) = setup();
    let p1 = Address::generate(&env);
    let asset = Address::generate(&env);
    let dom = Symbol::new(&env, "d");
    c.set_partner(&p1, &3000, &p1, &dom); // 30%

    let fee = c.record_attribution(
        &p1,
        &asset,
        &1_000_000_000,
        &BytesN::from_array(&env, &[7u8; 32]),
    );
    assert_eq!(fee, 300_000_000); // 30% of 1.0 USDC-billion units
}

#[test]
fn attribution_for_unknown_partner_fails() {
    let (env, c) = setup();
    let ghost = Address::generate(&env);
    let asset = Address::generate(&env);
    let err = c
        .try_record_attribution(&ghost, &asset, &100, &BytesN::from_array(&env, &[1u8; 32]))
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::PartnerNotFound);
}

#[test]
fn remove_partner_frees_bps() {
    let (env, c) = setup();
    let p1 = Address::generate(&env);
    let dom = Symbol::new(&env, "d");
    c.set_partner(&p1, &7000, &p1, &dom);
    assert_eq!(c.total_bps(), 7000);
    c.remove_partner(&p1);
    assert_eq!(c.total_bps(), 0);
    assert!(c.get_partner(&p1).is_none());
}
