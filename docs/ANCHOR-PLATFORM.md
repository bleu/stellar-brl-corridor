# Anchor Platform — BR (BRL/PIX) configuration

A BR-configured deployment of [SDF's Anchor Platform](https://developers.stellar.org/docs/category/anchor-platform) (AP) for the USDC ↔ BRL corridor. Bleu does **not** rebuild AP — `anchor-platform/` packages the configuration that makes AP serve a resolvable SEP-1 `stellar.toml` and a SEP-38 firm-quote flow for `sell=USDC → buy=BRL` delivered over **PIX**.

The full live AP + sandbox-anchor business server (the Rate Integration that produces real quotes, and the SEP-31 receive flow) is the **T1 deliverable**. What lives here is the configured, runnable starting point — and it does run: a local AP 4.3.0 stack came up and served SEP-1 + SEP-38 `/info` from this config (see [What ran live](#what-ran-live-vs-example) below).

## What's configured

| File | Purpose |
|------|---------|
| `anchor-platform/config/sep1-stellar.toml` | Concrete BR-configured SEP-1 `stellar.toml` (testnet). |
| `anchor-platform/config/sep38-assets.yaml` | AP `assets.type=file` config — the USDC↔BRL/PIX/BR corridor. |
| `anchor-platform/env.example` | AP 4.x env vars (`SECRET_*`, `DATA_*`, SEP toggles, asset/SEP-1 file paths). |
| `anchor-platform/docker-compose.example.yml` | Local stack: AP 4.3.0 + postgres:16. |
| `anchor-platform/examples/*.json` | Documented SEP-38 `/info`, `/prices`, `/quote` response shapes. |
| `anchor-platform/examples/live/` | Raw captures from the live local AP run. |

### SEP-1 `stellar.toml`

Concrete, valid TOML on **testnet** (`Test SDF Network ; September 2015`). Key fields:

- `SIGNING_KEY` / `ACCOUNTS` — `GC5DJDO5VPVFQC7576GALSLSSA37Q4EA3VEKB7ZSTZ6D3OV3Z2KJOWDT`, a real testnet public key generated with `stellar keys generate`. The matching secret seed is **not committed** — it lives only in `.env` (`SECRET_SEP10_SIGNING_SEED`, gitignored).
- `WEB_AUTH_ENDPOINT` (SEP-10), `KYC_SERVER` (SEP-12), `DIRECT_PAYMENT_SERVER` (SEP-31), `ANCHOR_QUOTE_SERVER` (SEP-38), `TRANSFER_SERVER_SEP0024` (SEP-24) — all under the configured domain `anchor.bleu.builders` (placeholder; swapped for the BR-licensed anchor's real domain at T1).
- `[[CURRENCIES]]` — **USDC** (Circle's live Stellar **testnet** issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`) and **BRL** (off-chain, settled via PIX; referenced as `iso4217:BRL` in SEP-38).

### SEP-38 corridor (`sep38-assets.yaml`)

- `sell_asset = stellar:USDC:GBBD47IF6...` → `buy_asset = iso4217:BRL`
- `buy_delivery_method = PIX`, `sell_delivery_method = PIX`, `country_code = BR`
- USDC asset has `sep31.quotes_required = true` (firm quotes enforced for this corridor).

## How to run it

```bash
cd anchor-platform
cp env.example .env
# Fill the [NEEDS] values in .env — at minimum SECRET_SEP10_SIGNING_SEED (the
# secret S... seed for the SIGNING_KEY in sep1-stellar.toml) and the SECRET_*
# JWT/auth secrets (>= 32 chars each).

docker compose -f docker-compose.example.yml up -d
# AP loads config/sep1-stellar.toml (SEP1_TOML_VALUE) and config/sep38-assets.yaml
# (ASSETS_VALUE), both mounted read-only into the container.
```

Then:

```bash
curl http://localhost:8080/.well-known/stellar.toml          # SEP-1
curl http://localhost:8080/sep38/info                        # SEP-38 corridor
```

## SEP endpoints

AP serves these on `:8080` (SEP server); the Platform API is on `:8081`/`:8085`.

| SEP | Endpoint | Served by static config? |
|-----|----------|--------------------------|
| SEP-1  | `GET /.well-known/stellar.toml` | Yes — from `sep1-stellar.toml`. |
| SEP-10 | `GET /auth` (web auth, JWT) | Yes — signing seed + JWT secret. |
| SEP-12 | `/sep12` (KYC) | Yes (BR custom fields land at T1). |
| SEP-38 | `GET /sep38/info` | Yes — from `sep38-assets.yaml`. |
| SEP-38 | `GET /sep38/prices`, `GET /sep38/price`, `POST /sep38/quote` | **No** — require the **Rate Integration** callback (business server) for pricing, and `POST /quote` requires a SEP-10 JWT. This is the T1 deliverable. |
| SEP-31 | `/sep31` (cross-border receive) | Config present; receive flow lands at T1. |

## Example SEP-38 `POST /quote` (the IOF-ready `fee.details[]`)

This is the response shape the T1 Rate Integration will return (see `anchor-platform/examples/sep38-quote.json`). Request: sell 100 USDC → BRL via PIX in BR.

```json
{
  "id": "de762cb8-1f0a-4e0b-9d9b-2f0a1c3e4f55",
  "expires_at": "2026-05-29T12:15:00.000000Z",
  "total_price": "0.1850139",
  "price": "5.42",
  "sell_asset": "stellar:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
  "sell_amount": "100",
  "buy_asset": "iso4217:BRL",
  "buy_amount": "540.50",
  "buy_delivery_method": "PIX",
  "fee": {
    "total": "1.50",
    "asset": "iso4217:BRL",
    "details": [
      {
        "name": "PIX settlement fee",
        "description": "Anchor fee for settling BRL via PIX.",
        "amount": "1.50"
      },
      {
        "name": "IOF",
        "description": "Decreto 6.306/2007 — anticipatory; not mandated for crypto FX today",
        "amount": "0"
      }
    ]
  }
}
```

`fee.details[]` carries two discrete entries: the always-present **PIX settlement fee**, and a discrete, clearly-optional **IOF** entry (default `amount: "0"`).

## IOF is anticipatory — not currently mandated for crypto FX

> **IOF (Imposto sobre Operações Financeiras), Decreto 6.306/2007, is NOT currently a mandated charge for crypto / virtual-asset FX in Brazil.**

The IOF entry in `fee.details[]` is an **anticipatory disclosure capability** — wired and ready so that *if / when* IOF is applied to the crypto rail, the anchor can populate it without any schema or client change. Today:

- The IOF detail defaults to `amount: "0"` (disclosed, transparent, but not charged) — or the anchor may omit the entry entirely.
- The toggle lives in the AP **Rate Integration** (business server), decided per-quote, not in static config. `sep38-assets.yaml` documents the intent under its `FEE COMPOSITION` comment.

This keeps the response shape correct for a future regulatory change while being accurate about the present: **the corridor does not charge IOF on crypto FX today.**

## What ran live vs example

The local stack **did come up** in this environment (Docker became available mid-session). AP **4.3.0** + postgres:16 started cleanly; logs show `Sep1Service`, `Sep10Service`, `Sep12Service`, `Sep31Service`, `Sep38Service` all initialized and `Started ServiceRunner`.

- **Served live (HTTP 200, captured):**
  - `GET /.well-known/stellar.toml` → `anchor-platform/examples/live/stellar.toml.served`
  - `GET /sep38/info` → `anchor-platform/examples/live/sep38-live-capture.txt`
- **Not served live (example shapes only):**
  - `GET /sep38/prices`, `GET /sep38/price` → AP returns `service not available` until the **Rate Integration** callback is wired (T1).
  - `POST /sep38/quote` → AP returns `forbidden` without a SEP-10 JWT, and would need the Rate Integration to price. The example in `examples/sep38-quote.json` is the shape that integration returns.

So: the **SEP-1 TOML and SEP-38 corridor advertisement are proven live**; **firm pricing/quotes are the T1 business-server work**, documented here as validated example responses.

### Notes from bringing up the stack (config corrections made)

Surfaced and fixed against the real AP 4.3.0 image:

1. The compose service had no start `command:` — AP printed usage and crash-looped. Added `command: ["--sep-server", "--platform-server"]`.
2. `env.example` used pre-4.x var names. Rewrote to AP 4.x conventions (`SECRET_DATA_USERNAME`/`SECRET_DATA_PASSWORD`, `SECRET_SEP10_SIGNING_SEED`, `SECRET_SEP10_JWT_SECRET`, `DATA_SERVER=host:port`, `SEP1_TOML_VALUE`, `ASSETS_VALUE`).
3. Stellar assets in `assets.yaml` require `distribution_account` — added (placeholder = demo account; dedicated distribution account at T1).
4. `SEP31_DEPOSIT_INFO_GENERATOR_TYPE` enum is `self | none` in 4.3.0 (not `api`). Set to `self`.
5. SEP-24 disabled for this corridor (it is SEP-31/SEP-38, not SEP-24 interactive) to avoid its interactive-URL config requirements.

## See also

- `anchor-platform/README.md` — directory layout and quickstart.
- `anchor-platform/config/sep1-stellar.toml` — the SEP-1 TOML.
- `anchor-platform/config/sep38-assets.yaml` — the SEP-38 corridor + fee-composition note.
- `anchor-platform/examples/` — SEP-38 `/info`, `/prices`, `/quote` shapes + live captures.
