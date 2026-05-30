# FX Rate-Lock

SEP-38 firm-quote rate-lock for the BRL↔USDC corridor. Locks a quoted rate on-chain so it is honored for a bounded window and cannot be silently re-priced or double-settled.

## Why on-chain

- **No stale quotes.** Each quote lives in Temporary storage (CAP-46-12) and is reclaimed at TTL — an expired quote ceases to exist by construction.
- **No malformed quotes.** `lock_quote` re-derives the SEP-38 price relation `(sell − fee) == price · buy` in fixed-point and traps on mismatch, so an inconsistent quote can never be stored.
- **No replay / double-settle.** `consume_quote` is guarded by ledger-sequence expiry plus a one-shot `consumed` flag.
- **IOF disclosure** (`Decreto 6.306/2007`) is bound to the locked rate via `fee_iof`; the licensed anchor collects it at conversion — this contract only discloses it.

## API

| Fn | Params | Returns | Auth |
|---|---|---|---|
| `lock_quote` | `quote_id: BytesN<32>, sell_amount, buy_amount, price, fee_iof: i128, ttl_ledgers: u32` | `u32` (expiry ledger) | admin |
| `consume_quote` | `quote_id, sep31_tx_id: BytesN<32>` | `()` | admin |
| `get_quote` | `quote_id` | `Option<Quote>` | — |
| `is_active` | `quote_id` | `bool` | — |

`price` is fixed-point at `PRICE_SCALE = 1e7`, defined by `(sell − fee)·SCALE == price·buy`.

## Errors

`QuoteNotFound · QuoteExpired · QuoteAlreadyConsumed · PriceInvariantViolated · InvalidExpiry · InvalidAmount · Overflow · NotInitialized`

## Events (`#[contractevent]`)

- `quote_locked(quote_id)` → `{ expires_at_ledger, fee_iof }`
- `quote_use(quote_id, sep31_tx_id)` → `{ price, fee_iof }`

## Composition

Admin auth composes OpenZeppelin's audited `stellar_access::access_control` (`stellar-contracts =0.7.1`), matching the sibling contracts: `lock_quote` and `consume_quote` are gated `#[only_admin]`. The `consume_quote` rate-lock deadline is Bleu's own typed check — it returns `QuoteExpired` the instant the current ledger reaches `expires_at_ledger`. This contract owns the novel surface: SEP-38 quote hashing, the price invariant, the Temporary-storage lifecycle, the expiry deadline, and the `quote_use` event. (OZ 0.7.1 requires `soroban-sdk ^25.3.0`; the workspace pins `=25.3.0`.)

## Tests

`cargo test -p bleu-fx-rate-lock` — 10 unit tests: lock/consume happy path, zero-fee quote, double-consume rejection, expiry (consume + grace-window readability), the expiry-deadline boundary, price-invariant trap, input validation (non-positive sell/buy/price, negative IOF, zero TTL), unknown-quote.
