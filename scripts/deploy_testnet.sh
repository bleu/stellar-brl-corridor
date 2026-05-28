#!/usr/bin/env bash
# Deploy the Bleu corridor contracts to a Stellar network (default: testnet).
# Requires the `stellar` CLI:  cargo install --locked stellar-cli
#
# Usage:
#   scripts/deploy_testnet.sh [network] [source-key-name]
#   NETWORK=testnet SOURCE=bleu-deployer scripts/deploy_testnet.sh
#
# Writes deployed contract IDs to deployments/<network>.json so the README's
# "Deployed addresses" table and the SDKs can pick them up.
set -euo pipefail

NETWORK="${1:-${NETWORK:-testnet}}"
SOURCE="${2:-${SOURCE:-bleu-deployer}}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/deployments"
OUT="$OUT_DIR/${NETWORK}.json"
WASM_DIR="$ROOT/target/wasm32v1-none/release"

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

mkdir -p "$OUT_DIR"
echo "{" >"$OUT"
echo "  \"network\": \"$NETWORK\"," >>"$OUT"
echo "  \"admin\": \"$ADMIN\"," >>"$OUT"
echo "  \"deployed_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," >>"$OUT"
echo "  \"contracts\": {" >>"$OUT"

deploy() {
  local crate="$1" wasm="$2" last="${3:-}"
  echo "› Deploying $crate"
  local id
  id="$(stellar contract deploy \
    --wasm "$WASM_DIR/$wasm" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    -- --admin "$ADMIN")"
  printf '    "%s": "%s"%s\n' "$crate" "$id" "$last" >>"$OUT"
  echo "  $crate -> $id"
}

deploy "fx-rate-lock"        "bleu_fx_rate_lock.wasm"        ","
deploy "partner-attribution" "bleu_partner_attribution.wasm" ","
deploy "card-collateral-poc" "bleu_card_collateral_poc.wasm" ""

echo "  }" >>"$OUT"
echo "}" >>"$OUT"
echo "✓ Wrote $OUT"
