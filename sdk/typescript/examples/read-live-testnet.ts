/**
 * Read LIVE testnet state from the deployed corridor contracts.
 *
 * No signing, no funds — these are read-only Soroban simulation calls against
 * the public testnet RPC. Run it:
 *
 *   npm run example          # from sdk/typescript
 *   just sdk-example         # from the repo root
 *
 * Expected (set by the demo run in docs/DEMO.md):
 *   partner-attribution admin      = GAQH34BVB4SEEI4DNKIJQI6BTCNFJVO7AWC4SGQHV23UVRNLIZEL7NLI
 *   partner-attribution total_bps  = 5000   (two partners summing to 50%)
 *   partner-attribution sac_address= the USDC SAC
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  corridorClients,
  addressesFromDeployment,
  TESTNET_RPC_URL,
  type DeploymentFile,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
// sdk/typescript/examples -> repo root deployments/testnet.json
const deploymentPath = resolve(here, "../../../deployments/testnet.json");

async function main(): Promise<void> {
  const deployment = JSON.parse(
    readFileSync(deploymentPath, "utf8"),
  ) as DeploymentFile;
  const addresses = addressesFromDeployment(deployment);

  console.log("Bleu BRL/PIX corridor — reading LIVE testnet state");
  console.log(`  RPC:      ${TESTNET_RPC_URL}`);
  console.log(`  network:  ${deployment.network}`);
  console.log(`  contract: partner-attribution ${addresses.partnerAttribution}`);
  console.log("");

  const { partnerAttribution } = corridorClients({ addresses });

  // Each call simulates against the RPC and returns the decoded result.
  const [admin, totalBps, sacAddress] = await Promise.all([
    partnerAttribution.get_admin().then((t) => t.result),
    partnerAttribution.total_bps().then((t) => t.result),
    partnerAttribution.sac_address().then((t) => t.result),
  ]);

  console.log("partner-attribution (live, on-chain):");
  console.log(`  get_admin()   = ${admin ?? "<none>"}`);
  console.log(`  total_bps()   = ${totalBps}  (${Number(totalBps) / 100}% of spread routed to partners)`);
  console.log(`  sac_address() = ${sacAddress}`);
  console.log("");

  // Cross-check the SAC the contract reports against the deployment file.
  const sacMatch = sacAddress === addresses.usdcSac;
  console.log(`  sac_address matches deployments/testnet.json usdc_sac: ${sacMatch}`);

  console.log("");
  console.log("Live read complete — values above came straight off testnet.");
}

main().catch((err) => {
  console.error("Failed to read live testnet state:");
  console.error(err);
  process.exitCode = 1;
});
