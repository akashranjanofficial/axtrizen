"""
Broker configuration and factory for the Axtrizen Maple bridge.

Wraps Maple OSS's ``MessageBroker`` and ``ProductionBrokerManager``
with correct API signatures.

Maple API references (verified against source):
  - Config(agent_id: str, broker_url: str, security?, performance?)
  - SecurityConfig(auth_type: str, credentials: str, require_links?, strict_link_policy?)
  - MessageBroker(config: Config)  — singleton; .connect() / .disconnect() take NO args
  - ProductionBrokerManager.create_broker(config, preferred_type=BrokerType.IN_MEMORY) → Result
  - BrokerType: IN_MEMORY | NATS | REDIS | RABBITMQ
  - AgentRegistry() with register_agent(), find_agents_by_capability(), heartbeat()
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

from maple import Config, SecurityConfig, MessageBroker
from maple.broker.production_broker import ProductionBrokerManager, BrokerType
from maple.security.link import LinkManager
from maple.discovery.registry import AgentRegistry

logger = logging.getLogger("maple_bridge.broker")


class AxtrizenBrokerType(str, Enum):
    """Broker backends supported by Axtrizen."""

    MEMORY = "memory"      # Fast, single-process — for dev/test
    NATS = "nats"          # Production — lightweight NATS server


# Map our simplified enum to Maple's BrokerType
_BROKER_TYPE_MAP = {
    AxtrizenBrokerType.MEMORY: BrokerType.IN_MEMORY,
    AxtrizenBrokerType.NATS: BrokerType.NATS,
}


@dataclass
class BrokerConfig:
    """Configuration for the Axtrizen Maple broker."""

    broker_type: AxtrizenBrokerType = AxtrizenBrokerType.MEMORY
    nats_url: str = "nats://127.0.0.1:4222"
    require_links: bool = False          # enforce LIM for all messages
    strict_link_policy: bool = False     # reject msgs without valid LIM link
    heartbeat_interval_sec: float = 30.0
    team_topic_prefix: str = "team"      # topics: team:<teamId>:tasks etc.
    extra: dict[str, Any] = field(default_factory=dict)


class AxtrizenMapleBroker:
    """Managed Maple broker for the Axtrizen desktop app.

    Typically one instance per application lifetime, created in the
    ``MapleBridge`` entry-point.

    Holds:
      - A real Maple ``MessageBroker`` instance
      - A Maple ``AgentRegistry`` for capability-based discovery
      - An optional ``LinkManager`` for LIM security
    """

    def __init__(
        self,
        broker: MessageBroker,
        config: BrokerConfig,
        registry: AgentRegistry,
    ):
        self._broker = broker
        self._config = config
        self._registry = registry
        self._connected_agents: set[str] = set()

        # Shared LinkManager — either from the broker (when security is on)
        # or a single standalone instance shared across ALL agents.
        existing_lm = getattr(broker, "link_manager", None)
        self._shared_link_manager: LinkManager = existing_lm if existing_lm is not None else LinkManager()

    # ── Factory ─────────────────────────────────────────────────────

    @classmethod
    def create(cls, config: Optional[BrokerConfig] = None) -> "AxtrizenMapleBroker":
        """Create and return an ``AxtrizenMapleBroker`` instance.

        Uses the real Maple APIs:
          Config(agent_id=..., broker_url=..., security=...)
          ProductionBrokerManager.create_broker(config, preferred_type)
        """
        cfg = config or BrokerConfig()

        # Build SecurityConfig when LIM enforcement is on.
        # SecurityConfig REQUIRES auth_type: str and credentials: str.
        security_cfg = None
        if cfg.require_links or cfg.strict_link_policy:
            security_cfg = SecurityConfig(
                auth_type="token",
                credentials="axtrizen-internal",
                require_links=cfg.require_links,
                strict_link_policy=cfg.strict_link_policy,
            )

        # Config REQUIRES agent_id: str and broker_url: str as first two args.
        # For the broker-level config we use a sentinel agent_id.
        broker_url = cfg.nats_url if cfg.broker_type == AxtrizenBrokerType.NATS else "memory://local"
        maple_config = Config(
            agent_id="axtrizen-broker",
            broker_url=broker_url,
            security=security_cfg,
        )

        # Normalise broker_type to enum if passed as string
        if isinstance(cfg.broker_type, str):
            cfg = BrokerConfig(**{**cfg.__dict__, "broker_type": AxtrizenBrokerType(cfg.broker_type)})

        maple_broker_type = _BROKER_TYPE_MAP.get(cfg.broker_type, BrokerType.IN_MEMORY)

        # ProductionBrokerManager.create_broker(config, preferred_type) → Result[broker, err]
        result = ProductionBrokerManager.create_broker(maple_config, maple_broker_type)
        if result.is_ok():
            maple_broker = result.unwrap()
            logger.info("Created %s broker via ProductionBrokerManager", cfg.broker_type.value)
        else:
            # Fallback: direct in-memory MessageBroker
            logger.warning(
                "ProductionBrokerManager could not create %s (%s), falling back to in-memory",
                cfg.broker_type.value,
                result.unwrap_err() if result.is_err() else "unknown",
            )
            maple_broker = MessageBroker(maple_config)

        # MessageBroker.connect() takes NO arguments
        maple_broker.connect()

        # Shared AgentRegistry for capability-based discovery
        registry = AgentRegistry()

        return cls(broker=maple_broker, config=cfg, registry=registry)

    # ── Public helpers ──────────────────────────────────────────────

    @property
    def broker(self) -> MessageBroker:
        """The underlying Maple MessageBroker instance."""
        return self._broker

    @property
    def config(self) -> BrokerConfig:
        return self._config

    @property
    def registry(self) -> AgentRegistry:
        """Shared AgentRegistry for capability-based agent discovery."""
        return self._registry

    @property
    def link_manager(self) -> Optional[LinkManager]:
        """Return the broker's LinkManager (may be None in dev mode)."""
        return getattr(self._broker, "link_manager", None)

    @property
    def shared_link_manager(self) -> LinkManager:
        """Shared LinkManager for all agents on this broker.

        Always returns a valid instance — either the broker's own
        LinkManager (when security is configured) or a standalone
        one created at broker init time.
        """
        return self._shared_link_manager

    def team_topic(self, team_id: str, channel: str = "tasks") -> str:
        """Return the topic string for a team channel.

        Examples:
            ``team:abc123:tasks``
            ``team:abc123:reviews``
        """
        return f"{self._config.team_topic_prefix}:{team_id}:{channel}"

    def register_agent(
        self,
        agent_id: str,
        name: str = "",
        capabilities: list[str] | None = None,
    ) -> None:
        """Track an agent and register in Maple's AgentRegistry."""
        self._connected_agents.add(agent_id)
        self._registry.register_agent(
            agent_id=agent_id,
            name=name or agent_id,
            capabilities=capabilities or [],
        )
        logger.debug("Agent %s registered (total: %d)", agent_id, len(self._connected_agents))

    def unregister_agent(self, agent_id: str) -> None:
        self._connected_agents.discard(agent_id)
        self._registry.deregister_agent(agent_id)
        logger.debug("Agent %s unregistered (total: %d)", agent_id, len(self._connected_agents))

    def find_agents_by_capability(self, capability: str) -> list[str]:
        """Find agents that advertise a given capability."""
        infos = self._registry.find_agents_by_capability(capability)
        return [info.agent_id for info in infos]

    @property
    def connected_agent_ids(self) -> frozenset[str]:
        return frozenset(self._connected_agents)

    def shutdown(self) -> None:
        """Cleanly tear down the broker.

        MessageBroker.disconnect() takes NO arguments.
        """
        logger.info("Shutting down Maple broker (%d agents)", len(self._connected_agents))
        try:
            self._broker.disconnect()
        except Exception:
            logger.exception("Error during broker shutdown")
        self._connected_agents.clear()
