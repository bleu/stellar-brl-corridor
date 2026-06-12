//! Bleu — Delay Module policy contract.
//!
//! Standalone Soroban policy contract implementing the delay queue from
//! ADR-0001: a user-initiated operation (outbound transfer or config change)
//! is queued, becomes executable only after a cooldown, and is void after an
//! execution window. The user may cancel their own pending entries; there is
//! deliberately NO admin or third-party cancellation path — the contract has
//! no admin role at all.
//!
//! Cooldown and expiration are per-instance constructor parameters (ADR-0001
//! defaults: 180 s / 1800 s — supplied at deploy time, never hardcoded here),
//! measured in seconds of ledger time from the moment of queueing. An entry is
//! executable inside `[queued_at + cooldown, queued_at + expiration)`.
//!
//! Every transition emits an event (`entry_queued`, `entry_executed`,
//! `entry_cancelled`, `entry_expired`). The indexer and the issuer adapter
//! compute Spendable from these events, so they are part of the contract's
//! interface: each carries the user, the operation kind (a queued config
//! change counts as a full-balance withdrawal downstream), and the amount.
//! Expiry itself is passive — an entry past its window is void with no
//! transaction — so the `entry_expired` event is emitted by the permissionless
//! `expire` entrypoint, which reaps the dead entry.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address,
    Bytes, Env,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidConfig = 1,
    InvalidAmount = 2,
    EntryNotFound = 3,
    CooldownNotElapsed = 4,
    EntryExpired = 5,
    NotYetExpired = 6,
    Overflow = 7,
}

/// What kind of operation is being delayed. The distinction is part of the
/// event interface: downstream Spendable treats a queued `ConfigChange` as a
/// full-balance withdrawal, while a `Transfer` reduces Spendable by `amount`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OpKind {
    Transfer,
    ConfigChange,
}

/// A pending queue entry. Existence in storage means pending: executed,
/// cancelled, and expired entries are removed, and the emitted events are the
/// history of record.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Entry {
    pub user: Address,
    pub kind: OpKind,
    /// Transfer amount in the asset's minor units; 0 for config changes.
    pub amount: i128,
    /// Opaque operation data for the executing smart account; this policy
    /// contract never interprets it.
    pub payload: Bytes,
    /// First ledger timestamp (inclusive) at which `execute` is permitted.
    pub executable_at: u64,
    /// Ledger timestamp (exclusive) from which the entry is void.
    pub expires_at: u64,
}

/// Per-instance delay policy, fixed at construction.
#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub cooldown_secs: u64,
    pub expiration_secs: u64,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Config,
    NextId,
    Entry(u64),
}

/// Emitted when a user queues an operation. Topics: `entry_queued`, `id`,
/// `user`. Carries everything the indexer needs to subtract the entry from
/// Spendable without an extra read.
#[contractevent]
pub struct EntryQueued {
    #[topic]
    pub id: u64,
    #[topic]
    pub user: Address,
    pub kind: OpKind,
    pub amount: i128,
    pub executable_at: u64,
    pub expires_at: u64,
}

/// Emitted when an entry is executed inside its window. Topics:
/// `entry_executed`, `id`, `user`.
#[contractevent]
pub struct EntryExecuted {
    #[topic]
    pub id: u64,
    #[topic]
    pub user: Address,
    pub kind: OpKind,
    pub amount: i128,
}

/// Emitted when the queuing user cancels their own entry. Topics:
/// `entry_cancelled`, `id`, `user`.
#[contractevent]
pub struct EntryCancelled {
    #[topic]
    pub id: u64,
    #[topic]
    pub user: Address,
    pub kind: OpKind,
    pub amount: i128,
}

/// Emitted when a dead entry is reaped by the permissionless `expire`.
/// Topics: `entry_expired`, `id`, `user`. Note the entry was already void from
/// `expires_at` on — this event marks the reaping, not the moment of expiry,
/// and the indexer must not rely on it to drop entries from the live view.
#[contractevent]
pub struct EntryExpired {
    #[topic]
    pub id: u64,
    #[topic]
    pub user: Address,
    pub kind: OpKind,
    pub amount: i128,
}

#[contract]
pub struct DelayModule;

