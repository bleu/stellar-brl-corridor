# Bleu — Technical Architecture

Companion to the SCF Build Award (Integration track) proposal. Follows the Stellar KickStart C4 template: L1 System Context → L2 Container → L3 sequences → Contract Overview → Tech Stack → Integrations.

This document is **Stellar-specific** and shows the integration plan against the two SCF Integration-List building blocks Bleu operationalizes: **Anchor Platform** and the **Stellar Disbursement Platform (SDP)**.

> **Scope in one line.** A BR-configured **Anchor Platform** deployment + **two** mainnet-bound Soroban primitives (SEP-38 rate-lock, partner attribution; audit scheduled via the Soroban Audit Bank pre-mainnet), with a **card-collateral smart account shipped as a testnet proof-of-concept** (off the audit/mainnet critical path). Bleu holds no keys; the licensed BR anchor holds the regulated functions.

---

## 1. Introduction

### 1.1 High-Level Overview

Bleu operationalizes two SDF reference implementations — **Anchor Platform** (SEP-10/12/24/31/38) and the **Stellar Disbursement Platform** (SDP, whose one-way bulk-disbursement pattern Bleu makes bidirectional at the API surface) — for Brazil's BRL/PIX corridor, and ships **two** MIT-licensed Soroban primitives (implemented + tested in this repo, audit-bound pre-mainnet) on top:

1. **SEP-38 Rate-Lock** *(mainnet-bound, audit pending)* — firm-quote contract using Temporary storage (CAP-46-12) for quote rows keyed by `DataKey::Quote(BytesN<32>)`; Bleu owns the SEP-38 quote hashing, Temporary-storage lifecycle, and the typed `QuoteExpired` rate-lock deadline. Admin auth composes OpenZeppelin's `stellar_access::access_control` (`#[only_admin]` on `lock_quote` / `consume_quote`), as in the sibling contracts (see [Contract Overview](#3-contract-overview)).
2. **Partner-Attribution Wrapper** *(mainnet-bound, audit pending)* — a SAC admin wrapper on USDC built on OpenZeppelin's `stellar_tokens::fungible::sac_admin_wrapper` over USDC's deterministic SAC, gated by `stellar_access::access_control`. Its `settle_split` moves real balance through the SAC's SEP-41 `transfer`, atomically splitting to partner payouts; it emits a `partner_transfer` event and enforces `Σ partner.bps ≤ 10_000`.

Two further pieces are **not** standalone audited contracts:

- **Payout orchestration is glue, not a contract.** Batched bidirectional dispatch (USDC SAC `transfer` under `require_auth()` over `Vec<PayoutEntry>` keyed by `(batch_id, cursor)`, monotonic `processed_cursor`, fee-bump ×10 retry) lives in the **Anchor Platform business server**, making the SDP one-way bulk model bidirectional for B2B.
- **Card-Collateral Vault is a testnet PoC.** The PoC implements the collateral state machine (`reserve` / `settle` / `release`) and the auth/clearing shortfall accounting, composing OpenZeppelin's `stellar_contract_utils::pausable` (circuit breaker on new collateral) + `stellar_access::access_control` (admin gating). The production vault additionally composes OpenZeppelin's `stellar_accounts::smart_account::SmartAccount` (`do_check_auth`) + `policies::spending_limit` + `verifiers::webauthn` / `ed25519`, with CAP-21 `minSeqAge` cool-downs and CAP-23 claimable-balance auto-return as Bleu-specific glue. Demonstrates a Stellar-only capability — collateral can keep earning **USDC** yield (never XLM) while a policy releases only the spent slice at card auth. Off the audit/mainnet critical path.

Fintechs, FX operators, and channel partners consume the stack via REST API, TypeScript / Python SDK, or a reference dashboard. **Bleu holds no keys.** End-user funds flow through a **BACEN FX-licensed Brazilian anchor** (selected from a 10-candidate pool; an offshore Stellar-compatible anchor is the tested "or equivalent" fallback) that holds the regulated functions (FX, custody, KYC/KYB, COAF, Res 521 reporting).

