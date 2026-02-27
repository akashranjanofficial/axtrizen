"""
MapleBridge — Rust ↔ Python sidecar IPC bridge.

This module is the entry-point that the Tauri sidecar spawns via:
    python3 -m maple_bridge.bridge

It:
  1. Adds the vendored maple-oss to sys.path so ``import maple`` works.
  2. Boots the Maple broker (in-memory or NATS).
  3. Listens on stdin/stdout JSON-RPC for commands from the Rust backend.
  4. Forwards Maple events back to Rust as JSON-RPC notifications.

Protocol
--------
Each line on stdin is a JSON object::

    {"id": 1, "method": "broker.start", "params": {...}}
    {"id": 2, "method": "agent.connect", "params": {"agentId": "dev-1", "teamId": "t1", "role": "developer"}}

Each line on stdout is a JSON response or notification::

    {"id": 1, "result": {"status": "ok"}}
    {"jsonrpc": "2.0", "method": "event", "params": {"type": "STATUS_UPDATE", ...}}
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from typing import Any, Optional

# ── Vendor path setup ───────────────────────────────────────────────
# Ensure the vendored maple-oss is importable.  The vendor directory
# sits alongside the maple_bridge package:
#   axtrizen-app/
#     vendor/maple-oss/maple/...
#     maple_bridge/bridge.py  (this file)
_BRIDGE_DIR = os.path.dirname(os.path.abspath(__file__))
_APP_DIR = os.path.dirname(_BRIDGE_DIR)
_VENDOR_MAPLE = os.path.join(_APP_DIR, "vendor", "maple-oss")
if _VENDOR_MAPLE not in sys.path:
    sys.path.insert(0, _VENDOR_MAPLE)

from maple_bridge.broker_config import AxtrizenMapleBroker, BrokerConfig, AxtrizenBrokerType
from maple_bridge.axtrizen_agent import AxtrizenMapleAgent
from maple_bridge.message_types import MessageType
from maple_bridge.memu_handler import MemUHandler
from maple_bridge.agent_pool import AgentPoolManager

logger = logging.getLogger("maple_bridge.bridge")


class MapleBridge:
    """JSON-RPC bridge between Rust/Tauri and the Maple broker."""

    def __init__(self) -> None:
        self._broker: Optional[AxtrizenMapleBroker] = None
        self._agents: dict[str, AxtrizenMapleAgent] = {}
        self._pool: Optional[AgentPoolManager] = None
        self._running = False
        self._memu = MemUHandler()

    # ── Main loop ───────────────────────────────────────────────────

    async def run(self) -> None:
        """Read JSON-RPC commands from stdin, dispatch, write responses to stdout."""
        self._running = True
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        await asyncio.get_event_loop().connect_read_pipe(lambda: protocol, sys.stdin)

        logger.info("MapleBridge started — waiting for commands on stdin")

        while self._running:
            line = await reader.readline()
            if not line:
                break
            try:
                request = json.loads(line.decode())
                response = await self._dispatch(request)
                self._write(response)
            except json.JSONDecodeError:
                self._write({"error": "Invalid JSON"})
            except Exception as exc:
                logger.exception("Dispatch error")
                self._write({"id": None, "error": str(exc)})

    # ── Dispatch ────────────────────────────────────────────────────

    async def _dispatch(self, request: dict[str, Any]) -> dict[str, Any]:
        req_id = request.get("id")
        method = request.get("method", "")
        params = request.get("params", {})

        handler = {
            "broker.start": self._handle_broker_start,
            "broker.shutdown": self._handle_broker_shutdown,
            "agent.connect": self._handle_agent_connect,
            "agent.disconnect": self._handle_agent_disconnect,
            "agent.publish": self._handle_agent_publish,
            "agent.claim_task": self._handle_agent_claim_task,
            "lim.initiate": self._handle_lim_initiate,
            "lim.review_request": self._handle_lim_review_request,
            "lim.review_result": self._handle_lim_review_result,
            "lim.terminate": self._handle_lim_terminate,
            "status": self._handle_status,
            # ── Worker pool management ──────────────────────────
            "pool.spawn": self._handle_pool_spawn,
            "pool.shutdown": self._handle_pool_shutdown,
            "pool.status": self._handle_pool_status,
            "pool.resolve_task": self._handle_pool_resolve_task,
            # ── memU memory handlers ────────────────────────────
            "memu.init": self._memu.handle_init,
            "memu.memorize": self._memu.handle_memorize,
            "memu.retrieve": self._memu.handle_retrieve,
            "memu.list": self._memu.handle_list,
            "memu.clear": self._memu.handle_clear,
            "memu.stats": self._memu.handle_stats,
        }.get(method)

        if handler is None:
            return {"id": req_id, "error": f"Unknown method: {method}"}

        try:
            result = await handler(params)
            return {"id": req_id, "result": result}
        except Exception as exc:
            return {"id": req_id, "error": str(exc)}

    # ── Handlers ────────────────────────────────────────────────────

    async def _handle_broker_start(self, params: dict[str, Any]) -> dict[str, Any]:
        broker_type = params.get("brokerType", "memory")
        nats_url = params.get("natsUrl", "nats://127.0.0.1:4222")
        require_links = params.get("requireLinks", False)

        config = BrokerConfig(
            broker_type=AxtrizenBrokerType(broker_type),
            nats_url=nats_url,
            require_links=require_links,
        )
        self._broker = AxtrizenMapleBroker.create(config)

        # Auto-initialize memU in the background — non-fatal if it fails
        try:
            await self._memu.handle_init({})
            logger.info("memU auto-initialized on broker start")
        except Exception as exc:
            logger.warning("memU auto-init skipped: %s", exc)

        return {"status": "ok", "brokerType": broker_type}

    async def _handle_broker_shutdown(self, _params: dict[str, Any]) -> dict[str, Any]:
        if self._broker:
            # Disconnect all agents first
            for agent in list(self._agents.values()):
                agent.disconnect()
            self._agents.clear()
            self._broker.shutdown()
            self._broker = None
        self._running = False
        return {"status": "ok"}

    async def _handle_agent_connect(self, params: dict[str, Any]) -> dict[str, Any]:
        self._ensure_broker()
        agent_id = params["agentId"]
        team_id = params.get("teamId", "default")
        role = params.get("role", "developer")

        agent = AxtrizenMapleAgent(
            agent_id=agent_id,
            broker=self._broker,
            role=role,
            team_id=team_id,
        )

        # Register event forwarding — pipe incoming P2P messages to stdout
        for msg_type in MessageType:
            agent.on(msg_type, self._make_event_forwarder(agent_id, msg_type))

        # AxtrizenMapleAgent.connect() is now sync (delegates to Maple Agent.start())
        agent.connect()
        await agent.start_heartbeat()
        self._agents[agent_id] = agent
        return {"status": "connected", "agentId": agent_id}

    async def _handle_agent_disconnect(self, params: dict[str, Any]) -> dict[str, Any]:
        agent_id = params["agentId"]
        agent = self._agents.pop(agent_id, None)
        if agent:
            agent.disconnect()
        return {"status": "disconnected", "agentId": agent_id}

    async def _handle_agent_publish(self, params: dict[str, Any]) -> dict[str, Any]:
        agent_id = params["agentId"]
        agent = self._get_agent(agent_id)
        msg_type = MessageType(params["type"])
        payload = params.get("payload", {})
        receiver_id = params.get("receiverId")
        channel = params.get("channel", "tasks")

        msg = agent.publish(msg_type, payload, receiver_id=receiver_id, channel=channel)
        return {"status": "published", "messageId": msg["id"]}

    async def _handle_agent_claim_task(self, params: dict[str, Any]) -> dict[str, Any]:
        agent_id = params["agentId"]
        task_id = params["taskId"]
        manager_id = params["managerId"]
        agent = self._get_agent(agent_id)
        msg = agent.claim_task(task_id, manager_id)
        return {"status": "claimed", "messageId": msg["id"]}

    async def _handle_lim_initiate(self, params: dict[str, Any]) -> dict[str, Any]:
        agent_id = params["agentId"]
        reviewer_id = params["reviewerId"]
        agent = self._get_agent(agent_id)
        link_id = agent.initiate_review_link(reviewer_id)
        return {"status": "link_established", "linkId": link_id}

    async def _handle_lim_review_request(self, params: dict[str, Any]) -> dict[str, Any]:
        agent_id = params["agentId"]
        reviewer_id = params["reviewerId"]
        link_id = params["linkId"]
        payload = params["payload"]
        agent = self._get_agent(agent_id)
        msg = agent.send_review_request(reviewer_id, link_id, payload)
        return {"status": "review_requested", "messageId": msg["id"]}

    async def _handle_lim_review_result(self, params: dict[str, Any]) -> dict[str, Any]:
        agent_id = params["agentId"]
        dev_id = params["devId"]
        link_id = params["linkId"]
        payload = params["payload"]
        agent = self._get_agent(agent_id)
        msg = agent.send_review_result(dev_id, link_id, payload)
        return {"status": "review_sent", "messageId": msg["id"]}

    async def _handle_lim_terminate(self, params: dict[str, Any]) -> dict[str, Any]:
        agent_id = params["agentId"]
        link_id = params["linkId"]
        agent = self._get_agent(agent_id)
        agent._lim.terminate_link(link_id)
        return {"status": "link_terminated", "linkId": link_id}

    async def _handle_status(self, _params: dict[str, Any]) -> dict[str, Any]:
        result = {
            "brokerActive": self._broker is not None,
            "brokerType": self._broker.config.broker_type.value if self._broker else None,
            "connectedAgents": list(self._broker.connected_agent_ids) if self._broker else [],
            "agentCount": len(self._agents),
        }
        if self._pool:
            result["pool"] = self._pool.status()
        return result

    # ── Worker Pool Handlers ────────────────────────────────────────

    async def _handle_pool_spawn(self, params: dict[str, Any]) -> dict[str, Any]:
        """Spawn workers for a list of agents.

        params: {agents: [{id, name, role}], teamId: str, gatewayUrl?: str}
        """
        self._ensure_broker()
        agents = params["agents"]
        team_id = params["teamId"]
        gateway_url = params.get("gatewayUrl", "ws://127.0.0.1:18789")

        if not self._pool:
            self._pool = AgentPoolManager(self._broker)

        count = await self._pool.spawn_workers(agents, team_id, gateway_url)
        return {
            "status": "ok",
            "workersSpawned": count,
            "strategy": self._pool.strategy,
            "totalWorkers": self._pool.worker_count,
        }

    async def _handle_pool_shutdown(self, _params: dict[str, Any]) -> dict[str, Any]:
        """Shutdown all workers in the pool."""
        if self._pool:
            await self._pool.shutdown()
            self._pool = None
        return {"status": "ok"}

    async def _handle_pool_status(self, _params: dict[str, Any]) -> dict[str, Any]:
        """Get pool status."""
        if not self._pool:
            return {"status": "no_pool", "totalWorkers": 0}
        return self._pool.status()

    async def _handle_pool_resolve_task(self, params: dict[str, Any]) -> dict[str, Any]:
        """Resolve a pending task result for a GatewayBackedWorker.

        params: {agentId, taskId, result: {...}}
        """
        if not self._pool:
            return {"status": "error", "message": "No pool active"}
        agent_id = params["agentId"]
        task_id = params["taskId"]
        result = params["result"]
        resolved = self._pool.resolve_task(agent_id, task_id, result)
        return {"status": "resolved" if resolved else "not_found"}

    # ── Helpers ─────────────────────────────────────────────────────

    def _ensure_broker(self) -> None:
        if self._broker is None:
            raise RuntimeError("Broker not started — call broker.start first")

    def _get_agent(self, agent_id: str) -> AxtrizenMapleAgent:
        agent = self._agents.get(agent_id)
        if agent is None:
            raise KeyError(f"Agent {agent_id} is not connected")
        return agent

    def _make_event_forwarder(
        self, agent_id: str, msg_type: MessageType
    ) -> Any:
        """Create an async handler that pipes P2P events to stdout as JSON-RPC notifications."""
        async def _forward(message: dict[str, Any]) -> None:
            self._write({
                "jsonrpc": "2.0",
                "method": "event",
                "params": {
                    "agentId": agent_id,
                    "type": msg_type.value,
                    "message": message,
                },
            })
        return _forward

    @staticmethod
    def _write(data: dict[str, Any]) -> None:
        sys.stdout.write(json.dumps(data) + "\n")
        sys.stdout.flush()


# ── Entry-point ─────────────────────────────────────────────────────

def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        stream=sys.stderr,  # Logs to stderr so stdout stays clean for JSON-RPC
    )
    bridge = MapleBridge()
    asyncio.run(bridge.run())


if __name__ == "__main__":
    main()
