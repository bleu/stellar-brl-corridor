//! Bleu — Partner Attribution & Revenue-Share.
//!
//! Binds distribution partners (accountants, FX operators, fintech channels) to
//! an on-chain revenue split, so B2B2B economics are auditable on the ledger
//! instead of reconciled off-chain. Each settled flow emits a `partner_transfer`
//! event carrying the partner, the asset, the amount, and the attributed fee.
//!
//! Invariant: the sum of all partner basis points can never exceed 10_000
//! (100%). It is enforced on every write via a running `TotalBps` counter, so a
//! mis-configuration can't over-allocate the spread.
//!
//! In production this is a thin layer over OpenZeppelin's audited
//! `stellar_tokens::fungible::sac_admin_wrapper`, composing with USDC's
//! deterministic SAC so wallets still see standard SEP-41 `transfer` events;
//! this module owns the attribution accounting, the `Σ bps ≤ 10_000` invariant,
//! and the `partner_transfer` event added on top of the audited wrapper.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    Symbol,
};

/// 100% in basis points.
const MAX_BPS: u32 = 10_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    PartnerNotFound = 2,
    BpsCapExceeded = 3,
    InvalidAmount = 4,
    Overflow = 5,
}

/// A distribution partner and its share of the incremental spread.
#[contracttype]
#[derive(Clone)]
pub struct Partner {
    pub fee_bps: u32,
    pub payout: Address,
    pub domain: Symbol,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    TotalBps,
    Partner(Address),
}

/// Emitted when a partner is created or updated. Topic: `partner_set`, partner.
#[contractevent]
pub struct PartnerSet {
    #[topic]
    pub partner: Address,
    pub fee_bps: u32,
    pub total_bps: u32,
}

/// Emitted when a partner is removed. Topic: `partner_removed`, partner.
#[contractevent]
pub struct PartnerRemoved {
    #[topic]
    pub partner: Address,
    pub total_bps: u32,
}

/// Emitted at settlement with the attributed revenue split. Topic:
/// `partner_transfer`, partner, anchor_asset.
#[contractevent]
pub struct PartnerTransfer {
    #[topic]
    pub partner: Address,
    #[topic]
    pub anchor_asset: Address,
    pub amount: i128,
    pub fee_bps: u32,
    pub fee: i128,
    pub tx_hash: BytesN<32>,
}

#[contract]
pub struct PartnerAttribution;

#[contractimpl]
impl PartnerAttribution {
    pub fn __constructor(env: Env, admin: Address) {
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::TotalBps, &0u32);
    }

    /// Create or update a partner. Admin-authenticated. Re-derives the running
    /// total and rejects any write that would push `Σ bps` over 100%.
    pub fn set_partner(
        env: Env,
        partner: Address,
        fee_bps: u32,
        payout: Address,
        domain: Symbol,
    ) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();
        if fee_bps > MAX_BPS {
            return Err(Error::BpsCapExceeded);
        }

        let prev = Self::partner(&env, &partner)
            .map(|p| p.fee_bps)
            .unwrap_or(0);
        let total = Self::total_bps(env.clone());
        let new_total = total
            .checked_sub(prev)
            .and_then(|t| t.checked_add(fee_bps))
            .ok_or(Error::Overflow)?;
        if new_total > MAX_BPS {
            return Err(Error::BpsCapExceeded);
        }

        env.storage().persistent().set(
            &DataKey::Partner(partner.clone()),
            &Partner {
                fee_bps,
                payout,
                domain,
            },
        );
        env.storage().instance().set(&DataKey::TotalBps, &new_total);

        PartnerSet {
            partner,
            fee_bps,
            total_bps: new_total,
        }
        .publish(&env);
        Ok(())
    }

    /// Remove a partner and free its basis points. Admin-authenticated.
    pub fn remove_partner(env: Env, partner: Address) -> Result<(), Error> {
        Self::admin(&env)?.require_auth();
        let existing = Self::partner(&env, &partner).ok_or(Error::PartnerNotFound)?;

        let total = Self::total_bps(env.clone());
        let new_total = total.saturating_sub(existing.fee_bps);
        env.storage()
            .persistent()
            .remove(&DataKey::Partner(partner.clone()));
        env.storage().instance().set(&DataKey::TotalBps, &new_total);

        PartnerRemoved {
            partner,
            total_bps: new_total,
        }
        .publish(&env);
        Ok(())
    }

    /// Record an attributed settlement and emit `partner_transfer`. Returns the
    /// fee owed to the partner. Admin-authenticated (called at settlement time).
    pub fn record_attribution(
        env: Env,
        partner: Address,
        anchor_asset: Address,
        amount: i128,
        tx_hash: BytesN<32>,
    ) -> Result<i128, Error> {
        Self::admin(&env)?.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let p = Self::partner(&env, &partner).ok_or(Error::PartnerNotFound)?;

        let fee = amount
            .checked_mul(p.fee_bps as i128)
            .ok_or(Error::Overflow)?
            / MAX_BPS as i128;

        PartnerTransfer {
            partner,
            anchor_asset,
            amount,
            fee_bps: p.fee_bps,
            fee,
            tx_hash,
        }
        .publish(&env);
        Ok(fee)
    }

    pub fn get_partner(env: Env, partner: Address) -> Option<Partner> {
        Self::partner(&env, &partner)
    }

    pub fn total_bps(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::TotalBps)
            .unwrap_or(0)
    }

    fn admin(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    fn partner(env: &Env, partner: &Address) -> Option<Partner> {
        env.storage()
            .persistent()
            .get(&DataKey::Partner(partner.clone()))
    }
}

#[cfg(test)]
mod test;
