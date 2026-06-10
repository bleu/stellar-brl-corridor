# Live testnet demo — the three corridor primitives, on-chain

**What this proves.** The three Soroban primitives behind Bleu's BRL/PIX corridor
are not just *deployed* — they *work* on the live Stellar testnet, end to end,
with reviewer-clickable transactions. Below, each primitive shows the exact
`stellar contract invoke` command, the resulting transaction hash (linked to
stellar.expert), the event it emitted, and the observable on-chain effect:
real USDC moving through the wrapped SAC for the revenue split, a SEP-38 firm
quote locked then consumed (with its one-shot replay guard set), and the card
collateral state machine clearing both the normal and the auth/clearing
**shortfall** path. Every hash below resolves on testnet; reproduce the whole
run with `just demo`.

- **Network:** testnet
- **Admin / deployer (also USDC issuer):** `GAQH34BVB4SEEI4DNKIJQI6BTCNFJVO7AWC4SGQHV23UVRNLIZEL7NLI`
- **Testnet USDC SAC:** [`CBQAJM5A…ZDO7D`](https://stellar.expert/explorer/testnet/contract/CBQAJM5AF5MLNFWLYR7USHOINGL2P7SGYW2BZUEMDR4HVQWN7FMZDO7D)
- **Run captured:** 2026-06-10 against the 2026-06-05 deployment (machine-readable record: [`deployments/testnet-demo.json`](../deployments/testnet-demo.json))

Reproduce: `just demo` (or `scripts/demo_testnet.sh`). The script is idempotent
— quote ids and card-auth ids are derived from a per-run tag, so re-runs land
fresh transactions without colliding.

> **A note on the settlement account.** In `settle_split`, the partner-attribution
> contract is itself the on-chain settlement account that holds incoming corridor
> flow and fans it out to partners (the anchor-custody archetype). The contract
> `transfer`s from its own balance, so its outflow is authorized by the invocation
> context. This is also the only auth model the public testnet RPC supports for
> this call: the SAC `transfer(from, …)` is a sub-invocation, and a classic-account
> `from` would require non-root authorization recording, which the public RPC
> rejects.

---

## 1. Partner attribution — revenue split through the wrapped USDC SAC

Binds distribution partners (accountants, FX operators, fintech channels) to an
on-chain revenue split. `settle_split` atomically transfers each partner's
`amount · fee_bps / 10_000` slice through USDC's SEP-41 `transfer` and emits a
`partner_transfer` event per partner — so B2B2B economics are auditable on the
ledger instead of reconciled off-chain.

**Setup — register two partners (A = 30%, B = 20%):**

```bash
stellar contract invoke --id CCXSXAM7KLACDCD2UDBM37BFTZZYATPTN4WFXJASIEGZ4ZO44CM23OFB \
  --source bleu-deployer --network testnet -- \
  set_partner --partner <A> --fee_bps 3000 --payout <A> --domain accountant
stellar contract invoke --id CCXSXAM7KLACDCD2UDBM37BFTZZYATPTN4WFXJASIEGZ4ZO44CM23OFB \
  --source bleu-deployer --network testnet -- \
  set_partner --partner <B> --fee_bps 2000 --payout <B> --domain fxoperator
```

- set A (3000 bps) → [`71afa4cc…`](https://stellar.expert/explorer/testnet/tx/71afa4cc88ade4d573e09c3d41b71bd19e5df1b75e9463fd7b33126909327192) — event `partner_set`, `total_bps` → 5000
- set B (2000 bps) → [`23ac5a7f…`](https://stellar.expert/explorer/testnet/tx/23ac5a7f43b1a3f88d167d7c6954520d80bf7e6133d2ba560e6f389d0dea9409) — event `partner_set`, `total_bps` → 5000

**The split — settle a 100 USDC flow:**

```bash
stellar contract invoke --id CCXSXAM7KLACDCD2UDBM37BFTZZYATPTN4WFXJASIEGZ4ZO44CM23OFB \
  --source bleu-deployer --network testnet -- \
  settle_split \
  --from CCXSXAM7KLACDCD2UDBM37BFTZZYATPTN4WFXJASIEGZ4ZO44CM23OFB \
  --amount 1000000000 \
  --partners '["<A>","<B>"]' \
  --tx_hash <sep31-tx-hash>
```

- **tx:** [`d03dec96…`](https://stellar.expert/explorer/testnet/tx/d03dec96b07bdf664ea4136ea72a043838825a00e3691e90ce5cd01c21cfafd6)
- **events:** two `partner_transfer` + two SEP-41 `transfer` (standard token events wallets/explorers see)
- **return:** `500000000` (50 USDC total paid to partners; residual stays with the settlement account)
- **observable effect:** partner A USDC balance **+300000000** (30 USDC), partner B **+200000000** (20 USDC) — exactly the 30% / 20% split of the 100 USDC flow, asserted live by the script against the SAC `balance`.

---

## 2. FX rate-lock — SEP-38 firm quote: lock then consume

Locks a SEP-38 firm BRL↔USDC quote on-chain so the rate is honored for a bounded
window and cannot be silently re-priced or double-settled. On lock, the contract
re-derives the SEP-38 price relation `(sell − fee_iof) · PRICE_SCALE == price · buy`
in fixed-point and traps on mismatch. `consume_quote` is guarded by a one-shot
`consumed` flag, blocking replay / double-settlement. IOF (Decreto 6.306/2007)
rides along as a disclosed `fee_iof` field.

The demo quote: sell **531.91 BRL** (incl. **1.91 BRL** IOF) for **100 USDC** at
**5.30 BRL/USDC** — `sell_amount=53191, fee_iof=191, buy_amount=1000000000,
price=530`, which satisfies the on-chain invariant exactly.

**Lock:**

```bash
stellar contract invoke --id CCF7U43LBCHURKKHEHLBWUUZKNPFWQUQTESJLFWWVHCNKZKQMG3UG2AI \
  --source bleu-deployer --network testnet -- \
  lock_quote --quote_id <quote-id> \
  --sell_amount 53191 --buy_amount 1000000000 --price 530 --fee_iof 191 \
  --ttl_ledgers 120
```

- **tx:** [`6c117f68…`](https://stellar.expert/explorer/testnet/tx/6c117f6899d1c33f00317fe0623a567580d87917e19f3c767179378a1f102466)
- **event:** `quote_locked` (`expires_at_ledger`, `fee_iof: 191`)
- **observable effect:** `is_active(quote_id)` → `true`.

**Consume (bind to a SEP-31 transaction):**

```bash
stellar contract invoke --id CCF7U43LBCHURKKHEHLBWUUZKNPFWQUQTESJLFWWVHCNKZKQMG3UG2AI \
  --source bleu-deployer --network testnet -- \
  consume_quote --quote_id <quote-id> --sep31_tx_id <sep31-tx-id>
```

- **tx:** [`cd510591…`](https://stellar.expert/explorer/testnet/tx/cd5105914d7b813007a1fbdb9609fe8b8623b9e7a76059ed227ac967e6c769c4)
- **event:** `quote_use` (`price: 530`, `fee_iof: 191`)
- **observable effect:** `is_active(quote_id)` → `false` — the one-shot `consumed`
  flag is set, so any second settlement against the same quote is rejected. This
  is the live double-settlement defense.

> The **TTL-expiry path** (`QuoteExpired` once the rate-lock window passes) is not
> re-run live here because it requires waiting ~120 ledgers (~10 min); it is
> covered by the contract unit tests in `contracts/fx-rate-lock/src/test.rs`. The
> one-shot replay guard above is demonstrated live.

---

## 3. Card-collateral PoC — reserve → settle → release, and the shortfall race

Models the card-collateral lifecycle Stellar enables and EVM card stacks do not:
collateral is reserved at authorization, only the spent slice is consumed at
clearing, and the unused remainder is released. It also surfaces the auth/clearing
**shortfall** race that real card programs (Monavate/Gnosis Pay archetype) concede.
(Testnet PoC — off the audit/mainnet critical path.)

**Normal lifecycle — reserve 50 USDC, settle 30 (partial), release 20:**

```bash
stellar contract invoke --id CAVFABBNRNU6CRAYNIH2OZSZBDKGXRUYVIUGNZKVKAUYK6P3GGOIFRWV \
  --source bleu-deployer --network testnet -- \
  reserve --auth_id <auth-id> --amount 500000000
stellar contract invoke --id CAVFABBNRNU6CRAYNIH2OZSZBDKGXRUYVIUGNZKVKAUYK6P3GGOIFRWV \
  --source bleu-deployer --network testnet -- \
  settle --auth_id <auth-id> --final_amount 300000000
stellar contract invoke --id CAVFABBNRNU6CRAYNIH2OZSZBDKGXRUYVIUGNZKVKAUYK6P3GGOIFRWV \
  --source bleu-deployer --network testnet -- \
  release --auth_id <auth-id>
```

- reserve 50 USDC → [`289a28dc…`](https://stellar.expert/explorer/testnet/tx/289a28dc5fc95e1a4f91f670a3f955383eb29ab5340312c6b49af2561b533f94) — event `collateral_locked`
- settle 30 USDC → [`69435816…`](https://stellar.expert/explorer/testnet/tx/694358160e3e1c259ff5c3b0057ed428518025b45765f2fdf013e46081c99f89) — event `card_settle`, returns shortfall `0` (fully covered)
- release → [`5f61d765…`](https://stellar.expert/explorer/testnet/tx/5f61d765c2ed11eece468d808fbe05d8a34e38c3c76f892f2ee97010acddf23e) — event `collateral_released`, returns `200000000` (20 USDC unused remainder freed)

**Shortfall race — reserve 10 USDC, clearing comes in at 14:**

```bash
stellar contract invoke --id CAVFABBNRNU6CRAYNIH2OZSZBDKGXRUYVIUGNZKVKAUYK6P3GGOIFRWV \
  --source bleu-deployer --network testnet -- \
  reserve --auth_id <auth-id-2> --amount 100000000
stellar contract invoke --id CAVFABBNRNU6CRAYNIH2OZSZBDKGXRUYVIUGNZKVKAUYK6P3GGOIFRWV \
  --source bleu-deployer --network testnet -- \
  settle --auth_id <auth-id-2> --final_amount 140000000
```

- reserve 10 USDC → [`217ddc69…`](https://stellar.expert/explorer/testnet/tx/217ddc69777c140b78b1710fe391c08a642b208abf09eb29e438c82f973ed349) — event `collateral_locked`
- settle 14 USDC → [`bb6f3ac3…`](https://stellar.expert/explorer/testnet/tx/bb6f3ac3fb4e7ad32ea20f7b55ef2139d41542755f4fdf3688ce7f44ea7eb803) — events `card_settle` **and** `shortfall`, returns `40000000`
- **observable effect:** clearing exceeded locked collateral by **4 USDC** (`40000000`);
  the `shortfall` event is emitted as the off-chain top-up reconciliation signal.

---

## Summary — key tx to cite

| Primitive | Key operation | Tx | Event |
| --- | --- | --- | --- |
| Partner attribution | `settle_split` (100 USDC split 30/20) | [`d03dec96…`](https://stellar.expert/explorer/testnet/tx/d03dec96b07bdf664ea4136ea72a043838825a00e3691e90ce5cd01c21cfafd6) | `partner_transfer` ×2 |
| FX rate-lock | `consume_quote` | [`cd510591…`](https://stellar.expert/explorer/testnet/tx/cd5105914d7b813007a1fbdb9609fe8b8623b9e7a76059ed227ac967e6c769c4) | `quote_use` |
| Card-collateral | `settle` (covered) | [`69435816…`](https://stellar.expert/explorer/testnet/tx/694358160e3e1c259ff5c3b0057ed428518025b45765f2fdf013e46081c99f89) | `card_settle` |
| Card-collateral | `settle` (shortfall) | [`bb6f3ac3…`](https://stellar.expert/explorer/testnet/tx/bb6f3ac3fb4e7ad32ea20f7b55ef2139d41542755f4fdf3688ce7f44ea7eb803) | `shortfall` |

---

## Troubleshooting — `error: Failed to find config identity for bleu-deployer`

The demo signs every admin-gated call (`mint`, `set_partner`, `settle_split`,
`lock_quote`, the card lifecycle) as the `bleu-deployer` identity
(`SOURCE` env var overrides the name). That secret lives only in the local
stellar CLI keystore (`~/.config/stellar/identity/bleu-deployer.toml`) — it is
never committed. The helper identities (`demo-partner-a`/`-b`) auto-regenerate,
which is why a run with a missing deployer key gets through the trustline setup
and then fails on the first `invoke`.

If the keystore entry is gone (new machine, cleaned config, or a testnet reset
that wiped the funded account), there is **no in-place recovery**: each
contract's admin is fixed at deploy time, so without the original secret no
admin call can ever be signed again. The deployed contracts are orphaned.

Recovery is a full redeploy:

```bash
just deploy-testnet   # generates + funds a fresh bleu-deployer, deploys a new
                      # USDC SAC + the three contracts, rewrites deployments/testnet.json
just demo             # re-runs this walkthrough, rewrites deployments/testnet-demo.json
```

Then refresh everything that records the addresses — this file, the README
address table, `docs/REVIEWERS.md`, `docs/PROVENANCE.md` (re-verify the
reproducible-build hashes against the new contract ids), and the generated
TypeScript bindings (`just bindings <name> <new-contract-id>` per contract).
The old contract ids keep resolving on stellar.expert but can no longer be
administered.

This page reflects exactly such a rotation: the 2026-05-30 deployment was
orphaned when the local deployer identity was lost, redeployed on 2026-06-05,
and the demo re-captured on 2026-06-08 (see `CHANGELOG.md`).