#[contractimpl]
impl DelayModule {
    /// Deploy with the delay policy: an entry queued at `t` is executable in
    /// `[t + cooldown_secs, t + expiration_secs)`. ADR-0001 defaults are
    /// 180 / 1800 — passed by the deployer, not baked in.
    /// Traps with `InvalidConfig` unless `expiration_secs > cooldown_secs` —
    /// otherwise the execution window `[cooldown, expiration)` is empty and
    /// every entry would be dead on arrival.
    pub fn __constructor(env: Env, cooldown_secs: u64, expiration_secs: u64) {
        if expiration_secs <= cooldown_secs {
            panic_with_error!(&env, Error::InvalidConfig);
        }
        env.storage().instance().set(
            &DataKey::Config,
            &Config {
                cooldown_secs,
                expiration_secs,
            },
        );
    }

    /// Queue an operation for delayed execution, authorized by `user`. The
    /// entry becomes executable at `now + cooldown` and void at
    /// `now + expiration`. Returns the entry id (sequential per instance).
    pub fn queue(
        env: Env,
        user: Address,
        kind: OpKind,
        amount: i128,
        payload: Bytes,
    ) -> Result<u64, Error> {
        user.require_auth();

        // A transfer delays a positive amount; a config change carries none —
        // downstream Spendable already treats it as a full-balance withdrawal.
        let amount_ok = match kind {
            OpKind::Transfer => amount > 0,
            OpKind::ConfigChange => amount == 0,
        };
        if !amount_ok {
            return Err(Error::InvalidAmount);
        }

        let config: Config = env.storage().instance().get(&DataKey::Config).unwrap();
        let now = env.ledger().timestamp();
        let executable_at = now
            .checked_add(config.cooldown_secs)
            .ok_or(Error::Overflow)?;
        let expires_at = now
            .checked_add(config.expiration_secs)
            .ok_or(Error::Overflow)?;

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(0u64);
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        let entry = Entry {
            user: user.clone(),
            kind: kind.clone(),
            amount,
            payload,
            executable_at,
            expires_at,
        };
        env.storage().persistent().set(&DataKey::Entry(id), &entry);

        EntryQueued {
            id,
            user,
            kind,
            amount,
            executable_at,
            expires_at,
        }
        .publish(&env);
        Ok(id)
    }

    /// Execute a pending entry, authorized by its queuing user. Valid only
    /// inside `[executable_at, expires_at)`. Removes the entry and returns it
    /// so the caller (the composing smart account) can act on the payload.
    pub fn execute(env: Env, id: u64) -> Result<Entry, Error> {
        let entry = Self::load_entry(&env, id)?;
        entry.user.require_auth();

        // Execution window is `[executable_at, expires_at)`: the expiry check
        // first, so an entry that is both (mis-configured) reads as expired.
        let now = env.ledger().timestamp();
        if now >= entry.expires_at {
            return Err(Error::EntryExpired);
        }
        if now < entry.executable_at {
            return Err(Error::CooldownNotElapsed);
        }

        env.storage().persistent().remove(&DataKey::Entry(id));
        EntryExecuted {
            id,
            user: entry.user.clone(),
            kind: entry.kind.clone(),
            amount: entry.amount,
        }
        .publish(&env);
        Ok(entry)
    }

    /// Cancel a pending entry. Only the queuing user can authorize this —
    /// there is intentionally no admin or third-party cancellation path.
    pub fn cancel(env: Env, id: u64) -> Result<(), Error> {
        let entry = Self::load_entry(&env, id)?;
        entry.user.require_auth();

        env.storage().persistent().remove(&DataKey::Entry(id));
        EntryCancelled {
            id,
            user: entry.user,
            kind: entry.kind,
            amount: entry.amount,
        }
        .publish(&env);
        Ok(())
    }

    /// Reap an entry whose execution window has passed. Permissionless:
    /// expiry is a fact of time, not a decision, so anyone may emit the
    /// `entry_expired` event and free the storage.
    pub fn expire(env: Env, id: u64) -> Result<(), Error> {
        let entry = Self::load_entry(&env, id)?;

        if env.ledger().timestamp() < entry.expires_at {
            return Err(Error::NotYetExpired);
        }

        env.storage().persistent().remove(&DataKey::Entry(id));
        EntryExpired {
            id,
            user: entry.user,
            kind: entry.kind,
            amount: entry.amount,
        }
        .publish(&env);
        Ok(())
    }

    /// Read a pending entry. `None` once executed, cancelled, or reaped.
    pub fn get_entry(env: Env, id: u64) -> Option<Entry> {
        env.storage().persistent().get(&DataKey::Entry(id))
    }

    /// The configured delay policy.
    pub fn get_config(env: Env) -> Config {
        env.storage().instance().get(&DataKey::Config).unwrap()
    }

    fn load_entry(env: &Env, id: u64) -> Result<Entry, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Entry(id))
            .ok_or(Error::EntryNotFound)
    }
}

#[cfg(test)]
mod test;
