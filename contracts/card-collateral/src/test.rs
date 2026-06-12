#![cfg(test)]
use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    Address, BytesN, Env,
};

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
fn reserve_records_owned_lock_and_lien() {
    let (env, c) = setup();
    let user = Address::generate(&env);
    let id = aid(&env, 1);

    c.reserve(&user, &id, &100_000_000);

    let lock = c.get_lock(&id).unwrap();
    assert_eq!(lock.owner, user);
    assert_eq!(lock.authorized, 100_000_000);
    assert_eq!(lock.locked, 100_000_000);
    assert_eq!(lock.settled, 0);
    assert_eq!(c.get_locked_total(&user), 100_000_000);
}

#[test]
fn settle_reduces_lien_by_cleared_amount() {
    let (env, c) = setup();
    let user = Address::generate(&env);
    let id = aid(&env, 2);
    c.reserve(&user, &id, &100_000_000);

    let shortfall = c.settle(&id, &60_000_000);

    assert_eq!(shortfall, 0);
    assert_eq!(c.get_locked_total(&user), 40_000_000);
}

#[test]
fn release_returns_remainder_and_clears_lien() {
    let (env, c) = setup();
    let user = Address::generate(&env);
    let id = aid(&env, 3);
    c.reserve(&user, &id, &100_000_000);
    c.settle(&id, &60_000_000);

    let returned = c.release(&id);

    assert_eq!(returned, 40_000_000);
    assert!(c.get_lock(&id).is_none());
    assert_eq!(c.get_locked_total(&user), 0);
}

#[test]
fn settlement_exceeding_locked_flags_shortfall_and_floors_lien() {
    let (env, c) = setup();
    let user = Address::generate(&env);
    let id = aid(&env, 4);
    c.reserve(&user, &id, &100_000_000);

    // Auth/clearing race: cumulative settles run past the locked amount.
    assert_eq!(c.settle(&id, &80_000_000), 0);
    let shortfall = c.settle(&id, &50_000_000); // cumulative 130M > 100M locked

    assert_eq!(shortfall, 30_000_000);
    let lock = c.get_lock(&id).unwrap();
    assert_eq!(lock.settled, 130_000_000);
    // The lien never goes negative: the lock's contribution is floored at 0.
    assert_eq!(c.get_locked_total(&user), 0);

    // Nothing left to return; the lien stays at 0 through release.
    assert_eq!(c.release(&id), 0);
    assert_eq!(c.get_locked_total(&user), 0);
}

#[test]
fn breaching_settle_publishes_shortfall_event() {
    let (env, c) = setup();
    let user = Address::generate(&env);
    let id = aid(&env, 5);
    c.reserve(&user, &id, &100_000_000);

    // Covered settle publishes the settle event only.
    c.settle(&id, &60_000_000);
    assert_eq!(env.events().all().events().len(), 1);

    // Breaching settle publishes settle + shortfall.
    c.settle(&id, &70_000_000); // cumulative 130M > 100M locked
    assert_eq!(env.events().all().events().len(), 2);
}

/// Lien invariant: `locked_total(user) = Σ max(0, locked − settled)` over the
/// user's open locks, here across mixed states — untouched, partially settled,
/// and breached (settled > locked).
#[test]
fn lien_equals_sum_of_open_lock_remainders() {
    let (env, c) = setup();
    let user = Address::generate(&env);
    let (a, b, d) = (aid(&env, 10), aid(&env, 11), aid(&env, 12));

    c.reserve(&user, &a, &100_000_000); // untouched: contributes 100M
    c.reserve(&user, &b, &50_000_000);
    c.reserve(&user, &d, &30_000_000);
    assert_eq!(c.get_locked_total(&user), 180_000_000);

    c.settle(&b, &20_000_000); // partial: contributes 30M
    c.settle(&d, &45_000_000); // breached: contributes max(0, 30M-45M) = 0

    let expected: i128 = [&a, &b, &d]
        .iter()
        .map(|id| {
            let lock = c.get_lock(id).unwrap();
            (lock.locked - lock.settled).max(0)
        })
        .sum();
    assert_eq!(expected, 130_000_000);
    assert_eq!(c.get_locked_total(&user), expected);

    // Closing a lock removes exactly its remaining contribution.
    c.release(&b);
    assert_eq!(c.get_locked_total(&user), 100_000_000);
}

#[test]
fn liens_are_isolated_per_user() {
    let (env, c) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    c.reserve(&alice, &aid(&env, 20), &70_000_000);
    c.reserve(&bob, &aid(&env, 21), &10_000_000);
    c.settle(&aid(&env, 21), &10_000_000);

    assert_eq!(c.get_locked_total(&alice), 70_000_000);
    assert_eq!(c.get_locked_total(&bob), 0);
}

#[test]
fn double_reserve_same_auth_rejected_without_touching_lien() {
    let (env, c) = setup();
    let user = Address::generate(&env);
    let id = aid(&env, 30);
    c.reserve(&user, &id, &100);

    let err = c.try_reserve(&user, &id, &100).err().unwrap().unwrap();

    assert_eq!(err, Error::AuthAlreadyExists);
    assert_eq!(c.get_locked_total(&user), 100);
}

#[test]
fn settle_or_release_unknown_auth_fails() {
    let (env, c) = setup();
    let id = aid(&env, 31);
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
fn rejects_nonpositive_reserve_and_negative_settle() {
    let (env, c) = setup();
    let user = Address::generate(&env);
    let id = aid(&env, 32);
    assert_eq!(
        c.try_reserve(&user, &id, &0).err().unwrap().unwrap(),
        Error::InvalidAmount
    );
    c.reserve(&user, &id, &100);
    assert_eq!(
        c.try_settle(&id, &-1).err().unwrap().unwrap(),
        Error::InvalidAmount
    );
    assert_eq!(c.get_locked_total(&user), 100);
}

// ---- OZ pausable circuit breaker (composition under test) ----

#[test]
fn pause_blocks_reserve_but_allows_wind_down() {
    let (env, c) = setup();
    let caller = Address::generate(&env);
    let user = Address::generate(&env);

    let id1 = aid(&env, 40);
    c.reserve(&user, &id1, &100_000_000);
    assert!(!c.paused());

    // Pause: the circuit breaker stops the vault taking on NEW collateral.
    c.pause(&caller);
    assert!(c.paused());
    let id2 = aid(&env, 41);
    assert!(
        c.try_reserve(&user, &id2, &100_000_000).is_err(),
        "reserve must be rejected while paused"
    );

    // ...but open authorizations still settle and release, winding the lien down.
    assert_eq!(c.settle(&id1, &60_000_000), 0);
    assert_eq!(c.release(&id1), 40_000_000);
    assert_eq!(c.get_locked_total(&user), 0);

    c.unpause(&caller);
    c.reserve(&user, &id2, &50_000_000);
    assert_eq!(c.get_locked_total(&user), 50_000_000);
}
