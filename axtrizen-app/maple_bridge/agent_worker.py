"""
AgentWorker — Long-lived autonomous worker process for a Maple agent.

Each worker wraps an AxtrizenMapleAgent and:
  1. Connects to the Maple broker
  2. Subscribes to team topics (tasks, reviews, phase sync)
  3. Reacts autonomously to incoming messages
  4. Sends heartbeats periodically
  5. Claims and completes tasks from the TaskQueue

The worker communicates with the Gateway LLM for reasoning when needed,
but is otherwise fully autonomous — the orchestrator publishes AVAILABLE_TASK
events and the worker claims and executes them independently.

Usage (standalone):
    python -m maple_bridge.agent_worker --agent-id dev-1 --team-id team-abc

Usage (from AgentPoolManager):
    pool.spawn_worker("dev-1", "team-abc", role="developer")
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Optional

# Ensure vendored Maple is on path
_BRIDGE_DIR = os.path.dirname(os.path.abspath(__file__))
_APP_DIR = os.path.dirname(_BRIDGE_DIR)
_VENDOR_MAPLE = os.path.join(_APP_DIR, "vendor", "maple-oss")
if _VENDOR_MAPLE not in sys.path:
    sys.path.insert(0, _VENDOR_MAPLE)

from maple_bridge.broker_config import AxtrizenMapleBroker, BrokerConfig
from maple_bridge.axtrizen_agent import AxtrizenMapleAgent, AgentCapabilities
from maple_bridge.message_types import (
    MessageType,
    status_update_payload,
    task_completed_payload,
)

logger = logging.getLogger("maple_bridge.worker")


@dataclass
class WorkerConfig:
    """Configuration for an agent worker process."""

    agent_id: str
    team_id: str
    role: str = "developer"
    name: str = ""
    heartbeat_interval_sec: float = 30.0
    task_timeout_sec: float = 300.0  # 5 min per task max
    max_retries: int = 2
    capabilities: list[str] = field(
        default_factory=lambda: ["python", "typescript", "rust", "developer"]
    )


class AgentWorker:
    """Autonomous agent worker that subscribes to Maple and reacts to events.

    Lifecycle:
        worker = AgentWorker(config, broker)
        await worker.start()    # connects + begins event loop
        ...                     # worker handles tasks autonomously
        await worker.stop()     # disconnects + cleans up
    """

    def __init__(self, config: WorkerConfig, broker: AxtrizenMapleBroker):
        self._config = config
        self._broker = broker
        self._running = False
        self._current_task: Optional[dict[str, Any]] = None
        self._completed_tasks: list[str] = []
        self._task_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._shutdown_event = asyncio.Event()

        # Create the Maple agent
        self._agent = AxtrizenMapleAgent(
            agent_id=config.agent_id,
            broker=broker,
            role=config.role,
            team_id=config.team_id,
            capabilities=AgentCapabilities(
                languages=[c for c in config.capabilities if c not in ("developer", "reviewer", "manager")],
                roles=[c for c in config.capabilities if c in ("developer", "reviewer", "manager")],
                max_concurrent_tasks=1,
            ),
        )

    @property
    def agent_id(self) -> str:
        return self._config.agent_id

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def current_task(self) -> Optional[dict[str, Any]]:
        return self._current_task

    @property
    def completed_count(self) -> int:
        return len(self._completed_tasks)

    @property
    def status(self) -> dict[str, Any]:
        return {
            "agentId": self._config.agent_id,
            "teamId": self._config.team_id,
            "role": self._config.role,
            "running": self._running,
            "currentTask": self._current_task.get("taskId") if self._current_task else None,
            "completedTasks": len(self._completed_tasks),
            "queuedTasks": self._task_queue.qsize(),
        }

    # ── Lifecycle ────────────────────────────────────────────────────

    async def start(self) -> None:
        """Connect to Maple broker and begin autonomous event loop."""
        logger.info(
            "Starting worker %s (role=%s, team=%s)",
            self._config.agent_id, self._config.role, self._config.team_id,
        )

        # Connect the Maple agent (subscribes to topics, registers handlers)
        self._agent.connect()
        self._running = True

        # Register message handlers for autonomous operation
        self._agent.on(MessageType.AVAILABLE_TASK, self._handle_available_task)
        self._agent.on(MessageType.TASK_ASSIGNMENT, self._handle_task_assignment)
        self._agent.on(MessageType.PHASE_SYNC, self._handle_phase_sync)
        self._agent.on(MessageType.CODE_REVIEW_REQUEST, self._handle_review_request)
        self._agent.on(MessageType.STATUS_UPDATE, self._handle_status_update)

        # Start heartbeat
        await self._agent.start_heartbeat(self._config.heartbeat_interval_sec)

        # Start the task processing loop
        asyncio.create_task(self._task_loop())

        logger.info("Worker %s started successfully", self._config.agent_id)

    async def stop(self) -> None:
        """Gracefully stop the worker."""
        logger.info("Stopping worker %s", self._config.agent_id)
        self._running = False
        self._shutdown_event.set()

        # Complete current task if any
        if self._current_task:
            logger.warning(
                "Worker %s stopping with active task %s",
                self._config.agent_id,
                self._current_task.get("taskId"),
            )

        self._agent.disconnect()
        logger.info("Worker %s stopped", self._config.agent_id)

    async def wait_for_shutdown(self) -> None:
        """Block until stop() is called."""
        await self._shutdown_event.wait()

    # ── Message Handlers ─────────────────────────────────────────────

    async def _handle_available_task(self, message: dict[str, Any]) -> None:
        """Handle AVAILABLE_TASK — decide whether to claim it."""
        payload = message.get("payload", message)
        task_id = payload.get("taskId", "")
        title = payload.get("title", "")

        # Don't claim if we're already busy
        if self._current_task:
            logger.debug(
                "Worker %s skipping task %s (busy with %s)",
                self._config.agent_id, task_id,
                self._current_task.get("taskId"),
            )
            return

        # Check if this task matches our capabilities
        requirements = payload.get("requirements", [])
        our_caps = set(self._config.capabilities)
        if requirements and not our_caps.intersection(set(requirements)):
            logger.debug(
                "Worker %s skipping task %s (no matching capabilities)",
                self._config.agent_id, task_id,
            )
            return

        logger.info("Worker %s claiming task %s: %s", self._config.agent_id, task_id, title)

        # Claim the task via Maple
        manager_id = payload.get("managerId", "")
        if manager_id:
            self._agent.claim_task(task_id, manager_id)

        # Queue it for processing
        await self._task_queue.put(payload)

    async def _handle_task_assignment(self, message: dict[str, Any]) -> None:
        """Handle TASK_ASSIGNMENT — manager assigned us a specific task."""
        payload = message.get("payload", message)
        assigned_to = payload.get("assignedTo", payload.get("agentId", ""))

        # Only accept if assigned to us
        if assigned_to and assigned_to != self._config.agent_id:
            return

        task_id = payload.get("taskId", "")
        logger.info("Worker %s received task assignment: %s", self._config.agent_id, task_id)

        await self._task_queue.put(payload)

    async def _handle_phase_sync(self, message: dict[str, Any]) -> None:
        """Handle PHASE_SYNC — phase transition notification."""
        payload = message.get("payload", message)
        phase = payload.get("phase", "")
        action = payload.get("action", "")
        logger.info(
            "Worker %s: phase sync — %s %s",
            self._config.agent_id, phase, action,
        )

        # If phase completed and we have no tasks, go idle
        if action == "complete" and not self._current_task:
            self._agent.set_current_task(None)

    async def _handle_review_request(self, message: dict[str, Any]) -> None:
        """Handle CODE_REVIEW_REQUEST — someone wants us to review their work."""
        payload = message.get("payload", message)
        reviewee_id = payload.get("revieweeId", "")
        task_id = payload.get("taskId", "")

        # Only handle if we're the designated reviewer
        reviewer_id = payload.get("reviewerId", "")
        if reviewer_id and reviewer_id != self._config.agent_id:
            return

        logger.info(
            "Worker %s: review request for %s's task %s",
            self._config.agent_id, reviewee_id, task_id,
        )

        # Queue review as a task
        review_task = {
            "taskId": f"review-{task_id}",
            "title": f"Review {reviewee_id}'s work on {task_id}",
            "type": "review",
            "reviewPayload": payload,
        }
        await self._task_queue.put(review_task)

    async def _handle_status_update(self, message: dict[str, Any]) -> None:
        """Handle STATUS_UPDATE — other agents reporting progress."""
        # Just log it — useful for awareness but no action needed
        payload = message.get("payload", message)
        agent_id = payload.get("agentId", "")
        status = payload.get("status", "")
        if agent_id != self._config.agent_id:
            logger.debug("Worker %s: peer %s is %s", self._config.agent_id, agent_id, status)

    # ── Task Processing Loop ─────────────────────────────────────────

    async def _task_loop(self) -> None:
        """Main autonomous task processing loop.

        Pulls tasks from the internal queue and processes them one at a time.
        Reports status and completion via Maple broadcasts.
        """
        while self._running:
            try:
                # Wait for a task (with timeout so we can check _running)
                try:
                    task = await asyncio.wait_for(
                        self._task_queue.get(), timeout=5.0
                    )
                except asyncio.TimeoutError:
                    continue

                task_id = task.get("taskId", "unknown")
                self._current_task = task
                self._agent.set_current_task(task_id)

                # Broadcast that we're working on it
                self._agent.publish(
                    MessageType.STATUS_UPDATE,
                    status_update_payload(
                        task_id=task_id,
                        agent_id=self._config.agent_id,
                        status="in_progress",
                        percent_complete=0,
                    ),
                )

                logger.info("Worker %s processing task: %s", self._config.agent_id, task_id)

                # Process the task
                try:
                    result = await self._process_task(task)

                    # Broadcast completion
                    self._agent.publish(
                        MessageType.TASK_COMPLETED,
                        task_completed_payload(
                            task_id=task_id,
                            files_created=result.get("filesCreated", []),
                            summary=result.get("summary", "Task completed"),
                        ),
                    )
                    self._completed_tasks.append(task_id)
                    logger.info("Worker %s completed task: %s", self._config.agent_id, task_id)

                except Exception as e:
                    logger.error(
                        "Worker %s failed task %s: %s",
                        self._config.agent_id, task_id, e,
                    )
                    # Report failure
                    self._agent.publish(
                        MessageType.STATUS_UPDATE,
                        status_update_payload(
                            task_id=task_id,
                            agent_id=self._config.agent_id,
                            status="failed",
                            percent_complete=0,
                            blockers=[str(e)],
                        ),
                    )

                finally:
                    self._current_task = None
                    self._agent.set_current_task(None)

            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Unexpected error in worker %s task loop", self._config.agent_id)
                await asyncio.sleep(1)

    async def _process_task(self, task: dict[str, Any]) -> dict[str, Any]:
        """Process a single task.

        In the current Gateway-backed architecture, this would call the
        Gateway LLM API. For now, we structure the interface so the
        orchestrator can plug in the actual execution strategy.

        Override this method in subclasses for custom task execution.
        """
        task_type = task.get("type", "development")
        title = task.get("title", "")
        description = task.get("description", "")

        logger.info(
            "Worker %s executing %s task: %s",
            self._config.agent_id, task_type, title,
        )

        # Progress updates
        self._agent.publish(
            MessageType.STATUS_UPDATE,
            status_update_payload(
                task_id=task.get("taskId", ""),
                agent_id=self._config.agent_id,
                status="in_progress",
                percent_complete=50,
            ),
        )

        # The actual work happens here — in the current architecture,
        # this is where we'd call Gateway LLM. For now, we return a
        # structured result that the orchestrator can use.
        return {
            "taskId": task.get("taskId", ""),
            "agentId": self._config.agent_id,
            "title": title,
            "summary": f"Completed: {title}",
            "filesCreated": [],
            "output": f"Worker {self._config.agent_id} processed task: {title}\n{description}",
        }


class GatewayBackedWorker(AgentWorker):
    """Agent worker that delegates actual reasoning to the Gateway LLM.

    This is the production worker — it connects to both Maple (for P2P events)
    and Gateway (for LLM reasoning). The Maple layer handles task distribution
    while Gateway provides the actual LLM intelligence.
    """

    def __init__(
        self,
        config: WorkerConfig,
        broker: AxtrizenMapleBroker,
        gateway_url: str = "ws://127.0.0.1:18789",
    ):
        super().__init__(config, broker)
        self._gateway_url = gateway_url
        # Gateway integration point — the Rust side handles the actual
        # WebSocket connection. The worker signals task readiness and
        # the orchestrator routes the LLM call.
        self._pending_results: dict[str, asyncio.Future[dict[str, Any]]] = {}

    async def _process_task(self, task: dict[str, Any]) -> dict[str, Any]:
        """Process task using Gateway LLM for reasoning.

        The worker publishes a TASK_CLAIM + STATUS_UPDATE, then waits
        for the orchestrator to route the LLM call through Gateway.
        The result is published back as TASK_COMPLETED.
        """
        task_id = task.get("taskId", "")

        # Create a future that the orchestrator will resolve
        future: asyncio.Future[dict[str, Any]] = asyncio.get_event_loop().create_future()
        self._pending_results[task_id] = future

        # Signal to orchestrator that we're ready for the LLM call
        self._agent.publish(
            MessageType.STATUS_UPDATE,
            status_update_payload(
                task_id=task_id,
                agent_id=self._config.agent_id,
                status="awaiting_llm",
                percent_complete=10,
            ),
        )

        # Wait for the orchestrator to provide the LLM result
        try:
            result = await asyncio.wait_for(
                future, timeout=self._config.task_timeout_sec,
            )
            return result
        except asyncio.TimeoutError:
            raise TimeoutError(
                f"Task {task_id} timed out after {self._config.task_timeout_sec}s"
            )
        finally:
            self._pending_results.pop(task_id, None)

    def resolve_task(self, task_id: str, result: dict[str, Any]) -> None:
        """Called by orchestrator when LLM result is ready.

        This bridges the Gateway response back to the worker's async loop.
        """
        future = self._pending_results.get(task_id)
        if future and not future.done():
            future.set_result(result)


# ── CLI entry-point ──────────────────────────────────────────────────

async def _run_standalone(agent_id: str, team_id: str, role: str) -> None:
    """Run a single worker as a standalone process."""
    broker = AxtrizenMapleBroker.create()
    config = WorkerConfig(agent_id=agent_id, team_id=team_id, role=role)
    worker = AgentWorker(config, broker)

    await worker.start()
    logger.info("Worker %s running autonomously. Press Ctrl+C to stop.", agent_id)

    try:
        await worker.wait_for_shutdown()
    except KeyboardInterrupt:
        pass
    finally:
        await worker.stop()
        broker.shutdown()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run an autonomous agent worker")
    parser.add_argument("--agent-id", required=True, help="Agent ID")
    parser.add_argument("--team-id", required=True, help="Team ID")
    parser.add_argument("--role", default="developer", help="Agent role")
    parser.add_argument("--log-level", default="INFO", help="Log level")
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    asyncio.run(_run_standalone(args.agent_id, args.team_id, args.role))
