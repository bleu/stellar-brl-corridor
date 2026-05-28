# Card-Collateral Smart Account — TESTNET PoC

> **Off the audit/mainnet critical path.** Testnet proof-of-concept only.

Demonstrates a capability Stellar enables that EVM card stacks do not: native USDC collateral can stay productive while an account policy releases only the spent slice at card authorization. Models the collateral lifecycle and the auth/clearing shortfall race that real card programs (Monavate/Gnosis Pay archetype) concede.

**Yield, where present, accrues on USDC collateral — never on XLM.** Nothing here offers, promotes, or implies any interest, dividend, yield, or return on XLM.

## API

| Fn | Params | Returns | Auth |
|---|---|---|---|
| `reserve` | `auth_id: BytesN<32>, amount: i128, ttl_ledgers: u32` | `()` | admin |
| `settle` | `auth_id, final_amount: i128` | `i128` (shortfall, 0 if covered) | admin |
| `release` | `auth_id` | `i128` (returned) | admin |
| `get_lock` | `auth_id` | `Option<CardLock>` | — |

## Errors

`AuthNotFound · AuthAlreadyExists · InvalidAmount · Overflow · NotInitialized`

## Events (`#[contractevent]`)

- `collateral_locked(auth_id)` → `{ amount, expires_at_ledger }`
- `card_settle(auth_id)` → `{ final_amount, settled }`
- `shortfall(auth_id)` → `{ shortfall }` *(settlement exceeded locked collateral)*
- `collateral_released(auth_id)` → `{ returned }`

## Composition

The production vault composes OpenZeppelin's `stellar_accounts::smart_account::SmartAccount` (`CustomAccountInterface` via `do_check_auth`) with `policies::spending_limit`, `verifiers::webauthn`/`ed25519`, and `pausable`. This PoC owns the collateral state machine and the shortfall accounting.

## Tests

`cargo test -p bleu-card-collateral-poc` — 8 unit tests: reserve/settle/release, shortfall on over-clearing, shortfall invariant across covered + breached cases, cumulative settles, double-reserve rejection, unknown-auth, input validation (non-positive amount, zero TTL, negative final amount).
