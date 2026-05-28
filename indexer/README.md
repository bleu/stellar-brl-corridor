# Indexer

Open-source Soroban event indexer — polls Stellar RPC `getEvents` with a cursor and writes contract events to Postgres.

> **Status: T0 stub.** Real implementation lands in T1 alongside the contracts. The intent is a reference template any Stellar builder can fork — partner reconciliation, audit trails, dashboard backends.

Stellar RPC retains events for 24h (default) up to 7d (max). This service bridges that to long-term storage.
