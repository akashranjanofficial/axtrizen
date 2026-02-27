// Maple Bridge commands — Tauri IPC wrappers for the P2P communication layer.
//
// These commands let the frontend start/stop the Maple broker, connect
// agents, publish messages, and manage LIM links — all through the
// standard Tauri invoke() interface.

use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{Emitter, State};
use tokio::sync::Mutex;

use crate::maple_bridge::{MapleBridgeClient, MapleBridgeConfig};

/// Managed state for the Maple bridge sidecar.
pub struct MapleBridgeState {
    pub client: Mutex<Option<Arc<MapleBridgeClient>>>,
}

impl Default for MapleBridgeState {
    fn default() -> Self {
        Self {
            client: Mutex::new(None),
        }
    }
}

/// Start the Maple P2P broker sidecar.
#[tauri::command]
pub async fn maple_broker_start(
    broker_type: Option<String>,
    nats_url: Option<String>,
    require_links: Option<bool>,
    state: State<'_, MapleBridgeState>,
    app_handle: tauri::AppHandle,
) -> Result<Value, String> {
    let config = MapleBridgeConfig {
        broker_type: broker_type.unwrap_or_else(|| "memory".into()),
        nats_url,
        require_links: require_links.unwrap_or(false),
    };

    let (client, mut event_rx) = MapleBridgeClient::spawn(config).await?;
    let client = Arc::new(client);

    // Store the client
    {
        let mut guard = state.client.lock().await;
        *guard = Some(client.clone());
    }

    // Spawn a task that forwards Maple events to the frontend via Tauri events
    let handle = app_handle.clone();
    tokio::spawn(async move {
        while let Some(event) = event_rx.recv().await {
            let _ = handle.emit("maple-event", json!({
                "agentId": event.agent_id,
                "type": event.event_type,
                "message": event.message,
            }));
        }
    });

    Ok(json!({"status": "ok"}))
}

/// Stop the Maple broker and all connected agents.
#[tauri::command]
pub async fn maple_broker_stop(
    state: State<'_, MapleBridgeState>,
) -> Result<Value, String> {
    let mut guard = state.client.lock().await;
    if let Some(client) = guard.take() {
        client.shutdown().await?;
    }
    Ok(json!({"status": "ok"}))
}

/// Get the Maple broker status.
#[tauri::command]
pub async fn maple_broker_status(
    state: State<'_, MapleBridgeState>,
) -> Result<Value, String> {
    let guard = state.client.lock().await;
    match &*guard {
        Some(client) => client.status().await,
        None => Ok(json!({"brokerActive": false, "connectedAgents": [], "agentCount": 0})),
    }
}

/// Connect an agent to the Maple broker for P2P communication.
#[tauri::command]
pub async fn maple_agent_connect(
    agent_id: String,
    team_id: String,
    role: Option<String>,
    state: State<'_, MapleBridgeState>,
) -> Result<Value, String> {
    let guard = state.client.lock().await;
    let client = guard.as_ref().ok_or("Maple broker not started")?;
    client.connect_agent(&agent_id, &team_id, &role.unwrap_or_else(|| "developer".into())).await
}

/// Disconnect an agent from the Maple broker.
#[tauri::command]
pub async fn maple_agent_disconnect(
    agent_id: String,
    state: State<'_, MapleBridgeState>,
) -> Result<Value, String> {
    let guard = state.client.lock().await;
    let client = guard.as_ref().ok_or("Maple broker not started")?;
    client.disconnect_agent(&agent_id).await
}

/// Publish a P2P message from an agent.
#[tauri::command]
pub async fn maple_agent_publish(
    agent_id: String,
    msg_type: String,
    payload: Value,
    receiver_id: Option<String>,
    channel: Option<String>,
    state: State<'_, MapleBridgeState>,
) -> Result<Value, String> {
    let guard = state.client.lock().await;
    let client = guard.as_ref().ok_or("Maple broker not started")?;
    client.publish(
        &agent_id,
        &msg_type,
        payload,
        receiver_id.as_deref(),
        channel.as_deref(),
    ).await
}

/// Have a worker agent claim a task.
#[tauri::command]
pub async fn maple_claim_task(
    agent_id: String,
    task_id: String,
    manager_id: String,
    state: State<'_, MapleBridgeState>,
) -> Result<Value, String> {
    let guard = state.client.lock().await;
    let client = guard.as_ref().ok_or("Maple broker not started")?;
    client.claim_task(&agent_id, &task_id, &manager_id).await
}

/// Initiate a LIM link for secure code review.
#[tauri::command]
pub async fn maple_lim_initiate(
    agent_id: String,
    reviewer_id: String,
    state: State<'_, MapleBridgeState>,
) -> Result<Value, String> {
    let guard = state.client.lock().await;
    let client = guard.as_ref().ok_or("Maple broker not started")?;
    let link_id = client.initiate_review_link(&agent_id, &reviewer_id).await?;
    Ok(json!({"linkId": link_id}))
}

/// Terminate a LIM link.
#[tauri::command]
pub async fn maple_lim_terminate(
    agent_id: String,
    link_id: String,
    state: State<'_, MapleBridgeState>,
) -> Result<Value, String> {
    let guard = state.client.lock().await;
    let client = guard.as_ref().ok_or("Maple broker not started")?;
    client.terminate_link(&agent_id, &link_id).await
}
