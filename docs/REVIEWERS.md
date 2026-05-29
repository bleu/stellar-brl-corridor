# For SCF reviewers — verify this in 60 seconds

Everything below is **live and clickable**. You don't have to trust a roadmap — check the receipts.

## 0. What this repo is
A BR-configured **Anchor Platform** deployment + three Soroban contracts (SEP-38 FX rate-lock, on-chain partner attribution, card-collateral PoC), each composing **OpenZeppelin's audited `stellar-contracts =0.7.1`**. MIT. 30 unit tests, CI green. Built for [SCF #44](https://communityfund.stellar.org/) (Build Award, Integration track).

## 1. The contracts are live on testnet (10s — just click)
Deployed addresses + explorer links: [`deployments/testnet.json`](../deployments/testnet.json) · also in the README table.

| Primitive | Live testnet contract |
|---|---|
| FX rate-lock | [`CDI6XOFI…JEHIL`](https://stellar.expert/explorer/testnet/contract/CDI6XOFI3OSXKDPHRLPGKJGWHP37V2EFX3KUCQ6R2DUMIT2Y7JSJEHIL) |
| Partner attribution | [`CBQNOWPD…X763KR`](https://stellar.expert/explorer/testnet/contract/CBQNOWPD4T2PMGADTE6QID6WLMDU7LAHS4LPKOV2USLVXD3X6DX763KR) |
| Card-collateral PoC | [`CDBZXWAN…C5LQ6H3MW`](https://stellar.expert/explorer/testnet/contract/CDBZXWAN6564WGPWXJRFD6EXEKHYHJV62G23SJJLY5I6ROLC5LQ6H3MW) |

## 2. The primitives actually *execute* on-chain (20s — click the txs)
Full walkthrough with every transaction: [`docs/DEMO.md`](DEMO.md). The flagship:

- **Atomic B2B2B revenue split** — `settle_split` moved real USDC, split 30%/20% to two partners, emitted two `partner_transfer` events:
  [tx `aa141ef9…`](https://stellar.expert/explorer/testnet/tx/aa141ef9878d3b7a06b309df76cbf526c76d9cb39cb8e8a980e38bae68d9233f)
- **FX firm-quote consume** (`quote_use`, price invariant held on-chain): [tx `90a3e3ef…`](https://stellar.expert/explorer/testnet/tx/90a3e3eff463f358df4c7fdf10759b9776caabbdb929d3f3beb36e154e59112c)
- **Card settle + shortfall event**: [tx `9bd0f64e…`](https://stellar.expert/explorer/testnet/tx/9bd0f64e1b8f3752aed7bc4238508ecc8ac6ceddda449841ca945e3e116c27b8) · [tx `1210d0fa…`](https://stellar.expert/explorer/testnet/tx/1210d0fa5b0850d617ecd6fe4cf93b865186c650ce717ee4f869b215e630b3f8)

## 3. Run it yourself (each is one command)

![SDK reading live testnet state](media/sdk-live-testnet.gif)

```bash
git clone git@github.com:bleu/stellar-brl-corridor.git && cd stellar-brl-corridor

just demo          # re-run the full on-chain demo (real testnet txs, prints a clickable hash per step)
just sdk-example   # TS SDK reads live on-chain state (admin / total_bps / sac) off testnet RPC — read-only
just ap-up && just ap-check   # boot the BR Anchor Platform; it serves SEP-1 stellar.toml + SEP-38 /info
cargo test --workspace        # 30 passing unit tests
```

## 4. Read the design
- **Technical architecture** (C4 L1/L2/L3 + contract overview): [`docs/architecture/README.md`](architecture/README.md)
- **SEP / CAP coverage matrix**: [`docs/sep-cap-coverage.md`](sep-cap-coverage.md)
- **Anchor Platform** (SEP-1 TOML, SEP-38 quote with IOF-ready `fee.details[]`): [`docs/ANCHOR-PLATFORM.md`](ANCHOR-PLATFORM.md)
- **Grant summary**: [`docs/grant.md`](grant.md)

## What's done vs. what the grant funds
**Done (verifiable now):** 3 contracts deployed + demonstrated on-chain; OZ-composed; 30 tests; CI green; TS SDK reading live state; AP booting + serving SEP-1/SEP-38 `/info`. **Grant-funded (T1→T3):** SEP-38 rate-integration + sandbox-anchor wiring, end-to-end SEP-31 receive flow, audit (SDF Audit Bank), mainnet launch, published SDKs, BR-anchor integration.

> **A note on IOF:** the SEP-38 `fee.details[]` carries a discrete, default-`0` IOF entry. IOF is **not currently mandated for crypto/virtual-asset FX in Brazil** — it's wired anticipatorily so the rail is ready if/when it applies.
