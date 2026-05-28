/**
 * @bleu/stellar-brl-corridor-sdk
 *
 * TypeScript SDK for Bleu's BRL/PIX corridor on Stellar.
 *
 * T0 skeleton. The real surface lands in T1, generated from the Soroban
 * contract specs via `stellar contract bindings --language typescript`, with
 * thin hand-written wrappers around SEP-31 / SEP-38 quote and transaction flows.
 *
 * @packageDocumentation
 */

export const SDK_VERSION = "0.0.1" as const;

/**
 * Stellar network the client targets.
 */
export type Network = "testnet" | "mainnet";

/**
 * Configuration for {@link BleuClient}.
 */
export interface BleuClientConfig {
  /** Stellar RPC URL (Soroban RPC JSON-RPC endpoint). */
  readonly rpcUrl: string;
  /** Anchor domain that publishes SEP-1 `stellar.toml`. */
  readonly anchorDomain: string;
  /** Network the RPC connects to. */
  readonly network: Network;
}

/**
 * Bleu corridor client.
 *
 * T0 ships the type surface only; transport implementations land in T1.
 */
export class BleuClient {
  constructor(public readonly config: BleuClientConfig) {}

  /** Liveness probe used by CI. */
  ping(): "ok" {
    return "ok";
  }
}