### 1.2 Constraints

**Security**
- **Non-custodial posture.** Bleu's contracts never hold third-party funds; the anchor holds SPSAV licensing.
- **Static footprint** (CAP-46-05) on every Soroban primitive — predictable fee quoting.
- **Temporary storage for ephemeral state** (CAP-46-12 — dies at TTL=0, unrecoverable): SEP-38 quote rows; per-authorization vault locks (PoC).
- **Persistent storage for long-lived state**: partner configs.

**Regulatory**
- **BCB Resoluções 519–521** (SPSAV regime; FX-reporting regime in force). Bleu = non-custodial software provider; external-counsel-signed preliminary memo at submission.
- **IOF-ready disclosure** via SEP-38 `fee.details[]` (`{name: "IOF", description: "Decreto 6.306/2007"}`, default `0`) — anticipatory; IOF is not currently mandated for crypto/virtual-asset FX. The anchor would collect it at BRL↔USDC conversion if/when it applies.
- **LGPD dual-controller**: anchor controls anchor-collected data, fintech controls SEP-12-injected KYC, Bleu processes operational metadata only.
- **Dual-compliance KYC/KYB**: SEP-12 shares *verified attributes*; does not replace either party's independent obligation.

**Open-source**
- **MIT** on every artifact.
- **Verifiable builds** via `stellar contract build --meta commit=<sha> --meta ci_run=<url>` — embedded in the `contractmetav0` custom Wasm section.

---

## 2. Architecture Overview

### 2.1 Flow — SEP-31 B2B PIX receive with SEP-38 firm quote

1. Fintech calls `POST /quote` (SEP-38) via Bleu API → AP quote endpoint → `id` + `expires_at` + `total_price` + `fee.details[]` (incl. IOF disclosure).
2. Bleu locks the quote on-chain in the rate-lock contract's Temporary storage keyed by `DataKey::Quote(id)` with `expires_at_ledger = now + 180` (~15 min).
3. Fintech calls `POST /transactions` (SEP-31) with `quote_id` + `sender_id` / `receiver_id` (both from prior SEP-12 KYC) + `destination_asset = iso4217:BRL` + `funding_method = "PIX"`.
4. Sender submits a Stellar USDC payment (classic or SAC) with `stellar_memo`.
5. AP's Stellar Observer detects the payment → calls Business Server `notify_onchain_funds_received` → status → `pending_receiver`.
6. Business Server triggers the PIX payout via the anchor API (this is where the batched payout glue runs).
7. Anchor confirms PIX → `notify_offchain_funds_sent` → status → `completed`. `rate_lock.consume_quote(quote_id, sep31_tx_id)` emits `quote_use` with topics `(quote_id, sep31_tx_id)` and data `{price, fee_iof}`.
8. If the quote expires before settlement: Temporary-storage death is the enforcement mechanism.

### 2.2 C4 L1 — System Context

