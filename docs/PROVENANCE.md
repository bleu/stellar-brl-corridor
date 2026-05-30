# Build provenance — reproducible Wasm

Every corridor contract is built with `stellar contract build`, which embeds the
git commit + toolchain into the on-chain Wasm's `contractmetav0` custom section.
The deployed bytecode is therefore **self-describing and reproducible**: a
reviewer reads the embedded `commit`, checks it out, rebuilds with the same meta,
and gets the identical hash.

## Verify it yourself

```bash
# 1. Read the metadata embedded in the deployed (testnet) contract:
stellar contract info meta --network testnet \
  --contract-id CDZLXRAWDHU6JLDAU5PRTYC3NNXWRWXIDTPJNOTIHIMLVAPSA5JONVRW
#   → rsver: 1.95.0 · rssdkver: 25.3.0 · commit: e14432b… · ci_run: local

# 2. Check out that commit and rebuild with the same meta:
git checkout e14432bdd978027276a49bec89be45ff53db687c
stellar contract build --meta commit=e14432bdd978027276a49bec89be45ff53db687c --meta ci_run=local

# 3. Fetch the on-chain Wasm and compare hashes:
stellar contract fetch --network testnet --id <CONTRACT_ID> -o onchain.wasm
shasum -a 256 onchain.wasm target/wasm32v1-none/release/<crate>.wasm
```

## Result (testnet, verified 2026-05-30) — byte-identical ✅

| Contract | Testnet id | Embedded `commit` | sha256 (on-chain **==** rebuilt) |
|---|---|---|---|
| `fx-rate-lock` | `CDZLXRAW…JONVRW` | `e14432b` | `263f657806d4fe02f3f292ccbed447cf2a55b492200c3ec298101556b239722c` |
| `partner-attribution` | `CDBUJYLO…K53YR` | `e14432b` | `c885de54e39fd7e38c983552e5d2d05f8bd99d5637482815cad52ad51d5e3c8f` |
| `card-collateral-poc` | `CC7HSHXJ…WH2WT` | `e14432b` | `f9b2681f5744a1d937eda045aaf30cc5b63e36630e000612122a8e008b5349b9` |

All three on-chain hashes reproduce **exactly** from source at `e14432b` with
`rsver 1.95.0` / `soroban-sdk 25.3.0` (pinned in `rust-toolchain.toml` + `Cargo.toml`).
The build commit `e14432b` precedes the deploy commit `9a1bfeb` — the deploy
script builds the Wasm, then commits the deploy record — and both are reachable on `main`.
