# @bleu/stellar-brl-corridor-sdk

TypeScript SDK for Bleu's BRL/PIX corridor on Stellar — Anchor Platform + SEP-38 rate-lock + partner attribution.

The contract surface is generated from the **live** Soroban contract specs via
`stellar contract bindings typescript` (in `src/generated/`) and exposed through
thin typed clients pointed at the deployed testnet addresses.

## Read live testnet state in 20 lines

This connects to the public testnet RPC and reads real on-chain state from the
deployed `partner-attribution` contract — read-only simulation calls, no signing,
no funds:

```ts
import { readFileSync } from "node:fs";
import {
  corridorClients,
  addressesFromDeployment,
  type DeploymentFile,
} from "@bleu/stellar-brl-corridor-sdk";

const deployment = JSON.parse(
  readFileSync("deployments/testnet.json", "utf8"),
) as DeploymentFile;

const { partnerAttribution } = corridorClients({
  addresses: addressesFromDeployment(deployment),
});

const { result: admin } = await partnerAttribution.get_admin();
const { result: totalBps } = await partnerAttribution.total_bps();
const { result: sac } = await partnerAttribution.sac_address();

console.log({ admin, totalBps, sac });
// { admin: 'GAQH34BV…7NLI', totalBps: 5000, sac: 'CBQAJM5A…DO7D' }
```

Run the full example (prints live values to the console):

```bash
npm install && npm run example      # from sdk/typescript
just sdk-example                    # from the repo root
```

## Regenerate bindings

Bindings live in `src/generated/<contract>/` and are produced from the deployed
contracts:

```bash
just bindings <contract_id> testnet
```

## Develop

```bash
npm install
npm run build   # tsc -p .
npm test        # tsc --noEmit -p .
```
