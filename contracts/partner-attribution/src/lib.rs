//! Bleu — Partner Attribution & Revenue-Share.
//!
//! Binds distribution partners (accountants, FX operators, fintech channels) to
//! an on-chain revenue split, so B2B2B economics are auditable on the ledger
//! instead of reconciled off-chain.
//!
//! This contract is a SAC admin wrapper over USDC's deterministic Stellar Asset
//! Contract. It composes OpenZeppelin's audited `stellar-contracts` (=0.7.1):
//!
//! - `stellar_tokens::fungible::sac_admin_wrapper` — wraps the USDC SAC. The
//!   wrapper stores the SAC address and exposes the audited admin passthroughs
//!   (`set_admin`, `set_authorized`, `mint`, `clawback`). Settlement moves real
//!   balance through the SAC's SEP-41 `transfer`, so wallets and explorers still
//!   see standard token transfer events.
//! - `stellar_access::access_control` (+ `stellar_macros::only_admin`) — gates
//!   every admin op and the settlement split behind the contract admin's auth.
//!
//! The novel surface this module owns, on top of the audited wrapper, is small:
//! the partner attribution accounting, the `Σ bps ≤ 10_000` invariant, the
//! `partner_transfer` event, and the batched payout split dispatched through the
//! audited SAC `transfer`.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token::TokenClient,
    Address, BytesN, Env, Symbol, Vec,
};
use stellar_access::access_control::{self as access_control, AccessControl};
use stellar_macros::only_admin;
use stellar_tokens::fungible::sac_admin_wrapper::{
    self, get_sac_address, set_sac_address, SACAdminWrapper,
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
    SplitExceedsTotal = 6,
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

/// Emitted per partner when a settlement is split and paid out through the SAC.
/// Topic: `partner_transfer`, partner, anchor_asset (the wrapped SAC address).
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
    /// Initialize with the contract admin (the anchor's business server) and the
    /// USDC SAC address this contract wraps. The admin gates every admin op and
    /// the settlement split; the SAC address is where real balance moves.
    pub fn __constructor(env: Env, admin: Address, usdc_sac: Address) {
        access_control::set_admin(&env, &admin);
        set_sac_address(&env, &usdc_sac);
        env.storage().instance().set(&DataKey::TotalBps, &0u32);
    }

    /// Create or update a partner. Admin-gated via OZ access control. Re-derives
    /// the running total and rejects any write that would push `Σ bps` over 100%.
    #[only_admin]
    pub fn set_partner(
        env: Env,
        partner: Address,
        fee_bps: u32,
        payout: Address,
        domain: Symbol,
    ) -> Result<(), Error> {
        if fee_bps > MAX_BPS {
            return Err(Error::BpsCapExceeded);
        }

        let prev = Self::partner(&env, &partner)
            .map(|p| p.fee_bps)
            .unwrap_or(0);
        let total = Self::total_bps_of(&env);
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

    /// Remove a partner and free its basis points. Admin-gated via OZ access
    /// control.
    #[only_admin]
    pub fn remove_partner(env: Env, partner: Address) -> Result<(), Error> {
        let existing = Self::partner(&env, &partner).ok_or(Error::PartnerNotFound)?;

        let total = Self::total_bps_of(&env);
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

    /// Settle a flow and atomically split it to the listed partners through the
    /// wrapped USDC SAC's SEP-41 `transfer`. Admin-gated via OZ access control;
    /// `from` authorizes the debit. For each partner the contract transfers
    /// `amount * fee_bps / 10_000` from `from` to the partner payout and emits a
    /// `partner_transfer`. The split is atomic: any sub-transfer that fails
    /// reverts the whole settlement.
    ///
    /// Returns the total amount transferred to partners (the residual stays with
    /// `from`). The per-call `total_bps_used` accumulator is a duplicate-partner
    /// guard: the global `Σ bps ≤ 10_000` registry invariant already bounds the
    /// sum over *distinct* partners, so the running cap here exists to reject a
    /// `partners` list that names the same partner twice (which would otherwise
    /// double-pay and overshoot 100%).
    #[only_admin]
    pub fn settle_split(
        env: Env,
        from: Address,
        amount: i128,
        partners: Vec<Address>,
        tx_hash: BytesN<32>,
    ) -> Result<i128, Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let sac = get_sac_address(&env);
        let token = TokenClient::new(&env, &sac);

        let mut total_paid: i128 = 0;
        let mut total_bps_used: u32 = 0;

        for partner in partners.iter() {
            let p = Self::partner(&env, &partner).ok_or(Error::PartnerNotFound)?;
            total_bps_used = total_bps_used
                .checked_add(p.fee_bps)
                .ok_or(Error::Overflow)?;
            if total_bps_used > MAX_BPS {
                return Err(Error::SplitExceedsTotal);
            }

            let share = amount
                .checked_mul(p.fee_bps as i128)
                .ok_or(Error::Overflow)?
                / MAX_BPS as i128;

            if share > 0 {
                // Real SEP-41 transfer through the wrapped SAC — moves balance
                // and emits a standard token `transfer` event wallets can see.
                token.transfer(&from, &p.payout, &share);
                total_paid = total_paid.checked_add(share).ok_or(Error::Overflow)?;

                // Only emit a `partner_transfer` when balance actually moved; a
                // zero-value share (rounding to 0, or a 0-bps partner) is not a
                // transfer and must not surface as a phantom event.
                PartnerTransfer {
                    partner: partner.clone(),
                    anchor_asset: sac.clone(),
                    amount,
                    fee_bps: p.fee_bps,
                    fee: share,
                    tx_hash: tx_hash.clone(),
                }
                .publish(&env);
            }
        }

        Ok(total_paid)
    }

    pub fn get_partner(env: Env, partner: Address) -> Option<Partner> {
        Self::partner(&env, &partner)
    }

    /// The running `Σ bps` across all registered partners. Thin caller over the
    /// `&Env` helper used internally.
    pub fn total_bps(env: Env) -> u32 {
        Self::total_bps_of(&env)
    }

    /// The wrapped USDC SAC address.
    pub fn sac_address(env: Env) -> Address {
        get_sac_address(&env)
    }

    /// Read the running `Σ bps` without cloning the `Env`. Internal callers use
    /// this; the public `total_bps` getter forwards to it.
    fn total_bps_of(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::TotalBps)
            .unwrap_or(0)
    }

    fn partner(env: &Env, partner: &Address) -> Option<Partner> {
        env.storage()
            .persistent()
            .get(&DataKey::Partner(partner.clone()))
    }
}

// Expose the audited OZ SAC admin-wrapper interface. Each admin passthrough is
// gated by the contract admin via `#[only_admin]`, then forwards to the audited
// `sac_admin_wrapper` helper which performs the actual SAC admin call.
#[contractimpl]
impl SACAdminWrapper for PartnerAttribution {
    #[only_admin]
    fn set_admin(e: Env, new_admin: Address, _operator: Address) {
        sac_admin_wrapper::set_admin(&e, &new_admin);
    }

    #[only_admin]
    fn set_authorized(e: Env, id: Address, authorize: bool, _operator: Address) {
        sac_admin_wrapper::set_authorized(&e, &id, authorize);
    }

    #[only_admin]
    fn mint(e: Env, to: Address, amount: i128, _operator: Address) {
        sac_admin_wrapper::mint(&e, &to, amount);
    }

    #[only_admin]
    fn clawback(e: Env, from: Address, amount: i128, _operator: Address) {
        sac_admin_wrapper::clawback(&e, &from, amount);
    }
}

// Expose the audited OZ AccessControl interface (grant/revoke roles, admin
// transfer, queries) so role administration is on-chain and standard.
#[contractimpl(contracttrait)]
impl AccessControl for PartnerAttribution {}

#[cfg(test)]
mod test;
