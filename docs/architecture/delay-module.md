# Delay Module — policy contract

Contract: [`contracts/delay-module`](../../contracts/delay-module/src/lib.rs) ·
Testnet address in [`deployments/testnet.json`](../../deployments/testnet.json) (`delay-module`).

The Delay Module is the on-chain half of the corridor's card-spend safety
model. A user-initiated operation — an outbound transfer or a config change —
does not happen immediately: it is **queued**, becomes executable only after a
**cooldown**, and is void after an **execution window**. The off-chain issuer
adapter (STE-44) authorizes card spend only within **Spendable** =
on-chain balance − open liens − queued-but-unexecuted delay entries, so the
cooldown is exactly the time the adapter has to observe a pending withdrawal
before money can leave.

## Policy parameters

Cooldown and expiration are **per-instance constructor parameters**, never
hardcoded. ADR-0001 defaults: cooldown **180 s** (3 min), expiration **1800 s**
(30 min); the deployer passes them (`scripts/deploy_testnet.sh`, overridable
via `DELAY_COOLDOWN_SECS` / `DELAY_EXPIRATION_SECS`). The constructor rejects
`expiration ≤ cooldown` (the execution window would be empty).

Both are measured in seconds of ledger time from the moment of queueing. An
entry queued at `t` is executable in the half-open window
**`[t + cooldown, t + expiration)`**: execute at `t + cooldown` succeeds,
execute at `t + expiration` fails.

## Entrypoints

| Entrypoint | Auth | Semantics |
| --- | --- | --- |
| `queue(user, kind, amount, payload) → id` | `user` | Store the entry, emit `entry_queued`. `kind` is `Transfer` (positive `amount`) or `ConfigChange` (`amount == 0`); `payload` is opaque operation data for the executing smart account. Ids are sequential per instance. |
| `execute(id) → Entry` | queuing user | Valid only inside the window. Removes the entry, emits `entry_executed`, returns the entry so the composing smart account (STE-41) can act on the payload. |
| `cancel(id)` | queuing user | Removes the entry, emits `entry_cancelled`. Valid any time the entry is pending — including during cooldown, which is the point. |
| `expire(id)` | **none** | Reaps an entry whose window has passed; emits `entry_expired`. Rejected with `NotYetExpired` while the entry is live. |
| `get_entry(id)`, `get_config()` | none | Read-only. |

**There is no admin or third-party cancellation path.** The contract has no
admin role of any kind: `cancel` and `execute` are bound to the queuing user's
`require_auth`, and no other entrypoint mutates a pending entry. This is
verified by test (`only_the_queuing_user_can_cancel`,
`only_the_queuing_user_can_execute`).

## Events — the indexer/adapter interface

Every transition emits an event; the indexer (STE-43) and the issuer adapter
(STE-44) compute Spendable from these, so they are interface, not telemetry.
All four carry topics `(<name>, id, user)` and data `(kind, amount, …)`:

- `entry_queued` — also carries `executable_at` and `expires_at`, so the
  indexer can compute liveness without a contract read.
- `entry_executed`, `entry_cancelled` — the entry left the queue by action.
- `entry_expired` — emitted by the permissionless `expire` reaper. **Expiry
  itself is passive**: an entry is void from `expires_at` on, with no
  transaction. The indexer must drop expired entries from the live view based
  on `expires_at`, never by waiting for an `entry_expired` event (which may
  arrive late or never).

For Spendable, a queued `Transfer` subtracts its `amount`; a queued
`ConfigChange` counts as a full-balance withdrawal (ADR-0001 decision #8) —
which is why `queue` rejects a nonzero amount on config changes.

## Storage

Entries live in persistent storage keyed by id; **existence means pending**.
Executed, cancelled, and expired entries are removed, and the events are the
history of record. Config and the id counter live in instance storage.
