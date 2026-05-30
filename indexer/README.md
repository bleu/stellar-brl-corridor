# Soroban event indexer

A runnable reference indexer that polls Stellar RPC `getEvents` for the corridor
contracts, decodes + dedups events, and sinks them to **Postgres** (when
`DATABASE_URL` is set) or **NDJSON** otherwise. Fork it for partner
reconciliation, audit trails, or a dashboard backend.

Pattern: Stellar's ["Ingest events published from a contract"](https://developers.stellar.org/docs/build/guides/events/ingest)
· [`getEvents`](https://developers.stellar.org/network/soroban-rpc/methods/getEvents).

## Run

```bash
just index                 # one-shot catch-up → NDJSON at indexer/out/events-testnet.ndjson

# …or into a database:
psql "$DATABASE_URL" -f indexer/schema.sql
DATABASE_URL=postgres://… just index
```

Contract ids come from `deployments/testnet.json` (single source of truth). The
run is idempotent: it resumes from the last ingested ledger (`indexer/.last-ledger`)
and dedups by the RPC event `id`.

### Example output (live testnet)

```
Indexed 26 new event(s) over ledgers 2814607..2820607 → …/events-testnet.ndjson
  partner_set 4 · partner_transfer 4 · collateral_locked 4 · card_settle 4
  collateral_released 4 · quote_locked 2 · quote_use 2 · shortfall 2
```

```json
{"type":"partner_transfer","contract_name":"partner-attribution",
 "topics":["G…partner","C…USDC_SAC"],
 "data":{"amount":"1000000000","fee":"300000000","fee_bps":3000,"tx_hash":"de1ad0…"}}
```

## How it works (best practice)

- **`getEvents`** with a `type:contract` filter on the three corridor contract ids.
- **Cursor pagination** (`limit` up to 10000); on the next run it resumes from the
  largest stored ledger.
- **Dedup by event `id`** (the RPC can return duplicates across pages).
- Decoded topics/data are stored as JSONB; typed SQL views (`partner_transfers`,
  `quote_uses`) sit on top — see [`schema.sql`](schema.sql).

## Retention & going deeper

stellar-rpc keeps only **~24h (max 7 days)** of events, so a durable record
requires **continuous ingestion** — run `just index` on a loop / cron; it only
fetches ledgers newer than the last run. For full history or higher throughput,
graduate to **Galexie + the Ingest SDK** (self-host) or a managed indexer:
**Mercury/Retroshades**, **Goldsky Mirrors**, or **The Graph Substreams**.
