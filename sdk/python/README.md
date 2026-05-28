# bleu-stellar-brl-corridor (Python)

Python SDK for Bleu's BRL/PIX corridor on Stellar — Anchor Platform + SEP-38 rate-lock + partner attribution.

> **Status: T0 skeleton.** Type surface only. Real client lands in T1.

## Install

```bash
# T0 — not yet on PyPI. Install from source.
pip install -e .
```

## Quickstart

```python
from bleu_corridor import BleuClient, BleuClientConfig

client = BleuClient(BleuClientConfig(
    rpc_url="https://soroban-testnet.stellar.org",
    anchor_domain="anchor.example.com",
    network="testnet",
))

assert client.ping() == "ok"
```
