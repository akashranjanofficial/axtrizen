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

/// Shared Gateway client state managed by Tauri
pub struct GatewayClient {
    sender: Arc<Mutex<Option<mpsc::UnboundedSender<String>>>>,
    pending: PendingMap,
    token: Arc<Mutex<Option<String>>>,
    url: Arc<Mutex<String>>,
    connected: Arc<Mutex<bool>>,
}

impl Default for GatewayClient {
    fn default() -> Self {
        Self {
            sender: Arc::new(Mutex::new(None)),
            pending: Arc::new(Mutex::new(HashMap::new())),
            token: Arc::new(Mutex::new(None)),
            url: Arc::new(Mutex::new("ws://127.0.0.1:18789".to_string())),
            connected: Arc::new(Mutex::new(false)),
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
                                // Event frame: ignore for now (health, tick, etc.)
                                let event_name = frame.get("event").and_then(|v| v.as_str()).unwrap_or("unknown");
                                println!("[gateway] event: {}", event_name);
                            },
                            _ => {
                                println!("[gateway] unknown frame type: {}", frame_type);
                            }
                        }
                    }
                }
            }
            // Connection closed
            println!("[gateway] WebSocket connection closed");
            *connected_clone.lock().await = false;
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

    /// Send a request to the Gateway and wait for the response
    pub async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
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

        // Wait for response with timeout
        match tokio::time::timeout(std::time::Duration::from_secs(30), resp_rx).await {
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

    /// Check if connected
    pub async fn is_connected(&self) -> bool {
        *self.connected.lock().await
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

    // Try to read token: env var first, then config file
    let auth_token = token.or_else(|| {
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
    });

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
