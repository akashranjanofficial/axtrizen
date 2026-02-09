# OpenClaw App Integration Guide (Full API)

This guide documents the major categories of RPC methods available in the OpenClaw Gateway. Use these to build your own dashboard, bot manager, or analytics tool.

**Connection Endpoint**: `ws://<host>:18789`
**Protocol**: JSON-RPC 2.0

---

## 0. Authentication (Gateway Token)

The **Gateway Token** acts as an API Key. You have two options for this token:

1.  **Custom**: You can choose anything (e.g., `my-app-123`).
2.  **Generated**: If you leave it blank during `openclaw onboard`, the wizard will generate a strong random token for you.

### How to set the Token:

1.  **CLI Flag**: Start the gateway with a specific token:
    ```bash
    node openclaw.mjs gateway run --token MY_SECRET_TOKEN
    ```
2.  **Config File**: Add it to your `~/.openclaw/openclaw.json`:
    ```json
    {
      "gateway": {
        "auth": { "mode": "token", "token": "YOUR_SECRET_TOKEN" }
      }
    }
    ```
3.  **Environment Variable**:
    ```bash
    export OPENCLAW_GATEWAY_TOKEN=my-secret-token
    ```

### How to use it in API calls:

Include the token in the `auth` object within your JSON-RPC `params`:

```json
{
  "jsonrpc": "2.0",
  "method": "agents.list",
  "params": {
    "auth": { "token": "YOUR_SECRET_TOKEN" }
  }
}
```

---

## 1. Agent Management (`agents.ts`)

Control who the agents are and where their data lives.

- **`agents.list`**: Returns all agents, IDs, and workspace paths.
- **`agents.create`**: Programmatically add a new agent.
  - _Params_: `name`, `workspace`, `model`, `emoji`.
- **`agents.update`**: Change an agent's model, name, or avatar.
- **`agents.delete`**: Remove an agent (optionally delete their files).
- **`agents.files.list`**: List the key files (instructions, memory, tools) for an agent.
- **`agents.files.get` / `agents.files.set`**: Read or write the contents of an agent's instructions (e.g., update `SOUL.md` from your app).

---

## 2. Usage & Analytics (`usage.ts`)

Track costs and performance across your system.

- **`usage.cost`**: Get token counts and USD costs across a date range.
  - _Params_: `days` (e.g., 30) or `startDate`/`endDate`.
- **`sessions.usage`**: Deep dive into which specific sessions/users are consuming the most tokens.
- **`usage.status`**: Check the current balance/status of your model providers (OpenAI, Anthropic, etc.).

---

## 3. Channel & Connection Control (`channels.ts`)

Manage your bridges to WhatsApp, Telegram, etc.

- **`channels.status`**: Get a list of all accounts and whether they are `connected` or `disconnected`.
- **`web.login.qr`**: If a channel (like WhatsApp) needs a login, this returns the QR code string to render in your app.
- **`channels.restart`**: Force-restart a specific channel bridge.

---

## 4. System Health & Presence (`system.ts`, `health.ts`)

Monitor the "heartbeat" of your server.

- **`health`**: Returns a snapshot of memory usage, CPU load, and gateway version.
- **`last-heartbeat`**: The timestamp of the last successful communication with the agent core.
- **`system-presence`**: Shows which "Nodes" (phones, tablets, CLI instances) are currently active and paired with the gateway.

---

## 5. Automation & Cron (`cron.ts`)

Manage scheduled tasks.

- **`cron.list`**: List all active schedules.
- **`cron.add` / `cron.remove`**: Create new automated tasks (e.g., "Tell my agent to check my email every hour").
- **`cron.history`**: See when jobs last ran and if they succeeded.

---

## 6. Skills & Permissions (`skills.ts`, `exec-approvals.ts`)

Manage what the agents are allowed to do.

- **`skills.list`**: See every tool available (Web Search, Python Exec, etc.).
- **`skills.toggle`**: Enable or disable a skill for the whole gateway.
- **`exec.approvals.list`**: List any "pending" actions waiting for your approval.
- **`exec.approvals.approve`**: Remotely approve a command the agent wants to run.

---

## Core Protocol Example (Node.js/Browser)

```javascript
// Example: Fetching the list of agents
const request = {
  jsonrpc: "2.0",
  id: 1,
  method: "agents.list",
  params: {
    auth: { token: "YOUR_TOKEN" },
  },
};
socket.send(JSON.stringify(request));
```
