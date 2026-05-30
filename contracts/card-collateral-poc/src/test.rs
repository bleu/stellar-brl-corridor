#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

fn setup() -> (Env, CardCollateralClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let id = env.register(CardCollateral, (admin,));
    (env.clone(), CardCollateralClient::new(&env, &id))
}

fn aid(env: &Env, b: u8) -> BytesN<32> {
    BytesN::from_array(env, &[b; 32])
}

#[test]
fn reserve_settle_partial_then_release_returns_remainder() {
    let (env, c) = setup();
    let id = aid(&env, 1);
    c.reserve(&id, &100_000_000);

    let shortfall = c.settle(&id, &60_000_000);
    assert_eq!(shortfall, 0);

    let returned = c.release(&id);
    assert_eq!(returned, 40_000_000); // locked 100 - settled 60
    assert!(c.get_lock(&id).is_none());
}

#[test]
fn settlement_exceeding_locked_flags_shortfall() {
    let (env, c) = setup();
    let id = aid(&env, 2);
    c.reserve(&id, &100_000_000);

    // Auth/clearing race: clearing comes in above the locked amount.
    let shortfall = c.settle(&id, &130_000_000);
    assert_eq!(shortfall, 30_000_000);

    // Nothing left to return.
    let returned = c.release(&id);
    assert_eq!(returned, 0);
}

#[test]
fn cumulative_settles_accumulate() {
    let (env, c) = setup();
    let id = aid(&env, 3);
    c.reserve(&id, &100_000_000);
    assert_eq!(c.settle(&id, &40_000_000), 0);
    assert_eq!(c.settle(&id, &40_000_000), 0);
    let lock = c.get_lock(&id).unwrap();
    assert_eq!(lock.settled, 80_000_000);
    assert_eq!(c.release(&id), 20_000_000);
}

#[test]
fn double_reserve_same_auth_rejected() {
    let (env, c) = setup();
    let id = aid(&env, 4);
    c.reserve(&id, &100);
    let err = c.try_reserve(&id, &100).err().unwrap().unwrap();
    assert_eq!(err, Error::AuthAlreadyExists);
}

#[test]
fn settle_or_release_unknown_auth_fails() {
    let (env, c) = setup();
    let id = aid(&env, 9);
    assert_eq!(
        c.try_settle(&id, &10).err().unwrap().unwrap(),
        Error::AuthNotFound
    );
    assert_eq!(
        c.try_release(&id).err().unwrap().unwrap(),
        Error::AuthNotFound
    );
}

#[test]
fn rejects_nonpositive_reserve() {
    let (env, c) = setup();
    let id = aid(&env, 5);
    assert_eq!(
        c.try_reserve(&id, &0).err().unwrap().unwrap(),
        Error::InvalidAmount
    );
}

#[test]
fn settle_rejects_negative_final_amount() {
    let (env, c) = setup();
    let id = aid(&env, 6);
    c.reserve(&id, &100_000_000);
    assert_eq!(
        c.try_settle(&id, &-1).err().unwrap().unwrap(),
        Error::InvalidAmount
    );
}

/// Shortfall invariant: the shortfall reported by `settle` is exactly
/// `max(0, settled − locked)`, and equals `authorized − settled` flipped in
/// sign once settlement exceeds the locked collateral. Verifies the grant's
/// `locked ≥ authorized − settled` framing across the covered + breached cases.
#[test]
fn shortfall_invariant_holds_across_cases() {
    let (env, c) = setup();
    let id = aid(&env, 7);
    let authorized = 100_000_000i128;
    c.reserve(&id, &authorized);

    // Covered: settled < locked => shortfall 0, and locked >= authorized - settled.
    let shortfall = c.settle(&id, &70_000_000);
    assert_eq!(shortfall, 0);
    let lock = c.get_lock(&id).unwrap();
    assert!(lock.locked >= lock.authorized - lock.settled);

    // Breach: cumulative settled now exceeds locked => shortfall = settled - locked.
    let shortfall = c.settle(&id, &50_000_000); // cumulative 120M > 100M locked
    let lock = c.get_lock(&id).unwrap();
    assert_eq!(shortfall, lock.settled - lock.locked);
    assert_eq!(shortfall, 20_000_000);
}

// ---- OZ pausable circuit breaker (composition under test) ----

#[test]
fn pause_blocks_reserve_but_allows_wind_down() {
    let (env, c) = setup();
    let caller = Address::generate(&env);

    // Open an authorization while unpaused.
    let id1 = aid(&env, 30);
    c.reserve(&id1, &100_000_000);
    assert!(!c.paused());

    // Pause: the circuit breaker stops the vault taking on NEW collateral.
    c.pause(&caller);
    assert!(c.paused());
    let id2 = aid(&env, 31);
    let err = c.try_reserve(&id2, &100_000_000);
    assert!(err.is_err(), "reserve must be rejected while paused");

    // ...but open authorizations can still be settled and released to wind down.
    let shortfall = c.settle(&id1, &60_000_000);
    assert_eq!(shortfall, 0);
    let returned = c.release(&id1);
    assert_eq!(returned, 40_000_000);

    // Unpause restores normal operation.
    c.unpause(&caller);
    assert!(!c.paused());
    c.reserve(&id2, &50_000_000);
    assert_eq!(c.get_lock(&id2).unwrap().locked, 50_000_000);
}
