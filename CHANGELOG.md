# Changelog

Notable changes to the Bleu BRL/PIX corridor. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions track the contract
workspace.

## [Unreleased]

### Added
- **FX Rate-Lock** contract — SEP-38 firm-quote `lock_quote` / `consume_quote`
  with Temporary-storage expiry (+grace), an on-chain SEP-38 price-invariant
  check, replay/double-settle guards, and `quote_locked` / `quote_use`
  `#[contractevent]`s. Composes OZ `stellar_fee_abstraction::validate_expiration_ledger`
  as the rate-lock deadline guard. 10 unit tests.
- **Partner Attribution** contract — a SAC admin wrapper over USDC composing OZ
  `stellar_tokens::fungible::sac_admin_wrapper` + `stellar_access::access_control`.
  `settle_split` moves real balance through the SAC's SEP-41 `transfer`,
  atomically splitting to partner payouts under the `Σ partner.bps ≤ 10_000`
  invariant, with `partner_set` / `partner_removed` / `partner_transfer` events.
  11 unit tests.
- **Card-Collateral testnet PoC** — `reserve` / `settle` / `release` lifecycle
  with auth/clearing shortfall accounting, composing OZ
  `stellar_contract_utils::pausable` (circuit breaker) + `stellar_access::access_control`.
  USDC collateral only; never XLM. 9 unit tests.
- BR-configured Anchor Platform compose stack + SEP-1 `stellar.toml` template.
- TypeScript + Python SDK skeletons; Soroban event-indexer stub.

### Changed
- **Composed OpenZeppelin `stellar-contracts =0.7.1`** into all three contracts.
  OZ 0.7.1 requires `soroban-sdk ^25.3.0`, so the workspace pin moved from
  `soroban-sdk 26` to `=25.3.0` (no OZ release targets soroban-sdk 26 yet).
- Wasm build sets `SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2=1`
  (justfile + CI), required because OZ 0.7.1 enables soroban-sdk's
  `experimental_spec_shaking_v2` feature.
- Wasm target pinned to `wasm32v1-none` (Rust ≥ 1.84 requirement for Soroban).

## [0.0.1] — 2026-05-27

### Added
- Initial public scaffold (Tranche-0): Cargo workspace, CI
  (fmt / clippy `-D warnings` / test / wasm build), MIT license, C4 architecture
  docs + diagrams, SEP/CAP coverage matrix.
