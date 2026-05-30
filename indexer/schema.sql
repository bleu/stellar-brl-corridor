-- Bleu corridor event indexer — Postgres schema.
-- A normalized event log keyed by the RPC event id (the dedup key), plus a few
-- typed views for partner reconciliation + corridor analytics. The decoded
-- topics/data are kept as JSONB so every event is queryable without migration.
--
-- Apply:  psql "$DATABASE_URL" -f indexer/schema.sql
-- Ingest: DATABASE_URL=... just index

CREATE TABLE IF NOT EXISTS contract_events (
  id               text PRIMARY KEY,             -- RPC event id (unique; the dedup key)
  ledger           bigint NOT NULL,
  ledger_closed_at timestamptz,
  contract         text NOT NULL,                -- contract address (C…)
  contract_name    text NOT NULL,                -- fx-rate-lock | partner-attribution | card-collateral-poc
  type             text NOT NULL,                -- event name (partner_transfer, quote_use, …)
  topics           jsonb NOT NULL DEFAULT '[]',  -- decoded indexed topics (after the event name)
  data             jsonb NOT NULL DEFAULT '{}',  -- decoded event body
  ingested_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contract_events_ledger_idx   ON contract_events (ledger);
CREATE INDEX IF NOT EXISTS contract_events_type_idx     ON contract_events (type);
CREATE INDEX IF NOT EXISTS contract_events_contract_idx ON contract_events (contract_name);

-- Partner revenue splits (B2B2B reconciliation). topics = [partner, anchor_asset].
CREATE OR REPLACE VIEW partner_transfers AS
  SELECT id, ledger, ledger_closed_at,
         topics->>0                 AS partner,
         topics->>1                 AS anchor_asset,
         (data->>'amount')::numeric AS amount,
         (data->>'fee')::numeric    AS fee,
         (data->>'fee_bps')::int    AS fee_bps,
         data->>'tx_hash'           AS tx_hash
  FROM contract_events WHERE type = 'partner_transfer';

-- SEP-38 firm-quote consumption (settlement). topics = [quote_id, sep31_tx_id].
CREATE OR REPLACE VIEW quote_uses AS
  SELECT id, ledger, ledger_closed_at,
         topics->>0                  AS quote_id,
         topics->>1                  AS sep31_tx_id,
         (data->>'price')::numeric   AS price,
         (data->>'fee_iof')::numeric AS fee_iof
  FROM contract_events WHERE type = 'quote_use';
