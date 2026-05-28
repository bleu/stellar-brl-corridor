# Bleu — Stellar BRL/PIX Corridor — task runner
# Usage:  `just`  (lists recipes)  ·  `just build`  ·  `just test`

set shell := ["bash", "-cu"]

default:
    @just --list

# Build everything (contracts + SDK)
build: build-contracts build-sdk

# Build the three Soroban contracts in release mode against wasm32v1-none
build-contracts:
    cargo build --release --target wasm32v1-none --workspace --locked

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

# Generate TypeScript bindings from a deployed contract id.
bindings contract_id network="testnet":
    stellar contract bindings typescript --network {{network}} --contract-id {{contract_id}} --output-dir sdk/typescript/src/generated --overwrite

# Anchor Platform — bring up local stack against a sandbox anchor
ap-up:
    docker compose -f anchor-platform/docker-compose.example.yml up

ap-down:
    docker compose -f anchor-platform/docker-compose.example.yml down -v

# Clean Rust + Node build outputs
clean:
    cargo clean
    rm -rf sdk/typescript/dist sdk/typescript/node_modules
    rm -rf indexer/dist indexer/node_modules
