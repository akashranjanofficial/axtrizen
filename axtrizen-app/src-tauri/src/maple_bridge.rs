// maple_bridge.rs — Rust client for the Maple OSS Python sidecar.
//
// The Rust orchestrator uses this module to spin up the Python
// MapleBridge process and send JSON-RPC commands for P2P agent
// communication (task claiming, code review, status updates).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot, Mutex};

/// Events emitted by the Maple broker that the Rust side listens to.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapleEvent {
    pub agent_id: String,
    pub event_type: String,
    pub message: Value,
}

/// Configuration for starting the Maple bridge sidecar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapleBridgeConfig {
    /// "memory" or "nats"
    pub broker_type: String,
    /// NATS server URL (only used when broker_type == "nats")
    pub nats_url: Option<String>,
    /// Whether to enforce LIM links for all messages
    pub require_links: bool,
}

impl Default for MapleBridgeConfig {
    fn default() -> Self {
        Self {
            broker_type: "memory".into(),
            nats_url: None,
            require_links: false,
        }
    }
}

/// Rust-side handle to the Maple bridge Python sidecar.
pub struct MapleBridgeClient {
    stdin: Arc<Mutex<tokio::process::ChildStdin>>,
    _child: Arc<Mutex<Child>>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>>,
    _event_tx: mpsc::UnboundedSender<MapleEvent>,
    next_id: AtomicU64,
}

