# memU Integration Research — Can We Use It in Axtrizen?

## TL;DR

**Yes — memU is a strong fit** for replacing/upgrading Axtrizen's memory system (Phase 5, Sprints 9–10). It directly addresses 3 of the 5 planned features and fills 2 existing gaps. The existing **Maple Bridge** (JSON-RPC over stdin/stdout) provides a ready-made integration pathway.

---

## What memU Provides

| Capability                      | Details                                                             |
| ------------------------------- | ------------------------------------------------------------------- |
| **3-layer hierarchical memory** | Resource → MemoryItem → MemoryCategory (auto-organized)             |
| **Real embeddings**             | OpenAI, Doubao, OpenRouter, Voyage — no placeholder hashes          |
| **Proactive memory**            | 24/7 background monitoring, intent prediction, auto-extraction      |
| **Multiple backends**           | In-memory, SQLite (brute-force cosine), PostgreSQL (pgvector)       |
| **Workflow engine**             | Step-based pipelines with interceptors and observability hooks      |
| **LangGraph integration**       | `save_memory` / `search_memory` tools for agent use                 |
| **RAG + LLM retrieval**         | Dual-mode: fast embedding search OR deep LLM reasoning              |
| **Cost efficiency**             | Caches insights, avoids redundant LLM calls for long-running agents |

---

## What Axtrizen Currently Has (Gaps Highlighted)

| Component                    | Status                                                                      |
| ---------------------------- | --------------------------------------------------------------------------- |
| `agent-memory.ts`            | localStorage only — no embeddings, no search, no persistence beyond browser |
| `vector-memory.ts`           | Service exists, calls Tauri commands, has chunking + RAG prompt builder     |
| `vector_store.rs`            | ⚠️ Uses hash-based `simple_embed()` — **not real embeddings**               |
| `AgentMemory.tsx`            | ⚠️ Long-term tab is **empty placeholder**                                   |
| Short-term memory w/ TTL     | ❌ Missing                                                                  |
| Episodic memory              | ❌ Missing                                                                  |
| Agent dormancy (<500ms wake) | ❌ Missing                                                                  |
| Cost tracking dashboard      | Metrics collected, ❌ no visualization                                      |

---

## Integration Strategy

### Approach: **memU as Python sidecar via Maple Bridge extension**

Axtrizen already has a Rust ↔ Python bridge (`maple_bridge/bridge.py`) that uses JSON-RPC over stdin/stdout. We can **extend this bridge** to expose memU's API to the Tauri frontend.

```
┌─────────────┐     Tauri IPC      ┌──────────────┐    JSON-RPC     ┌──────────────┐
│  Frontend    │ ──────────────────▶│  Rust Backend │ ──────────────▶│  Python       │
│  (Next.js)   │                    │  (Tauri)      │   stdin/stdout  │  Sidecar      │
│              │                    │               │                 │              │
│  vector-     │◀──────────────────│  memu.rs      │◀──────────────│  MapleBridge  │
│  memory.ts   │     results        │  (new Tauri   │    responses    │  + MemU       │
│  AgentMemory │                    │   commands)   │                │  MemoryService│
└─────────────┘                    └──────────────┘                 └──────────────┘
```

### New RPC Methods to Add

| Method          | Maps to memU API                    | Purpose                          |
| --------------- | ----------------------------------- | -------------------------------- |
| `memu.memorize` | `MemoryService.memorize()`          | Ingest conversations, docs, code |
| `memu.retrieve` | `MemoryService.retrieve()`          | Search memory (RAG or LLM mode)  |
| `memu.list`     | `MemoryService.list_memories()`     | Browse stored memories           |
| `memu.clear`    | `MemoryService.clear()`             | Wipe agent memory                |
| `memu.status`   | `MemoryService._provider_summary()` | Health check + stats             |

---

## Sprint Plan Feature Mapping

| Sprint Feature                          | memU Coverage                                                       | Integration Effort                              |
| --------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| **Real embedding model** (Sprint 5 gap) | ✅ Full — OpenAI/OpenRouter embeddings                              | Low — replace `simple_embed()`                  |
| **Long-term memory UI** (Sprint 5 gap)  | ✅ retrieve() + categories API                                      | Medium — wire `AgentMemory.tsx` to new commands |
| **Short-term memory w/ TTL** (Sprint 9) | ⚠️ Partial — memU has item expiry concepts but no explicit TTL tier | Medium — add TTL wrapper on top of memU         |
| **Episodic memory** (Sprint 9)          | ✅ Full — Resource layer stores full conversations as episodes      | Low — map `memorize(modality="conversation")`   |
| **Agent dormancy** (Sprint 10)          | ❌ Not covered — memU is memory, not process lifecycle              | Separate concern                                |
| **Cost tracking** (Sprint 10)           | ⚠️ Partial — memU tracks LLM usage metadata via interceptors        | Medium — pipe usage data to dashboard           |

---

## Risks & Considerations

| Risk                                          | Mitigation                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Python 3.13+ required**                     | Maple bridge already uses Python — pin or upgrade                                       |
| **OpenAI API key needed for real embeddings** | Already required for agent LLM calls; can also use OpenRouter                           |
| **Additional process overhead**               | memU runs inside existing Python sidecar — no new process                               |
| **Data migration**                            | Existing `vector_store.db` data uses 128-d hash vectors — must re-embed with real model |
| **SQLite brute-force at scale**               | Fine for <10K items per agent; for larger scale, use pgvector                           |
| **Apache 2.0 license**                        | Compatible with Axtrizen's licensing                                                    |

---

## Recommended Next Steps

1. **Add `memu-py` to `maple_bridge/` requirements** and extend `bridge.py` with `memu.*` RPC handlers
2. **Create `memu.rs`** — new Tauri command module that routes to bridge
3. **Wire `AgentMemory.tsx`** long-term tab to the new `memu.retrieve` command
4. **Replace `simple_embed()`** — the hash-based vector store can be deprecated in favor of memU's real embeddings
5. **Add episodic memory** — auto-memorize conversations on session end
6. **Build short-term TTL layer** — thin wrapper over memU with expiry tracking

This covers 4 out of 5 Phase 5 features. Agent dormancy remains a separate Rust-side concern.
