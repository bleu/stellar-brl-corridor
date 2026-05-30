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
- **Admin / deployer (also USDC issuer):** `GDWNOIAEKIWIKL6BSOHNJYJNYAZTVPXAG47G3XZA2ZFPC66Q5LCLABYF`
- **Testnet USDC SAC:** [`CBCIMM65…OH37`](https://stellar.expert/explorer/testnet/contract/CBCIMM652YGFPUJ3YVKJL6LNJGHCU7S22IPQXJWMA2ZC7CRA4Q2XOH37)
- **Run captured:** 2026-05-30 (machine-readable record: [`deployments/testnet-demo.json`](../deployments/testnet-demo.json))

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
stellar contract invoke --id CDBUJYLO5TUXGU5VSQGULB2GXNJ2NPLKI6IPUCFBK774KPHNV22K53YR \
  --source bleu-deployer --network testnet -- \
  set_partner --partner <A> --fee_bps 3000 --payout <A> --domain accountant
stellar contract invoke --id CDBUJYLO5TUXGU5VSQGULB2GXNJ2NPLKI6IPUCFBK774KPHNV22K53YR \
  --source bleu-deployer --network testnet -- \
  set_partner --partner <B> --fee_bps 2000 --payout <B> --domain fxoperator
```

- set A (3000 bps) → [`af330cc1…`](https://stellar.expert/explorer/testnet/tx/af330cc15e9f94f9b6e8b498612e643b29158630e643ebac18298a3e21a2ceac) — event `partner_set`, `total_bps` → 5000
- set B (2000 bps) → [`a0e20f8b…`](https://stellar.expert/explorer/testnet/tx/a0e20f8b8b4438746e642503ab74528981d2337a8e40201b242a110061517759) — event `partner_set`, `total_bps` → 5000

**The split — settle a 100 USDC flow:**

```bash
stellar contract invoke --id CDBUJYLO5TUXGU5VSQGULB2GXNJ2NPLKI6IPUCFBK774KPHNV22K53YR \
  --source bleu-deployer --network testnet -- \
  settle_split \
  --from CDBUJYLO5TUXGU5VSQGULB2GXNJ2NPLKI6IPUCFBK774KPHNV22K53YR \
  --amount 1000000000 \
  --partners '["<A>","<B>"]' \
  --tx_hash <sep31-tx-hash>
```

- **tx:** [`32d4880d…`](https://stellar.expert/explorer/testnet/tx/32d4880ddd59345247267cda9edbccc858ad1b27a8a2f38c030cbab0e3ce28cb)
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
stellar contract invoke --id CDZLXRAWDHU6JLDAU5PRTYC3NNXWRWXIDTPJNOTIHIMLVAPSA5JONVRW \
  --source bleu-deployer --network testnet -- \
  lock_quote --quote_id <quote-id> \
  --sell_amount 53191 --buy_amount 1000000000 --price 530 --fee_iof 191 \
  --ttl_ledgers 120
```

- **tx:** [`b3390ba9…`](https://stellar.expert/explorer/testnet/tx/b3390ba9ce493e63ae4d97c2c691fcb59f7a2aa3c1ae15af20bb38db17583fe8)
- **event:** `quote_locked` (`expires_at_ledger`, `fee_iof: 191`)
- **observable effect:** `is_active(quote_id)` → `true`.

**Consume (bind to a SEP-31 transaction):**

```bash
stellar contract invoke --id CDZLXRAWDHU6JLDAU5PRTYC3NNXWRWXIDTPJNOTIHIMLVAPSA5JONVRW \
  --source bleu-deployer --network testnet -- \
  consume_quote --quote_id <quote-id> --sep31_tx_id <sep31-tx-id>
```

- **tx:** [`9370006f…`](https://stellar.expert/explorer/testnet/tx/9370006f8f3182c89055c4c4f19c26f06e2f55d8e1644c0e44666d4da7cbeeec)
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
stellar contract invoke --id CC7HSHXJBWCVA7PQH7GW2QASVACOYYCOZNCKDQGYM7LOIQ3C2T6WH2WT \
  --source bleu-deployer --network testnet -- \
  reserve --auth_id <auth-id> --amount 500000000
stellar contract invoke --id CC7HSHXJBWCVA7PQH7GW2QASVACOYYCOZNCKDQGYM7LOIQ3C2T6WH2WT \
  --source bleu-deployer --network testnet -- \
  settle --auth_id <auth-id> --final_amount 300000000
stellar contract invoke --id CC7HSHXJBWCVA7PQH7GW2QASVACOYYCOZNCKDQGYM7LOIQ3C2T6WH2WT \
  --source bleu-deployer --network testnet -- \
  release --auth_id <auth-id>
```

- reserve 50 USDC → [`9a5f7588…`](https://stellar.expert/explorer/testnet/tx/9a5f758881d784984f2e3f1d94ba58855ee255f953dd636d3e957a4d65779bc5) — event `collateral_locked`
- settle 30 USDC → [`f609b291…`](https://stellar.expert/explorer/testnet/tx/f609b29103335914cb6edda981df163b1960219cffb39dafdd211303c0a80e03) — event `card_settle`, returns shortfall `0` (fully covered)
- release → [`713dbee6…`](https://stellar.expert/explorer/testnet/tx/713dbee6fd9afb11414a7385004c3e5cd1721da588a4a68684b8d98c47fce0be) — event `collateral_released`, returns `200000000` (20 USDC unused remainder freed)

**Shortfall race — reserve 10 USDC, clearing comes in at 14:**

```bash
stellar contract invoke --id CC7HSHXJBWCVA7PQH7GW2QASVACOYYCOZNCKDQGYM7LOIQ3C2T6WH2WT \
  --source bleu-deployer --network testnet -- \
  reserve --auth_id <auth-id-2> --amount 100000000
stellar contract invoke --id CC7HSHXJBWCVA7PQH7GW2QASVACOYYCOZNCKDQGYM7LOIQ3C2T6WH2WT \
  --source bleu-deployer --network testnet -- \
  settle --auth_id <auth-id-2> --final_amount 140000000
```

- reserve 10 USDC → [`f413c42c…`](https://stellar.expert/explorer/testnet/tx/f413c42ca9c5acd42053aa9002ffd38985d28edd16b5832e9767193a9efc8dc3) — event `collateral_locked`
- settle 14 USDC → [`1e5df38f…`](https://stellar.expert/explorer/testnet/tx/1e5df38f1d9882cb9ecb2f0b5c8aa8b55c1197b2f61968d982817235d6427597) — events `card_settle` **and** `shortfall`, returns `40000000`
- **observable effect:** clearing exceeded locked collateral by **4 USDC** (`40000000`);
  the `shortfall` event is emitted as the off-chain top-up reconciliation signal.

---

## Summary — key tx to cite

| Primitive | Key operation | Tx | Event |
| --- | --- | --- | --- |
| Partner attribution | `settle_split` (100 USDC split 30/20) | [`32d4880d…`](https://stellar.expert/explorer/testnet/tx/32d4880ddd59345247267cda9edbccc858ad1b27a8a2f38c030cbab0e3ce28cb) | `partner_transfer` ×2 |
| FX rate-lock | `consume_quote` | [`9370006f…`](https://stellar.expert/explorer/testnet/tx/9370006f8f3182c89055c4c4f19c26f06e2f55d8e1644c0e44666d4da7cbeeec) | `quote_use` |
| Card-collateral | `settle` (covered) | [`f609b291…`](https://stellar.expert/explorer/testnet/tx/f609b29103335914cb6edda981df163b1960219cffb39dafdd211303c0a80e03) | `card_settle` |
| Card-collateral | `settle` (shortfall) | [`1e5df38f…`](https://stellar.expert/explorer/testnet/tx/1e5df38f1d9882cb9ecb2f0b5c8aa8b55c1197b2f61968d982817235d6427597) | `shortfall` |
