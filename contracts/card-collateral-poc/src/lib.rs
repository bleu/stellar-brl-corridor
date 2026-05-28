//! Bleu — Card-Collateral Smart Account (TESTNET PoC).
//!
//! Demonstrates a capability Stellar enables and EVM card stacks do not: native
//! USDC collateral can stay productive while an account policy releases only the
//! spent slice at card authorization. This PoC models the collateral lifecycle —
//! `reserve` at authorization, `settle` at clearing, `release` of the unused
//! remainder — and the auth/clearing **shortfall** race that real card programs
//! (Monavate/Gnosis Pay archetype) concede.
//!
//! Yield, where present, accrues on **USDC** collateral via a yield position
//! underneath the vault — **never on XLM**. Nothing here offers, promotes, or
//! implies any interest, dividend, yield, or return on XLM.
//!
//! TESTNET PoC — off the audit/mainnet critical path. It composes the OZ
//! `stellar-contracts` (=0.7.1) building blocks that fit a collateral state
//! machine without inflating the audit surface:
//!
//! - `stellar_contract_utils::pausable` — an audited circuit breaker. `reserve`
//!   (taking on new collateral) is gated `#[when_not_paused]`; `settle`/`release`
//!   stay available so an emergency pause can wind down open authorizations.
//! - `stellar_access::access_control` (+ `stellar_macros::only_admin`) — gates
//!   every collateral op and the pause controls behind the admin's auth.
//!
//! The full account-abstraction stack — `stellar_accounts::smart_account`
//! (`CustomAccountInterface`/`do_check_auth`), `policies::spending_limit`, and
//! `verifiers::webauthn`/`ed25519` — is the production-vault target. It is
//! deliberately NOT wired into this PoC: that machinery is far larger than the
//! collateral state machine it would wrap, and folding it in here would invert
//! the "small, tight audit surface" thesis. This module keeps the novel
//! surface: the reserve/settle/release lifecycle and the shortfall accounting.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    Symbol, Vec,
};
use stellar_access::access_control::{self as access_control, AccessControl};
use stellar_contract_utils::pausable::{self as pausable, Pausable};
use stellar_macros::{only_admin, when_not_paused};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AuthNotFound = 2,
    AuthAlreadyExists = 3,
    InvalidAmount = 4,
    Overflow = 5,
}

/// Collateral state for a single card authorization.
/// Invariant in the normal path: `settled <= locked`; a `settle` that breaches
/// it is a shortfall (emitted as an event, debited on next top-up off-chain).
#[contracttype]
#[derive(Clone)]
pub struct CardLock {
    pub authorized: i128,
    pub locked: i128,
    pub settled: i128,
    pub expires_at_ledger: u32,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Lock(BytesN<32>),
}

/// Emitted when collateral is reserved at authorization. Topic:
/// `collateral_locked`, auth_id.
#[contractevent]
pub struct CollateralLocked {
    #[topic]
    pub auth_id: BytesN<32>,
    pub amount: i128,
    pub expires_at_ledger: u32,
}

/// Emitted when an authorization clears. Topic: `card_settle`, auth_id.
#[contractevent]
pub struct CardSettle {
    #[topic]
    pub auth_id: BytesN<32>,
    pub final_amount: i128,
    pub settled: i128,
}

/// Emitted when clearing exceeds locked collateral (auth/clearing race). Topic:
/// `shortfall`, auth_id.
#[contractevent]
pub struct Shortfall {
    #[topic]
    pub auth_id: BytesN<32>,
    pub shortfall: i128,
}

/// Emitted when the unused remainder is released and the auth closes. Topic:
/// `collateral_released`, auth_id.
#[contractevent]
pub struct CollateralReleased {
    #[topic]
    pub auth_id: BytesN<32>,
    pub returned: i128,
}

#[contract]
pub struct CardCollateral;

#[contractimpl]
impl CardCollateral {
    /// Initialize with the admin (the issuer adapter / business server) that may
    /// reserve, settle, release, and pause. Admin gating is delegated to OZ
    /// access control; the contract starts unpaused.
    pub fn __constructor(env: Env, admin: Address) {
        access_control::set_admin(&env, &admin);
    }

