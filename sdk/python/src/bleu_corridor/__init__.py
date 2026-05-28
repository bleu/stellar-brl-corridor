"""bleu_corridor — Python SDK for Bleu's BRL/PIX corridor on Stellar.

T0 skeleton. The real client lands in T1, generated from the Soroban contract
specs via ``stellar contract bindings --language python`` and thin
hand-written wrappers around SEP-31 / SEP-38.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

__version__ = "0.0.1"

Network = Literal["testnet", "mainnet"]


@dataclass(frozen=True)
class BleuClientConfig:
    """Configuration for :class:`BleuClient`."""

    rpc_url: str
    anchor_domain: str
    network: Network


class BleuClient:
    """Bleu corridor client.

    T0 ships the type surface only; transport implementations land in T1.
    """

    def __init__(self, config: BleuClientConfig) -> None:
        self.config = config

    def ping(self) -> str:
        """Liveness probe used by CI."""
        return "ok"


__all__ = ["BleuClient", "BleuClientConfig", "Network", "__version__"]
