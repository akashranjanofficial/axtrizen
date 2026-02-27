/**
 * Vector Memory Service — RAG (Retrieval-Augmented Generation) for Agents.
 *
 * Sprint 5, Epic 6: Long-term memory using a local vector DB.
 *
 * Features:
 *   • Embed and store project artifacts (FINAL_REPORT.md, key code files)
 *   • Semantic search across past projects for context injection
 *   • Collection-per-project isolation
 *   • Automatic embedding on project completion
 *   • Memory-aware prompt building for planning phases
 *
 * Backend uses a local vector DB (Qdrant or ChromaDB) via Tauri commands.
 * The embedding model runs locally through the OpenClaw gateway.
 */

import {
  vectorStoreInit,
  vectorStoreAdd,
  vectorStoreSearch,
  vectorStoreStats,
  memuInit,
  memuMemorize,
  memuRetrieve,
  memuList,
  memuClear,
  memuStats,
  type VectorSearchResult,
  type VectorCollectionStats,
  type MemURetrieveResult,
  type MemUListResult,
  type MemUStatsResult,
} from "../tauri-api";

// ── Types ──────────────────────────────────────────────────────────────

export interface MemoryDocument {
  /** Unique document identifier */
  id: string;
  /** The text content to embed */
  content: string;
  /** Metadata for filtering and display */
  metadata: {
    projectId?: string;
    projectName?: string;
    sourceFile?: string;
    documentType: "report" | "code" | "architecture" | "decision" | "review" | "conversation";
    agentId?: string;
    timestamp: string;
    tags?: string[];
    [key: string]: unknown;
  };
}

export interface MemorySearchOptions {
  /** Collection to search (default: "project_memories") */
  collection?: string;
  /** Maximum results to return */
  topK?: number;
  /** Minimum similarity score (0-1) */
  minScore?: number;
  /** Filter by document type */
  documentType?: string;
  /** Filter by project ID */
  projectId?: string;
}

export interface MemoryContext {
  /** Retrieved documents relevant to the query */
  documents: VectorSearchResult[];
  /** Formatted context string for prompt injection */
  formattedContext: string;
  /** Number of tokens (approximate) */
  estimatedTokens: number;
}

// ── Constants ──────────────────────────────────────────────────────────

const DEFAULT_COLLECTION = "project_memories";
const DECISIONS_COLLECTION = "architectural_decisions";
const MAX_CHUNK_SIZE = 1000; // characters per chunk
const CHUNK_OVERLAP = 200;
const APPROX_CHARS_PER_TOKEN = 4;

// ── Chunking ───────────────────────────────────────────────────────────

/**
 * Split text into overlapping chunks for embedding.
 *
 * Uses a simple sliding-window approach. Each chunk is ~1000 chars
 * with 200 chars of overlap for context continuity.
 */
