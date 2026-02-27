"""
MessageAggregator — Aggregates high-volume agent messages into human-readable summaries.

When 100+ agents are posting status updates, the human doesn't want to see
every individual message. This module buffers messages by topic/channel and
produces periodic summaries.

Usage:
    agg = MessageAggregator(window_sec=30)
    agg.add("team:alpha:status", {"agentId": "dev-1", "status": "in_progress"})
    agg.add("team:alpha:status", {"agentId": "dev-2", "status": "completed"})
    summaries = agg.flush()
    # → {"team:alpha:status": "2 agents: 1 in progress, 1 completed"}
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

logger = logging.getLogger("maple_bridge.aggregator")


@dataclass
class AggregatorConfig:
    """Configuration for the message aggregator."""

    window_sec: float = 30.0          # Flush every N seconds
    individual_threshold: int = 5     # Show individual msgs below this count
    max_buffer_size: int = 1000       # Hard cap on buffered messages per topic
    auto_flush: bool = True           # Auto-flush on timer


class MessageAggregator:
    """Buffers and summarizes high-volume agent messages.

    Messages are grouped by topic. When flushed:
      - ≤5 messages: shown individually
      - >5 messages: summarized by status/type
    """

    def __init__(
        self,
        config: AggregatorConfig | None = None,
        on_flush: Optional[Callable[[dict[str, Any]], None]] = None,
    ):
        self._config = config or AggregatorConfig()
        self._buffer: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self._on_flush = on_flush
        self._flush_task: Optional[asyncio.Task] = None
        self._last_flush = time.time()

    async def start(self) -> None:
        """Start the auto-flush timer."""
        if self._config.auto_flush:
            self._flush_task = asyncio.create_task(self._auto_flush_loop())

    async def stop(self) -> None:
        """Stop the auto-flush timer and do a final flush."""
        if self._flush_task and not self._flush_task.done():
            self._flush_task.cancel()
        await self.flush()

    def add(self, topic: str, message: dict[str, Any]) -> None:
        """Add a message to the buffer for a topic."""
        buf = self._buffer[topic]
        if len(buf) < self._config.max_buffer_size:
            buf.append({
                "timestamp": time.time(),
                **message,
            })

    async def flush(self) -> dict[str, Any]:
        """Generate summaries for all buffered topics and clear the buffer.

        Returns a dict of topic → summary (either individual messages or summary string).
        """
        if not self._buffer:
            return {}

        results: dict[str, Any] = {}

        for topic, messages in self._buffer.items():
            if not messages:
                continue

            if len(messages) <= self._config.individual_threshold:
                # Show individual messages
                results[topic] = {
                    "type": "individual",
                    "count": len(messages),
                    "messages": messages,
                }
            else:
                # Summarize
                results[topic] = {
                    "type": "summary",
                    "count": len(messages),
                    "summary": self._summarize(topic, messages),
                    "breakdown": self._breakdown(messages),
                }

        self._buffer.clear()
        self._last_flush = time.time()

        # Callback for listeners
        if self._on_flush and results:
            try:
                self._on_flush(results)
            except Exception:
                logger.exception("Error in flush callback")

        return results

    def _summarize(self, topic: str, messages: list[dict[str, Any]]) -> str:
        """Generate a human-readable summary from a batch of messages."""
        count = len(messages)

        # Count by status
        statuses: dict[str, int] = defaultdict(int)
        agents: set[str] = set()

        for msg in messages:
            status = msg.get("status", msg.get("type", "unknown"))
            statuses[status] += 1
            agent_id = msg.get("agentId", msg.get("senderId", ""))
            if agent_id:
                agents.add(agent_id)

        # Build summary
        parts = [f"{count} messages from {len(agents)} agents"]
        status_parts = [f"{c} {s}" for s, c in sorted(statuses.items(), key=lambda x: -x[1])]
        if status_parts:
            parts.append(", ".join(status_parts))

        return " — ".join(parts)

    def _breakdown(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        """Generate a structured breakdown of messages."""
        by_agent: dict[str, list[str]] = defaultdict(list)
        by_status: dict[str, int] = defaultdict(int)

        for msg in messages:
            agent_id = msg.get("agentId", msg.get("senderId", "unknown"))
            status = msg.get("status", msg.get("type", "unknown"))
            by_agent[agent_id].append(status)
            by_status[status] += 1

        return {
            "byAgent": {
                agent_id: {
                    "messageCount": len(statuses),
                    "latestStatus": statuses[-1] if statuses else None,
                }
                for agent_id, statuses in by_agent.items()
            },
            "byStatus": dict(by_status),
            "uniqueAgents": len(by_agent),
        }

    async def _auto_flush_loop(self) -> None:
        """Periodically flush the buffer."""
        while True:
            try:
                await asyncio.sleep(self._config.window_sec)
                results = await self.flush()
                if results:
                    logger.debug("Auto-flushed %d topics", len(results))
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Error in auto-flush")

    @property
    def stats(self) -> dict[str, Any]:
        """Get aggregator stats."""
        return {
            "bufferedTopics": len(self._buffer),
            "totalBufferedMessages": sum(len(msgs) for msgs in self._buffer.values()),
            "lastFlushAge": time.time() - self._last_flush,
            "config": {
                "windowSec": self._config.window_sec,
                "individualThreshold": self._config.individual_threshold,
                "maxBufferSize": self._config.max_buffer_size,
            },
        }
