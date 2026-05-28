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

- Pre-mainnet: external review via SDF's Soroban Audit Bank (grant Tranche-3).
- Planned build-time dependency (mainnet-hardening pass, not yet wired in):
  OpenZeppelin `stellar-contracts =0.7.1` (MIT, audited by OpenZeppelin's
  security team; formal verification by Certora).

## Build provenance

Wasm artifacts embed the source commit + CI run in the `contractmetav0` custom
section (`stellar contract build --meta`), so any deployed contract can be
hash-verified against this repository.