```mermaid
flowchart LR
    subgraph actors[Actors]
        enterprise["Enterprise Customer<br>importer · exporter · SMB<br>with cross-border flow"]
        fintech["Fintech Integrator<br>RecargaPay · Efí · Plusdin · Dinie<br>embeds Bleu via SDK"]
        fxop["FX / Remittance Operator<br>Husky · PagBrasil · Ebury · WTM<br>back-office upgrade"]
        channel["Channel Partner<br>accountants · tax · wealth advisors<br>earns on-chain rev-share"]
    end

    bleu["Bleu Platform<br>BR/PIX corridor on Stellar<br>BR-configured Anchor Platform +<br>2 Soroban primitives<br>(+ card-collateral PoC on testnet)<br>MIT · open source"]

    subgraph anchorrails[Anchor rails]
        anchor["BR Stellar Anchor<br>BACEN FX-licensed (10-candidate pool)<br>offshore Stellar anchor = fallback<br>SEP-10 · SEP-12 · SEP-31 · SEP-38"]
        pix["PIX<br>BCB SPI (via anchor)"]
    end

    subgraph byo[BYO adapters]
        kyc["BYO KYC / KYB<br>Idwall · Unico · Truora ·<br>Onfido · Sumsub<br>(SEP-12 pass-through)"]
        wallet["BYO Wallet / Custody<br>Freighter · LOBSTR · Vibrant<br>Fireblocks · BitGo · Anchorage<br>Dynamic · Privy · Turnkey<br>(Bleu holds no keys)"]
    end

    subgraph chain[Stellar mainnet]
        stellar["Stellar Network<br>Soroban RPC + Horizon<br>SCP ~5s finality"]
        usdc["USDC SAC<br>Circle-issued, native<br>AUTH_CLAWBACK_ENABLED<br>CAP-46-06 deterministic ID"]
    end

    card["Card Network / Issuer / Processor<br>Visa · Mastercard · BIN sponsor · EMI<br>(Monavate-pattern · offchain)<br>card-collateral PoC only"]

    oz["OpenZeppelin Stellar Contracts<br>stellar-contracts =0.7.1 · MIT<br>audited · SDF collaboration<br>(build-time dep)"]

    enterprise -- "payment / payout<br>REST + webhook" --> bleu
    fintech -- "SDK (TS/Python)<br>SEP-31 quote_id flow" --> bleu
    fxop -- "orchestrator<br>BRL ↔ USDC" --> bleu
    channel -- "partner_transfer<br>event rev-share" --> bleu

    bleu -- "SEP-10/12/31/38<br>JSON-RPC callbacks" --> anchor
    bleu -- "SEP-12 PUT /customer" --> kyc
    bleu -- "external signing<br>(no-key posture)" --> wallet
    anchor -- "BRL cash-out (SPI)" --> pix

    bleu -- "Prepare → Sign → Submit<br>simulateTx · sendTx · getEvents" --> stellar
    bleu -- "SAC transfer / transfer_from" --> usdc
    usdc -. "runs on" .-> stellar

    bleu -- "issuer-API adapter (PoC)<br>auth · capture · refund<br>(offchain webhooks)" --> card
    card -- "auth decisions<br>settlement feed" --> bleu

    oz -. "composes: sac_admin_wrapper ·<br>access_control (admin auth, all 3) ·<br>pausable (card PoC) ·<br>SmartAccount + policies (production vault)" .-> bleu

    classDef bleuNode fill:#2563eb,stroke:#1e40af,color:#fff
    classDef chainNode fill:#dcfce7,stroke:#15803d,color:#14532d
    classDef buildDep fill:#fef3c7,stroke:#ca8a04,color:#713f12
    class bleu bleuNode
    class stellar,usdc chainNode
    class oz buildDep
```

Actors: **Enterprise Customer**, **Fintech Integrator**, **FX / Remittance Operator**, **Channel Partner** (earning rev-share via `partner_transfer` events).

External systems: **BR Stellar Anchor** (BACEN FX-licensed, 10-candidate pool; offshore fallback), **PIX** (via anchor), **BYO KYC/KYB** (Idwall · Unico · Truora · Onfido · Sumsub via SEP-12), **BYO Wallet/Custody**, **Stellar Network**, **USDC SAC**, **Card Network/Issuer** (offchain — relevant only to the card-collateral PoC).

Build-time dependency (composed today): **OpenZeppelin Stellar Contracts** (`stellar-contracts =0.7.1`, MIT, audited by OZ, SDF collaboration), wired into all three contracts. OZ 0.7.1 requires `soroban-sdk ^25.3.0`, so the workspace pins `soroban-sdk =25.3.0`.

### 2.3 C4 L2 — Containers

