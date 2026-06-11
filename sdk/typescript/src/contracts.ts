/**
 * Corridor contract wiring.
 *
 * Thin typed clients over the generated Soroban bindings, pointed at the
 * deployed testnet contract addresses. The addresses live in one place —
 * {@link CorridorAddresses} — so the SDK, examples and tests never hardcode a
 * contract id in more than one spot. The canonical on-chain source of truth is
 * `deployments/testnet.json` at the repo root; {@link addressesFromDeployment}
 * maps a parsed deployment file into {@link CorridorAddresses}.
 *
 * @packageDocumentation
 */

import { Client as PartnerAttributionClient } from "./generated/partner-attribution/src/index.js";
import { Client as FxRateLockClient } from "./generated/fx-rate-lock/src/index.js";
import { Client as CardCollateralClient } from "./generated/card-collateral/src/index.js";

/** Public Soroban RPC endpoint for Stellar testnet. */
export const TESTNET_RPC_URL = "https://soroban-testnet.stellar.org" as const;

/** Network passphrase for Stellar testnet. */
export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015" as const;

/**
 * Contract ids for one deployment of the corridor. Mirror the structure of
 * `deployments/<network>.json` so a parsed deployment file maps straight in.
 */
export interface CorridorAddresses {
  readonly partnerAttribution: string;
  readonly fxRateLock: string;
  readonly cardCollateralPoc: string;
  readonly cardCollateral: string;
  readonly usdcSac: string;
}

/**
 * Shape of `deployments/<network>.json`. Parsed at runtime (the file lives
 * outside the SDK `rootDir`, so it is read via fs, not imported).
 */
export interface DeploymentFile {
  readonly network: string;
  readonly admin: string;
  readonly usdc_sac: string;
  readonly deployed_at?: string;
  readonly contracts: {
    readonly "fx-rate-lock": string;
    readonly "partner-attribution": string;
    readonly "card-collateral-poc": string;
    readonly "card-collateral": string;
  };
}

/** Map a parsed `deployments/<network>.json` into {@link CorridorAddresses}. */
export function addressesFromDeployment(d: DeploymentFile): CorridorAddresses {
  return {
    partnerAttribution: d.contracts["partner-attribution"],
    fxRateLock: d.contracts["fx-rate-lock"],
    cardCollateralPoc: d.contracts["card-collateral-poc"],
    cardCollateral: d.contracts["card-collateral"],
    usdcSac: d.usdc_sac,
  };
}

/** Connection params for building read-only contract clients. */
export interface CorridorClientOptions {
  /** Contract addresses for the target deployment. */
  readonly addresses: CorridorAddresses;
  /** Soroban RPC URL. Defaults to {@link TESTNET_RPC_URL}. */
  readonly rpcUrl?: string;
  /** Network passphrase. Defaults to {@link TESTNET_PASSPHRASE}. */
  readonly networkPassphrase?: string;
}

/**
 * Typed clients for the corridor contracts, ready for read-only simulation
 * calls (no signing, no funds). Each method returns an `AssembledTransaction`;
 * `.result` holds the simulated return value.
 */
export interface CorridorClients {
  readonly partnerAttribution: PartnerAttributionClient;
  readonly fxRateLock: FxRateLockClient;
  readonly cardCollateral: CardCollateralClient;
}

/**
 * Build typed, read-only clients for the corridor contracts.
 *
 * @example
 * ```ts
 * const { partnerAttribution } = corridorClients({ addresses });
 * const { result: admin } = await partnerAttribution.get_admin();
 * ```
 */
export function corridorClients(opts: CorridorClientOptions): CorridorClients {
  const rpcUrl = opts.rpcUrl ?? TESTNET_RPC_URL;
  const networkPassphrase = opts.networkPassphrase ?? TESTNET_PASSPHRASE;

  return {
    partnerAttribution: new PartnerAttributionClient({
      contractId: opts.addresses.partnerAttribution,
      networkPassphrase,
      rpcUrl,
    }),
    fxRateLock: new FxRateLockClient({
      contractId: opts.addresses.fxRateLock,
      networkPassphrase,
      rpcUrl,
    }),
    cardCollateral: new CardCollateralClient({
      contractId: opts.addresses.cardCollateral,
      networkPassphrase,
      rpcUrl,
    }),
  };
}
