// Gateway WebSocket Client
// Implements OpenClaw Gateway protocol (custom frame-based, NOT JSON-RPC 2.0)
//
// Protocol overview:
//   Request:  { type: "req", id: "<uuid>", method: "<method>", params: {...} }
//   Response: { type: "res", id: "<uuid>", ok: true/false, payload?: {...}, error?: {...} }
//   Event:    { type: "event", event: "<name>", payload?: {...}, seq?: N }
//
// The first message after WebSocket connect MUST be a "connect" request with
// ConnectParams (minProtocol, maxProtocol, client info, auth token).

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio_tungstenite::{connect_async, tungstenite::Message};

const PROTOCOL_VERSION: i32 = 3;
const CLIENT_VERSION: &str = "0.1.0";

type PendingMap = Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>>;

/// Tracks an in-flight chat.send streaming response.
/// Accumulates delta text and resolves the oneshot when `state: "final"` arrives.
struct ChatCollector {
    buffer: String,
    sender: Option<oneshot::Sender<String>>,
}

type ChatCollectorMap = Arc<Mutex<HashMap<String, ChatCollector>>>;

/// Shared Gateway client state managed by Tauri
pub struct GatewayClient {
    sender: Arc<Mutex<Option<mpsc::UnboundedSender<String>>>>,
    pending: PendingMap,
    token: Arc<Mutex<Option<String>>>,
    url: Arc<Mutex<String>>,
    connected: Arc<Mutex<bool>>,
    /// Collects streaming chat responses keyed by runId
    chat_collectors: ChatCollectorMap,
}

