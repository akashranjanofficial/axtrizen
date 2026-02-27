#!/usr/bin/env python3
"""
Integration test: Verify the Axtrizen Maple Bridge uses the REAL Maple OSS APIs.

Tests:
  1. Broker creation (MessageBroker, ProductionBrokerManager, Config)
  2. Agent lifecycle (Agent.start/stop, register_handler, subscribe)
  3. Message sending (Agent.send, Agent.publish with real Message objects)
  4. LIM links (LinkManager.initiate_link, establish_link, validate_link, terminate_link)
  5. AgentRegistry (register_agent, find_agents_by_capability)
  6. TaskQueue integration
  7. Two-agent communication (dev → reviewer code review flow)
"""

import asyncio
import time
import sys
import os

# Ensure vendored maple is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "vendor", "maple-oss"))

from maple_bridge import (
    AxtrizenMapleBroker,
    AxtrizenMapleAgent,
    BrokerConfig,
    MessageType,
    create_message,
    create_maple_message,
    LIMManager,
)
from maple_bridge.message_types import (
    available_task_payload,
    task_claim_payload,
    code_review_request_payload,
    code_review_result_payload,
    task_completed_payload,
    status_update_payload,
)
from maple import Message, Priority, Result
from maple.task_management import TaskQueue
from maple.task_management.task_queue import TaskPriority, TaskStatus
from maple.error.circuit_breaker import CircuitBreaker
from maple.error.recovery import retry, RetryOptions, exponential_backoff

passed = 0
failed = 0

def check(label, condition):
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✓ {label}")
    else:
        failed += 1
        print(f"  ✗ {label}")


# ═══════════════════════════════════════════════════════════════════
print("1. Broker Creation (real Maple APIs)")
# ═══════════════════════════════════════════════════════════════════
broker = AxtrizenMapleBroker.create(BrokerConfig(
    broker_type="memory",
    require_links=False,
))
check("Broker created", broker is not None)
check("Broker has real MessageBroker", type(broker.broker).__name__ == "MessageBroker")
check("Broker has AgentRegistry", type(broker.registry).__name__ == "AgentRegistry")
check("team_topic generates correct format", broker.team_topic("team1", "tasks") == "team:team1:tasks")


# ═══════════════════════════════════════════════════════════════════
print("\n2. Agent Lifecycle (real Maple Agent.start/stop)")
# ═══════════════════════════════════════════════════════════════════
dev_agent = AxtrizenMapleAgent(
    agent_id="dev-1",
    broker=broker,
    role="developer",
    team_id="team-alpha",
)
check("Agent created", dev_agent.agent_id == "dev-1")
check("Agent has real Maple Agent", type(dev_agent._maple_agent).__name__ == "Agent")

# Connect uses Maple Agent.start()
dev_agent.connect()
check("Agent connected", dev_agent._connected)
check("Agent registered in broker", "dev-1" in broker.connected_agent_ids)

# Check registry
agents = broker.registry.list_agents()
check("Agent in registry", any(a.agent_id == "dev-1" for a in agents))
check("Registry has capabilities", len(agents) > 0 and len(agents[0].capabilities) > 0)


# ═══════════════════════════════════════════════════════════════════
print("\n3. Message Creation (real Maple Message class)")
# ═══════════════════════════════════════════════════════════════════
# Dict envelope (for JSON-RPC)
dict_msg = create_message(
    MessageType.AVAILABLE_TASK, "dev-1",
    available_task_payload("task-1", "Build login page", ["react", "typescript"]),
)
check("Dict message has id", "id" in dict_msg)
check("Dict message has correct type", dict_msg["type"] == "AVAILABLE_TASK")
check("Dict message has sender", dict_msg["sender"] == "dev-1")

# Real Maple Message (for broker transport)
maple_msg = create_maple_message(
    MessageType.STATUS_UPDATE, "dev-1",
    status_update_payload("task-1", "dev-1", "in_progress", 50),
    priority=2,
)
check("Maple Message is real Message", type(maple_msg).__name__ == "Message")
check("Maple Message has correct type", maple_msg.message_type == "STATUS_UPDATE")
check("Maple Message has sender", str(maple_msg.sender) == "dev-1")
check("Maple Message has HIGH priority", maple_msg.priority == Priority.HIGH)
check("Maple Message has payload", maple_msg.payload is not None and "taskId" in maple_msg.payload)


