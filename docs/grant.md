# Grant summary

This repo is the engineering output of Bleu's [Stellar Community Fund #44](https://communityfund.stellar.org/) Build Award (Integration track) submission — **"Operationalizing Anchor Platform for Brazil: a compliant BRL/PIX payments corridor on Stellar."**

- **Ask:** US$ 110,000 over five months, four tranches (10 / 20 / 30 / 40).
- **Integration List items:** Stellar Anchor Platform, Stellar Disbursement Platform.
- **Ships:** a BR-configured Anchor Platform deployment + two mainnet-bound Soroban primitives (SEP-38 rate-lock, partner attribution; audited via the SDF Soroban Audit Bank before mainnet) + a card-collateral smart-account testnet PoC + public TS + Python SDKs.
- **Honest moat:** the contract logic is portable; the operating corridor — a licensed BR anchor on PIX, a BR-configured Anchor Platform, BCB compliance hooks, an in-market BR distribution network — is not.

## Tranches

| # | % | Gate (Bleu-controlled) |
| --- | --- | --- |
| **T0** | 10% | Public GitHub + MIT + green CI + testnet skeletons + external-counsel legal memo + Audit Bank application submitted |
| **T1** | 20% | Testnet E2E — contracts + Anchor Platform vs sandbox anchor + walkthrough video |
| **T2** | 30% | Contracts feature-complete + audit engaged + BR integration + compliance hooks + reference dashboard |
| **T3** | 40% | **Mainnet launch** — audit cleared (SDF Audit Bank credits), audited contracts live + E2E corridor flow + public SDK + reference fintech integration + professional user testing |

Tranche releases are gated only on deliverables in Bleu's control. The live BR-licensed anchor + cumulative volume are **reported outcomes**, never payment conditions — a tested offshore Stellar anchor is the "or equivalent" path.

## Team

Core build: **two engineers at full allocation** (Pedro Yves Fracari, Smart Contract Lead; Luiz Gustavo Abou Hatem de Liz, Stellar workstream) ≈ ~43 engineer-weeks, plus fractional product / design / GTM / commercial.

Smart-contract delivery record: CoW Protocol (30+ months continuous), Balancer, Morpho, Silo Finance, Perk (3+ years). The Soroban here in this repo (3 contracts, 26 tests, CI green) is the Stellar receipt; production fintech (PIX, USDC yield, B2B2B distribution) runs under a private commercial engagement, with a reference letter available to the SCF panel.

## Get involved

- Open an [issue](https://github.com/bleu/stellar-brl-corridor/issues) or PR.
- Reach out: hello@bleu.builders.
- Watch the repo for tranche updates.
