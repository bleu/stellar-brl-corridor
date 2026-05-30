# For SCF reviewers — verify this in 60 seconds

Everything below is **live and clickable**. You don't have to trust a roadmap — check the receipts.

## 0. What this repo is
A BR-configured **Anchor Platform** deployment + three Soroban contracts (SEP-38 FX rate-lock, on-chain partner attribution, card-collateral PoC), each composing **OpenZeppelin's audited `stellar-contracts =0.7.1`**. MIT. 31 unit tests, CI green. Built for [SCF #44](https://communityfund.stellar.org/) (Build Award, Integration track).

## 1. The contracts are live on testnet (10s — just click)
Deployed addresses + explorer links: [`deployments/testnet.json`](../deployments/testnet.json) · also in the README table.

| Primitive | Live testnet contract |
|---|---|
| FX rate-lock | [`CDZLXRAW…JONVRW`](https://stellar.expert/explorer/testnet/contract/CDZLXRAWDHU6JLDAU5PRTYC3NNXWRWXIDTPJNOTIHIMLVAPSA5JONVRW) |
| Partner attribution | [`CDBUJYLO…K53YR`](https://stellar.expert/explorer/testnet/contract/CDBUJYLO5TUXGU5VSQGULB2GXNJ2NPLKI6IPUCFBK774KPHNV22K53YR) |
| Card-collateral PoC | [`CC7HSHXJ…WH2WT`](https://stellar.expert/explorer/testnet/contract/CC7HSHXJBWCVA7PQH7GW2QASVACOYYCOZNCKDQGYM7LOIQ3C2T6WH2WT) |

## 2. The primitives actually *execute* on-chain (20s — click the txs)
Full walkthrough with every transaction: [`docs/DEMO.md`](DEMO.md). The flagship:

- **Atomic B2B2B revenue split** — `settle_split` moved real USDC, split 30%/20% to two partners, emitted two `partner_transfer` events:
  [tx `32d4880d…`](https://stellar.expert/explorer/testnet/tx/32d4880ddd59345247267cda9edbccc858ad1b27a8a2f38c030cbab0e3ce28cb)
- **FX firm-quote consume** (`quote_use`, price invariant held on-chain): [tx `9370006f…`](https://stellar.expert/explorer/testnet/tx/9370006f8f3182c89055c4c4f19c26f06e2f55d8e1644c0e44666d4da7cbeeec)
- **Card settle + shortfall event**: [tx `f609b291…`](https://stellar.expert/explorer/testnet/tx/f609b29103335914cb6edda981df163b1960219cffb39dafdd211303c0a80e03) · [tx `1e5df38f…`](https://stellar.expert/explorer/testnet/tx/1e5df38f1d9882cb9ecb2f0b5c8aa8b55c1197b2f61968d982817235d6427597)

## 3. Run it yourself (each is one command)

![SDK reading live testnet state](media/sdk-live-testnet.gif)

```bash
git clone git@github.com:bleu/stellar-brl-corridor.git && cd stellar-brl-corridor

just demo          # re-run the full on-chain demo (real testnet txs, prints a clickable hash per step)
just sdk-example   # TS SDK reads live on-chain state (admin / total_bps / sac) off testnet RPC — read-only
just index         # ingest the contracts' live events off RPC getEvents → NDJSON (best-practice indexer)
just ap-up && just ap-check   # boot the BR Anchor Platform; it serves SEP-1 stellar.toml + SEP-38 /info
cargo test --workspace        # 31 passing unit tests
```

## 4. Read the design
- **Technical architecture** (C4 L1/L2/L3 + contract overview): [`docs/architecture/README.md`](architecture/README.md)
- **SEP / CAP coverage matrix**: [`docs/sep-cap-coverage.md`](sep-cap-coverage.md)
- **Anchor Platform** (SEP-1 TOML, SEP-38 quote with IOF-ready `fee.details[]`): [`docs/ANCHOR-PLATFORM.md`](ANCHOR-PLATFORM.md)
- **Event indexer** (RPC `getEvents` → Postgres/NDJSON, best-practice): [`indexer/`](../indexer)
- **Build provenance** — deployed contracts reproduce **byte-for-byte** from source: [`docs/PROVENANCE.md`](PROVENANCE.md)
- **Grant summary**: [`docs/grant.md`](grant.md)

## What's done vs. what the grant funds
**Done (verifiable now):** 3 contracts deployed + demonstrated on-chain; OZ-composed; 30 tests; CI green; TS SDK reading live state; AP booting + serving SEP-1/SEP-38 `/info`. **Grant-funded (T1→T3):** SEP-38 rate-integration + sandbox-anchor wiring, end-to-end SEP-31 receive flow, audit (SDF Audit Bank), mainnet launch, published SDKs, BR-anchor integration.

> **A note on IOF:** the SEP-38 `fee.details[]` carries a discrete, default-`0` IOF entry. IOF is **not currently mandated for crypto/virtual-asset FX in Brazil** — it's wired anticipatorily so the rail is ready if/when it applies.