# ═══════════════════════════════════════════════════════════════════
print("\n4. Agent Publishing (real Agent.publish/send)")
# ═══════════════════════════════════════════════════════════════════
# Publish to topic (broadcast)
envelope = dev_agent.publish(
    MessageType.STATUS_UPDATE,
    status_update_payload("task-1", "dev-1", "in_progress", 30),
    channel="tasks",
)
check("Publish returns envelope", "id" in envelope and "type" in envelope)
check("Publish envelope type matches", envelope["type"] == "STATUS_UPDATE")


# ═══════════════════════════════════════════════════════════════════
print("\n5. Two-Agent Communication")
# ═══════════════════════════════════════════════════════════════════
# Create a reviewer agent
from maple_bridge.axtrizen_agent import AgentCapabilities
reviewer_agent = AxtrizenMapleAgent(
    agent_id="reviewer-1",
    broker=broker,
    role="reviewer",
    team_id="team-alpha",
    capabilities=AgentCapabilities(
        languages=["python", "rust"],
        roles=["reviewer", "security"],
    ),
)
reviewer_agent.connect()
check("Reviewer agent connected", reviewer_agent._connected)
check("Two agents in broker", len(broker.connected_agent_ids) == 2)

# Direct message: dev → reviewer
envelope = dev_agent.publish(
    MessageType.CODE_REVIEW_REQUEST,
    code_review_request_payload("task-1", [{"path": "main.rs", "diff": "+fn main(){}"}], "Initial implementation"),
    receiver_id="reviewer-1",
    channel="reviews",
)
check("Direct message sent", envelope["type"] == "CODE_REVIEW_REQUEST")
check("Direct message has receiver", envelope["receiver"] == "reviewer-1")

# Reviewer responds
envelope = reviewer_agent.publish(
    MessageType.CODE_REVIEW_RESULT,
    code_review_result_payload("task-1", "APPROVED", [{"file": "main.rs", "comment": "LGTM"}]),
    receiver_id="dev-1",
    channel="reviews",
)
check("Review result sent", envelope["type"] == "CODE_REVIEW_RESULT")


# ═══════════════════════════════════════════════════════════════════
print("\n6. LIM — Link Identification Mechanism")
# ═══════════════════════════════════════════════════════════════════
link_id = dev_agent.initiate_review_link("reviewer-1")
check("LIM link created", link_id is not None and len(link_id) > 0)
check("LIM link starts with 'link_'", link_id.startswith("link_"))

# Validate
valid = dev_agent._lim.validate_link(link_id, "dev-1", "reviewer-1")
check("LIM link validates correctly", valid is True)

# Get active links
active = dev_agent._lim.get_active_links()
check("Active link exists", link_id in active)

# Get links for agent
agent_links = dev_agent._lim.get_links_for_agent("dev-1")
check("get_links_for_agent works", len(agent_links) > 0)

# Send review over LIM link
envelope = dev_agent.send_review_request(
    "reviewer-1", link_id,
    code_review_request_payload("task-2", [{"path": "lib.rs", "diff": "+pub mod maple;"}], "Add maple module"),
)
check("LIM review request sent", envelope["type"] == "CODE_REVIEW_REQUEST")

# Reviewer responds over LIM
envelope = reviewer_agent.send_review_result(
    "dev-1", link_id,
    code_review_result_payload("task-2", "APPROVED", []),
)
check("LIM review result sent", envelope["type"] == "CODE_REVIEW_RESULT")

# Terminate link
dev_agent._lim.terminate_link(link_id)
active_after = dev_agent._lim.get_active_links()
check("LIM link terminated", link_id not in active_after)


# ═══════════════════════════════════════════════════════════════════
print("\n7. AgentRegistry — Capability Discovery")
# ═══════════════════════════════════════════════════════════════════
python_agents = broker.find_agents_by_capability("python")
check("Find agents by 'python'", "dev-1" in python_agents and "reviewer-1" in python_agents)

