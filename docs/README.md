# Documentation

Docs for the Bleu BRL/PIX corridor on Stellar — [SCF #44](https://communityfund.stellar.org/) (Build Award · Integration track). Repo root: [`../README.md`](../README.md).

## Start here

**[REVIEWERS.md](REVIEWERS.md)** — verify the whole thing in ~60 seconds: deployed contracts, the on-chain demo, the live-reading SDK, the event indexer, the Anchor Platform.

## Reference

| Doc | What |
| --- | --- |
| [architecture/README.md](architecture/README.md) | C4 L1/L2/L3 + contract overview — the Technical Architecture Document |
| [DEMO.md](DEMO.md) | Every primitive executing on-chain, with clickable testnet tx hashes (`just demo`) |
| [PROVENANCE.md](PROVENANCE.md) | The deployed contracts reproduce **byte-for-byte** from source |
| [../indexer/README.md](../indexer/README.md) | Soroban event indexer — RPC `getEvents` → Postgres/NDJSON (`just index`) |
| [ANCHOR-PLATFORM.md](ANCHOR-PLATFORM.md) | BR-configured SEP-1 TOML + SEP-38 firm-quote config (IOF-ready `fee.details[]`) |
| [sep-cap-coverage.md](sep-cap-coverage.md) | Which SEPs/CAPs the corridor consumes, extends, or proposes |
| [grant.md](grant.md) | SCF #44 scope, tranches, team |

## Diagrams

All C4 diagrams are [Mermaid](https://mermaid.js.org) files (`architecture/*.mermaid`), linked from [architecture/README.md](architecture/README.md): L1 system context · L2 containers · L3 SEP-31 + SEP-38 + IOF flow · L3 CAP-33 sponsor-sandwich onboarding · L3 card-collateral authorization.
