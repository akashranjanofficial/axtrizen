// Vector store commands — lightweight in-memory vector DB with SQLite persistence
//
// Sprint 5, Epic 6: RAG pipeline for long-term agent memory.
// Uses cosine similarity over f32 embeddings stored in SQLite blobs.

use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::State;

// ── State ─────────────────────────────────────────────────────────────

pub struct VectorStoreState {
    pub db: Mutex<Option<Connection>>,
}

impl Default for VectorStoreState {
    fn default() -> Self {
        Self {
            db: Mutex::new(None),
        }
    }
}

// ── Schema helpers ────────────────────────────────────────────────────

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS vector_documents (
            id TEXT PRIMARY KEY,
            collection TEXT NOT NULL DEFAULT 'default',
            content TEXT NOT NULL,
            metadata TEXT,
            embedding BLOB,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_vector_collection ON vector_documents(collection);",
    )
    .map_err(|e| format!("Schema creation failed: {}", e))
}

// ── Embedding — simple TF-IDF ish hash-based placeholder ─────────────
// In production swap with a real embedding model; for now we generate
// deterministic 128-d float vectors from content hashing so that
// lexically similar texts produce similar embeddings.

fn simple_embed(text: &str) -> Vec<f32> {
    let dim = 128;
    let mut vec = vec![0.0f32; dim];
    let lower = text.to_lowercase();
    let words: Vec<&str> = lower.split_whitespace().collect();

    for (i, word) in words.iter().enumerate() {
        // Hash each word into a bucket
        let mut h: u64 = 5381;
        for b in word.bytes() {
            h = h.wrapping_mul(33).wrapping_add(b as u64);
        }
        let bucket = (h as usize) % dim;
        // Weight by inverse position (earlier words matter more)
        let weight = 1.0 / (1.0 + i as f32 * 0.1);
        vec[bucket] += weight;

        // Bigram — combine with next word
        if i + 1 < words.len() {
            let mut h2 = h;
            for b in words[i + 1].bytes() {
                h2 = h2.wrapping_mul(33).wrapping_add(b as u64);
            }
            let bucket2 = (h2 as usize) % dim;
            vec[bucket2] += weight * 0.5;
        }
    }

    // Normalize to unit vector
    let norm: f32 = vec.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        for v in vec.iter_mut() {
            *v /= norm;
        }
    }
    vec
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if na == 0.0 || nb == 0.0 {
        0.0
    } else {
        dot / (na * nb)
    }
}

fn embedding_to_bytes(emb: &[f32]) -> Vec<u8> {
    emb.iter().flat_map(|f| f.to_le_bytes()).collect()
}