impl Default for GatewayClient {
    fn default() -> Self {
        Self {
            sender: Arc::new(Mutex::new(None)),
            pending: Arc::new(Mutex::new(HashMap::new())),
            token: Arc::new(Mutex::new(None)),
            url: Arc::new(Mutex::new("ws://127.0.0.1:18789".to_string())),
            connected: Arc::new(Mutex::new(false)),
            chat_collectors: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl GatewayClient {
    /// Build the "connect" handshake frame required by OpenClaw Gateway
    fn build_connect_frame(id: &str, token: &Option<String>) -> Value {
        let mut frame = json!({
            "type": "req",
            "id": id,
            "method": "connect",
            "params": {
                "minProtocol": PROTOCOL_VERSION,
                "maxProtocol": PROTOCOL_VERSION,
                "client": {
                    "id": "gateway-client",
                    "displayName": "Axtrizen Desktop",
                    "version": CLIENT_VERSION,
                    "platform": std::env::consts::OS,
                    "mode": "backend"
                },
                "role": "operator",
                "scopes": ["operator.admin"]
            }
        });

        if let Some(t) = token {
            frame["params"]["auth"] = json!({ "token": t });
        }

        frame
    }

    /// Build a request frame for a method call
    fn build_request_frame(id: &str, method: &str, params: Value) -> Value {
        json!({
            "type": "req",
            "id": id,
            "method": method,
            "params": params
        })
    }

    /// Connect to the Gateway WebSocket and perform the connect handshake
    pub async fn connect(&self, url: &str, token: Option<String>) -> Result<(), String> {
        // Disconnect existing connection if any
        self.disconnect().await;

        *self.url.lock().await = url.to_string();
        *self.token.lock().await = token.clone();

        let (ws_stream, _) = connect_async(url)
            .await
            .map_err(|e| format!("WebSocket connection failed: {}", e))?;

        let (mut ws_write, mut ws_read) = ws_stream.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();

        *self.sender.lock().await = Some(tx.clone());

        let pending_clone = self.pending.clone();
        let connected_clone = self.connected.clone();
        let chat_collectors_clone = self.chat_collectors.clone();
        let sender_clone = self.sender.clone();

        // Spawn writer task: forwards outgoing messages to WebSocket
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if ws_write.send(Message::Text(msg)).await.is_err() {
                    break;
                }
            }
        });

        // Spawn reader task: routes incoming responses to waiting callers
        tokio::spawn(async move {
            while let Some(Ok(msg)) = ws_read.next().await {
                if let Message::Text(text) = msg {
                    if let Ok(frame) = serde_json::from_str::<Value>(&text) {
                        let frame_type = frame.get("type").and_then(|v| v.as_str()).unwrap_or("");

                        match frame_type {
                            "res" => {
                                // Response frame: { type: "res", id, ok, payload?, error? }
                                if let Some(id) = frame.get("id").and_then(|v| v.as_str()).map(String::from) {
                                    let mut pending = pending_clone.lock().await;
                                    if let Some(sender) = pending.remove(&id) {
                                        let ok = frame.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
                                        if ok {
                                            let payload = frame.get("payload").cloned().unwrap_or(Value::Null);
                                            let _ = sender.send(Ok(payload));
                                        } else if let Some(error) = frame.get("error") {
                                            let msg = error.get("message")
                                                .and_then(|m| m.as_str())
                                                .unwrap_or("Unknown error");
                                            let _ = sender.send(Err(msg.to_string()));
                                        } else {
                                            let _ = sender.send(Err("Request failed".to_string()));
                                        }
                                    }
                                }
                            },
                            "event" => {
                                let event_name = frame.get("event").and_then(|v| v.as_str()).unwrap_or("unknown");
                                
                                // Capture chat events for streaming response collection
                                if event_name == "chat" {
                                    if let Some(payload) = frame.get("payload") {
                                        let run_id = payload.get("runId")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("");
                                        let state_val = payload.get("state")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("");
                                        
                                        if !run_id.is_empty() {
                                            let mut collectors = chat_collectors_clone.lock().await;
                                            if let Some(collector) = collectors.get_mut(run_id) {
                                                // Extract text from delta/final events
                                                // IMPORTANT: Gateway sends CUMULATIVE text in each delta
                                                // (each delta contains the full response so far),
                                                // so we REPLACE the buffer, not append.
                                                if let Some(text) = payload.get("message")
                                                    .and_then(|m| m.get("content"))
                                                    .and_then(|c| c.as_array())
                                                    .and_then(|arr| arr.first())
                                                    .and_then(|item| item.get("text"))
                                                    .and_then(|t| t.as_str()) {
                                                    collector.buffer = text.to_string();
                                                }
                                                
                                                // When final/done/error state arrives, send the complete response
                                                if state_val == "final" || state_val == "done" || state_val == "error" {
                                                    let response = collector.buffer.clone();
                                                    if let Some(sender) = collector.sender.take() {
                                                        let _ = sender.send(response);
                                                    }
                                                    collectors.remove(run_id);
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    println!("[gateway] event: {}", event_name);
                                }
                            },
                            _ => {
                                println!("[gateway] unknown frame type: {}", frame_type);
                            }
                        }
                    }
                }
            }
            // Connection closed — clean up so the next call() gets an immediate
            // "Not connected" error and triggers auto-reconnect instead of
            // hanging until timeout.
            println!("[gateway] WebSocket connection closed");
            *connected_clone.lock().await = false;
            // Clear sender so call_inner() returns "Not connected" immediately
            *sender_clone.lock().await = None;
            // Drain all in-flight requests so they don't hang waiting for responses
            let mut pending = pending_clone.lock().await;
            for (_, sender) in pending.drain() {
                let _ = sender.send(Err("WebSocket connection closed".to_string()));
            }
        });

        // Send the connect handshake as the very first message
        let connect_id = uuid::Uuid::new_v4().to_string();
        let connect_frame = Self::build_connect_frame(&connect_id, &token);

        // Register pending response for the connect handshake
        let (resp_tx, resp_rx) = oneshot::channel();
        self.pending.lock().await.insert(connect_id.clone(), resp_tx);

        // Send connect frame
        tx.send(connect_frame.to_string())
            .map_err(|e| format!("Failed to send connect frame: {}", e))?;

        // Wait for connect response
        match tokio::time::timeout(std::time::Duration::from_secs(10), resp_rx).await {
            Ok(Ok(Ok(payload))) => {
                println!("[gateway] Connect handshake OK: {}", 
                    payload.get("server").and_then(|s| s.get("version"))
                        .and_then(|v| v.as_str()).unwrap_or("unknown"));
                *self.connected.lock().await = true;
                Ok(())
            },
            Ok(Ok(Err(e))) => {
                self.pending.lock().await.remove(&connect_id);
                *self.sender.lock().await = None;
                Err(format!("Connect handshake rejected: {}", e))
            },
            Ok(Err(_)) => {
                self.pending.lock().await.remove(&connect_id);
                *self.sender.lock().await = None;
                Err("Connect response channel closed".to_string())
            },
            Err(_) => {
                self.pending.lock().await.remove(&connect_id);
                *self.sender.lock().await = None;
                Err("Connect handshake timed out (10s)".to_string())
            }
        }
    }

    /// Disconnect from the Gateway
    pub async fn disconnect(&self) {
        *self.sender.lock().await = None;
        *self.connected.lock().await = false;
        // Drain all pending requests with an error
        let mut pending = self.pending.lock().await;
        for (_, sender) in pending.drain() {
            let _ = sender.send(Err("Disconnected".to_string()));
        }
    }

    /// Try to reconnect using stored URL and token.
    /// Re-reads the auth token from env/config to pick up fresh credentials,
    /// and retries a few times with short backoff since the Gateway may be mid-restart.
    async fn try_reconnect(&self) -> Result<(), String> {
        let url = self.url.lock().await.clone();

        // Always read the token fresh — it may have been updated, and the stored
        // value might be None from an early auto-connect before the frontend
        // passed the correct token via gateway_connect.
        let token = Self::read_auth_token().or_else(|| {
            // Fall back to the last stored token if env/config has nothing
            // (block_on would deadlock, so we can't read `self.token` inside the
            // async fn; we'll clone it in a separate step instead)
            None
        });
        let token = match token {
            Some(t) => Some(t),
            None => self.token.lock().await.clone(),
        };

        println!("[gateway] Auto-reconnecting to {} (token: {})...", url,
            if token.is_some() { "present" } else { "none" });

        let delays_ms: &[u64] = &[0, 500, 1000, 2000];
        let mut last_err = String::new();
        for (attempt, &delay) in delays_ms.iter().enumerate() {
            if delay > 0 {
                tokio::time::sleep(std::time::Duration::from_millis(delay)).await;
            }
            match self.connect(&url, token.clone()).await {
                Ok(()) => {
                    if attempt > 0 {
                        println!("[gateway] Reconnected on attempt {}", attempt + 1);
                    }
                    return Ok(());
                }
                Err(e) => {
                    println!("[gateway] Reconnect attempt {} failed: {}", attempt + 1, e);
                    last_err = e;
                }
            }
        }
        Err(format!("Gateway reconnect failed: {}", last_err))
    }

    /// Read authentication token from environment variable or config file.
    /// Same logic as gateway_connect but available as a static method.
    fn read_auth_token() -> Option<String> {
        // 1. Check OPENCLAW_GATEWAY_TOKEN env var (set by dev.sh)
        if let Ok(env_token) = std::env::var("OPENCLAW_GATEWAY_TOKEN") {
            if !env_token.is_empty() {
                return Some(env_token);
            }
        }
        // 2. Fall back to ~/.openclaw/openclaw.json config
        let home = std::env::var("HOME").ok()?;
        let config_path = format!("{}/.openclaw/openclaw.json", home);
        let content = std::fs::read_to_string(config_path).ok()?;
        let config: serde_json::Value = serde_json::from_str(&content).ok()?;
        config.get("gateway")
            .and_then(|g| g.get("auth"))
            .and_then(|a| a.get("token"))
            .and_then(|t| t.as_str())
            .map(String::from)
    }

    /// Send a request to the Gateway and wait for the response.
    /// Auto-reconnects once if the connection was lost (e.g. Gateway restarted).
    pub async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        // First attempt
        match self.call_inner(method, params.clone()).await {
            Ok(val) => Ok(val),
            Err(e) if e.contains("channel closed")
                    || e.contains("Not connected")
                    || e.contains("WebSocket connection closed") =>
            {
                // Connection dropped — try reconnecting once
                println!("[gateway] Connection lost ({}), attempting reconnect...", e);
                self.try_reconnect().await?;
                // Retry call after reconnect
                self.call_inner(method, params).await
            }
            Err(e) => Err(e),
        }
    }

    /// Inner call implementation (no reconnect logic)
    async fn call_inner(&self, method: &str, params: Value) -> Result<Value, String> {
        let sender = self.sender.lock().await;
        let tx = sender.as_ref().ok_or("Not connected to Gateway")?;

        let id = uuid::Uuid::new_v4().to_string();

        let request = Self::build_request_frame(&id, method, params);

        // Register a oneshot channel to receive the response
        let (resp_tx, resp_rx) = oneshot::channel();
        self.pending.lock().await.insert(id.clone(), resp_tx);

        // Send the request
        tx.send(request.to_string())
            .map_err(|e| format!("Failed to send: {}", e))?;

        // Wait for response with timeout (120s for LLM responses)
        match tokio::time::timeout(std::time::Duration::from_secs(120), resp_rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => {
                self.pending.lock().await.remove(&id);
                Err("Response channel closed".to_string())
            }
            Err(_) => {
                self.pending.lock().await.remove(&id);
                Err("Request timed out (30s)".to_string())
            }
        }
    }

    /// Send a chat.send request and wait for the full streaming response.
    /// Unlike `call()` which only gets the initial ack, this method registers
    /// a collector for the runId and waits for the complete LLM response.
    pub async fn send_chat_and_wait(&self, params: Value) -> Result<String, String> {
        // The idempotencyKey becomes the runId
        let run_id = params.get("idempotencyKey")
            .and_then(|v| v.as_str())
            .ok_or("send_chat_and_wait requires idempotencyKey in params")?
            .to_string();

        // Register a collector BEFORE sending the request
        let (resp_tx, resp_rx) = oneshot::channel::<String>();
        {
            let mut collectors = self.chat_collectors.lock().await;
            collectors.insert(run_id.clone(), ChatCollector {
                buffer: String::new(),
                sender: Some(resp_tx),
            });
        }

        // Send the chat.send request (returns ack immediately)
        let ack = self.call("chat.send", params).await;
        if let Err(e) = &ack {
            // Clean up collector on send failure
            self.chat_collectors.lock().await.remove(&run_id);
            return Err(format!("chat.send failed: {}", e));
        }

        // Wait for the streaming response to complete (timeout: 120s)
        match tokio::time::timeout(std::time::Duration::from_secs(120), resp_rx).await {
            Ok(Ok(response)) => {
                if response.is_empty() {
                    Ok("(Agent produced no output)".to_string())
                } else {
                    Ok(response)
                }
            }
            Ok(Err(_)) => {
                self.chat_collectors.lock().await.remove(&run_id);
                Err("Chat response channel closed".to_string())
            }
            Err(_) => {
                self.chat_collectors.lock().await.remove(&run_id);
                Err("Chat response timed out (120s)".to_string())
            }
        }
    }

    /// Check if connected
    pub async fn is_connected(&self) -> bool {
        *self.connected.lock().await
    }

    /// Create a clone of this client that shares the same underlying connection.
    /// Used by the orchestrator background task.
    pub fn clone_for_task(&self) -> GatewayClient {
        GatewayClient {
            sender: self.sender.clone(),
            pending: self.pending.clone(),
            token: self.token.clone(),
            url: self.url.clone(),
            connected: self.connected.clone(),
            chat_collectors: self.chat_collectors.clone(),
        }
    }
}

// --- Tauri Commands for Gateway Connection ---

#[tauri::command]
pub async fn gateway_connect(
    url: Option<String>,
    token: Option<String>,
    state: tauri::State<'_, GatewayClient>,
) -> Result<bool, String> {
    let gateway_url = url.unwrap_or_else(|| "ws://127.0.0.1:18789".to_string());

    // Use explicitly provided token, or read from env/config
    let auth_token = token.or_else(GatewayClient::read_auth_token);

    println!("Connecting to Gateway at: {} (token: {})", gateway_url, 
        if auth_token.is_some() { "present" } else { "none" });
    match state.connect(&gateway_url, auth_token).await {
        Ok(()) => {
            println!("Gateway connected and handshake complete!");
            Ok(true)
        }
        Err(e) => {
            println!("Gateway connection failed: {}", e);
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn gateway_disconnect(
    state: tauri::State<'_, GatewayClient>,
) -> Result<String, String> {
    state.disconnect().await;
    Ok("Disconnected".to_string())
}

#[tauri::command]
pub async fn gateway_is_connected(
    state: tauri::State<'_, GatewayClient>,
) -> Result<bool, String> {
    Ok(state.is_connected().await)
}
