# Lien-aware Card-Collateral — production vault

Extends the [testnet PoC](../card-collateral-poc/) state machine so every lock has an owner and the contract maintains a per-user **lien** aggregate. `reserve(user, auth_id, amount)` records the lien without moving tokens; `settle` and `release` reduce it. `get_locked_total(user)` exposes the aggregate as a single O(1) read so the smart account and the issuer adapter never enumerate per-auth locks.

Shortfall semantics are unchanged from the PoC: cumulative settles beyond the locked amount emit the shortfall event; capping the actual debit is downstream work (adapter debit module). The PoC contract is untouched and stays off the audit path.

## API

| Fn | Params | Returns | Auth |
|---|---|---|---|
| `reserve` | `user: Address, auth_id: BytesN<32>, amount: i128` | `()` | admin · blocked while paused |
| `settle` | `auth_id, final_amount: i128` | `i128` (shortfall, 0 if covered) | admin |
| `release` | `auth_id` | `i128` (returned) | admin |
| `get_lock` | `auth_id` | `Option<CardLock>` (carries `owner`) | — |
| `get_locked_total` | `user: Address` | `i128` (the lien, O(1)) | — |
| `pause` / `unpause` | `caller: Address` | `()` | admin |
| `paused` | — | `bool` | — |

Plus the OZ `AccessControl` interface (grant/revoke roles, admin transfer, queries).

## Invariant

`locked_total(user) = Σ max(0, locked − settled)` over the user's open locks. Maintained incrementally at `reserve` (+amount), `settle` (− the covered slice of the clearing), and `release` (− the remainder). A breached lock (settled > locked) contributes 0, never a negative.

## Errors

`AuthNotFound · AuthAlreadyExists · InvalidAmount · Overflow · NotInitialized`

## Events (`#[contractevent]`)

- `collateral_locked(auth_id, owner)` → `{ amount }`
- `card_settle(auth_id, owner)` → `{ final_amount, settled }`
- `shortfall(auth_id, owner)` → `{ shortfall }` *(settlement exceeded locked collateral)*
- `collateral_released(auth_id, owner)` → `{ returned }`

The `owner` topic lets the indexer attribute lien changes per user. Plus OZ pausable's `Paused` / `Unpaused` events.

## Composition

Same OZ (`stellar-contracts =0.7.1`) blocks as the PoC: `stellar_contract_utils::pausable` (`reserve` gated `#[when_not_paused]`; `settle`/`release` stay available to wind down) and `stellar_access::access_control` (admin gating on every op). The smart-account wrapper (`CustomAccountInterface`, policies, verifiers) composes around this contract; it consumes `get_locked_total` rather than living inside it.

## Tests

`cargo test -p bleu-card-collateral` — 11 unit tests: owned reserve + lien, settle reduces the lien, release returns the remainder and clears the lien, shortfall on over-clearing with the lien floored at 0, shortfall event emission, the lien invariant across mixed lock states, per-user isolation, double-reserve rejection, unknown-auth, input validation, and the pausable circuit breaker.
