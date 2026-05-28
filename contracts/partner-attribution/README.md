# Partner Attribution & Revenue-Share

Binds distribution partners (accountants, FX operators, fintech channels) to an on-chain revenue split, so B2B2B economics are auditable on the ledger instead of reconciled off-chain.

## Invariant

The sum of all partner basis points can never exceed `10_000` (100%). Enforced on every write via a running `TotalBps` counter — a mis-configuration cannot over-allocate the spread.

The contract is initialized with `__constructor(admin: Address, usdc_sac: Address)` — `admin` is the OZ access-control admin; `usdc_sac` is the deterministic USDC SAC this contract wraps.

## API

| Fn | Params | Returns | Auth |
|---|---|---|---|
| `set_partner` | `partner: Address, fee_bps: u32, payout: Address, domain: Symbol` | `()` | admin |
| `remove_partner` | `partner: Address` | `()` | admin |
| `settle_split` | `from: Address, amount: i128, partners: Vec<Address>, tx_hash: BytesN<32>` | `i128` (total paid) | admin (+ `from` authorizes the debit) |
| `get_partner` | `partner` | `Option<Partner>` | — |
| `total_bps` | — | `u32` | — |
| `sac_address` | — | `Address` | — |

Plus the OZ `SACAdminWrapper` admin passthroughs (`set_admin`/`set_authorized`/`mint`/`clawback`, all admin-gated) and the `AccessControl` interface (grant/revoke roles, admin transfer, queries).

`settle_split` performs a real SEP-41 `transfer` through the wrapped SAC for each partner's `amount * fee_bps / 10_000` share, atomically (any failed sub-transfer reverts the whole settlement). The residual stays with `from`.

## Errors

`PartnerNotFound · BpsCapExceeded · InvalidAmount · Overflow · SplitExceedsTotal · NotInitialized`

## Events (`#[contractevent]`)

- `partner_set(partner)` → `{ fee_bps, total_bps }`
- `partner_removed(partner)` → `{ total_bps }`
- `partner_transfer(partner, anchor_asset)` → `{ amount, fee_bps, fee, tx_hash }` (one per partner in a split), alongside the SAC's own standard SEP-41 `transfer` events.

## Composition

This contract IS a SAC admin wrapper over USDC, composing OpenZeppelin's audited `stellar_tokens::fungible::sac_admin_wrapper` (`stellar-contracts =0.7.1`) over USDC's deterministic SAC, gated by `stellar_access::access_control` (admin ops via `#[only_admin]`). Settlement moves real balance through the SAC's SEP-41 `transfer`, so wallets and explorers see standard token transfer events. This module owns the novel surface: the attribution accounting, the `Σ bps ≤ 10_000` invariant, the `partner_transfer` event, and the atomic `settle_split` payout dispatch. (OZ 0.7.1 requires `soroban-sdk ^25.3.0`; the workspace pins `=25.3.0`.)

## Tests

`cargo test -p bleu-partner-attribution` — 11 unit tests: total tracking, cap enforcement (single + cumulative), update recompute, free-room-then-add-third-partner, remove, plus the real SAC composition: `settle_split` moves actual balance to partner payouts, reverts atomically on an unknown partner, rejects combined bps > 100%, rejects non-positive amounts, and exposes the wrapped SAC address.
