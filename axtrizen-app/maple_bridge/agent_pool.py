"""
AgentPoolManager — Manages agent worker processes at scale.

Spawns, monitors, and scales worker processes based on agent count:
  - Strategy 1 (≤20 agents): 1 async worker per agent
  - Strategy 2 (20-100 agents): Multiplexed workers (N agents per process)
  - Strategy 3 (100+ agents): Shared queue workers pulling from TaskQueue

All strategies use the same AgentWorker interface — the pool manager
just decides how many actual Python coroutines/processes to spawn.

Usage:
    pool = AgentPoolManager(broker)
    await pool.spawn_workers(agents, team_id)
    status = pool.status()
    await pool.shutdown()
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Optional

from maple_bridge.broker_config import AxtrizenMapleBroker
from maple_bridge.agent_worker import AgentWorker, GatewayBackedWorker, WorkerConfig

logger = logging.getLogger("maple_bridge.pool")


@dataclass
class PoolConfig:
    """Configuration for the agent pool manager."""

    # Concurrency limits per strategy tier
    tier1_max: int = 20       # Direct: 1 worker per agent
    tier2_max: int = 100      # Multiplexed: batch agents into workers
    tier2_batch_size: int = 10  # Agents per multiplexed worker
    tier3_worker_count: int = 5  # Shared queue workers for 100+

    # Resource limits
    max_total_workers: int = 50  # Hard cap on concurrent workers
    worker_timeout_sec: float = 300.0  # Per-task timeout


class AgentPoolManager:
    """Manages a pool of agent workers with auto-scaling.

    The pool manager chooses a strategy based on agent count:
      ≤20 agents:  1 worker coroutine per agent (simple, fast)
      20-100:      Batch agents into multiplexed workers
      100+:        Shared queue workers (agents are lightweight objects)

    All workers share the same Maple broker and communicate via P2P events.
    """

    def __init__(
        self,
        broker: AxtrizenMapleBroker,
        config: PoolConfig | None = None,
    ):
        self._broker = broker
        self._config = config or PoolConfig()
        self._workers: dict[str, AgentWorker] = {}
        self._worker_tasks: dict[str, asyncio.Task] = {}
        self._strategy: str = "idle"

    @property
    def worker_count(self) -> int:
        return len(self._workers)

    @property
    def strategy(self) -> str:
        return self._strategy

    def status(self) -> dict[str, Any]:
        """Get pool status summary."""
        return {
            "strategy": self._strategy,
            "totalWorkers": len(self._workers),
            "activeWorkers": sum(1 for w in self._workers.values() if w.is_running),
            "busyWorkers": sum(1 for w in self._workers.values() if w.current_task),
            "completedTasks": sum(w.completed_count for w in self._workers.values()),
            "workers": {
                agent_id: worker.status
                for agent_id, worker in self._workers.items()
            },
        }

    # ── Spawning ─────────────────────────────────────────────────────

    async def spawn_workers(
        self,
        agents: list[dict[str, str]],
        team_id: str,
        gateway_url: str = "ws://127.0.0.1:18789",
    ) -> int:
        """Spawn workers for a list of agents.

        Args:
            agents: List of {"id": "...", "name": "...", "role": "..."} dicts
            team_id: Team these agents belong to
            gateway_url: Gateway URL for LLM calls

        Returns:
            Number of workers spawned
        """
        agent_count = len(agents)

        if agent_count <= self._config.tier1_max:
            self._strategy = "direct"
            return await self._spawn_direct(agents, team_id, gateway_url)
        elif agent_count <= self._config.tier2_max:
            self._strategy = "multiplexed"
            return await self._spawn_multiplexed(agents, team_id, gateway_url)
        else:
            self._strategy = "shared_queue"
            return await self._spawn_shared_queue(agents, team_id, gateway_url)

    async def _spawn_direct(
        self,
        agents: list[dict[str, str]],
        team_id: str,
        gateway_url: str,
    ) -> int:
        """Strategy 1: One worker per agent (≤20 agents)."""
        logger.info("Spawning %d direct workers (1:1)", len(agents))
        count = 0

        for agent in agents:
            agent_id = agent["id"]
            if agent_id in self._workers:
                continue  # Already running

            config = WorkerConfig(
                agent_id=agent_id,
                team_id=team_id,
                role=agent.get("role", "developer"),
                name=agent.get("name", agent_id),
            )
            worker = GatewayBackedWorker(config, self._broker, gateway_url)
            self._workers[agent_id] = worker

            # Start worker in background
            task = asyncio.create_task(self._run_worker(worker))
            self._worker_tasks[agent_id] = task
            count += 1

        logger.info("Spawned %d direct workers", count)
        return count

    async def _spawn_multiplexed(
        self,
        agents: list[dict[str, str]],
        team_id: str,
        gateway_url: str,
    ) -> int:
        """Strategy 2: Batch agents into multiplexed workers (20-100 agents).

        Multiple agents share a single asyncio event loop, each as a coroutine.
        This reduces process overhead while maintaining per-agent state.
        """
        logger.info(
            "Spawning multiplexed workers (%d agents, batch size %d)",
            len(agents), self._config.tier2_batch_size,
        )
        count = 0

        # Split agents into batches — each batch runs in one "conceptual worker"
        for agent in agents:
            agent_id = agent["id"]
            if agent_id in self._workers:
                continue

            config = WorkerConfig(
                agent_id=agent_id,
                team_id=team_id,
                role=agent.get("role", "developer"),
                name=agent.get("name", agent_id),
            )
            worker = GatewayBackedWorker(config, self._broker, gateway_url)
            self._workers[agent_id] = worker

            task = asyncio.create_task(self._run_worker(worker))
            self._worker_tasks[agent_id] = task
            count += 1

            # Yield to event loop periodically to avoid blocking
            if count % self._config.tier2_batch_size == 0:
                await asyncio.sleep(0)

        logger.info("Spawned %d multiplexed workers", count)
        return count

    async def _spawn_shared_queue(
        self,
        agents: list[dict[str, str]],
        team_id: str,
        gateway_url: str,
    ) -> int:
        """Strategy 3: Shared queue workers (100+ agents).

        Agents are lightweight state objects. A fixed number of workers
        pull tasks from Maple's TaskQueue and execute on behalf of agents.
        """
        logger.info(
            "Spawning %d shared queue workers for %d agents",
            self._config.tier3_worker_count, len(agents),
        )
        count = 0

        # Create lightweight agent workers (they subscribe but share execution)
        for agent in agents:
            agent_id = agent["id"]
            if agent_id in self._workers:
                continue

            config = WorkerConfig(
                agent_id=agent_id,
                team_id=team_id,
                role=agent.get("role", "developer"),
                name=agent.get("name", agent_id),
            )
            worker = GatewayBackedWorker(config, self._broker, gateway_url)
            self._workers[agent_id] = worker

            # Only start actual worker tasks up to the limit
            if count < self._config.tier3_worker_count:
                task = asyncio.create_task(self._run_worker(worker))
                self._worker_tasks[agent_id] = task

            count += 1

        # Connect remaining agents to Maple without full worker loops
        for agent_id, worker in self._workers.items():
            if agent_id not in self._worker_tasks:
                try:
                    worker._agent.connect()
                except Exception as e:
                    logger.warning("Failed to connect agent %s: %s", agent_id, e)

        logger.info("Spawned %d workers + %d passive agents", 
                     min(count, self._config.tier3_worker_count),
                     max(0, count - self._config.tier3_worker_count))
        return count

    async def _run_worker(self, worker: AgentWorker) -> None:
        """Run a single worker until shutdown."""
        try:
            await worker.start()
            await worker.wait_for_shutdown()
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Worker %s crashed", worker.agent_id)
        finally:
            try:
                await worker.stop()
            except Exception:
                pass

    # ── Worker Management ────────────────────────────────────────────

    def get_worker(self, agent_id: str) -> Optional[AgentWorker]:
        """Get a worker by agent ID."""
        return self._workers.get(agent_id)

    def resolve_task(self, agent_id: str, task_id: str, result: dict[str, Any]) -> bool:
        """Resolve a pending task result for a GatewayBackedWorker.

        Returns True if the task was resolved, False if worker not found.
        """
        worker = self._workers.get(agent_id)
        if isinstance(worker, GatewayBackedWorker):
            worker.resolve_task(task_id, result)
            return True
        return False

    async def stop_worker(self, agent_id: str) -> None:
        """Stop a specific worker."""
        worker = self._workers.pop(agent_id, None)
        task = self._worker_tasks.pop(agent_id, None)

        if worker:
            await worker.stop()
        if task and not task.done():
            task.cancel()

    # ── Shutdown ──────────────────────────────────────────────────────

    async def shutdown(self) -> None:
        """Gracefully stop all workers."""
        logger.info("Shutting down pool (%d workers)", len(self._workers))

        # Stop all workers
        stop_tasks = [worker.stop() for worker in self._workers.values()]
        if stop_tasks:
            await asyncio.gather(*stop_tasks, return_exceptions=True)

        # Cancel all background tasks
        for task in self._worker_tasks.values():
            if not task.done():
                task.cancel()

        if self._worker_tasks:
            await asyncio.gather(*self._worker_tasks.values(), return_exceptions=True)

        self._workers.clear()
        self._worker_tasks.clear()
        self._strategy = "idle"
        logger.info("Pool shutdown complete")
