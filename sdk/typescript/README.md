# @bleu/stellar-brl-corridor-sdk

TypeScript SDK for Bleu's BRL/PIX corridor on Stellar — Anchor Platform + SEP-38 rate-lock + partner attribution.

> **Status: T0 skeleton.** Type surface only. The real client lands in T1, generated from the Soroban contract specs via `stellar contract bindings --language typescript` and thin hand-written wrappers around SEP-31 / SEP-38.

## Install

```bash
# T0 — not yet on npm. Use the workspace path or git URL until T3.
npm install ../path/to/stellar-brl-corridor/sdk/typescript
```

## Quickstart

```ts
import { BleuClient } from "@bleu/stellar-brl-corridor-sdk";

const client = new BleuClient({
  rpcUrl: "https://soroban-testnet.stellar.org",
  anchorDomain: "anchor.example.com",
  network: "testnet",
});

console.log(client.ping()); // "ok"
```

## Develop

```bash
npm install
npm run build   # tsc -p .
npm test        # tsc --noEmit -p .
```
