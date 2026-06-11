# Changelog

Notable changes to the Bleu BRL/PIX corridor. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions track the contract
workspace.

## [Unreleased]

### Added
- **FX Rate-Lock** contract — SEP-38 firm-quote `lock_quote` / `consume_quote`
  with Temporary-storage expiry (+grace), an on-chain SEP-38 price-invariant
  check, replay/double-settle guards, and `quote_locked` / `quote_use`
  `#[contractevent]`s. Admin auth composes OZ `stellar_access::access_control`
  (`#[only_admin]`); the rate-lock deadline is Bleu's own typed `QuoteExpired`
  check. 10 unit tests.
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
- **Architecture diagrams migrated from D2-rendered SVGs to inline Mermaid**
  (GitHub renders them natively; the old 4100px+ canvases were illegible at
  page width). The five C4 diagrams live as fenced blocks in
  `docs/architecture/README.md`; the root README inlines the L1 system context.
  `.d2` / `.svg` sources deleted — Mermaid is the single source of truth, and
  `scripts/check_docs.sh` (`just check-docs`) validates every block with
  mermaid-cli.
- **Composed OpenZeppelin `stellar-contracts =0.7.1`** into all three contracts.
  OZ 0.7.1 requires `soroban-sdk ^25.3.0`, so the workspace pin moved from
  `soroban-sdk 26` to `=25.3.0` (no OZ release targets soroban-sdk 26 yet).
- **FX Rate-Lock admin auth moved onto OZ `stellar_access::access_control`**
  (`#[only_admin]` on `lock_quote` / `consume_quote`), matching the sibling
  contracts. Dropped the `stellar-fee-abstraction` dependency and its
  `validate_expiration_ledger` call; the rate-lock deadline is now a single
  typed `QuoteExpired` predicate. `NotInitialized` / `AlreadyInitialized` error
  discriminants are retained for ABI stability. Behavior-identical.
- **Card-Collateral PoC dropped the unused `expires_at_ledger` field and the
  `ttl_ledgers` `reserve` parameter** (the value was stored but never read);
  `collateral_locked` no longer carries `expires_at_ledger`.
- **Partner Attribution `settle_split` no longer emits a phantom
  `partner_transfer`** for a zero-value share — the event fires only when balance
  actually moves.
- Wasm build sets `SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2=1`
  (justfile + CI), required because OZ 0.7.1 enables soroban-sdk's
  `experimental_spec_shaking_v2` feature.
- Wasm target pinned to `wasm32v1-none` (Rust ≥ 1.84 requirement for Soroban).

## [0.0.1] — 2026-05-27

### Added
- Initial public scaffold (Tranche-0): Cargo workspace, CI
  (fmt / clippy `-D warnings` / test / wasm build), MIT license, C4 architecture
  docs + diagrams, SEP/CAP coverage matrix.
