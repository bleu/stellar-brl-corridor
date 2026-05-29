# Anchor Platform — BR configuration

A BR-configured deployment of [SDF's Anchor Platform](https://developers.stellar.org/docs/category/anchor-platform). Bleu does **not** rebuild AP — this directory packages the configuration to run it for the BRL/PIX corridor.

## Layout

```
anchor-platform/
├── README.md
├── docker-compose.example.yml   # local stack (AP + Postgres + sandbox anchor)
├── env.example                  # SEP_* env vars — copy to .env, fill values
└── config/
    └── sep1-stellar.toml.template
```

## Quickstart (local, testnet)

```bash
cp env.example .env
# Edit .env — at minimum: SEP10_HOME_DOMAIN, SEP10_SIGNING_SEED, PLATFORM_API_SECRET.

cp config/sep1-stellar.toml.template config/stellar.toml
# Edit config/stellar.toml — fill the anchor account / USDC issuer / domain.

docker compose -f docker-compose.example.yml up
```

The compose stack pins:

- `stellar/anchor-platform` — SDF's reference AP image (pin the version before T1).
- `postgres:16` — quote state, partner config, event log.

## What this configures

- SEP-10 / SEP-12 / SEP-24 / SEP-31 / SEP-38.
- SEP-31 with `quotes_required=true`.
- SEP-12 BR custom fields: `cpf`, `cnpj`, `pix_key`, `pix_key_type ∈ {cpf, cnpj, email, phone, evp}`, `bank_ispb`, mirrored to SEP-9 `tax_id` for cross-anchor interop.
- SEP-38 firm quotes with an **IOF-ready** `fee.details[]` entry (`{name: "IOF", description: "Decreto 6.306/2007 — anticipatory; not mandated for crypto FX today", amount}`, default `0`). Wired and ready; the anchor would emit/collect if/when IOF applies at BRL ↔ USDC conversion.

The **payout-orchestration glue** (batched USDC SAC `transfer` under `require_auth()` over `Vec<PayoutEntry>` keyed by `(batch_id, cursor)`, fee-bump ×10 retry) lives in the AP business server, not a standalone contract. T1 implementation lands alongside the SEP-31 receive flow.

## Notes

- For mainnet, switch `CUSTODY_TYPE` to `fireblocks` and rotate `SEP10_SIGNING_SEED` to a dedicated mainnet signing account.
- BR-licensed anchor selection happens in-grant (T1) from the 10-candidate BACEN FX-licensed pool. An offshore Stellar-compatible anchor is the tested "or equivalent" fallback.