rust_agents = broker.find_agents_by_capability("rust")
check("Find agents by 'rust'", "dev-1" in rust_agents and "reviewer-1" in rust_agents)

security_agents = broker.find_agents_by_capability("security")
check("Find agents by 'security'", "reviewer-1" in security_agents)
check("Dev agent NOT in 'security'", "dev-1" not in security_agents)


# ═══════════════════════════════════════════════════════════════════
print("\n8. TaskQueue Integration")
# ═══════════════════════════════════════════════════════════════════
tq = TaskQueue()
tq.start()

submit_result = tq.submit_task(
    "code_implementation",
    {"description": "Build login page", "story_id": "US-123"},
    priority=TaskPriority.HIGH,
    requirements=["react", "typescript"],
    timeout_seconds=600,
)
check("Task submitted", submit_result.is_ok())
task_id = submit_result.unwrap()
check("Task ID returned", len(task_id) > 0)

# Get task
task_result = tq.get_task(task_id)
check("Task retrievable", task_result.is_ok())
task = task_result.unwrap()
check("Task has correct type", task.task_type == "code_implementation")
check("Task has requirements", task.requirements == ["react", "typescript"])
check("Task status is QUEUED", task.status == TaskStatus.QUEUED)

# Get next task with capability matching
next_result = tq.get_next_task(agent_capabilities=["react", "typescript"])
check("get_next_task with matching caps", next_result.is_ok())

# Queue stats
stats = tq.get_queue_stats()
check("Queue stats available", stats.total_tasks >= 1)

tq.stop()


# ═══════════════════════════════════════════════════════════════════
print("\n9. CircuitBreaker & Retry (Error Handling)")
# ═══════════════════════════════════════════════════════════════════
cb = CircuitBreaker(failure_threshold=3, reset_timeout=5.0)
cb_result = cb.execute(lambda: Result.ok("healthy"))
check("CircuitBreaker executes ok", cb_result.is_ok() and cb_result.unwrap() == "healthy")
check("CircuitBreaker is closed", cb.is_closed())

# Retry with exponential backoff
retry_result = retry(
    lambda: Result.ok(42),
    RetryOptions(max_attempts=3, backoff=exponential_backoff(0.01, 2.0, 0.0)),
)
check("Retry succeeds", retry_result.is_ok() and retry_result.unwrap() == 42)


# ═══════════════════════════════════════════════════════════════════
print("\n10. Task Claim Protocol (Full Flow)")
# ═══════════════════════════════════════════════════════════════════
# Manager publishes available task
manager_envelope = dev_agent.publish(
    MessageType.AVAILABLE_TASK,
    available_task_payload("task-3", "Implement auth", ["python", "jwt"]),
    channel="tasks",
)
check("Available task published", manager_envelope["type"] == "AVAILABLE_TASK")

# Worker claims task
claim_envelope = reviewer_agent.claim_task("task-3", "dev-1")
check("Task claim sent", claim_envelope["type"] == "TASK_CLAIM")
check("Claim has task ID in payload", claim_envelope["payload"]["taskId"] == "task-3")

# Task completion
complete_envelope = reviewer_agent.publish(
    MessageType.TASK_COMPLETED,
    task_completed_payload("task-3", ["auth.py", "test_auth.py"], "Implemented JWT auth"),
)
check("Task completion published", complete_envelope["type"] == "TASK_COMPLETED")


# ═══════════════════════════════════════════════════════════════════
print("\n11. Cleanup")
# ═══════════════════════════════════════════════════════════════════
reviewer_agent.disconnect()
check("Reviewer disconnected", not reviewer_agent._connected)

dev_agent.disconnect()
check("Dev agent disconnected", not dev_agent._connected)

broker.shutdown()
check("Broker shut down", len(broker.connected_agent_ids) == 0)


# ═══════════════════════════════════════════════════════════════════
print(f"\n{'='*60}")
print(f"Results: {passed} passed, {failed} failed, {passed+failed} total")
print(f"{'='*60}")
if failed > 0:
    sys.exit(1)
else:
    print("ALL TESTS PASSED — Maple OSS properly leveraged!")