fn bytes_to_embedding(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

// ── Tauri Commands ────────────────────────────────────────────────────

/// Initialize the vector store (open/create the SQLite DB)
#[tauri::command]
pub async fn vector_store_init(
    state: State<'_, VectorStoreState>,
    db_path: Option<String>,
) -> Result<Value, String> {
    let path = db_path.unwrap_or_else(|| {
        let dir = dirs::data_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("axtrizen");
        std::fs::create_dir_all(&dir).ok();
        dir.join("vector_store.db")
            .to_string_lossy()
            .to_string()
    });

    let conn = Connection::open(&path)
        .map_err(|e| format!("Failed to open vector DB: {}", e))?;

    ensure_schema(&conn)?;

    let mut db = state.db.lock().map_err(|e| e.to_string())?;
    *db = Some(conn);

    Ok(json!({ "status": "ok", "path": path }))
}

/// Add a document to the vector store
#[tauri::command]
pub async fn vector_store_add(
    state: State<'_, VectorStoreState>,
    id: String,
    content: String,
    collection: Option<String>,
    metadata: Option<Value>,
) -> Result<Value, String> {
    let coll = collection.unwrap_or_else(|| "default".to_string());
    let meta_str = metadata
        .map(|m| serde_json::to_string(&m).unwrap_or_default())
        .unwrap_or_default();

    let embedding = simple_embed(&content);
    let emb_bytes = embedding_to_bytes(&embedding);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.as_ref().ok_or("Vector store not initialized")?;

    conn.execute(
        "INSERT OR REPLACE INTO vector_documents (id, collection, content, metadata, embedding) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, coll, content, meta_str, emb_bytes],
    )
    .map_err(|e| format!("Insert failed: {}", e))?;

    Ok(json!({ "status": "ok", "id": id }))
}

/// Search the vector store by similarity
#[tauri::command]
pub async fn vector_store_search(
    state: State<'_, VectorStoreState>,
    query: String,
    collection: Option<String>,
    limit: Option<usize>,
    min_score: Option<f32>,
) -> Result<Value, String> {
    let coll = collection.unwrap_or_else(|| "default".to_string());
    let max_results = limit.unwrap_or(10);
    let threshold = min_score.unwrap_or(0.0);

    let query_embedding = simple_embed(&query);

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.as_ref().ok_or("Vector store not initialized")?;

    let mut stmt = conn
        .prepare("SELECT id, content, metadata, embedding FROM vector_documents WHERE collection = ?1")
        .map_err(|e| format!("Query prepare failed: {}", e))?;

    let mut results: Vec<(f32, Value)> = Vec::new();

    let rows = stmt
        .query_map(params![coll], |row| {
            let id: String = row.get(0)?;
            let content: String = row.get(1)?;
            let meta: String = row.get(2)?;
            let emb_bytes: Vec<u8> = row.get(3)?;
            Ok((id, content, meta, emb_bytes))
        })
        .map_err(|e| format!("Query failed: {}", e))?;

    for row in rows {
        let (id, content, meta, emb_bytes) = row.map_err(|e| format!("Row error: {}", e))?;
        let emb = bytes_to_embedding(&emb_bytes);
        let score = cosine_similarity(&query_embedding, &emb);

        if score >= threshold {
            let metadata: Value =
                serde_json::from_str(&meta).unwrap_or(Value::Null);
            results.push((
                score,
                json!({
                    "id": id,
                    "content": content,
                    "metadata": metadata,
                    "score": score,
                }),
            ));
        }
    }

    // Sort by score descending
    results.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(max_results);

    let items: Vec<Value> = results.into_iter().map(|(_, v)| v).collect();
    Ok(json!({ "results": items }))
}

/// Delete a document from the vector store
#[tauri::command]
pub async fn vector_store_delete(
    state: State<'_, VectorStoreState>,
    id: String,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.as_ref().ok_or("Vector store not initialized")?;

    let deleted = conn
        .execute("DELETE FROM vector_documents WHERE id = ?1", params![id])
        .map_err(|e| format!("Delete failed: {}", e))?;

    Ok(json!({ "status": "ok", "deleted": deleted }))
}

/// Get collection statistics
#[tauri::command]
pub async fn vector_store_stats(
    state: State<'_, VectorStoreState>,
    collection: Option<String>,
) -> Result<Value, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.as_ref().ok_or("Vector store not initialized")?;

    match collection {
        Some(coll) => {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM vector_documents WHERE collection = ?1",
                    params![coll],
                    |row| row.get(0),
                )
                .map_err(|e| format!("Stats query failed: {}", e))?;

            Ok(json!({
                "collection": coll,
                "documentCount": count,
                "embeddingDimension": 128,
            }))
        }
        None => {
            // All collections
            let mut stmt = conn
                .prepare(
                    "SELECT collection, COUNT(*) as cnt FROM vector_documents GROUP BY collection",
                )
                .map_err(|e| format!("Stats query failed: {}", e))?;

            let mut collections = Vec::new();
            let rows = stmt
                .query_map([], |row| {
                    let name: String = row.get(0)?;
                    let count: i64 = row.get(1)?;
                    Ok((name, count))
                })
                .map_err(|e| format!("Query failed: {}", e))?;

            for row in rows {
                let (name, count) = row.map_err(|e| e.to_string())?;
                collections.push(json!({
                    "collection": name,
                    "documentCount": count,
                }));
            }

            Ok(json!({
                "collections": collections,
                "embeddingDimension": 128,
            }))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_embed_produces_unit_vector() {
        let emb = simple_embed("hello world");
        let norm: f32 = emb.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_similar_texts_high_similarity() {
        let a = simple_embed("the quick brown fox");
        let b = simple_embed("the quick brown dog");
        let sim = cosine_similarity(&a, &b);
        assert!(sim > 0.5, "Expected high similarity, got {}", sim);
    }

    #[test]
    fn test_different_texts_lower_similarity() {
        let a = simple_embed("the quick brown fox");
        let b = simple_embed("quantum physics equations");
        let sim_similar = cosine_similarity(&a, &simple_embed("quick brown animal"));
        let sim_diff = cosine_similarity(&a, &b);
        assert!(
            sim_similar > sim_diff,
            "Similar text should score higher: {} vs {}",
            sim_similar,
            sim_diff
        );
    }

    #[test]
    fn test_embedding_serialization_roundtrip() {
        let emb = simple_embed("test data");
        let bytes = embedding_to_bytes(&emb);
        let restored = bytes_to_embedding(&bytes);
        assert_eq!(emb.len(), restored.len());
        for (a, b) in emb.iter().zip(restored.iter()) {
            assert!((a - b).abs() < 1e-7);
        }
    }
}
