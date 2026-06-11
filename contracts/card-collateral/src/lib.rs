//! Bleu — Lien-aware Card-Collateral (production vault).
//!
//! Extends the testnet PoC state machine (`reserve` / `settle` / `release` /
//! `get_lock`) so that every lock has an owner and the contract maintains a
//! per-user **lien** aggregate. `reserve(user, auth_id, amount)` records the
//! lien without moving tokens; `settle` and `release` reduce it.
//! `get_locked_total(user)` exposes the aggregate as a single O(1) read so the
//! smart account and the issuer adapter never enumerate per-auth locks.
//!
//! Shortfall semantics are unchanged from the PoC: cumulative settles beyond
//! the locked amount emit the shortfall event; capping the actual debit is
//! downstream work (adapter debit module). The PoC contract stays untouched
//! and off the audit path.

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

/// Collateral state for a single card authorization, owned by `owner`.
/// Invariant in the normal path: `settled <= locked`; a `settle` that breaches
/// it is a shortfall (emitted as an event, debited downstream).
#[contracttype]
#[derive(Clone)]
pub struct CardLock {
    pub owner: Address,
    pub authorized: i128,
    pub locked: i128,
    pub settled: i128,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Lock(BytesN<32>),
    LockedTotal(Address),
}

/// Emitted when collateral is reserved at authorization. Topics:
/// `collateral_locked`, auth_id, owner.
#[contractevent]
pub struct CollateralLocked {
    #[topic]
    pub auth_id: BytesN<32>,
    #[topic]
    pub owner: Address,
    pub amount: i128,
}

/// Emitted when an authorization clears. Topics: `card_settle`, auth_id, owner.
#[contractevent]
pub struct CardSettle {
    #[topic]
    pub auth_id: BytesN<32>,
    #[topic]
    pub owner: Address,
    pub final_amount: i128,
    pub settled: i128,
}

/// Emitted when clearing exceeds locked collateral (auth/clearing race).
/// Topics: `shortfall`, auth_id, owner.
#[contractevent]
pub struct Shortfall {
    #[topic]
    pub auth_id: BytesN<32>,
    #[topic]
    pub owner: Address,
    pub shortfall: i128,
}

/// Emitted when the unused remainder is released and the auth closes. Topics:
/// `collateral_released`, auth_id, owner.
#[contractevent]
pub struct CollateralReleased {
    #[topic]
    pub auth_id: BytesN<32>,
    #[topic]
    pub owner: Address,
    pub returned: i128,
}

/// A lock's live contribution to its owner's lien: `max(0, locked − settled)`.
fn remaining(lock: &CardLock) -> i128 {
    if lock.locked > lock.settled {
        lock.locked - lock.settled
    } else {
        0
    }
}

/// Shrink `owner`'s lien aggregate by `by`. Callers pass the change in a
/// lock's `remaining` contribution, which is never larger than the aggregate,
/// so the result stays >= 0.
fn reduce_lien(env: &Env, owner: &Address, by: i128) {
    let key = DataKey::LockedTotal(owner.clone());
    let total: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    env.storage().persistent().set(&key, &(total - by));
}

#[contract]
pub struct CardCollateral;

#[contractimpl]
impl CardCollateral {
    pub fn __constructor(env: Env, admin: Address) {
        access_control::set_admin(&env, &admin);
    }

    /// Reserve collateral at card authorization for `user`. Records the lien
    /// (no token movement): the lock is stored under `auth_id` with `user` as
    /// owner, and `locked_total(user)` grows by `amount`.
    #[only_admin]
    #[when_not_paused]
    pub fn reserve(
        env: Env,
        user: Address,
        auth_id: BytesN<32>,
        amount: i128,
    ) -> Result<(), Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let key = DataKey::Lock(auth_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AuthAlreadyExists);
        }
        env.storage().persistent().set(
            &key,
            &CardLock {
                owner: user.clone(),
                authorized: amount,
                locked: amount,
                settled: 0,
            },
        );
        let total_key = DataKey::LockedTotal(user.clone());
        let total: i128 = env.storage().persistent().get(&total_key).unwrap_or(0);
        let total = total.checked_add(amount).ok_or(Error::Overflow)?;
        env.storage().persistent().set(&total_key, &total);

        CollateralLocked {
            auth_id,
            owner: user,
            amount,
        }
        .publish(&env);
        Ok(())
    }

    /// Settle (clear) an authorization. Returns the shortfall amount (0 if the
    /// clearing was fully covered by locked collateral). The owner's lien
    /// shrinks by the covered part of the clearing: the lock's contribution to
    /// `locked_total` is always `max(0, locked − settled)`.
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

        let remaining_before = remaining(&lock);
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

        reduce_lien(&env, &lock.owner, remaining_before - remaining(&lock));

        CardSettle {
            auth_id: auth_id.clone(),
            owner: lock.owner.clone(),
            final_amount,
            settled: lock.settled,
        }
        .publish(&env);
        if shortfall > 0 {
            Shortfall {
                auth_id,
                owner: lock.owner,
                shortfall,
            }
            .publish(&env);
        }
        Ok(shortfall)
    }

    /// Release the unused remainder (`locked − settled`, floored at 0) and
    /// close the authorization. The owner's lien shrinks by the same amount.
    /// Returns the amount returned to the cardholder.
    #[only_admin]
    pub fn release(env: Env, auth_id: BytesN<32>) -> Result<i128, Error> {
        let key = DataKey::Lock(auth_id.clone());
        let lock: CardLock = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::AuthNotFound)?;

        let returned = remaining(&lock);
        env.storage().persistent().remove(&key);

        reduce_lien(&env, &lock.owner, returned);

        CollateralReleased {
            auth_id,
            owner: lock.owner,
            returned,
        }
        .publish(&env);
        Ok(returned)
    }

    pub fn get_lock(env: Env, auth_id: BytesN<32>) -> Option<CardLock> {
        env.storage().persistent().get(&DataKey::Lock(auth_id))
    }

    /// The user's lien: total collateral currently locked across their open
    /// authorizations, as a single O(1) read.
    pub fn get_locked_total(env: Env, user: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::LockedTotal(user))
            .unwrap_or(0)
    }
}

// OZ audited pausable circuit breaker. `reserve` (taking on new collateral) is
// gated `#[when_not_paused]`; `settle`/`release` stay available so an emergency
// pause can wind down open authorizations. Controls are admin-gated.
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
