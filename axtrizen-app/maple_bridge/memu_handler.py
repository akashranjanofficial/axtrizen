"""
MemU Handler — JSON-RPC handler for memU memory service.

Integrates memU's MemoryService into the MapleBridge, reading LLM
provider config from ~/.openclaw/openclaw.json so no separate setup
is needed.

Methods:
    memu.init      → Boot MemoryService with OpenClaw provider config
    memu.memorize  → Ingest conversation/document/code into memory
    memu.retrieve  → Search memory (RAG or LLM mode)
    memu.list      → Browse stored memories and categories
    memu.clear     → Wipe agent memory
    memu.stats     → Memory stats (item count, categories)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger("maple_bridge.memu")

# ── Auto-install memU if missing ────────────────────────────────────

def _ensure_memu_installed() -> bool:
    """Try to import memu; if missing, auto-install via pip."""
    try:
        import memu  # noqa: F401
        return True
    except ImportError:
        logger.info("memU not found — auto-installing memu-py...")
        try:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", "--quiet", "memu-py"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            import memu  # noqa: F401
            logger.info("memU installed successfully")
            return True
        except Exception as exc:
            logger.warning("Auto-install of memu-py failed: %s", exc)
            return False

# ── OpenClaw config path ────────────────────────────────────────────

def _openclaw_config_path() -> Path:
    """Return path to ~/.openclaw/openclaw.json."""
    home = os.environ.get("HOME", os.path.expanduser("~"))
    return Path(home) / ".openclaw" / "openclaw.json"


def _read_openclaw_config() -> dict[str, Any]:
    """Read and parse the OpenClaw configuration file."""
    path = _openclaw_config_path()
    if not path.exists():
        logger.warning("OpenClaw config not found at %s", path)
        return {}
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        logger.error("Failed to read OpenClaw config: %s", exc)
        return {}


def _build_llm_profiles(config: dict[str, Any]) -> dict[str, Any]:
    """Map OpenClaw config to memU llm_profiles format.

    OpenClaw stores provider info under:
      agents.defaults.model.primary → "google-antigravity/gemini-3-flash"
      gateway.auth.token → the auth token used for all LLM calls

    Since OpenClaw's gateway already handles LLM provider routing,
    we use the gateway endpoint for memU's LLM and embedding calls.
    The user never needs to set a separate API key — everything comes
    from the same config they set up during `openclaw onboard`.
    """
    agents = config.get("agents", {})
    defaults = agents.get("defaults", {})
    primary_model = defaults.get("model", {}).get("primary", "")

    # Extract provider and model from "provider/model-name" format
    provider = ""
    model_name = primary_model
    if "/" in primary_model:
        provider, model_name = primary_model.split("/", 1)

    # Get gateway auth token — this is the key the user sets during onboarding
    gateway = config.get("gateway", {})
    gateway_token = gateway.get("auth", {}).get("token", "")
    gateway_port = gateway.get("port", 18789)

    # The gateway itself can proxy LLM calls, so we can use it as the base URL
    # If an explicit API key is set via env var, prefer that
    api_key = (
        os.environ.get("OPENAI_API_KEY")
        or os.environ.get("MEMU_API_KEY")
        or gateway_token  # fall back to gateway token
        or "not-needed"   # memU needs a non-empty string
    )

    # Map known OpenClaw providers to embedding-friendly base URLs
    provider_urls = {
        "openai": "https://api.openai.com/v1",
        "google-antigravity": "https://generativelanguage.googleapis.com/v1beta",
        "anthropic": "https://api.anthropic.com",
        "openrouter": "https://openrouter.ai",
    }

    base_url = os.environ.get("MEMU_BASE_URL", provider_urls.get(provider, "https://api.openai.com/v1"))

    # For embedding model — use a sensible default based on provider
    embed_model = os.environ.get("MEMU_EMBED_MODEL", "text-embedding-3-small")

    llm_profiles: dict[str, Any] = {
        "default": {
            "base_url": base_url,
            "api_key": api_key,
            "chat_model": model_name,
        },
        "embedding": {
            "base_url": os.environ.get("MEMU_EMBED_BASE_URL", base_url),
            "api_key": os.environ.get("MEMU_EMBED_API_KEY", api_key),
            "embed_model": embed_model,
        },
    }

    return llm_profiles


# ── MemU data directory ─────────────────────────────────────────────

def _memu_data_dir() -> Path:
    """Return the memU data directory inside Axtrizen's data dir."""
    data_dir = Path(
        os.environ.get("AXTRIZEN_DATA_DIR", "")
        or (Path(os.environ.get("HOME", os.path.expanduser("~")))
            / "Library" / "Application Support" / "axtrizen")
    )
    memu_dir = data_dir / "memu"
    memu_dir.mkdir(parents=True, exist_ok=True)
    return memu_dir


