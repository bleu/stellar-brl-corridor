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
- **Run captured:** 2026-05-29 (machine-readable record: [`deployments/testnet-demo.json`](../deployments/testnet-demo.json))

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
stellar contract invoke --id CBQNOWPD4T2PMGADTE6QID6WLMDU7LAHS4LPKOV2USLVXD3X6DX763KR \
  --source bleu-deployer --network testnet -- \
  set_partner --partner <A> --fee_bps 3000 --payout <A> --domain accountant
stellar contract invoke --id CBQNOWPD4T2PMGADTE6QID6WLMDU7LAHS4LPKOV2USLVXD3X6DX763KR \
  --source bleu-deployer --network testnet -- \
  set_partner --partner <B> --fee_bps 2000 --payout <B> --domain fxoperator
```

- set A (3000 bps) → [`af79ccd1…`](https://stellar.expert/explorer/testnet/tx/af79ccd14e41aa2b27920fcba1d876ea19f23df02a25f1783b47b07290ea740a) — event `partner_set`, `total_bps` → 5000
- set B (2000 bps) → [`b2331c74…`](https://stellar.expert/explorer/testnet/tx/b2331c74a20477ee60577f723ff597b8485fbc13ec5cb9cb1b6bec16de0d1beb) — event `partner_set`, `total_bps` → 5000

**The split — settle a 100 USDC flow:**

```bash
stellar contract invoke --id CBQNOWPD4T2PMGADTE6QID6WLMDU7LAHS4LPKOV2USLVXD3X6DX763KR \
  --source bleu-deployer --network testnet -- \
  settle_split \
  --from CBQNOWPD4T2PMGADTE6QID6WLMDU7LAHS4LPKOV2USLVXD3X6DX763KR \
  --amount 1000000000 \
  --partners '["<A>","<B>"]' \
  --tx_hash <sep31-tx-hash>
```

- **tx:** [`aa141ef9…`](https://stellar.expert/explorer/testnet/tx/aa141ef9878d3b7a06b309df76cbf526c76d9cb39cb8e8a980e38bae68d9233f)
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
stellar contract invoke --id CDI6XOFI3OSXKDPHRLPGKJGWHP37V2EFX3KUCQ6R2DUMIT2Y7JSJEHIL \
  --source bleu-deployer --network testnet -- \
  lock_quote --quote_id <quote-id> \
  --sell_amount 53191 --buy_amount 1000000000 --price 530 --fee_iof 191 \
  --ttl_ledgers 120
```

- **tx:** [`aa22d19b…`](https://stellar.expert/explorer/testnet/tx/aa22d19ba34f9708bf5654dbd306f61d7afc9ba744887248c311001da055f635)
- **event:** `quote_locked` (`expires_at_ledger`, `fee_iof: 191`)
- **observable effect:** `is_active(quote_id)` → `true`.

**Consume (bind to a SEP-31 transaction):**

```bash
stellar contract invoke --id CDI6XOFI3OSXKDPHRLPGKJGWHP37V2EFX3KUCQ6R2DUMIT2Y7JSJEHIL \
  --source bleu-deployer --network testnet -- \
  consume_quote --quote_id <quote-id> --sep31_tx_id <sep31-tx-id>
```

- **tx:** [`90a3e3ef…`](https://stellar.expert/explorer/testnet/tx/90a3e3eff463f358df4c7fdf10759b9776caabbdb929d3f3beb36e154e59112c)
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
stellar contract invoke --id CDBZXWAN6564WGPWXJRFD6EXEKHYHJV62G23SJJLY5I6ROLC5LQ6H3MW \
  --source bleu-deployer --network testnet -- \
  reserve --auth_id <auth-id> --amount 500000000 --ttl_ledgers 600
stellar contract invoke --id CDBZXWAN6564WGPWXJRFD6EXEKHYHJV62G23SJJLY5I6ROLC5LQ6H3MW \
  --source bleu-deployer --network testnet -- \
  settle --auth_id <auth-id> --final_amount 300000000
stellar contract invoke --id CDBZXWAN6564WGPWXJRFD6EXEKHYHJV62G23SJJLY5I6ROLC5LQ6H3MW \
  --source bleu-deployer --network testnet -- \
  release --auth_id <auth-id>
```

- reserve 50 USDC → [`95d55425…`](https://stellar.expert/explorer/testnet/tx/95d55425faab613e0dbaf7a5f4898053cb022652d0c32bd0eb1ed865cf7ca6bd) — event `collateral_locked`
- settle 30 USDC → [`9bd0f64e…`](https://stellar.expert/explorer/testnet/tx/9bd0f64e1b8f3752aed7bc4238508ecc8ac6ceddda449841ca945e3e116c27b8) — event `card_settle`, returns shortfall `0` (fully covered)
- release → [`18412c46…`](https://stellar.expert/explorer/testnet/tx/18412c46229f7ed8cc443c0da33fa2b06575cb2e91f4a53fd7aa7d7478ae2036) — event `collateral_released`, returns `200000000` (20 USDC unused remainder freed)

**Shortfall race — reserve 10 USDC, clearing comes in at 14:**

```bash
stellar contract invoke --id CDBZXWAN6564WGPWXJRFD6EXEKHYHJV62G23SJJLY5I6ROLC5LQ6H3MW \
  --source bleu-deployer --network testnet -- \
  reserve --auth_id <auth-id-2> --amount 100000000 --ttl_ledgers 600
stellar contract invoke --id CDBZXWAN6564WGPWXJRFD6EXEKHYHJV62G23SJJLY5I6ROLC5LQ6H3MW \
  --source bleu-deployer --network testnet -- \
  settle --auth_id <auth-id-2> --final_amount 140000000
```

- reserve 10 USDC → [`aea581b6…`](https://stellar.expert/explorer/testnet/tx/aea581b6a7522048fce1293841a3ae7a146b5d77117514901815559413d59b1b) — event `collateral_locked`
- settle 14 USDC → [`1210d0fa…`](https://stellar.expert/explorer/testnet/tx/1210d0fa5b0850d617ecd6fe4cf93b865186c650ce717ee4f869b215e630b3f8) — events `card_settle` **and** `shortfall`, returns `40000000`
- **observable effect:** clearing exceeded locked collateral by **4 USDC** (`40000000`);
  the `shortfall` event is emitted as the off-chain top-up reconciliation signal.

---

## Summary — key tx to cite

| Primitive | Key operation | Tx | Event |
| --- | --- | --- | --- |
| Partner attribution | `settle_split` (100 USDC split 30/20) | [`aa141ef9…`](https://stellar.expert/explorer/testnet/tx/aa141ef9878d3b7a06b309df76cbf526c76d9cb39cb8e8a980e38bae68d9233f) | `partner_transfer` ×2 |
| FX rate-lock | `consume_quote` | [`90a3e3ef…`](https://stellar.expert/explorer/testnet/tx/90a3e3eff463f358df4c7fdf10759b9776caabbdb929d3f3beb36e154e59112c) | `quote_use` |
| Card-collateral | `settle` (covered) | [`9bd0f64e…`](https://stellar.expert/explorer/testnet/tx/9bd0f64e1b8f3752aed7bc4238508ecc8ac6ceddda449841ca945e3e116c27b8) | `card_settle` |
| Card-collateral | `settle` (shortfall) | [`1210d0fa…`](https://stellar.expert/explorer/testnet/tx/1210d0fa5b0850d617ecd6fe4cf93b865186c650ce717ee4f869b215e630b3f8) | `shortfall` |
