#!/usr/bin/env bash
# Deploy the Bleu corridor contracts to a Stellar network (default: testnet).
# Requires the `stellar` CLI:  cargo install --locked stellar-cli  (or: brew install stellar-cli)
#
# Usage:
#   scripts/deploy_testnet.sh [network] [source-key-name]
#   NETWORK=testnet SOURCE=bleu-deployer scripts/deploy_testnet.sh
#
# Writes deployed contract IDs to deployments/<network>.json so the README's
# "Deployed addresses" table and the SDKs can pick them up.
#
# Note on USDC: on testnet there is no canonical Circle USDC, so this script
# deploys a Stellar Asset Contract (SAC) for `USDC:<deployer>` and wires the
# partner-attribution contract to it. On mainnet, pass the real Circle USDC SAC
# via the USDC_SAC env var instead.
set -euo pipefail

NETWORK="${1:-${NETWORK:-testnet}}"
SOURCE="${2:-${SOURCE:-bleu-deployer}}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/deployments"
OUT="$OUT_DIR/${NETWORK}.json"
WASM_DIR="$ROOT/target/wasm32v1-none/release"
cd "$ROOT"

command -v stellar >/dev/null 2>&1 || {
  echo "error: stellar CLI not found. Install with: cargo install --locked stellar-cli" >&2
  exit 1
}

echo "› Building contracts with provenance metadata"
stellar contract build \
  --meta "commit=$(git -C "$ROOT" rev-parse HEAD)" \
  --meta "ci_run=${GITHUB_RUN_URL:-local}"

# Ensure the deployer key + funding exist (testnet only).
if ! stellar keys address "$SOURCE" >/dev/null 2>&1; then
  echo "› Generating + funding deployer key '$SOURCE' on $NETWORK"
  stellar keys generate --network "$NETWORK" --fund "$SOURCE"
fi
ADMIN="$(stellar keys address "$SOURCE")"
echo "› Admin / deployer: $ADMIN"

# USDC SAC: use the provided mainnet SAC, or deploy a testnet USDC:<deployer> SAC.
if [ -n "${USDC_SAC:-}" ]; then
  echo "› Using provided USDC SAC: $USDC_SAC"
else
  USDC_ASSET="USDC:$ADMIN"
  echo "› Deploying testnet USDC SAC ($USDC_ASSET)"
  USDC_SAC="$(stellar contract asset deploy --asset "$USDC_ASSET" --source "$SOURCE" --network "$NETWORK" 2>/dev/null \
    || stellar contract id asset --asset "$USDC_ASSET" --network "$NETWORK")"
  echo "  USDC SAC -> $USDC_SAC"
fi

mkdir -p "$OUT_DIR"
echo "{" >"$OUT"
echo "  \"network\": \"$NETWORK\"," >>"$OUT"
echo "  \"admin\": \"$ADMIN\"," >>"$OUT"
echo "  \"usdc_sac\": \"$USDC_SAC\"," >>"$OUT"
echo "  \"deployed_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," >>"$OUT"
echo "  \"contracts\": {" >>"$OUT"

# deploy <crate> <wasm> <trailing-json-comma> -- <constructor args...>
deploy() {
  local crate="$1" wasm="$2" last="$3"; shift 3
  echo "› Deploying $crate"
  local id
  id="$(stellar contract deploy \
    --wasm "$WASM_DIR/$wasm" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    -- "$@")"
  printf '    "%s": "%s"%s\n' "$crate" "$id" "$last" >>"$OUT"
  echo "  $crate -> $id"
}

deploy "fx-rate-lock"        "bleu_fx_rate_lock.wasm"        "," --admin "$ADMIN"
deploy "partner-attribution" "bleu_partner_attribution.wasm" "," --admin "$ADMIN" --usdc_sac "$USDC_SAC"
deploy "card-collateral-poc" "bleu_card_collateral_poc.wasm" ""  --admin "$ADMIN"

echo "  }" >>"$OUT"
echo "}" >>"$OUT"
echo "✓ Wrote $OUT"