```mermaid
flowchart TB
    users_ent["Enterprise / Fintech / FX Op"]
    users_chan["Channel Partner"]
    users_admin["Bleu Admin"]

    subgraph bleup[Bleu Platform]
        subgraph pub[Public VPC]
            gateway["API Gateway<br>Kong · TLS · rate-limit"]
            dashboard["Enterprise Dashboard<br>React + Vite"]
            console["Partner Console<br>React + Vite"]
        end

        subgraph priv[Private VPC]
            orch["Orchestrator Service<br>Node.js + TypeScript<br>Prepare → Sign → Submit<br>fee-bump ×10 retries"]
            ap_sep["Anchor Platform — SEP Server<br>Java · SDF reference<br>SEP-10/12/24/31/38"]
            ap_biz["AP Business Server<br>Node.js + TypeScript<br>SEP-31 JSON-RPC actions<br>IOF in fee.details[]<br>+ batched payout glue<br>(Vec&lt;PayoutEntry&gt;, fee-bump ×10)"]
            kyc_proxy["KYC / KYB Proxy<br>SEP-12 shim to Idwall · Unico ·<br>Truora · Onfido · Sumsub"]
            rpc["Stellar RPC + Horizon<br>simulateTx · sendTx · getEvents<br>CAP-33 sponsor-sandwich"]
            indexer["Soroban Event Indexer<br>Postgres sink · OSS template<br>bridges RPC 24h → long-term"]
            card_adapter["Card Issuer Adapter<br>Node.js + TypeScript (testnet PoC)<br>ingests auth · capture · refund<br>webhooks → vault.reserve /<br>settle / release invocations<br>(Gnosis Pay hybrid pattern,<br>offchain by necessity)"]
        end

        subgraph sec[Secure VPC]
            rds[("Postgres (RDS)<br>quote state · partner config<br>event log")]
            redis[("Redis<br>quote cache · rate-limit<br>inflight tx dedup")]
            s3[("S3<br>KYC binaries · artifacts<br>audit logs")]
        end
    end

    subgraph sc["Soroban contracts (attr + rfq mainnet-bound, audit-bound · vault = testnet PoC)"]
        attr["Partner-Attribution Wrapper<br>mainnet-bound · audit-bound<br>OZ sac_admin_wrapper + access_control<br>partner_transfer event<br>invariant Σ bps ≤ 10_000"]
        rfq["SEP-38 Rate-Lock<br>mainnet-bound · audit-bound<br>custom Soroban<br>Temporary storage (CAP-46-12)<br>admin auth via OZ access_control<br>(quote_use, quote_id, context,<br>sep31_tx_id) events"]
        vault["Card-Collateral Vault<br>TESTNET PoC — off critical path<br>OZ pausable + access_control<br>admin-gated reserve / settle / release<br>(production vault adds SmartAccount +<br>spending_limit + webauthn / ed25519)<br>USDC yield only (never XLM)"]
        usdc["USDC SAC<br>Circle · CAP-46-06<br>AUTH_CLAWBACK_ENABLED"]
    end

    anchor["BACEN FX-licensed BR anchor<br>(10-candidate pool · offshore fallback)<br>upstream SEP-31 + SEP-38<br>PIX BRL rail"]
    fb["Fireblocks (mainnet) /<br>self-custody (testnet)<br>external signer"]
    card_proc["Card Processor / Issuer / BIN<br>Visa · Mastercard rails<br>Monavate-pattern EMI<br>(offchain; not on Stellar)<br>card PoC only"]
    oz_dep["OpenZeppelin Stellar Contracts<br>stellar-contracts =0.7.1 (MIT)<br>build-time dependency"]

    users_ent -- HTTPS --> dashboard
    users_ent -- REST --> gateway
    users_chan -- HTTPS --> console
    users_admin --> dashboard

    gateway --> orch
    gateway --> ap_sep

    ap_sep -- "Platform API<br>JWT-signed" --> ap_biz
    ap_biz --> kyc_proxy
    orch --> rpc
    indexer -- "getEvents paginated" --> rpc

    orch --> rds
    orch --> redis
    ap_biz --> rds
    kyc_proxy --> s3
    indexer -- "events sink" --> rds

    rpc --> attr
    rpc --> rfq
    rpc -. "testnet PoC" .-> vault

    attr -- "transfer_from (SEP-41)" --> usdc
    vault -. "transfer_from<br>(allowance, production vault)" .-> usdc

    ap_sep -- "upstream SEP-31/38" --> anchor
    orch -- "external signer" --> fb
    anchor -. "BRL ↔ USDC settlement" .-> usdc

    card_proc -- "auth · capture · refund<br>webhooks (HTTPS)" --> card_adapter
    card_adapter -- "vault.reserve /<br>vault.settle /<br>vault.release" --> rpc

    oz_dep -. "build-time composition<br>(not a runtime call)" .-> sc

    classDef frontend fill:#60a5fa,stroke:#1e40af,color:#fff
    classDef service fill:#6366f1,stroke:#312e81,color:#fff
    classDef soroban fill:#16a34a,stroke:#14532d,color:#fff
    classDef sorobanPoc fill:#86efac,stroke:#14532d,color:#14532d,stroke-dasharray:3
    classDef datastore fill:#d97706,stroke:#78350f,color:#fff
    classDef external fill:#e2e8f0,stroke:#64748b,color:#1e293b
    classDef buildDep fill:#fef3c7,stroke:#ca8a04,color:#713f12
    class gateway,dashboard,console frontend
    class orch,ap_sep,ap_biz,kyc_proxy,rpc,indexer,card_adapter service
    class attr,rfq soroban
    class vault sorobanPoc
    class rds,redis,s3 datastore
    class anchor,fb,card_proc,usdc external
    class oz_dep buildDep
```

