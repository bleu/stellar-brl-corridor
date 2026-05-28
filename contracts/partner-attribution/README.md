# Partner Attribution & Revenue-Share

Binds distribution partners (accountants, FX operators, fintech channels) to an on-chain revenue split, so B2B2B economics are auditable on the ledger instead of reconciled off-chain.

## Invariant

The sum of all partner basis points can never exceed `10_000` (100%). Enforced on every write via a running `TotalBps` counter — a mis-configuration cannot over-allocate the spread.

## API

| Fn | Params | Returns | Auth |
|---|---|---|---|
| `set_partner` | `partner: Address, fee_bps: u32, payout: Address, domain: Symbol` | `()` | admin |
| `remove_partner` | `partner: Address` | `()` | admin |
| `record_attribution` | `partner, anchor_asset: Address, amount: i128, tx_hash: BytesN<32>` | `i128` (fee) | admin |
| `get_partner` | `partner` | `Option<Partner>` | — |
| `total_bps` | — | `u32` | — |

## Errors

`PartnerNotFound · BpsCapExceeded · InvalidAmount · Overflow · NotInitialized`

## Events (`#[contractevent]`)

- `partner_set(partner)` → `{ fee_bps, total_bps }`
- `partner_removed(partner)` → `{ total_bps }`
- `partner_transfer(partner, anchor_asset)` → `{ amount, fee_bps, fee, tx_hash }`

## Composition

In production this is a thin layer over OpenZeppelin's audited `stellar_tokens::fungible::sac_admin_wrapper`, composing with USDC's deterministic SAC so wallets still see standard SEP-41 `transfer` events. This module owns the attribution accounting, the `Σ bps ≤ 10_000` invariant, and the `partner_transfer` event added on top of the audited wrapper.

## Tests

`cargo test -p bleu-partner-attribution` — 9 unit tests: total tracking, cap enforcement (single + cumulative), update recompute, free-room-then-add-third-partner, fee computation, non-positive amount rejection, unknown-partner, remove.
