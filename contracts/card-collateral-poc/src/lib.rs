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
//! Off the audit/mainnet critical path. The production vault composes
//! OpenZeppelin's `stellar_accounts::smart_account::SmartAccount`
//! (`CustomAccountInterface` via `do_check_auth`) with `policies::spending_limit`,
//! `verifiers::webauthn`/`ed25519`, and `pausable`; this PoC owns the collateral
//! state machine and the shortfall accounting.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
};

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
    Admin,
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
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Reserve collateral at card authorization. Admin-authenticated
    /// (the issuer adapter, on an auth webhook).
    pub fn reserve(
        env: Env,
        auth_id: BytesN<32>,
        amount: i128,
        ttl_ledgers: u32,
    ) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();
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
    pub fn settle(env: Env, auth_id: BytesN<32>, final_amount: i128) -> Result<i128, Error> {
        Self::admin(&env)?.require_auth();
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
    pub fn release(env: Env, auth_id: BytesN<32>) -> Result<i128, Error> {
        Self::admin(&env)?.require_auth();
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

    fn admin(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }
}

#[cfg(test)]
mod test;
