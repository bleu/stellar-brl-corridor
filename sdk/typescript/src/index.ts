/**
 * @bleu/stellar-brl-corridor-sdk
 *
 * TypeScript SDK for Bleu's BRL/PIX corridor on Stellar.
 *
 * The contract surface is generated from the live Soroban contract specs via
 * `stellar contract bindings typescript` (see `src/generated/`) and exposed
 * through thin typed clients in {@link corridorClients}, pointed at the
 * deployed testnet addresses. Read live on-chain state in ~20 lines — see
 * `examples/read-live-testnet.ts`.
 *
 * @packageDocumentation
 */

export const SDK_VERSION = "0.0.1" as const;

// Typed corridor clients over the generated Soroban bindings.
export {
  corridorClients,
  addressesFromDeployment,
  TESTNET_RPC_URL,
  TESTNET_PASSPHRASE,
} from "./contracts.js";
export type {
  CorridorAddresses,
  CorridorClients,
  CorridorClientOptions,
  DeploymentFile,
} from "./contracts.js";
