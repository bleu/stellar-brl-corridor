# Contributing

Thanks for the interest. This repo is the public engineering output of Bleu's [SCF #44](https://communityfund.stellar.org/) Build Award (Integration track) — BR BRL/PIX corridor on Stellar.

## Ground rules

- **Open by default, MIT.** Every artifact in this repo ships under MIT. Don't add a dependency or vendored file with an incompatible license.
- **CI must pass.** `cargo fmt`, `cargo clippy -D warnings`, `cargo test`, and the wasm release build are non-negotiable for merge.
- **Conventional Commits.** Use `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`. The history is read by reviewers.
- **One change, one PR.** Atomic PRs review faster.

## Development loop

```bash
just lint           # fmt + clippy
just test           # cargo test --workspace
just build          # release wasm + TS SDK
```

For the local Anchor Platform stack:

```bash
just ap-up          # docker compose, sandbox anchor
just ap-down
```

## Branching

- Trunk-based on `main`. Branch from `main`, open a PR back to `main`.
- Release tags follow `v0.X.Y`. Tags drive testnet/mainnet deploys (configured in `.github/workflows/`).

## Security

Found a vulnerability? **Do not** open a public issue. Email security@bleu.builders. We'll respond within two business days.

## Code of conduct

Be kind, be precise, prefer specifics over adjectives. We follow the [Contributor Covenant](https://www.contributor-covenant.org/) as the operating norm.
