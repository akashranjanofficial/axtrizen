"""
Axtrizen Maple Bridge — P2P Agent Communication Layer

Sits between the Rust/Tauri orchestrator and the Maple OSS library
(https://github.com/maheshvaikri-code/maple-oss), giving Python agents
peer-to-peer messaging, task negotiation, and secure code-review
channels without routing every message through the Gateway WebSocket.

The vendored Maple OSS package lives at:
    axtrizen-app/vendor/maple-oss/maple/

Maple features actively used:
  - Agent lifecycle (start/stop, register_handler, send, publish, subscribe)
  - MessageBroker (in-memory singleton, topic subscriptions)
  - Message class (type-safe envelopes with priority, payload, metadata)
  - LIM — LinkManager for secure agent-to-agent review channels
  - AgentRegistry for capability-based agent discovery
  - Result[T,E] for Rust-style error handling
  - TaskQueue for priority-based task management

Usage:
    from maple_bridge import AxtrizenMapleBroker, AxtrizenMapleAgent, MessageType

    broker = AxtrizenMapleBroker.create()
    agent  = AxtrizenMapleAgent(agent_id="dev-1", broker=broker, role="developer")
    agent.connect()
"""

import os
import sys

# ── Ensure vendored Maple is importable ─────────────────────────────
_BRIDGE_DIR = os.path.dirname(os.path.abspath(__file__))
_APP_DIR = os.path.dirname(_BRIDGE_DIR)
_VENDOR_MAPLE = os.path.join(_APP_DIR, "vendor", "maple-oss")
if _VENDOR_MAPLE not in sys.path:
    sys.path.insert(0, _VENDOR_MAPLE)

from maple_bridge.broker_config import AxtrizenMapleBroker, BrokerConfig
from maple_bridge.axtrizen_agent import AxtrizenMapleAgent
from maple_bridge.message_types import MessageType, create_message, create_maple_message
from maple_bridge.lim_manager import LIMManager
from maple_bridge.bridge import MapleBridge
from maple_bridge.memu_handler import MemUHandler

__all__ = [
    "AxtrizenMapleBroker",
    "AxtrizenMapleAgent",
    "BrokerConfig",
    "MessageType",
    "create_message",
    "create_maple_message",
    "LIMManager",
    "MapleBridge",
    "MemUHandler",
]
