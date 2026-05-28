# Card-Collateral Smart Account — TESTNET PoC

> **Off the audit/mainnet critical path.** Testnet proof-of-concept only.

Demonstrates a capability Stellar enables that EVM card stacks do not: native USDC collateral can stay productive while an account policy releases only the spent slice at card authorization. Models the collateral lifecycle and the auth/clearing shortfall race that real card programs (Monavate/Gnosis Pay archetype) concede.

**Yield, where present, accrues on USDC collateral — never on XLM.** Nothing here offers, promotes, or implies any interest, dividend, yield, or return on XLM.

## API

| Fn | Params | Returns | Auth |
|---|---|---|---|
| `reserve` | `auth_id: BytesN<32>, amount: i128, ttl_ledgers: u32` | `()` | admin · blocked while paused |
| `settle` | `auth_id, final_amount: i128` | `i128` (shortfall, 0 if covered) | admin |
| `release` | `auth_id` | `i128` (returned) | admin |
| `get_lock` | `auth_id` | `Option<CardLock>` | — |
| `pause` / `unpause` | `caller: Address` | `()` | admin |
| `paused` | — | `bool` | — |

Plus the OZ `AccessControl` interface (grant/revoke roles, admin transfer, queries).

## Errors

`AuthNotFound · AuthAlreadyExists · InvalidAmount · Overflow · NotInitialized`

## Events (`#[contractevent]`)

- `collateral_locked(auth_id)` → `{ amount, expires_at_ledger }`
- `card_settle(auth_id)` → `{ final_amount, settled }`
- `shortfall(auth_id)` → `{ shortfall }` *(settlement exceeded locked collateral)*
- `collateral_released(auth_id)` → `{ returned }`

Plus OZ pausable's `Paused` / `Unpaused` events.

## Composition

This PoC composes the OpenZeppelin (`stellar-contracts =0.7.1`) blocks that fit a collateral state machine: `stellar_contract_utils::pausable` (an audited circuit breaker — `reserve` is gated `#[when_not_paused]`; `settle`/`release` stay available to wind down) and `stellar_access::access_control` (admin gating on every op). The full account-abstraction stack — `stellar_accounts::smart_account::SmartAccount` (`CustomAccountInterface` via `do_check_auth`), `policies::spending_limit`, `verifiers::webauthn`/`ed25519` — is the production-vault target, deliberately not wired in here so the PoC stays a tight collateral state machine. This PoC owns the reserve/settle/release lifecycle and the shortfall accounting. (OZ 0.7.1 requires `soroban-sdk ^25.3.0`; the workspace pins `=25.3.0`.)

## Tests

`cargo test -p bleu-card-collateral-poc` — 9 unit tests: reserve/settle/release, shortfall on over-clearing, shortfall invariant across covered + breached cases, cumulative settles, double-reserve rejection, unknown-auth, input validation (non-positive amount, zero TTL, negative final amount), and the pausable circuit breaker (pause blocks reserve while still allowing settle/release wind-down, unpause restores).