impl MapleBridgeClient {
    /// Spawn the Python sidecar and return a client handle + event receiver.
    ///
    /// The `event_rx` channel receives P2P events forwarded by agents.
    pub async fn spawn(
        config: MapleBridgeConfig,
    ) -> Result<(Self, mpsc::UnboundedReceiver<MapleEvent>), String> {
        // Resolve the axtrizen-app directory (two levels up from the binary).
        // In dev: target/debug/axtrizen-app → ../../../
        // In prod: the Tauri resource dir is used.
        // The Python maple_bridge package and vendor/maple-oss live in
        // the axtrizen-app root, so we set current_dir there.
        let app_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()))
            // Fallback: current_dir (works when cargo run from axtrizen-app)
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

        // The actual axtrizen-app dir containing maple_bridge/ and vendor/
        // In dev builds, the exe is in target/debug, so we need the workspace root.
        // We walk up until we find maple_bridge/ directory, or fall back to cwd.
        let maple_bridge_root = find_maple_bridge_root(&app_dir)
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

        let mut child = Command::new("python3")
            .args(["-m", "maple_bridge.bridge"])
            .current_dir(&maple_bridge_root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit()) // logs visible in terminal
            .spawn()
            .map_err(|e| format!("Failed to spawn Maple bridge: {}", e))?;

        let stdin = child.stdin.take().ok_or("No stdin")?;
        let stdout = child.stdout.take().ok_or("No stdout")?;

        let pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let (event_tx, event_rx) = mpsc::unbounded_channel();

        // Spawn a reader task that routes responses and events
        let pending_clone = pending.clone();
        let event_tx_clone = event_tx.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(msg) = serde_json::from_str::<Value>(&line) {
                    // JSON-RPC notification (event from agent)
                    if msg.get("jsonrpc").is_some() && msg.get("method").is_some() {
                        if let Some(params) = msg.get("params") {
                            let event = MapleEvent {
                                agent_id: params
                                    .get("agentId")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                event_type: params
                                    .get("type")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                message: params.get("message").cloned().unwrap_or(Value::Null),
                            };
                            let _ = event_tx_clone.send(event);
                        }
                    }
                    // JSON-RPC response (to a pending request)
                    else if let Some(id) = msg.get("id").and_then(|v| v.as_u64()) {
                        let mut map = pending_clone.lock().await;
                        if let Some(sender) = map.remove(&id) {
                            let payload = msg.get("result").cloned().unwrap_or_else(|| {
                                msg.get("error")
                                    .cloned()
                                    .unwrap_or(json!({"error": "unknown"}))
                            });
                            let _ = sender.send(payload);
                        }
                    }
                }
            }
        });

        let client = Self {
            stdin: Arc::new(Mutex::new(stdin)),
            _child: Arc::new(Mutex::new(child)),
            pending,
            _event_tx: event_tx,
            next_id: AtomicU64::new(1),
        };

        // Start the broker
        client
            .call(
                "broker.start",
                json!({
                    "brokerType": config.broker_type,
                    "natsUrl": config.nats_url,
                    "requireLinks": config.require_links,
                }),
            )
            .await?;

        Ok((client, event_rx))
    }

    /// Send a JSON-RPC request to the Python sidecar and await the response.
    pub async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let request = json!({
            "id": id,
            "method": method,
            "params": params,
        });

        let (tx, rx) = oneshot::channel();
        {
            let mut map = self.pending.lock().await;
            map.insert(id, tx);
        }

        let line = serde_json::to_string(&request).unwrap() + "\n";
        {
            let mut stdin = self.stdin.lock().await;
            stdin
                .write_all(line.as_bytes())
                .await
                .map_err(|e| format!("Write to maple bridge failed: {}", e))?;
            stdin.flush().await.map_err(|e| e.to_string())?;
        }

        rx.await.map_err(|_| "Bridge response channel closed".to_string())
    }

    // ── Convenience methods ────────────────────────────────────────

    /// Connect an agent to the Maple broker.
    pub async fn connect_agent(
        &self,
        agent_id: &str,
        team_id: &str,
        role: &str,
    ) -> Result<Value, String> {
        self.call(
            "agent.connect",
            json!({
                "agentId": agent_id,
                "teamId": team_id,
                "role": role,
            }),
        )
        .await
    }

    /// Disconnect an agent from the broker.
    pub async fn disconnect_agent(&self, agent_id: &str) -> Result<Value, String> {
        self.call("agent.disconnect", json!({ "agentId": agent_id }))
            .await
    }

    /// Publish a P2P message from an agent.
    pub async fn publish(
        &self,
        agent_id: &str,
        msg_type: &str,
        payload: Value,
        receiver_id: Option<&str>,
        channel: Option<&str>,
    ) -> Result<Value, String> {
        let mut params = json!({
            "agentId": agent_id,
            "type": msg_type,
            "payload": payload,
        });
        if let Some(recv) = receiver_id {
            params["receiverId"] = json!(recv);
        }
        if let Some(ch) = channel {
            params["channel"] = json!(ch);
        }
        self.call("agent.publish", params).await
    }

    /// Have a worker agent claim a task.
    pub async fn claim_task(
        &self,
        agent_id: &str,
        task_id: &str,
        manager_id: &str,
    ) -> Result<Value, String> {
        self.call(
            "agent.claim_task",
            json!({
                "agentId": agent_id,
                "taskId": task_id,
                "managerId": manager_id,
            }),
        )
        .await
    }

    /// Initiate a LIM link for code review.
    pub async fn initiate_review_link(
        &self,
        agent_id: &str,
        reviewer_id: &str,
    ) -> Result<String, String> {
        let result = self
            .call(
                "lim.initiate",
                json!({
                    "agentId": agent_id,
                    "reviewerId": reviewer_id,
                }),
            )
            .await?;
        result
            .get("linkId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "No linkId in response".to_string())
    }

    /// Send a code review request over a LIM link.
    pub async fn send_review_request(
        &self,
        agent_id: &str,
        reviewer_id: &str,
        link_id: &str,
        payload: Value,
    ) -> Result<Value, String> {
        self.call(
            "lim.review_request",
            json!({
                "agentId": agent_id,
                "reviewerId": reviewer_id,
                "linkId": link_id,
                "payload": payload,
            }),
        )
        .await
    }

    /// Send a code review result over a LIM link.
    pub async fn send_review_result(
        &self,
        reviewer_id: &str,
        dev_id: &str,
        link_id: &str,
        payload: Value,
    ) -> Result<Value, String> {
        self.call(
            "lim.review_result",
            json!({
                "agentId": reviewer_id,
                "devId": dev_id,
                "linkId": link_id,
                "payload": payload,
            }),
        )
        .await
    }

    /// Terminate a LIM link.
    pub async fn terminate_link(
        &self,
        agent_id: &str,
        link_id: &str,
    ) -> Result<Value, String> {
        self.call(
            "lim.terminate",
            json!({
                "agentId": agent_id,
                "linkId": link_id,
            }),
        )
        .await
    }

    /// Get the bridge status.
    pub async fn status(&self) -> Result<Value, String> {
        self.call("status", json!({})).await
    }

    /// Shut down the bridge and the broker.
    pub async fn shutdown(&self) -> Result<Value, String> {
        self.call("broker.shutdown", json!({})).await
    }
}

/// Walk up from `start` to find the directory containing `maple_bridge/`.
/// Returns `None` if not found within 10 levels.
fn find_maple_bridge_root(start: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut dir = start.to_path_buf();
    for _ in 0..10 {
        if dir.join("maple_bridge").is_dir() {
            return Some(dir);
        }
        if !dir.pop() {
            break;
        }
    }
    None
}
