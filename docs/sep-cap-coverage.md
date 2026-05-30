# SEP & CAP coverage

Which Stellar Ecosystem Proposals and Core Advancement Proposals Bleu **consumes**, **extends**, or **proposes**. Grant scope maps to existing protocol seams, not reinvention.

| Spec | Role | Bleu usage |
| --- | --- | --- |
| **SEP-1** | Anchor metadata | Publishes `SIGNING_KEY`, `TRANSFER_SERVER_SEP0024`, `DIRECT_PAYMENT_SERVER`, `ANCHOR_QUOTE_SERVER`, `WEB_AUTH_ENDPOINT`, `KYC_SERVER`, `[[CURRENCIES]]`. |
| **SEP-9** | KYC field dictionary | Consumed + **extended** — BR fields (`cpf_number`, `cnpj_number`, `pix_key`, `pix_key_type`, `pix_end_to_end_id`) shipped as SEP-12 custom fields in v1; upstream PR filed during grant. |
| **SEP-10** | Web auth / JWT | Consumed as-is. `client_domain` drives off-chain partner attribution. |
| **SEP-12** | KYC API | Consumed as-is; BR fields as custom extensions under `type=sep31-sender/receiver`. Dual-compliance BYO model. |
| **SEP-24** | Interactive deposit/withdraw | Consumed as-is for wallet-driven BRL onramp. |
| **SEP-31** | Cross-border B2B | Consumed as-is. `quotes_required=true`; driven by Platform JSON-RPC actions. Refund invariant in CI. |
| **SEP-38** | Firm-quote RFQ | Consumed at the API surface; on-chain rate-lock is a **proposed companion SEP**. IOF via existing `fee.details[]`. |
| **SEP-41** | Soroban token interface | Consumed as-is for the partner-attribution wrapper (wraps USDC SAC). |
| **CAP-21** | Tx preconditions | `minSeqAge` for card-collateral vault cool-downs (PoC). |
| **CAP-23** | Claimable balances | `And(Claimant, AbsBefore)` predicates for auto-return on stale rate-locks and unused card-vault funds (PoC). |
| **CAP-33** | Sponsored reserves | Core onboarding primitive: atomic `BeginSponsoring`/`EndSponsoring` sandwich for zero-XLM enterprise users. |
| **CAP-35** | Asset clawback | Inherits Circle's `AUTH_CLAWBACK_ENABLED` on USDC; named for future BRL-on-Stellar. |
| **CAP-46-05** | Static footprint | Predictable fee quoting — all read/write entries declared before execution. |
| **CAP-46-06** | Deterministic asset SAC | `CONTRACT_ID_PREIMAGE_FROM_ASSET` for USDC SAC composition; no re-issued balances. |
| **CAP-46-12** | Storage types | `StorageType::Temporary` for quotes (die on TTL, no stale-quote risk); `Persistent` for partner configs and vault locks. |
| **OpenZeppelin Stellar Contracts `=0.7.1`** (MIT, audited by OZ, SDF collaboration) | Audited building blocks (composed today) | **Composed now**, not aspirational. Wired into all three contracts: `stellar_access::access_control` for admin auth (fx-rate-lock, partner-attribution, card-collateral PoC); `stellar_tokens::fungible::sac_admin_wrapper` over USDC's deterministic SAC (partner-attribution); `stellar_contract_utils::pausable` (card-collateral PoC). `SmartAccount` + `policies::spending_limit` + `verifiers::webauthn`/`ed25519` remain the production-vault target for card-collateral. **Version note:** OZ 0.7.1 (latest release) requires `soroban-sdk ^25.3.0`; the workspace is pinned to `=25.3.0` to compose `=0.7.1` for real — no OZ release targets `soroban-sdk 26` yet. **Out of OZ scope (always Bleu-specific)**: `partner_transfer` event, SEP-38 quote-hash lifecycle, the typed `QuoteExpired` rate-lock deadline, shortfall invariant. |

## Upstream contributions (filed during the grant)

- **SEP-9 BR extensions** — `cpf_number`, `cnpj_number`, `pix_key`, `pix_key_type ∈ {cpf,cnpj,email,phone,evp}`, `pix_end_to_end_id`. Follows the precedent of existing country-specific KYC fields (Mexico's CLABE, Argentina's CBU/CVU).
- **Draft SEP — Anchor Quote Rate-Lock** — formalizes SEP-38's off-chain reservation as a Soroban state machine so cross-anchor wallets can verify expiry without trusting each anchor's custom contract.
- **Draft SEP — Partner Attribution for Regulated Corridors** — composes with SEP-10 `client_domain` so B2B2B distribution gains an interoperable ledger-level primitive.
