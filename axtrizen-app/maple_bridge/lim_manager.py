"""
LIM Manager — Link Identification Mechanism wrapper for Axtrizen.

Wraps Maple OSS's ``LinkManager`` to manage secure, time-bounded
communication channels between pairs of agents.

Maple LIM API (verified against source):
  LinkManager()
    .initiate_link(agent_a: str, agent_b: str) → Link
    .establish_link(link_id: str, lifetime_seconds: int = 3600) → Result[Link, dict]
    .validate_link(link_id: str, sender: str, receiver: str) → Result[Link, dict]
    .terminate_link(link_id: str) → Result[None, dict]
    .get_links_for_agent(agent_id: str) → Result[list, dict]

  Link(agent_a, agent_b, link_id?)
    .establish(lifetime_seconds)
    .is_expired() → bool
    .terminate()
    .link_id, .state, .agent_a, .agent_b

  LinkState:
    INITIATING, ESTABLISHED, DEGRADED, TERMINATED

  Result uses: .is_ok(), .unwrap(), .is_err(), .unwrap_err()
"""

from __future__ import annotations

import logging
from typing import Optional

from maple.security.link import LinkManager, Link, LinkState

logger = logging.getLogger("maple_bridge.lim")

# Default link lifetime: 10 minutes (enough for one review cycle)
DEFAULT_LINK_LIFETIME_SEC = 600


class LIMManager:
    """High-level LIM operations for Axtrizen agents.

    Each ``AxtrizenMapleAgent`` holds one ``LIMManager`` reference that
    points to the broker's shared ``LinkManager``.
    """

    def __init__(self, link_manager: LinkManager):
        """Initialise with a *shared* ``LinkManager``.

        The ``AxtrizenMapleBroker`` owns a single ``LinkManager``
        instance (either from Maple's security layer or a standalone
        one) and passes it to every agent's ``LIMManager`` so that
        links created by one agent are visible to all others.
        """
        self._link_mgr: LinkManager = link_manager
        self._active_links: dict[str, Link] = {}

    # ── Public API ──────────────────────────────────────────────────

    def initiate_link(
        self,
        agent_a: str,
        agent_b: str,
        lifetime_sec: int = DEFAULT_LINK_LIFETIME_SEC,
    ) -> str:
        """Initiate a new LIM link between two agents.

        Uses the real Maple API:
          link = LinkManager.initiate_link(agent_a, agent_b)  → Link
          result = LinkManager.establish_link(link.link_id, lifetime)  → Result[Link, dict]
          Result.unwrap()  — NOT .value

        Returns the ``link_id`` on success.
        Raises ``RuntimeError`` if the link could not be established.
        """
        link = self._link_mgr.initiate_link(agent_a, agent_b)
        result = self._link_mgr.establish_link(link.link_id, lifetime_sec)

        if result.is_err():
            raise RuntimeError(f"Failed to establish LIM link: {result.unwrap_err()}")

        established_link = result.unwrap()
        self._active_links[link.link_id] = established_link
        logger.info(
            "LIM link established: %s ↔ %s (id=%s, ttl=%ds)",
            agent_a, agent_b, link.link_id, lifetime_sec,
        )
        return link.link_id

    def validate_link(
        self,
        link_id: str,
        sender_id: str,
        receiver_id: str,
    ) -> bool:
        """Validate that a link exists and is usable by the two agents.

        Uses: LinkManager.validate_link(link_id, sender, receiver) → Result
        """
        result = self._link_mgr.validate_link(link_id, sender_id, receiver_id)
        if result.is_err():
            raise PermissionError(
                f"LIM link {link_id} is not valid for {sender_id} → {receiver_id}: "
                f"{result.unwrap_err()}"
            )
        return True

    def terminate_link(self, link_id: str) -> None:
        """Terminate a link (e.g., after review cycle completes).

        Uses: LinkManager.terminate_link(link_id) → Result
        """
        result = self._link_mgr.terminate_link(link_id)
        if result.is_err():
            logger.warning("LIM terminate warning: %s", result.unwrap_err())
        self._active_links.pop(link_id, None)
        logger.info("LIM link terminated: %s", link_id)

    def get_active_links(self) -> dict[str, Link]:
        """Return currently-active links managed by this instance."""
        # Prune expired links using Link.is_expired()
        to_remove = [
            lid for lid, link in self._active_links.items()
            if link.is_expired()
        ]
        for lid in to_remove:
            self._active_links.pop(lid)
        return dict(self._active_links)

    def get_links_for_agent(self, agent_id: str) -> list[Link]:
        """Get all links for a specific agent using Maple's API.

        Uses: LinkManager.get_links_for_agent(agent_id) → Result[list, dict]
        """
        result = self._link_mgr.get_links_for_agent(agent_id)
        if result.is_ok():
            return result.unwrap()
        return []

    def get_link(self, link_id: str) -> Optional[Link]:
        """Return a specific link, or None."""
        return self._active_links.get(link_id)