# ── Handler class ───────────────────────────────────────────────────

class MemUHandler:
    """JSON-RPC handler for memU MemoryService operations.

    Lazily initializes memU on first use, reading LLM config from
    the OpenClaw configuration file.
    """

    def __init__(self) -> None:
        self._service: Any = None
        self._initialized = False
        self._init_error: Optional[str] = None

    # ── RPC handlers ────────────────────────────────────────────────

    async def handle_init(self, params: dict[str, Any]) -> dict[str, Any]:
        """Initialize memU MemoryService.

        Fully automatic — reads provider config from ~/.openclaw/openclaw.json.
        No API keys or manual setup required — uses whatever the user
        configured during `openclaw onboard`.

        Accepts optional overrides in params:
            - db_provider: "inmemory" (default) or "sqlite"
        """
        if self._initialized and self._service is not None:
            return {"status": "already_initialized"}

        # Auto-install memU if needed
        if not _ensure_memu_installed():
            self._init_error = "memU could not be auto-installed"
            # Return gracefully — don't crash the broker
            return {"status": "unavailable", "reason": self._init_error}

        try:
            from memu import MemoryService
        except ImportError as exc:
            self._init_error = f"memU import failed after install: {exc}"
            logger.error(self._init_error)
            return {"status": "unavailable", "reason": self._init_error}

        # Build config from OpenClaw
        oc_config = _read_openclaw_config()
        llm_profiles = _build_llm_profiles(oc_config)

        # Apply param overrides (for advanced users only)
        if params.get("api_key"):
            llm_profiles["default"]["api_key"] = params["api_key"]
            llm_profiles["embedding"]["api_key"] = params["api_key"]
        if params.get("embed_model"):
            llm_profiles["embedding"]["embed_model"] = params["embed_model"]

        # Database config — default to inmemory (zero setup needed)
        db_provider = params.get("db_provider", "inmemory")
        data_dir = _memu_data_dir()

        database_config: dict[str, Any] = {
            "metadata_store": {"provider": db_provider},
        }
        if db_provider == "sqlite":
            database_config["metadata_store"]["url"] = str(data_dir / "memu.db")

        # Blob config for resource storage
        blob_config = {
            "resources_dir": str(data_dir / "resources"),
        }

        try:
            self._service = MemoryService(
                llm_profiles=llm_profiles,
                database_config=database_config,
                blob_config=blob_config,
            )
            self._initialized = True
            logger.info("memU MemoryService initialized (db=%s)", db_provider)
            return {
                "status": "ok",
                "db_provider": db_provider,
                "data_dir": str(data_dir),
            }
        except Exception as exc:
            self._init_error = str(exc)
            logger.exception("memU init failed")
            raise

    async def handle_memorize(self, params: dict[str, Any]) -> dict[str, Any]:
        """Ingest content into memU.

        Params:
            resource_url: str — path or URL to the resource
            modality: str — "conversation" | "document" | "code" | "image"
            user_id: str (optional) — scope to a specific agent
            agent_id: str (optional) — the agent performing the memorize
        """
        self._ensure_initialized()

        resource_url = params.get("resource_url", "")
        modality = params.get("modality", "conversation")
        user_data: dict[str, Any] = {}
        if params.get("user_id"):
            user_data["user_id"] = params["user_id"]
        if params.get("agent_id"):
            user_data["agent_id"] = params["agent_id"]

        # If raw content is provided instead of a file path, write it
        # to a temp file first
        content = params.get("content")
        if content and not resource_url:
            import tempfile
            data_dir = _memu_data_dir()
            tmp_dir = data_dir / "tmp"
            tmp_dir.mkdir(exist_ok=True)
            tmp_file = tempfile.NamedTemporaryFile(
                mode="w", suffix=".json", dir=tmp_dir, delete=False
            )
            if modality == "conversation":
                # Wrap as a conversation JSON
                json.dump({"messages": [
                    {"role": "user", "content": content}
                ]}, tmp_file)
            else:
                tmp_file.write(content)
            tmp_file.close()
            resource_url = tmp_file.name

        try:
            result = await self._service.memorize(
                resource_url=resource_url,
                modality=modality,
                user=user_data if user_data else None,
            )
            # Serialize the result for JSON-RPC
            return _serialize_memu_result(result)
        except Exception as exc:
            logger.exception("memU memorize failed")
            raise RuntimeError(f"Memorize failed: {exc}") from exc

    async def handle_retrieve(self, params: dict[str, Any]) -> dict[str, Any]:
        """Search memU memory.

        Params:
            query: str — the search query
            queries: list[dict] (optional) — multi-turn query format
            method: str — "rag" (default) or "llm"
            user_id: str (optional) — scope to a specific agent
            top_k: int (optional) — max results (default 5)
        """
        self._ensure_initialized()

        method = params.get("method", "rag")
        where: dict[str, Any] = {}
        if params.get("user_id"):
            where["user_id"] = params["user_id"]

        # Build queries list
        queries = params.get("queries")
        if not queries:
            query_text = params.get("query", "")
            if not query_text:
                raise ValueError("Either 'query' or 'queries' is required")
            queries = [{"role": "user", "content": {"text": query_text}}]

        try:
            result = await self._service.retrieve(
                queries=queries,
                where=where if where else None,
                method=method,
            )
            return _serialize_memu_result(result)
        except Exception as exc:
            logger.exception("memU retrieve failed")
            raise RuntimeError(f"Retrieve failed: {exc}") from exc

    async def handle_list(self, params: dict[str, Any]) -> dict[str, Any]:
        """List memories and categories.

        Params:
            user_id: str (optional) — scope to a specific agent
            category: str (optional) — filter by category
        """
        self._ensure_initialized()

        where: dict[str, Any] = {}
        if params.get("user_id"):
            where["user_id"] = params["user_id"]

        try:
            # Use CRUD mixin methods
            memories = await self._service.list_memories(
                where=where if where else None
            )
            return _serialize_memu_result(memories)
        except Exception as exc:
            logger.exception("memU list failed")
            raise RuntimeError(f"List failed: {exc}") from exc

    async def handle_clear(self, params: dict[str, Any]) -> dict[str, Any]:
        """Clear all memories.

        Params:
            user_id: str (optional) — scope to a specific agent
        """
        self._ensure_initialized()

        where: dict[str, Any] = {}
        if params.get("user_id"):
            where["user_id"] = params["user_id"]

        try:
            await self._service.clear(where=where if where else None)
            return {"status": "cleared"}
        except Exception as exc:
            logger.exception("memU clear failed")
            raise RuntimeError(f"Clear failed: {exc}") from exc

    async def handle_stats(self, params: dict[str, Any]) -> dict[str, Any]:
        """Get memory statistics.

        Returns item count, category count, and provider info.
        """
        self._ensure_initialized()

        try:
            summary = self._service._provider_summary()
            # Count items and categories
            result: dict[str, Any] = {
                "initialized": self._initialized,
                "provider": summary if isinstance(summary, dict) else str(summary),
            }

            # Try to get counts via list
            try:
                memories = await self._service.list_memories()
                if isinstance(memories, dict):
                    items = memories.get("items", [])
                    categories = memories.get("categories", [])
                    result["item_count"] = len(items) if isinstance(items, list) else 0
                    result["category_count"] = len(categories) if isinstance(categories, list) else 0
                elif isinstance(memories, list):
                    result["item_count"] = len(memories)
            except Exception:
                result["item_count"] = -1
                result["category_count"] = -1

            return result
        except Exception as exc:
            logger.exception("memU stats failed")
            raise RuntimeError(f"Stats failed: {exc}") from exc

    # ── Helpers ─────────────────────────────────────────────────────

    def _ensure_initialized(self) -> None:
        """Raise if memU is not initialized."""
        if not self._initialized or self._service is None:
            error = self._init_error or "memU not initialized — call memu.init first"
            raise RuntimeError(error)


# ── Serialization ───────────────────────────────────────────────────

def _serialize_memu_result(result: Any) -> dict[str, Any]:
    """Convert memU result objects to JSON-serializable dicts."""
    if result is None:
        return {}
    if isinstance(result, dict):
        return {k: _serialize_value(v) for k, v in result.items()}
    if isinstance(result, list):
        return {"items": [_serialize_value(item) for item in result]}
    if hasattr(result, "__dict__"):
        return {k: _serialize_value(v) for k, v in result.__dict__.items()
                if not k.startswith("_")}
    return {"result": str(result)}


def _serialize_value(value: Any) -> Any:
    """Recursively serialize a value to JSON-compatible types."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {k: _serialize_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialize_value(item) for item in value]
    if hasattr(value, "__dict__"):
        return {k: _serialize_value(v) for k, v in value.__dict__.items()
                if not k.startswith("_")}
    return str(value)
