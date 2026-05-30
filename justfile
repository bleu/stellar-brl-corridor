# Bleu — Stellar BRL/PIX Corridor — task runner
# Usage:  `just`  (lists recipes)  ·  `just build`  ·  `just test`

set shell := ["bash", "-cu"]

default:
    @just --list

# Build everything (contracts + SDK)
build: build-contracts build-sdk

# Build the three Soroban contracts in release mode against wasm32v1-none.
# SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2 is required because the OZ
# stellar-contracts (=0.7.1) deps enable soroban-sdk's `experimental_spec_shaking_v2`
# feature; it is exactly what `stellar contract build` sets internally.
build-contracts:
    SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2=1 cargo build --release --target wasm32v1-none --workspace --locked

# Build the TypeScript SDK
build-sdk:
    cd sdk/typescript && npm install && npm run build

# Run all Rust tests
test:
    cargo test --workspace --locked

# Run lints (fmt + clippy)
lint:
    cargo fmt --all -- --check
    cargo clippy --workspace --all-targets -- -D warnings

# Auto-format
fmt:
    cargo fmt --all

# Build Wasm with provenance metadata (requires `stellar` CLI)
wasm:
    @command -v stellar >/dev/null || { echo "Install the stellar CLI:  cargo install --locked stellar-cli"; exit 1; }
    stellar contract build \
      --meta commit=$(git rev-parse HEAD) \
      --meta ci_run=${GITHUB_RUN_URL:-local}

# Deploy the contracts to a network (default testnet). Requires the stellar CLI.
deploy-testnet network="testnet":
    scripts/deploy_testnet.sh {{network}}

# Run the live testnet demo: exercises all three primitives against the deployed
# contracts and prints a clickable tx hash per step. Requires the stellar CLI +
# jq. Idempotent; pass a run tag to override the timestamp. See docs/DEMO.md.
demo run_tag="":
    scripts/demo_testnet.sh {{run_tag}}

# Generate TypeScript bindings from a deployed contract into its OWN subdir,
# e.g. `just bindings partner-attribution <CID>`. The per-contract output dir
# avoids the flatten/overwrite that a shared dir causes on the 2nd contract.
bindings name contract_id network="testnet":
    stellar contract bindings typescript --network {{network}} --contract-id {{contract_id}} --output-dir sdk/typescript/src/generated/{{name}} --overwrite

# Read LIVE testnet state via the TypeScript SDK (read-only; no signing, no funds).
# Connects to testnet RPC and prints partner-attribution admin / total_bps / sac.
sdk-example:
    cd sdk/typescript && npm install && npm run example

# Anchor Platform — bring up the BR-configured local stack (serves SEP-1 + SEP-38 /info)
ap-up:
    cd anchor-platform && (cp -n env.example .env || true) && docker compose -f docker-compose.example.yml up -d

# Tear down the Anchor Platform stack + volumes
ap-down:
    cd anchor-platform && docker compose -f docker-compose.example.yml down -v

# Smoke-check the live Anchor Platform: SEP-1 TOML + SEP-38 /info
ap-check:
    curl -s localhost:8080/.well-known/stellar.toml && echo && curl -s localhost:8080/sep38/info

# Clean Rust + Node build outputs
clean:
    cargo clean
    rm -rf sdk/typescript/dist sdk/typescript/node_modules
    rm -rf indexer/dist indexer/node_modules
