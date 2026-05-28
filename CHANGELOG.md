# Changelog

Notable changes to the Bleu BRL/PIX corridor. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions track the contract
workspace.

## [Unreleased]

### Added
- **FX Rate-Lock** contract — SEP-38 firm-quote `lock_quote` / `consume_quote`
  with Temporary-storage expiry (+grace), an on-chain SEP-38 price-invariant
  check, replay/double-settle guards, and `quote_locked` / `quote_use`
  `#[contractevent]`s. 6 unit tests.
- **Partner Attribution** contract — on-chain partner config with the
  `Σ partner.bps ≤ 10_000` invariant enforced on every write, fee computation,
  and `partner_set` / `partner_removed` / `partner_transfer` events. 7 unit tests.
- **Card-Collateral testnet PoC** — `reserve` / `settle` / `release` lifecycle
  with auth/clearing shortfall accounting. USDC collateral only; never XLM.
  6 unit tests.
- BR-configured Anchor Platform compose stack + SEP-1 `stellar.toml` template.
- TypeScript + Python SDK skeletons; Soroban event-indexer stub.

### Changed
- Events migrated to the soroban-sdk 26 `#[contractevent]` macro.
- Wasm target pinned to `wasm32v1-none` (Rust ≥ 1.84 requirement for Soroban).

## [0.0.1] — 2026-05-27

### Added
- Initial public scaffold (Tranche-0): Cargo workspace, CI
  (fmt / clippy `-D warnings` / test / wasm build), MIT license, C4 architecture
  docs + diagrams, SEP/CAP coverage matrix.
