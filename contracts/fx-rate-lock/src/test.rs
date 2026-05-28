#![cfg(test)]
use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, BytesN, Env,
};

fn setup() -> (Env, RateLockClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let id = env.register(RateLock, (admin.clone(),));
    (env.clone(), RateLockClient::new(&env, &id), admin)
}

fn qid(env: &Env, b: u8) -> BytesN<32> {
    BytesN::from_array(env, &[b; 32])
}

// A consistent quote satisfying  (sell - fee) * PRICE_SCALE == price * buy.
// sell 100.0000000 USDC, fee 3.5 USDC IOF => net 96.5 USDC; buy 500.00 BRL.
//   price = net * 1e7 / buy = 965_000_000 * 1e7 / 50_000 = 193_000_000_000.
fn consistent() -> (i128, i128, i128, i128) {
    let sell = 1_000_000_000i128; // 100.0 USDC (7dp)
    let fee = 35_000_000i128; //   3.5 USDC IOF (7dp)
    let buy = 50_000i128; // 500.00 BRL (2dp)
    let price = 193_000_000_000i128; // net * PRICE_SCALE / buy
    (sell, buy, price, fee)
}

#[test]
fn lock_then_consume_happy_path() {
    let (env, c, _admin) = setup();
    let (sell, buy, price, fee) = consistent();
    let id = qid(&env, 1);

    let expires = c.lock_quote(&id, &sell, &buy, &price, &fee, &180);
    assert_eq!(expires, env.ledger().sequence() + 180);
    assert!(c.is_active(&id));

    let q = c.get_quote(&id).unwrap();
    assert_eq!(q.sell_amount, sell);
    assert_eq!(q.fee_iof, fee);
    assert!(!q.consumed);

    c.consume_quote(&id, &qid(&env, 99));
    assert!(!c.is_active(&id)); // consumed
    assert!(c.get_quote(&id).unwrap().consumed);
}

#[test]
fn double_consume_is_rejected() {
    let (env, c, _admin) = setup();
    let (sell, buy, price, fee) = consistent();
    let id = qid(&env, 2);
    c.lock_quote(&id, &sell, &buy, &price, &fee, &180);
    c.consume_quote(&id, &qid(&env, 98));

    let err = c
        .try_consume_quote(&id, &qid(&env, 97))
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::QuoteAlreadyConsumed);
}

#[test]
fn expired_quote_cannot_be_consumed() {
    let (env, c, _admin) = setup();
    let (sell, buy, price, fee) = consistent();
    let id = qid(&env, 3);
    let expires = c.lock_quote(&id, &sell, &buy, &price, &fee, &180);

    env.ledger().set_sequence_number(expires + 1);

    let err = c
        .try_consume_quote(&id, &qid(&env, 96))
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::QuoteExpired);
    assert!(!c.is_active(&id));
}

#[test]
fn malformed_quote_traps_on_price_invariant() {
    let (env, c, _admin) = setup();
    let (sell, buy, price, fee) = consistent();
    let id = qid(&env, 4);
    // Bump price by 1 so (sell-fee)*scale != price*buy.
    let err = c
        .try_lock_quote(&id, &sell, &buy, &(price + 1), &fee, &180)
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::PriceInvariantViolated);
    assert!(c.get_quote(&id).is_none());
}

#[test]
fn rejects_nonpositive_amounts_and_zero_ttl() {
    let (env, c, _admin) = setup();
    let (sell, buy, price, fee) = consistent();
    let id = qid(&env, 5);
    assert_eq!(
        c.try_lock_quote(&id, &0, &buy, &price, &fee, &180)
            .err()
            .unwrap()
            .unwrap(),
        Error::InvalidAmount
    );
    assert_eq!(
        c.try_lock_quote(&id, &sell, &buy, &price, &fee, &0)
            .err()
            .unwrap()
            .unwrap(),
        Error::InvalidExpiry
    );
}

#[test]
fn consume_unknown_quote_fails() {
    let (env, c, _admin) = setup();
    let err = c
        .try_consume_quote(&qid(&env, 200), &qid(&env, 1))
        .err()
        .unwrap()
        .unwrap();
    assert_eq!(err, Error::QuoteNotFound);
}
