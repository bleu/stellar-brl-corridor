## What

<!-- One line on the change. -->

## Why

<!-- Briefly: what problem it solves or which deliverable it advances. Link to issue or grant tranche if relevant. -->

## How to verify

```bash
just lint
just test
just build
```

- [ ] CI is green
- [ ] If a contract changed: tests cover the new path + the property tests still hold
- [ ] If a public API changed: README or `docs/` updated
- [ ] If a dep was added: license is MIT-compatible