export function chunkText(
  text: string,
  maxChunkSize: number = MAX_CHUNK_SIZE,
  overlap: number = CHUNK_OVERLAP,
): string[] {
  if (text.length <= maxChunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxChunkSize;

    // Try to break at a paragraph or sentence boundary
    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf("\n\n", end);
      if (paragraphBreak > start + maxChunkSize * 0.5) {
        end = paragraphBreak + 2;
      } else {
        const sentenceBreak = text.lastIndexOf(". ", end);
        if (sentenceBreak > start + maxChunkSize * 0.3) {
          end = sentenceBreak + 2;
        }
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;

    // Prevent infinite loops
    if (start >= text.length - overlap) break;
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Estimate token count from character count.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

// ── Vector Memory Service ──────────────────────────────────────────────

export class VectorMemoryService {
  private initialized = false;
  private memuReady = false;

  /**
   * Initialize the vector store backend (legacy).
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      await vectorStoreInit();
      this.initialized = true;
    } catch (err) {
      console.error("[VectorMemory] Init failed:", err);
      throw err;
    }
  }

  // ── memU Integration ─────────────────────────────────────────────

  /**
   * Initialize the memU memory service.
   * Reads LLM config from ~/.openclaw/openclaw.json automatically.
   */
  async initMemU(): Promise<void> {
    if (this.memuReady) return;
    try {
      await memuInit();
      this.memuReady = true;
      console.log("[VectorMemory] memU initialized");
    } catch (err) {
      console.warn("[VectorMemory] memU init failed (falling back to legacy):", err);
    }
  }

  /**
   * Memorize content via memU (conversation, document, code).
   * Falls back silently if memU is not available.
   */
  async memorize(
    content: string,
    modality: "conversation" | "document" | "code" | "image" = "conversation",
    agentId?: string,
  ): Promise<void> {
    try {
      await this.initMemU();
      if (!this.memuReady) return;

      await memuMemorize({
        content,
        modality,
        userId: agentId,
        agentId,
      });
    } catch (err) {
      console.warn("[VectorMemory] memU memorize failed:", err);
    }
  }

  /**
   * Search memory via memU with real embeddings.
   * Falls back to legacy vectorStoreSearch if memU is unavailable.
   */
  async searchWithMemU(
    query: string,
    options?: { method?: "rag" | "llm"; userId?: string; topK?: number },
  ): Promise<MemURetrieveResult> {
    try {
      await this.initMemU();
      if (!this.memuReady) {
        return { items: [], categories: [] };
      }

      return await memuRetrieve({
        query,
        method: options?.method ?? "rag",
        userId: options?.userId,
        topK: options?.topK ?? 5,
      });
    } catch (err) {
      console.warn("[VectorMemory] memU retrieve failed:", err);
      return { items: [], categories: [] };
    }
  }

  /**
   * List all memories from memU.
   */
  async listMemories(userId?: string): Promise<MemUListResult> {
    try {
      await this.initMemU();
      if (!this.memuReady) return { items: [], categories: [] };
      return await memuList(userId);
    } catch (err) {
      console.warn("[VectorMemory] memU list failed:", err);
      return { items: [], categories: [] };
    }
  }

  /**
   * Get memU stats (item count, category count, provider info).
   */
  async getMemUStats(): Promise<MemUStatsResult | null> {
    try {
      await this.initMemU();
      if (!this.memuReady) return null;
      return await memuStats();
    } catch (err) {
      console.warn("[VectorMemory] memU stats failed:", err);
      return null;
    }
  }

  /**
   * Clear all memU memories for an agent.
   */
  async clearMemU(userId?: string): Promise<void> {
    try {
      await this.initMemU();
      if (!this.memuReady) return;
      await memuClear(userId);
    } catch (err) {
      console.warn("[VectorMemory] memU clear failed:", err);
    }
  }

  // ── Legacy Vector Store Methods (kept for backward compat) ───────

  /**
   * Store a single document (auto-chunks if needed).
   */
  async storeDocument(doc: MemoryDocument, collection?: string): Promise<number> {
    await this.init();
    const col = collection ?? DEFAULT_COLLECTION;
    const chunks = chunkText(doc.content);

    const documents = chunks.map((chunk, idx) => ({
      content: chunk,
      metadata: {
        ...doc.metadata,
        parentId: doc.id,
        chunkIndex: idx,
        totalChunks: chunks.length,
      },
    }));

    const result = await vectorStoreAdd(col, documents);
    return result.added;
  }

  /**
   * Store multiple documents at once.
   */
  async storeBatch(docs: MemoryDocument[], collection?: string): Promise<number> {
    let total = 0;
    for (const doc of docs) {
      total += await this.storeDocument(doc, collection);
    }
    return total;
  }

  /**
   * Embed a project's key artifacts on completion.
   *
   * Called when a project moves to "Done" phase.
   * Stores: FINAL_REPORT, architecture decisions, key code files.
   */
  async embedProjectArtifacts(
    projectId: string,
    projectName: string,
    artifacts: Array<{
      filename: string;
      content: string;
      type: MemoryDocument["metadata"]["documentType"];
    }>,
  ): Promise<number> {
    const timestamp = new Date().toISOString();
    const docs: MemoryDocument[] = artifacts.map((artifact) => ({
      id: `${projectId}:${artifact.filename}`,
      content: artifact.content,
      metadata: {
        projectId,
        projectName,
        sourceFile: artifact.filename,
        documentType: artifact.type,
        timestamp,
        tags: [projectName.toLowerCase()],
      },
    }));

    // Also memorize via memU if available
    for (const artifact of artifacts) {
      await this.memorize(
        `Project: ${projectName}\nFile: ${artifact.filename}\n\n${artifact.content}`,
        artifact.type === "conversation" ? "conversation" : "document",
      );
    }

    return this.storeBatch(docs);
  }

  /**
   * Store an architectural decision for long-term memory.
   */
  async storeDecision(
    projectId: string,
    decision: string,
    context: string,
    agentId?: string,
  ): Promise<number> {
    // Also memorize via memU
    await this.memorize(
      `Architecture Decision: ${decision}\n\nContext: ${context}`,
      "document",
      agentId,
    );

    return this.storeDocument(
      {
        id: `decision:${projectId}:${Date.now()}`,
        content: `Decision: ${decision}\n\nContext: ${context}`,
        metadata: {
          projectId,
          documentType: "decision",
          agentId,
          timestamp: new Date().toISOString(),
          tags: ["architecture", "decision"],
        },
      },
      DECISIONS_COLLECTION,
    );
  }

  /**
   * Search for relevant context from past projects.
   *
   * Uses memU (real embeddings) if available, falls back to legacy.
   */
  async searchMemory(query: string, options?: MemorySearchOptions): Promise<MemoryContext> {
    await this.init();
    const col = options?.collection ?? DEFAULT_COLLECTION;
    const topK = options?.topK ?? 5;

    const result = await vectorStoreSearch(col, query, topK);

    // Filter by score and metadata
    let filtered = result.results;
    if (options?.minScore) {
      filtered = filtered.filter((r) => r.score >= (options.minScore ?? 0));
    }
    if (options?.documentType) {
      filtered = filtered.filter(
        (r) =>
          (r.document.metadata as Record<string, unknown>).documentType === options.documentType,
      );
    }
    if (options?.projectId) {
      filtered = filtered.filter(
        (r) => (r.document.metadata as Record<string, unknown>).projectId === options.projectId,
      );
    }

    const formattedContext = formatMemoryResults(filtered);

    return {
      documents: filtered,
      formattedContext,
      estimatedTokens: estimateTokens(formattedContext),
    };
  }

  /**
   * Search architectural decisions specifically.
   */
  async searchDecisions(query: string, topK: number = 3): Promise<MemoryContext> {
    return this.searchMemory(query, {
      collection: DECISIONS_COLLECTION,
      topK,
    });
  }

  /**
   * Build a RAG-enhanced prompt for the planning phase.
   *
   * Queries past projects for relevant context and prepends it.
   */
  async buildRAGPrompt(
    basePrompt: string,
    projectDescription: string,
    maxContextTokens: number = 2000,
  ): Promise<string> {
    const context = await this.searchMemory(projectDescription, {
      topK: 10,
      minScore: 0.6,
    });

    // Trim to token budget
    let injectedContext = context.formattedContext;
    if (context.estimatedTokens > maxContextTokens) {
      const maxChars = maxContextTokens * APPROX_CHARS_PER_TOKEN;
      injectedContext = injectedContext.slice(0, maxChars) + "\n\n[Context trimmed...]";
    }

    if (!injectedContext.trim()) {
      return basePrompt;
    }

    return [
      "## Relevant Context from Past Projects",
      "",
      injectedContext,
      "",
      "---",
      "",
      basePrompt,
    ].join("\n");
  }

  /**
   * Get collection statistics.
   */
  async getStats(collection?: string): Promise<VectorCollectionStats[]> {
    await this.init();
    const result = await vectorStoreStats(collection);
    return result.collections;
  }

  /**
   * Delete all memories for a project.
   */
  async deleteProjectMemories(_projectId: string, _collection?: string): Promise<number> {
    // For now, we'd need to search and delete by metadata
    // This is a simplified version — a real impl would query by metadata filter
    console.warn(
      "[VectorMemory] deleteProjectMemories not fully implemented — use vector_store_delete with IDs",
    );
    return 0;
  }
}

// ── Formatting ─────────────────────────────────────────────────────────

/**
 * Format search results into a context string for prompt injection.
 */
export function formatMemoryResults(results: VectorSearchResult[]): string {
  if (results.length === 0) return "";

  const sections: string[] = [];

  for (const result of results) {
    const meta = result.document.metadata as Record<string, unknown>;
    const header = [
      meta.projectName && `Project: ${meta.projectName}`,
      meta.sourceFile && `File: ${meta.sourceFile}`,
      meta.documentType && `Type: ${meta.documentType}`,
      `Relevance: ${(result.score * 100).toFixed(0)}%`,
    ]
      .filter(Boolean)
      .join(" | ");

    sections.push(`### ${header}\n\n${result.document.content}`);
  }

  return sections.join("\n\n---\n\n");
}

// ── Singleton ──────────────────────────────────────────────────────────

export const vectorMemory = new VectorMemoryService();

export default vectorMemory;