Three zones inside the Bleu Platform boundary:

- **Public VPC** — API Gateway, Enterprise Dashboard, Partner Console.
- **Private VPC** — Orchestrator (Prepare→Sign→Submit driver), AP SEP Server (SDF reference), AP Business Server (SEP-31 JSON-RPC actions **+ batched payout glue**), KYC/KYB Proxy (SEP-12 shim), Stellar RPC + Horizon clients, Soroban Event Indexer, Card Issuer Adapter (testnet PoC).
- **Secure VPC** — Postgres, Redis, S3.

Outside the boundary: the **two** mainnet Soroban contracts (attribution + rate-lock), the **testnet** card-collateral vault, the USDC SAC, the anchor, and the signer (Fireblocks mainnet / self-custody testnet).

### 2.4 C4 L3 — Key Flow Sequences

#### 2.4.1 SEP-31 + SEP-38 + IOF flow

```mermaid
sequenceDiagram
    autonumber
    participant fintech as Fintech Integrator
    participant api as Bleu API Gateway
    participant ap_biz as AP Business Server
    participant ap_sep as AP SEP Server
    participant rfq as SEP-38 Rate-Lock<br>(Soroban)
    participant anchor as BR Anchor<br>(BACEN FX-licensed)
    participant sender as Sender Wallet
    participant observer as AP Stellar Observer
    participant usdc as USDC SAC<br>(Stellar Mainnet)
    participant pix as PIX (BCB SPI)

    fintech->>api: POST /quote (SEP-38)<br>sell=USDC, buy=iso4217:BRL, amount=100
    api->>ap_sep: SEP-38 quote req
    ap_sep->>anchor: upstream quote
    anchor-->>ap_sep: price + fee.details[]<br>(incl. IOF disclosure)
    ap_sep->>rfq: lock_quote(id,<br>expires_at_ledger = now + 180)
    rfq-->>ap_sep: locked — emit<br>(quote_locked, id, anchor)
    ap_sep-->>api: quote {id, expires_at,<br>total_price, fee.details[]}
    api-->>fintech: 200 OK — quote_id<br>+ IOF disclosure

    fintech->>api: POST /transactions (SEP-31)<br>quote_id, sender/receiver ids,<br>funding_method=PIX
    api->>ap_sep: SEP-31 create
    ap_sep->>ap_biz: JSON-RPC<br>request_offchain_funds
    ap_biz-->>api: stellar_account + memo<br>+ amount USDC
    api-->>fintech: transaction_id + deposit info

    fintech->>sender: instruct USDC pay + stellar_memo
    sender->>usdc: SAC transfer(USDC)
    usdc->>observer: payment event
    observer->>ap_biz: notify_onchain_funds_received
    ap_biz-->>api: status=pending_receiver

    ap_biz->>anchor: trigger PIX payout<br>(quote_id, BRL amount)
    anchor->>pix: BRL via SPI
    pix-->>anchor: PIX confirmed
    anchor->>ap_biz: notify_offchain_funds_sent

    ap_biz->>rfq: consume_quote(quote_id, tx_id)
    rfq-->>ap_biz: emit (quote_use, id,<br>context=sep31, sep31_tx_id)<br>{price, total_price, fee_iof}
    ap_biz-->>api: status=completed
    api-->>fintech: webhook: completed
```

