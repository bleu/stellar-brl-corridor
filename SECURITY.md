# Security Policy

## Reporting a vulnerability

Email **security@bleu.builders**. Do not open a public issue for security
reports. We aim to acknowledge within two business days.

## Scope

- In scope (mainnet-bound): the Soroban contracts under `contracts/fx-rate-lock`
  and `contracts/partner-attribution`. These are slated for an external review
  via SDF's Soroban Audit Bank before mainnet.
- Out of scope for audit: `contracts/card-collateral-poc` is a **testnet
  proof-of-concept** and is not audited.

## Audit status

- These contracts are **not yet audited**. External review is the Tranche-3
  deliverable, via SDF's Soroban Audit Bank, before mainnet.
- Build-time dependency (composed into all three contracts today): OpenZeppelin
  `stellar-contracts =0.7.1` (MIT, audited by OpenZeppelin's security team;
  formal verification by Certora). Composing these audited building blocks
  shrinks the novel surface that needs Bleu's own audit — it does **not** make
  the Bleu contracts audited. OZ 0.7.1 requires `soroban-sdk ^25.3.0`; the
  workspace pins `soroban-sdk =25.3.0`.

## Build provenance

Wasm artifacts embed the source commit + CI run in the `contractmetav0` custom
section (`stellar contract build --meta`), so any deployed contract can be
hash-verified against this repository.
