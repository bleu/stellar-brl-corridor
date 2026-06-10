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
  --contract-id CCF7U43LBCHURKKHEHLBWUUZKNPFWQUQTESJLFWWVHCNKZKQMG3UG2AI
#   → rsver: 1.96.0 · rssdkver: 25.3.0 · commit: 7bcadc4… · ci_run: local

# 2. Rebuild with the same meta (just wasm sets commit to HEAD and ci_run=local):
just wasm

# 3. Fetch the on-chain Wasm and compare hashes:
stellar contract fetch --network testnet \
  --id CCF7U43LBCHURKKHEHLBWUUZKNPFWQUQTESJLFWWVHCNKZKQMG3UG2AI \
  -o onchain-fx.wasm
shasum -a 256 onchain-fx.wasm target/wasm32v1-none/release/bleu_fx_rate_lock.wasm
```

## Result (testnet, verified 2026-06-10) — byte-identical ✅

| Contract | Testnet id | Embedded `commit` | sha256 (on-chain **==** rebuilt) |
|---|---|---|---|
| `fx-rate-lock` | [`CCF7U43L…UG2AI`](https://stellar.expert/explorer/testnet/contract/CCF7U43LBCHURKKHEHLBWUUZKNPFWQUQTESJLFWWVHCNKZKQMG3UG2AI) | `7bcadc4` | `b256b4f4b42cba047ede82bde5b161f18ed9a5909c24cd028a8ccc8235239617` |
| `partner-attribution` | [`CCXSXAM7…23OFB`](https://stellar.expert/explorer/testnet/contract/CCXSXAM7KLACDCD2UDBM37BFTZZYATPTN4WFXJASIEGZ4ZO44CM23OFB) | `7bcadc4` | `a374119be10b237f3784209dd74b7b3276f4de4eeeff11880501520ddc38cfe5` |
| `card-collateral-poc` | [`CAVFABBN…IFRWV`](https://stellar.expert/explorer/testnet/contract/CAVFABBNRNU6CRAYNIH2OZSZBDKGXRUYVIUGNZKVKAUYK6P3GGOIFRWV) | `7bcadc4` | `e95f338381efa9cf68aad9b1ba03140bf068cbe83cc55441c6630b278d4b2184` |

All three on-chain hashes reproduce **exactly** from source at `7bcadc4` with
`rsver 1.96.0` / `soroban-sdk 25.3.0` (pinned in `rust-toolchain.toml` + `Cargo.toml`).
The build commit `7bcadc4` precedes the deploy commit `9a1bfeb` — the deploy
script builds the Wasm, then commits the deploy record — and both are reachable on `main`.
