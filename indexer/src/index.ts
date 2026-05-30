/**
 * Bleu — Soroban event indexer.
 *
 * Polls Stellar RPC `getEvents` for the corridor contracts, decodes + dedups by
 * event id, and sinks to Postgres (when DATABASE_URL is set) or NDJSON. Resumes
 * from the last ingested ledger. A reference template any Stellar builder can fork.
 *
 * Pattern: https://developers.stellar.org/docs/build/guides/events/ingest
 * Retention caveat: stellar-rpc keeps only ~24h (max 7d) of events, so a durable
 * record requires CONTINUOUS ingestion (run this on a loop / cron). For deep
 * history use Galexie + the Ingest SDK, or a managed indexer (Mercury/Retroshades,
 * Goldsky Mirrors, The Graph Substreams).
 */
import { rpc, xdr, scValToNative } from "@stellar/stellar-sdk";
import { fileURLToPath } from "node:url";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const RPC_URL = process.env.RPC_URL ?? "https://soroban-testnet.stellar.org";
const PAGE_LIMIT = Number(process.env.PAGE_LIMIT ?? 10000);
// Ledgers to scan back on a cold start (~5s/ledger; 12000 ≈ 16h, within 24h retention).
const COLD_START_WINDOW = Number(process.env.COLD_START_WINDOW ?? 12000);

const repoPath = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const DEPLOY_FILE = repoPath("deployments/testnet.json");
const OUT_FILE = repoPath("indexer/out/events-testnet.ndjson");
const CURSOR_FILE = repoPath("indexer/.last-ledger");

interface Deployment {
  network: string;
  usdc_sac: string;
  contracts: Record<string, string>;
}

/** One decoded contract event, keyed by the RPC `id` (the dedup key). */
interface CorridorEvent {
  id: string;
  ledger: number;
  ledger_closed_at: string;
  contract: string;
  contract_name: string;
  type: string; // event name from topic[0] (partner_transfer, quote_use, ...)
  topics: unknown[]; // decoded remaining topics
  data: unknown; // decoded event value
}

interface Sink {
  has(id: string): boolean;
  write(ev: CorridorEvent): Promise<void> | void;
  close(): Promise<void> | void;
}

/** Recursively make a decoded value JSON/JSONB-safe: bigint→string, bytes→hex. */
function jsonSafe(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Uint8Array) return Buffer.from(v).toString("hex");
  if (Array.isArray(v)) return v.map(jsonSafe);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, jsonSafe(val)]));
  }
  return v;
}

/** Decode an RPC topic/value (XDR base64 string or ScVal) to a native JS value. */
function decode(v: unknown): unknown {
  const sv =
    typeof v === "string" ? xdr.ScVal.fromXDR(v, "base64") : v instanceof xdr.ScVal ? v : null;
  return sv ? scValToNative(sv) : v;
}

/** Resolve the contract strkey (C…) whether the SDK hands back a Contract or a string. */
function contractAddr(c: unknown): string {
  if (typeof c === "string") return c;
  if (c && typeof (c as { contractId?: () => string }).contractId === "function") {
    return (c as { contractId: () => string }).contractId();
  }
  return String(c ?? "");
}

/** Default sink: deduped NDJSON on disk — runnable with no external services. */
class NdjsonSink implements Sink {
  private seen = new Set<string>();
  constructor() {
    mkdirSync(dirname(OUT_FILE), { recursive: true });
    if (existsSync(OUT_FILE)) {
      for (const line of readFileSync(OUT_FILE, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          this.seen.add(JSON.parse(line).id);
        } catch {
          /* skip malformed line */
        }
      }
    }
  }
  has(id: string) {
    return this.seen.has(id);
  }
  write(ev: CorridorEvent) {
    this.seen.add(ev.id);
    appendFileSync(OUT_FILE, JSON.stringify(ev) + "\n");
  }
  close() {
    /* noop */
  }
}

/** Postgres sink (schema in indexer/schema.sql). Dedup via ON CONFLICT (id). */
async function makePostgresSink(url: string): Promise<Sink> {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return {
    has() {
      return false; // ON CONFLICT (id) DO NOTHING handles dedup at the DB
    },
    async write(ev: CorridorEvent) {
      await client.query(
        `INSERT INTO contract_events
           (id, ledger, ledger_closed_at, contract, contract_name, type, topics, data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO NOTHING`,
        [
          ev.id,
          ev.ledger,
          ev.ledger_closed_at || null,
          ev.contract,
          ev.contract_name,
          ev.type,
          JSON.stringify(ev.topics),
          JSON.stringify(ev.data),
        ],
      );
    },
    async close() {
      await client.end();
    },
  };
}

async function main() {
  const dep: Deployment = JSON.parse(readFileSync(DEPLOY_FILE, "utf8"));
  const nameByContract = new Map(Object.entries(dep.contracts).map(([n, id]) => [id, n]));
  const contractIds = Object.values(dep.contracts);

  const server = new rpc.Server(RPC_URL);
  const tip = (await server.getLatestLedger()).sequence;

  // Resume from last ingested ledger + 1, else the cold-start window. Clamp to
  // the retention floor (best effort).
  const floor = Math.max(2, tip - COLD_START_WINDOW);
  let startLedger = floor;
  if (existsSync(CURSOR_FILE)) {
    const last = Number(readFileSync(CURSOR_FILE, "utf8").trim());
    if (Number.isFinite(last) && last + 1 > floor) startLedger = last + 1;
  }
  if (startLedger > tip) {
    console.log(`Up to date (start ${startLedger} > tip ${tip}).`);
    return;
  }

  const dbUrl = process.env.DATABASE_URL;
  const sink: Sink = dbUrl ? await makePostgresSink(dbUrl) : new NdjsonSink();
  const filters = [{ type: "contract", contractIds }];

  let cursor: string | undefined;
  let first = true;
  let ingested = 0;
  let maxLedger = startLedger - 1;
  const byType = new Map<string, number>();

  for (;;) {
    const req = first
      ? { startLedger, filters, limit: PAGE_LIMIT }
      : { cursor: cursor as string, filters, limit: PAGE_LIMIT };
    const res = await server.getEvents(req as Parameters<typeof server.getEvents>[0]);
    first = false;
    const events = res.events ?? [];
    for (const e of events) {
      if (sink.has(e.id)) continue;
      const topics = (e.topic ?? []).map((t) => jsonSafe(decode(t)));
      const type = typeof topics[0] === "string" ? (topics[0] as string) : "unknown";
      const contract = contractAddr(e.contractId);
      const ev: CorridorEvent = {
        id: e.id,
        ledger: e.ledger,
        ledger_closed_at: e.ledgerClosedAt ?? "",
        contract,
        contract_name: nameByContract.get(contract) ?? "unknown",
        type,
        topics: topics.slice(1),
        data: jsonSafe(decode(e.value)),
      };
      await sink.write(ev);
      ingested++;
      maxLedger = Math.max(maxLedger, ev.ledger);
      byType.set(type, (byType.get(type) ?? 0) + 1);
    }
    cursor = res.cursor ?? (events.length ? events[events.length - 1].id : undefined);
    if (events.length < PAGE_LIMIT || !cursor) break;
  }

  if (maxLedger >= startLedger) writeFileSync(CURSOR_FILE, String(maxLedger));
  await sink.close();

  console.log(
    `Indexed ${ingested} new event(s) over ledgers ${startLedger}..${tip} → ${dbUrl ? "Postgres" : OUT_FILE}`,
  );
  for (const [t, n] of [...byType].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(20)} ${n}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