    /// Reserve collateral at card authorization. Admin-gated via OZ access
    /// control (the issuer adapter, on an auth webhook). Blocked while paused —
    /// the circuit breaker stops the vault from taking on new collateral.
    #[only_admin]
    #[when_not_paused]
    pub fn reserve(
        env: Env,
        auth_id: BytesN<32>,
        amount: i128,
        ttl_ledgers: u32,
    ) -> Result<(), Error> {
        if amount <= 0 || ttl_ledgers == 0 {
            return Err(Error::InvalidAmount);
        }
        let key = DataKey::Lock(auth_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AuthAlreadyExists);
        }
        let expires_at_ledger = env
            .ledger()
            .sequence()
            .checked_add(ttl_ledgers)
            .ok_or(Error::Overflow)?;
        env.storage().persistent().set(
            &key,
            &CardLock {
                authorized: amount,
                locked: amount,
                settled: 0,
                expires_at_ledger,
            },
        );
        CollateralLocked {
            auth_id,
            amount,
            expires_at_ledger,
        }
        .publish(&env);
        Ok(())
    }

    /// Settle (clear) an authorization. Returns the shortfall amount (0 if the
    /// clearing was fully covered by locked collateral). A positive return means
    /// settlement exceeded locked collateral — the auth/clearing race — and a
    /// `shortfall` event is emitted for off-chain top-up reconciliation.
    /// Admin-gated via OZ access control; stays available while paused so open
    /// authorizations can be wound down.
    #[only_admin]
    pub fn settle(env: Env, auth_id: BytesN<32>, final_amount: i128) -> Result<i128, Error> {
        if final_amount < 0 {
            return Err(Error::InvalidAmount);
        }
        let key = DataKey::Lock(auth_id.clone());
        let mut lock: CardLock = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::AuthNotFound)?;

        lock.settled = lock
            .settled
            .checked_add(final_amount)
            .ok_or(Error::Overflow)?;
        let shortfall = if lock.settled > lock.locked {
            lock.settled - lock.locked
        } else {
            0
        };
        env.storage().persistent().set(&key, &lock);

        CardSettle {
            auth_id: auth_id.clone(),
            final_amount,
            settled: lock.settled,
        }
        .publish(&env);
        if shortfall > 0 {
            Shortfall { auth_id, shortfall }.publish(&env);
        }
        Ok(shortfall)
    }

    /// Release the unused remainder (`locked − settled`, floored at 0) and close
    /// the authorization. Returns the amount returned to the cardholder.
    /// Admin-gated via OZ access control; stays available while paused so open
    /// authorizations can be wound down.
    #[only_admin]
    pub fn release(env: Env, auth_id: BytesN<32>) -> Result<i128, Error> {
        let key = DataKey::Lock(auth_id.clone());
        let lock: CardLock = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::AuthNotFound)?;

        let returned = if lock.locked > lock.settled {
            lock.locked - lock.settled
        } else {
            0
        };
        env.storage().persistent().remove(&key);
        CollateralReleased { auth_id, returned }.publish(&env);
        Ok(returned)
    }

    pub fn get_lock(env: Env, auth_id: BytesN<32>) -> Option<CardLock> {
        env.storage().persistent().get(&DataKey::Lock(auth_id))
    }
}

// OZ audited pausable circuit breaker. The pause/unpause controls are gated by
// the contract admin via OZ access control; `paused()` is a public query.
#[contractimpl]
impl Pausable for CardCollateral {
    fn paused(e: &Env) -> bool {
        pausable::paused(e)
    }

    #[only_admin]
    fn pause(e: &Env, _caller: Address) {
        pausable::pause(e);
    }

    #[only_admin]
    fn unpause(e: &Env, _caller: Address) {
        pausable::unpause(e);
    }
}

// Expose the audited OZ AccessControl interface (grant/revoke roles, admin
// transfer, queries) so role administration is on-chain and standard.
#[contractimpl(contracttrait)]
impl AccessControl for CardCollateral {}

#[cfg(test)]
mod test;
