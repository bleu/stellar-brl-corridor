/**
 * Bleu — Soroban event indexer (T0 stub).
 *
 * T1: poll Stellar RPC `getEvents` with a cursor, write each event to Postgres,
 * expose a small REST + GraphQL surface for partner reconciliation. Reference
 * implementation any Stellar builder can fork.
 *
 * For now this file exists so `tsc -p .` produces a clean build artifact.
 */

export const INDEXER_VERSION = "0.0.1" as const;