If the quote expires before settlement, Temporary-storage death (CAP-46-12) is the enforcement mechanism — see [§2.1](#21-flow--sep-31-b2b-pix-receive-with-sep-38-firm-quote).

#### 2.4.2 Card-collateral authorization *(testnet PoC)*

This sequence depicts the **production** card-collateral vault target (SmartAccount / webauthn / spending-limit policy / USDC settlement, CAP-21/23). The shipped testnet PoC ([`contracts/card-collateral-poc`](../../contracts/card-collateral-poc)) implements only the admin-gated reserve/settle/release state machine + shortfall accounting, composing OZ `pausable` + `access_control`; it does not call USDC or `do_check_auth`.

```mermaid
sequenceDiagram
    autonumber
    participant cardholder as Cardholder
    participant merchant as Merchant POS
    participant network as Card Network<br>(Visa / Mastercard)
    participant issuer as Issuer / BIN Sponsor<br>(Monavate-pattern EMI)
    participant adapter as Card Issuer Adapter<br>(Bleu · offchain)
    participant vault as Card-Collateral Vault<br>(Soroban · production vault design)
    participant usdc as USDC SAC<br>(Stellar Mainnet)

    cardholder->>merchant: swipe / tap<br>€50 purchase
    merchant->>network: authorization request
    network->>issuer: auth req<br>PAN / amount / MCC

    issuer->>adapter: POST /auth webhook<br>{card_bin, amount_usd,<br>merchant, mcc}

    adapter->>vault: invoke reserve(card_bin,<br>amount, expires_at)
    vault->>vault: SmartAccount.do_check_auth<br>webauthn / ed25519
    vault->>vault: SpendingLimit check<br>rolling window
    vault->>vault: when_not_paused guard
    vault->>usdc: transfer_from(allowance)
    usdc-->>vault: SEP-41 transfer event
    vault->>vault: Lock(id) Persistent entry
    vault-->>adapter: reserve_ok — emit<br>(collateral_locked, card_bin)

    adapter-->>issuer: 200 approve<br>(auth_id, reserved_amount)
    issuer-->>network: approved
    network-->>merchant: approval code
    merchant-->>cardholder: ✓ receipt

    network->>issuer: clearing batch
    issuer->>adapter: POST /capture webhook<br>(auth_id, final_amount)
    adapter->>vault: invoke settle(auth_id,<br>final_amount)
    vault->>vault: CAP-21 minSeqAge<br>cool-down enforced
    vault->>usdc: transfer → issuer<br>settlement address
    alt final_amount ≤ locked collateral
        vault-->>adapter: emit (card_settle, auth_id,<br>final_amount)
    else shortfall — clearing exceeds the lock
        vault-->>adapter: emit (card_settle) + (shortfall)<br>invariant breached: locked ≥ authorized − settled
    end

    network->>issuer: refund / expire
    issuer->>adapter: POST /refund OR<br>(no capture before expiry)
    adapter->>vault: invoke release(auth_id)
    vault->>vault: CAP-23 Claimable Balance<br>And(Claimant(cardholder),<br>AbsBefore(expires_at))
    vault-->>adapter: emit (collateral_released)
```

Yield, where present, accrues on **USDC** collateral — never on XLM.

#### 2.4.3 CAP-33 sponsor-sandwich onboarding

```mermaid
sequenceDiagram
    autonumber
    participant enterprise as Enterprise User<br>(non-crypto · zero XLM)
    participant fintech as Fintech UI
    participant api as Bleu API Gateway
    participant orch as Orchestrator Service
    participant signer as Sponsor Signer<br>(hardware wallet / Fireblocks)
    participant rpc as Stellar RPC
    participant core as Stellar Core<br>(Mainnet)

    enterprise->>fintech: sign up<br>business email · CPF/CNPJ
    fintech->>api: POST /accounts/onboard<br>(KYC pre-verified via SEP-12)
    api->>orch: orchestrate onboarding

    orch->>orch: generate sponsored keypair<br>(ephemeral — delivered to wallet<br>via BYO wallet interop)
    orch->>orch: build tx with ordered ops:<br>Begin → CreateAccount →<br>ChangeTrust(USDC) →<br>ChangeTrust(BRL) → End

    orch->>signer: sign as sponsor<br>(ops Begin/End require sponsor auth)
    signer-->>orch: sig_sponsor
    orch->>orch: sign as sponsored<br>(CreateAccount + ChangeTrusts<br>require sponsored auth)

    Note over orch: ⚠ Soroban contracts CANNOT interact with sponsorships —<br>the sandwich runs in the classic-tx layer<br>around any contract calls

    orch->>rpc: sendTransaction(sandwich_tx)
    rpc->>core: submit to ledger
    core->>core: validate sponsor reserve liquidity
    core->>core: AccountEntryExtensionV2.numSponsored++
    core->>core: verify mutual-consent op balance
    core-->>rpc: ledger close — tx success
    rpc-->>orch: tx_hash + ledger_sequence

    orch-->>api: account ready<br>(pk, sponsored_reserves ≈ 2 XLM)
    api-->>fintech: 200 OK<br>trustlines: USDC, BRL
    fintech-->>enterprise: account ready<br>can receive USDC + BRL<br>(zero XLM required)

    Note over orch: ↻ if user self-funds → RevokeSponsorshipOp returns reserves to Bleu<br>↻ if Bleu off-boards → sponsorship transfers to a replacement sponsor (no user action)<br>per-user Bleu cost: ~2 XLM (~USD 0.20) until revoked
```

The atomic five-operation transaction that creates a zero-XLM-ready account: `BeginSponsoringFutureReservesOp` → `CreateAccountOp` → `ChangeTrustOp(USDC)` → `ChangeTrustOp(BRL)` → `EndSponsoringFutureReservesOp`, with dual signatures for mutual consent. The constraint that governs the whole onboarding path: **Soroban contracts cannot interact with sponsorships**, so the sandwich runs at the classic-tx layer around any contract calls.

---

## 3. Contract Overview

**Two** mainnet-bound Soroban contracts (to run under 2-of-3 admin multisig, upgradeable via `update_current_contract_wasm` where applicable) + **one** testnet PoC + the inherited USDC SAC. Payout orchestration is AP-server glue, not a contract.

The "OZ composition" column lists the audited OpenZeppelin building blocks each contract composes **today** (wired in, not aspirational), plus — for card-collateral — the additional blocks reserved for the production vault. The Bleu-specific column is the novel surface that remains the audit focus. OZ `=0.7.1` requires `soroban-sdk ^25.3.0`; the workspace pins `soroban-sdk =25.3.0`. "Audit-bound" means the audit is the T3 deliverable — these contracts are **not yet audited**.

| Contract | Status | Storage (today) | Emitted events (today) | OZ composition (composed today) | Bleu-specific |
| --- | --- | --- | --- | --- | --- |
| **SEP-38 Rate-Lock** | Implemented + tested · audit-bound | Temporary + Instance | `quote_locked`, `quote_use` | `stellar_access::access_control::AccessControl` (admin auth via `#[only_admin]`) | Quote hashing, Temporary-storage lifecycle, the typed `QuoteExpired` rate-lock deadline, on-chain re-derivation of SEP-38 Price-Formulas invariant |
| **Partner-Attribution Wrapper** | Implemented + tested · audit-bound | Persistent + Instance | `partner_set`, `partner_removed`, `partner_transfer` | `stellar_tokens::fungible::sac_admin_wrapper` + `stellar_access::access_control::AccessControl` | `partner_transfer` event, `Σ bps ≤ 10_000` invariant, atomic `settle_split` over the USDC SAC `transfer` |
| **Card-Collateral Vault** | **Testnet PoC** | Persistent | `collateral_locked`, `card_settle`, `shortfall`, `collateral_released` | `stellar_contract_utils::pausable` + `stellar_access::access_control` (composed today); `stellar_accounts::smart_account::SmartAccount` + `policies::spending_limit` + `verifiers::webauthn` / `ed25519` (production-vault target) | shortfall invariant (`locked ≥ authorized − settled` in the normal path), CAP-21 `minSeqAge` cool-downs, CAP-23 auto-return, **USDC-only** yield (never XLM) |

---

## 4. Technology Stack

- **Soroban Contracts** — Rust, `soroban-sdk =25.3.0` (workspace pin), composing OpenZeppelin's `stellar-contracts =0.7.1` crates (wired into all three contracts today; OZ 0.7.1 requires `soroban-sdk ^25.3.0`). Wasm target: `wasm32v1-none` (Rust ≥1.84). OZ 0.7.1 enables soroban-sdk's `experimental_spec_shaking_v2`, so the wasm build sets `SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2=1` (the flag `stellar contract build` sets). Build provenance via `stellar contract build --meta`.
- **AP Business Server & Orchestrator** — Node.js + TypeScript, Fastify; Prepare→Sign→Submit via Stellar RPC; cursor-batched payout dispatch with fee-bump ×10 retries.
- **AP SEP Server** — SDF reference Java implementation, deployed via Docker Compose locally and Helm in production.
- **Frontend** — React + Vite + TypeScript + Tailwind + shadcn/ui. TypeScript bindings generated from Soroban specs via `stellar contract bindings`.
- **Event Indexer** — service polling Stellar RPC `getEvents` with cursor → Postgres. Open-source template.
- **Custody** — self-custody on testnet; Fireblocks for mainnet.

---

## 5. Integrations

1. **Stellar Network (Mainnet)** — primary runtime.
2. **Anchor Platform** — SDF reference, BR-configured. The Integration-List item being operationalized.
3. **Stellar Disbursement Platform** — SDF reference; bulk-disbursement pattern reused as AP-server payout glue (bidirectional B2B).
4. **BACEN FX-licensed BR anchor** — selected from a 10-candidate pool (offshore Stellar anchor as the "or equivalent" fallback).
5. **USDC on Stellar** — Circle-issued native asset via deterministic SAC (CAP-46-06).
6. **OpenZeppelin Stellar Contracts** — `stellar-contracts =0.7.1`, MIT, audited by OZ, SDF collaboration. Composed into all three contracts today (requires `soroban-sdk ^25.3.0`; workspace pins `=25.3.0`).
7. **Soroban event indexer** — Postgres sink (OSS template).
8. **BYO KYC/KYB** — Idwall, Unico, Truora, Onfido, Sumsub via SEP-12 `PUT /customer`.
9. **BYO Wallet / Custody** — Freighter, LOBSTR, Vibrant (retail); Fireblocks, BitGo, Anchorage (institutional); Dynamic, Privy, Turnkey (embedded).
10. **PIX (BCB SPI)** — BRL instant-payment rail, reached via the anchor's banking partner (Bleu does not connect directly).
11. **Card Network / Issuer** — Visa/Mastercard, offchain; relevant only to the card-collateral testnet PoC.

---

## See Also

- [Repo README](../../README.md)
- [SEP & CAP coverage matrix](../sep-cap-coverage.md)
- [Grant summary](../grant.md)
