//! Bleu — SEP-38 Rate-Lock.
//!
//! Locks SEP-38 firm quotes on-chain so a quoted BRL↔USDC rate is honored for a
//! bounded window and cannot be silently re-priced or double-settled.
//!
//! Each quote row lives in Temporary storage (CAP-46-12) keyed by the SEP-38
//! `quote_id` hash; Temporary entries are deleted at TTL, so an expired quote
//! disappears by construction — no stale-quote risk, no sweeper. On lock we
//! re-derive the SEP-38 price relation `(sell − fee) == price · buy` in
//! fixed-point and trap on mismatch, so a malformed quote can never be stored.
//! `consume_quote` is guarded by ledger-sequence expiry plus a one-shot
//! `consumed` flag, preventing replay/double-settlement.
//!
//! IOF (Decreto 6.306/2007) rides along as a disclosed `fee_iof` field; the
//! licensed anchor collects it at conversion — this contract only discloses it
//! and binds it to the locked rate.
//!
//! In production the lock lifecycle composes OpenZeppelin's audited
//! `stellar_fee_abstraction::validate_expiration_ledger` ledger-sequence
//! pattern; this module owns the SEP-38 quote hashing + Temporary lifecycle.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
};

/// Fixed-point scale for `price` (7 dp, matching Stellar asset precision).
const PRICE_SCALE: i128 = 10_000_000;

/// Ledgers an entry outlives its logical expiry before storage GC removes it.
/// The `expires_at_ledger` guard — not storage deletion — is the source of
/// truth for "expired"; the grace keeps the entry readable long enough to
/// return a precise `QuoteExpired` instead of a bare `QuoteNotFound`.
const EXPIRY_GRACE_LEDGERS: u32 = 60;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    QuoteNotFound = 3,
    QuoteExpired = 4,
    QuoteAlreadyConsumed = 5,
    PriceInvariantViolated = 6,
    InvalidExpiry = 7,
    InvalidAmount = 8,
    Overflow = 9,
}

/// A locked SEP-38 firm quote. Amounts are in each asset's minor units
/// (USDC: 7 dp stroops; BRL: 2 dp centavos). `price` is `sell-per-buy` scaled
/// by `PRICE_SCALE`.
#[contracttype]
#[derive(Clone)]
pub struct Quote {
    pub sell_amount: i128,
    pub buy_amount: i128,
    pub price: i128,
    pub fee_iof: i128,
    pub expires_at_ledger: u32,
    pub consumed: bool,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Quote(BytesN<32>),
}

/// Emitted when a firm quote is locked. Topic: `quote_locked`, `quote_id`.
#[contractevent]
pub struct QuoteLocked {
    #[topic]
    pub quote_id: BytesN<32>,
    pub expires_at_ledger: u32,
    pub fee_iof: i128,
}

/// Emitted when a quote is consumed at settlement. Topic: `quote_use`,
/// `quote_id`, `sep31_tx_id`.
#[contractevent]
pub struct QuoteUse {
    #[topic]
    pub quote_id: BytesN<32>,
    #[topic]
    pub sep31_tx_id: BytesN<32>,
    pub price: i128,
    pub fee_iof: i128,
}

#[contract]
pub struct RateLock;

#[contractimpl]
impl RateLock {
    /// Initialize with the admin (the anchor's business server) that may lock
    /// and consume quotes.
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Lock a firm quote until `now + ttl_ledgers`. Admin-authenticated.
    ///
    /// Stores the quote in Temporary storage and re-derives the SEP-38 price
    /// relation before persisting; an inconsistent quote traps.
    pub fn lock_quote(
        env: Env,
        quote_id: BytesN<32>,
        sell_amount: i128,
        buy_amount: i128,
        price: i128,
        fee_iof: i128,
        ttl_ledgers: u32,
    ) -> Result<u32, Error> {
        Self::admin(&env)?.require_auth();

        if sell_amount <= 0 || buy_amount <= 0 || price <= 0 || fee_iof < 0 {
            return Err(Error::InvalidAmount);
        }
        if ttl_ledgers == 0 {
            return Err(Error::InvalidExpiry);
        }
        Self::check_price_invariant(sell_amount, buy_amount, price, fee_iof)?;

        let expires_at_ledger = env
            .ledger()
            .sequence()
            .checked_add(ttl_ledgers)
            .ok_or(Error::Overflow)?;

        let quote = Quote {
            sell_amount,
            buy_amount,
            price,
            fee_iof,
            expires_at_ledger,
            consumed: false,
        };

        let key = DataKey::Quote(quote_id.clone());
        let store = env.storage().temporary();
        store.set(&key, &quote);
        // Live across the lock window + a short grace, so the explicit expiry
        // guard (not storage GC) decides validity; the entry is reclaimed after.
        let live = ttl_ledgers.saturating_add(EXPIRY_GRACE_LEDGERS);
        store.extend_ttl(&key, live, live);

        QuoteLocked {
            quote_id,
            expires_at_ledger,
            fee_iof,
        }
        .publish(&env);
        Ok(expires_at_ledger)
    }

    /// Consume a locked quote at settlement, binding it to a SEP-31 transaction.
    /// Fails if the quote is missing, expired, or already consumed.
    pub fn consume_quote(
        env: Env,
        quote_id: BytesN<32>,
        sep31_tx_id: BytesN<32>,
    ) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();

        let key = DataKey::Quote(quote_id.clone());
        let mut quote: Quote = env
            .storage()
            .temporary()
            .get(&key)
            .ok_or(Error::QuoteNotFound)?;

        if env.ledger().sequence() >= quote.expires_at_ledger {
            return Err(Error::QuoteExpired);
        }
        if quote.consumed {
            return Err(Error::QuoteAlreadyConsumed);
        }

        quote.consumed = true;
        env.storage().temporary().set(&key, &quote);

        QuoteUse {
            quote_id,
            sep31_tx_id,
            price: quote.price,
            fee_iof: quote.fee_iof,
        }
        .publish(&env);
        Ok(())
    }

    /// Read a quote if it still exists (returns `None` once it has expired out
    /// of Temporary storage).
    pub fn get_quote(env: Env, quote_id: BytesN<32>) -> Option<Quote> {
        env.storage().temporary().get(&DataKey::Quote(quote_id))
    }

    /// True if the quote exists, is unconsumed, and has not expired.
    pub fn is_active(env: Env, quote_id: BytesN<32>) -> bool {
        match env
            .storage()
            .temporary()
            .get::<_, Quote>(&DataKey::Quote(quote_id))
        {
            Some(q) => !q.consumed && env.ledger().sequence() < q.expires_at_ledger,
            None => false,
        }
    }

    fn admin(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    /// SEP-38 §Price Formulas: `sell_amount − fee == price · buy_amount`,
    /// evaluated in `PRICE_SCALE` fixed-point. Traps on mismatch or overflow.
    fn check_price_invariant(
        sell_amount: i128,
        buy_amount: i128,
        price: i128,
        fee_iof: i128,
    ) -> Result<(), Error> {
        let net = sell_amount.checked_sub(fee_iof).ok_or(Error::Overflow)?;
        let lhs = net.checked_mul(PRICE_SCALE).ok_or(Error::Overflow)?;
        let rhs = price.checked_mul(buy_amount).ok_or(Error::Overflow)?;
        if lhs != rhs {
            return Err(Error::PriceInvariantViolated);
        }
        Ok(())
    }
}

#[cfg(test)]
mod test;
