# For SCF reviewers — verify this in 60 seconds

Everything below is **live and clickable**. You don't have to trust a roadmap — check the receipts.

## 0. What this repo is
A BR-configured **Anchor Platform** deployment + three Soroban contracts (SEP-38 FX rate-lock, on-chain partner attribution, card-collateral PoC), each composing **OpenZeppelin's audited `stellar-contracts =0.7.1`**. MIT. 31 unit tests, CI green. Built for [SCF #44](https://communityfund.stellar.org/) (Build Award, Integration track).

## 1. The contracts are live on testnet (10s — just click)
Deployed addresses + explorer links: [`deployments/testnet.json`](../deployments/testnet.json) · also in the README table.

| Primitive | Live testnet contract |
|---|---|
| FX rate-lock | [`CCF7U43L…UG2AI`](https://stellar.expert/explorer/testnet/contract/CCF7U43LBCHURKKHEHLBWUUZKNPFWQUQTESJLFWWVHCNKZKQMG3UG2AI) |
| Partner attribution | [`CCXSXAM7…23OFB`](https://stellar.expert/explorer/testnet/contract/CCXSXAM7KLACDCD2UDBM37BFTZZYATPTN4WFXJASIEGZ4ZO44CM23OFB) |
| Card-collateral PoC | [`CAVFABBN…IFRWV`](https://stellar.expert/explorer/testnet/contract/CAVFABBNRNU6CRAYNIH2OZSZBDKGXRUYVIUGNZKVKAUYK6P3GGOIFRWV) |

## 2. The primitives actually *execute* on-chain (20s — click the txs)
Full walkthrough with every transaction: [`docs/DEMO.md`](DEMO.md). The flagship:

- **Atomic B2B2B revenue split** — `settle_split` moved real USDC, split 30%/20% to two partners, emitted two `partner_transfer` events:
  [tx `c8b95270…`](https://stellar.expert/explorer/testnet/tx/c8b95270f602384a79254723a6a23879120012ce49d7bb16c3b3d2f9f7f0978c)
- **FX firm-quote consume** (`quote_use`, price invariant held on-chain): [tx `73bef0ce…`](https://stellar.expert/explorer/testnet/tx/73bef0ce69c797d0e6334b62572e06dd8338ea2708f109ca435c2db80c8a8150)
- **Card settle + shortfall event**: [tx `49f506c9…`](https://stellar.expert/explorer/testnet/tx/49f506c9a9a322e8672e667b75ebdfe34312a14ba34263e9c5fd84e1b02d4389) · [tx `17425f22…`](https://stellar.expert/explorer/testnet/tx/17425f2273c7c8e409d14f3e289c308e1b137cdd8ff94032c74e29f468f3e0f0)

## 3. Run it yourself

```bash
git clone git@github.com:bleu/stellar-brl-corridor.git && cd stellar-brl-corridor
```

**Read-only — no deployer key required:**

```bash
cargo test --workspace        # 31 passing unit tests (Rust only, no network)
just sdk-example              # TS SDK reads live on-chain state off testnet RPC (admin / total_bps / sac)
just index                    # ingest the contracts' live events off RPC getEvents → NDJSON
just ap-up && just ap-check   # boot the BR Anchor Platform; serves SEP-1 stellar.toml + SEP-38 /info
```

**Full on-chain demo — deploys your own copy, then exercises it (~5 min):**

```bash
just deploy-testnet   # generates a fresh bleu-deployer key + funds it via friendbot, deploys all three contracts
just demo             # runs every primitive against your newly deployed contracts, prints a clickable tx hash per step
```

![just demo opening: settle_split moving real USDC 30/20 on testnet](media/demo-testnet.gif)

> `just demo` opening, recorded against the canonical deployment: partner mint → `set_partner` ×2 → `settle_split` printing its tx hash. The run continues through all 12 steps — the captured record is [`deployments/testnet-demo.json`](../deployments/testnet-demo.json), and the §2 hashes above link into it.

`just deploy-testnet` creates the `bleu-deployer` keystore entry automatically if it doesn't exist — no pre-setup needed. The demo is self-contained against whatever addresses `just deploy-testnet` writes to `deployments/testnet.json`.

> The pre-run tx hashes in section 2 above are from a captured run against the canonical deployment. Your own `just demo` run will produce different hashes (different quote ids, auth ids, partners) but exercises identical code paths.

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
