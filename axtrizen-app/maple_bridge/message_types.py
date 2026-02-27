"""
Maple OSS Message Types for Axtrizen inter-agent communication.

These are the standard envelope types that agents publish/subscribe
to on team topics.  Each message can be created as a raw dict envelope
or as a real Maple ``Message`` object for broker transport.

Maple API used:
  - Message(message_type, sender?, receiver?, priority?, payload?, metadata?)
  - Priority.HIGH / MEDIUM / LOW
"""

from __future__ import annotations

import time
import uuid
from enum import Enum
from typing import Any, Optional

from maple import Message, Priority


class MessageType(str, Enum):
    """Message types used across the Maple broker for intra-agent P2P comms."""

    # ── Task lifecycle ──────────────────────────────────────────────
    AVAILABLE_TASK = "AVAILABLE_TASK"
    TASK_CLAIM = "TASK_CLAIM"
    TASK_ASSIGNMENT = "TASK_ASSIGNMENT"
    STATUS_UPDATE = "STATUS_UPDATE"
    TASK_COMPLETED = "TASK_COMPLETED"

    # ── Code review (over LIM) ──────────────────────────────────────
    CODE_REVIEW_REQUEST = "CODE_REVIEW_REQUEST"
    CODE_REVIEW_RESULT = "CODE_REVIEW_RESULT"

    # ── Phase coordination ──────────────────────────────────────────
    PHASE_SYNC = "PHASE_SYNC"

    # ── Resource negotiation ────────────────────────────────────────
    RESOURCE_REQUEST = "RESOURCE_REQUEST"
    RESOURCE_GRANT = "RESOURCE_GRANT"


# Map integer priority (1-5) to Maple Priority
_PRIORITY_MAP = {
    1: Priority.HIGH,
    2: Priority.HIGH,
    3: Priority.MEDIUM,
    4: Priority.LOW,
    5: Priority.LOW,
}


def create_maple_message(
    msg_type: MessageType,
    sender_id: str,
    payload: dict[str, Any],
    *,
    receiver_id: Optional[str] = None,
    priority: int = 3,
    link_id: Optional[str] = None,
) -> Message:
    """Build a real Maple ``Message`` object for broker transport.

    This is the primary factory — uses the actual Maple Message class.
    """
    maple_priority = _PRIORITY_MAP.get(priority, Priority.MEDIUM)
    msg = Message(
        message_type=msg_type.value,
        sender=sender_id,
        receiver=receiver_id,
        priority=maple_priority,
        payload=payload,
    )
    if link_id:
        msg = msg.with_link(link_id)
    return msg


def create_message(
    msg_type: MessageType,
    sender_id: str,
    payload: dict[str, Any],
    *,
    receiver_id: Optional[str] = None,
    team_topic: Optional[str] = None,
    priority: int = 3,
) -> dict[str, Any]:
    """Build a dict-based message envelope (for JSON-RPC serialisation).

    Kept for backward compatibility with the bridge JSON-RPC protocol.
    """
    return {
        "id": str(uuid.uuid4()),
        "type": msg_type.value,
        "sender": sender_id,
        "receiver": receiver_id,
        "topic": team_topic,
        "priority": priority,
        "payload": payload,
        "timestamp": time.time(),
    }


# ── Pre-built payload helpers ───────────────────────────────────────


def available_task_payload(
    task_id: str,
    title: str,
    requirements: list[str],
    priority: int = 3,
    estimated_minutes: int = 30,
) -> dict[str, Any]:
    return {
        "taskId": task_id,
        "title": title,
        "requirements": requirements,
        "priority": priority,
        "estimatedMinutes": estimated_minutes,
    }


def task_claim_payload(
    task_id: str,
    agent_id: str,
    capabilities: list[str],
    current_load: float,
) -> dict[str, Any]:
    return {
        "taskId": task_id,
        "agentId": agent_id,
        "capabilities": capabilities,
        "currentLoad": current_load,
    }


def task_assignment_payload(
    task_id: str,
    story_id: str,
    title: str,
    description: str,
    acceptance_criteria: list[str],
    dependencies: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "taskId": task_id,
        "storyId": story_id,
        "title": title,
        "description": description,
        "acceptanceCriteria": acceptance_criteria,
        "dependencies": dependencies or [],
    }


def status_update_payload(
    task_id: str,
    agent_id: str,
    status: str,
    percent_complete: int,
    blockers: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "taskId": task_id,
        "agentId": agent_id,
        "status": status,
        "percentComplete": percent_complete,
        "blockers": blockers or [],
    }


def code_review_request_payload(
    task_id: str,
    files: list[dict[str, str]],
    commit_message: str,
) -> dict[str, Any]:
    """files: list of { path, diff }"""
    return {
        "taskId": task_id,
        "files": files,
        "commitMessage": commit_message,
    }


def code_review_result_payload(
    task_id: str,
    verdict: str,
    comments: list[dict[str, Any]],
) -> dict[str, Any]:
    """verdict: \"APPROVED\" | \"CHANGES_REQUESTED\" """
    return {
        "taskId": task_id,
        "verdict": verdict,
        "comments": comments,
    }


def task_completed_payload(
    task_id: str,
    files_created: list[str],
    summary: str,
) -> dict[str, Any]:
    return {
        "taskId": task_id,
        "filesCreated": files_created,
        "summary": summary,
    }


def phase_sync_payload(
    phase: str,
    action: str,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """action: \"start\" | \"complete\" """
    return {
        "phase": phase,
        "action": action,
        "context": context or {},
    }
