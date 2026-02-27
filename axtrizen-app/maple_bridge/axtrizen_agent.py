"""
AxtrizenMapleAgent — wraps the REAL Maple ``Agent`` class.

Actually delegates to ``maple.agent.Agent`` for:
  - Lifecycle: agent.start() / agent.stop()
  - Messaging: agent.send(Message) / agent.publish(topic, Message)
  - Subscriptions: agent.subscribe(topic), agent.register_handler(type, fn)
  - LIM: agent.establish_link(agent_id, lifetime) / agent.send_with_link(msg, agent_id)

Maple Agent API (verified):
  Agent(config: Config, broker?: MessageBroker)
  .start()  — starts background message handler thread
  .stop()   — stops the agent (blocks up to 5s for thread join)
  .send(message: Message) → Result[str, dict]
  .publish(topic: str, message: Message) → Result[str, dict]
  .subscribe(topic: str) → Result[None, dict]
  .register_handler(message_type: str, handler: Callable[[Message], Optional[Message]])
  .establish_link(agent_id: str, lifetime_seconds: int = 3600) → Result[str, dict]
  .send_with_link(message: Message, agent_id: str) → Result[str, dict]
  .broadcast(recipients: list[str], message: Message) → dict[str, Result]

MessageBroker API (verified):
  .subscribe(agent_id: str, handler: Callable[[Message], None])  — direct messages
  .subscribe_topic(topic: str, handler: Callable[[str, Message], None], agent_id?)  — topic messages
  .unsubscribe(agent_id: str)
  .publish(topic: str, message: Message) → str
  .send(message: Message) → str
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine, Optional

from maple import Agent as MapleAgent, Config, Message, Priority
from maple.task_management.task_queue import TaskQueue, TaskPriority

from maple_bridge.broker_config import AxtrizenMapleBroker
from maple_bridge.message_types import (
    MessageType,
    create_message,
    create_maple_message,
    status_update_payload,
    task_claim_payload,
)
from maple_bridge.lim_manager import LIMManager

logger = logging.getLogger("maple_bridge.agent")

# Type alias for async message handlers
MessageHandler = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]


@dataclass
class AgentCapabilities:
    """Capabilities advertised when claiming tasks."""

    languages: list[str] = field(default_factory=lambda: ["python", "typescript", "rust"])
    roles: list[str] = field(default_factory=lambda: ["developer"])
    max_concurrent_tasks: int = 1


class AxtrizenMapleAgent:
    """High-level wrapper that DELEGATES to a real Maple ``Agent``.

    Parameters
    ----------
    agent_id:
        OpenClaw agent ID (matches Gateway ``agents.list`` IDs).
    broker:
        Shared ``AxtrizenMapleBroker`` instance.
    role:
        Agent role string (``"developer"``, ``"reviewer"``, ``"manager"``).
    team_id:
        Team this agent belongs to.  Required for topic subscriptions.
    capabilities:
        Advertised capabilities.
    """

    def __init__(
        self,
        agent_id: str,
        broker: AxtrizenMapleBroker,
        role: str = "developer",
        team_id: str = "default",
        capabilities: AgentCapabilities | None = None,
    ):
        self.agent_id = agent_id
        self.role = role
        self.team_id = team_id
        self.capabilities = capabilities or AgentCapabilities()
        self._broker = broker
        self._lim = LIMManager(broker.shared_link_manager)
        self._handlers: dict[MessageType, list[MessageHandler]] = {}
        self._current_task: Optional[str] = None
        self._current_load: float = 0.0
        self._heartbeat_task: Optional[asyncio.Task[None]] = None
        self._connected = False

        # Build the real Maple Config for this agent.
        # Config(agent_id: str, broker_url: str) — both required.
        agent_config = Config(
            agent_id=agent_id,
            broker_url=broker.config.nats_url
            if broker.config.broker_type.value == "nats"
            else "memory://local",
        )

        # Create the real Maple Agent, passing the shared broker.
        # Agent(config: Config, broker?: MessageBroker)
        self._maple_agent = MapleAgent(agent_config, broker.broker)

    # ── Lifecycle ───────────────────────────────────────────────────

    def connect(self) -> None:
        """Start the Maple agent and subscribe to team topics.

        Maple Agent.start() starts the background message handler thread.
        """
        # Start the real Maple agent
        self._maple_agent.start()
        self._connected = True

        # Register in the shared broker/registry
        all_caps = self.capabilities.languages + self.capabilities.roles
        self._broker.register_agent(self.agent_id, name=self.agent_id, capabilities=all_caps)

        # Subscribe to team topics using real Maple Agent.subscribe(topic)
        task_topic = self._broker.team_topic(self.team_id, "tasks")
        self._maple_agent.subscribe(task_topic)

        review_topic = self._broker.team_topic(self.team_id, "reviews")
        self._maple_agent.subscribe(review_topic)

        # Register message handlers for all Axtrizen message types.
        # Maple: agent.register_handler(message_type: str, handler: Callable[[Message], Optional[Message]])
        for msg_type in MessageType:
            self._maple_agent.register_handler(msg_type.value, self._make_maple_handler(msg_type))

        # Also subscribe to topic messages via the broker for broadcast handling.
        # MessageBroker.subscribe_topic(topic, handler, agent_id?)
        self._broker.broker.subscribe_topic(
            task_topic,
            lambda topic, msg: self._on_topic_message(topic, msg),
            self.agent_id,
        )
        self._broker.broker.subscribe_topic(
            review_topic,
            lambda topic, msg: self._on_topic_message(topic, msg),
            self.agent_id,
        )

        logger.info(
            "Agent %s (%s) connected — topics: %s, %s",
            self.agent_id, self.role, task_topic, review_topic,
        )

    def disconnect(self) -> None:
        """Gracefully disconnect.

        Maple Agent.stop() stops the agent (blocks up to 5s).
        """
        if self._heartbeat_task and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()

        # Stop the real Maple agent — thread-safe, blocks for join
        self._maple_agent.stop()

        # Unsubscribe from broker direct messages
        self._broker.broker.unsubscribe(self.agent_id)

        # Unregister from broker/registry
        self._broker.unregister_agent(self.agent_id)
        self._connected = False
        logger.info("Agent %s disconnected", self.agent_id)

    # ── Publishing ──────────────────────────────────────────────────

    def publish(
        self,
        msg_type: MessageType,
        payload: dict[str, Any],
        *,
        receiver_id: Optional[str] = None,
        channel: str = "tasks",
        priority: int = 3,
        link_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Publish a message to a team topic or direct recipient.

        Uses the REAL Maple APIs:
          - Direct: agent.send(Message) or agent.send_with_link(Message, agent_id)
          - Broadcast: agent.publish(topic, Message)

        Returns the dict-based envelope for JSON-RPC serialisation.
        """
        topic = self._broker.team_topic(self.team_id, channel)

        # Build a real Maple Message
        maple_msg = create_maple_message(
            msg_type=msg_type,
            sender_id=self.agent_id,
            payload=payload,
            receiver_id=receiver_id,
            priority=priority,
            link_id=link_id,
        )

        if receiver_id:
            if link_id:
                # Send over a LIM-secured channel
                result = self._maple_agent.send_with_link(maple_msg, receiver_id)
            else:
                # Direct send
                result = self._maple_agent.send(maple_msg)
            if result.is_err():
                logger.warning("Send failed: %s", result.unwrap_err())
        else:
            # Broadcast to topic
            result = self._maple_agent.publish(topic, maple_msg)
            if result.is_err():
                logger.warning("Publish failed: %s", result.unwrap_err())

        # Also return a dict envelope for JSON-RPC
        envelope = create_message(
            msg_type=msg_type,
            sender_id=self.agent_id,
            payload=payload,
            receiver_id=receiver_id,
            team_topic=topic,
            priority=priority,
        )
        logger.debug("Agent %s published %s → %s", self.agent_id, msg_type.value, receiver_id or topic)
        return envelope

    # ── Handler registration ────────────────────────────────────────

    def on(self, msg_type: MessageType, handler: MessageHandler) -> None:
        """Register an async handler for a specific message type.

        These are Axtrizen-level handlers (async, receive dict payloads).
        They're invoked when the real Maple agent dispatches a message
        to our registered handler.
        """
        self._handlers.setdefault(msg_type, []).append(handler)

    # ── Task claiming (Worker protocol) ─────────────────────────────

    def claim_task(self, task_id: str, manager_id: str) -> dict[str, Any]:
        """Send a TASK_CLAIM to the manager for *task_id*."""
        payload = task_claim_payload(
            task_id=task_id,
            agent_id=self.agent_id,
            capabilities=self.capabilities.languages + self.capabilities.roles,
            current_load=self._current_load,
        )
        return self.publish(
            MessageType.TASK_CLAIM,
            payload,
            receiver_id=manager_id,
        )

    def set_current_task(self, task_id: Optional[str]) -> None:
        """Update the current task (affects load reporting)."""
        self._current_task = task_id
        self._current_load = 1.0 if task_id else 0.0

    # ── Heartbeat (STATUS_UPDATE) ───────────────────────────────────

    async def start_heartbeat(self, interval_sec: float = 30.0) -> None:
        """Begin periodic STATUS_UPDATE emissions."""
        async def _beat() -> None:
            while self._connected:
                if self._current_task:
                    payload = status_update_payload(
                        task_id=self._current_task,
                        agent_id=self.agent_id,
                        status="in_progress",
                        percent_complete=50,
                    )
                    self.publish(MessageType.STATUS_UPDATE, payload)

                # Also send heartbeat to Maple's AgentRegistry
                self._broker.registry.heartbeat(self.agent_id)

                await asyncio.sleep(interval_sec)

        self._heartbeat_task = asyncio.create_task(_beat())

    # ── LIM helpers (code review channel) ───────────────────────────

    def initiate_review_link(self, reviewer_id: str) -> str:
        """Open a secure LIM link with *reviewer_id*.

        Returns the ``link_id`` for CODE_REVIEW_REQUEST / RESULT exchanges.
        """
        return self._lim.initiate_link(self.agent_id, reviewer_id)

    def send_review_request(
        self,
        reviewer_id: str,
        link_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Send CODE_REVIEW_REQUEST over a LIM link."""
        self._lim.validate_link(link_id, self.agent_id, reviewer_id)
        return self.publish(
            MessageType.CODE_REVIEW_REQUEST,
            payload,
            receiver_id=reviewer_id,
            channel="reviews",
            link_id=link_id,
        )

    def send_review_result(
        self,
        dev_id: str,
        link_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """Send CODE_REVIEW_RESULT back over a LIM link."""
        self._lim.validate_link(link_id, dev_id, self.agent_id)
        return self.publish(
            MessageType.CODE_REVIEW_RESULT,
            payload,
            receiver_id=dev_id,
            channel="reviews",
            link_id=link_id,
        )

    # ── Internal ────────────────────────────────────────────────────

    def _make_maple_handler(self, msg_type: MessageType):
        """Create a sync handler for Maple's register_handler().

        Maple calls handlers synchronously from its message loop thread:
            handler(message: Message) → Optional[Message]

        We bridge to our async Axtrizen handlers.
        """
        def _handler(message: Message) -> None:
            # Convert Maple Message to dict for Axtrizen handlers
            try:
                msg_dict = message.to_dict()
            except Exception:
                msg_dict = {
                    "type": message.message_type,
                    "sender": str(message.sender) if message.sender else None,
                    "receiver": str(message.receiver) if message.receiver else None,
                    "payload": message.payload or {},
                }

            handlers = self._handlers.get(msg_type, [])
            for handler in handlers:
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.ensure_future(handler(msg_dict))
                    else:
                        loop.run_until_complete(handler(msg_dict))
                except RuntimeError:
                    # No event loop — create one in this thread
                    asyncio.run(handler(msg_dict))
            return None

        return _handler

    def _on_topic_message(self, topic: str, message: Message) -> None:
        """Handle messages received via topic subscription.

        MessageBroker.subscribe_topic handler signature:
            handler(topic: str, message: Message) → None
        """
        try:
            msg_type_str = message.message_type
            try:
                msg_type = MessageType(msg_type_str)
            except ValueError:
                logger.warning("Unknown message type on topic %s: %s", topic, msg_type_str)
                return

            msg_dict = message.to_dict()
            handlers = self._handlers.get(msg_type, [])
            for handler in handlers:
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.ensure_future(handler(msg_dict))
                    else:
                        loop.run_until_complete(handler(msg_dict))
                except RuntimeError:
                    asyncio.run(handler(msg_dict))
        except Exception:
            logger.exception("Error handling topic message in agent %s", self.agent_id)
