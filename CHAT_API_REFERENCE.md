# OpenClaw Interactive Chat API Reference

OpenClaw uses a **WebSocket JSON-RPC 2.0** protocol. To build a custom chat interface, connect to the Gateway (default: `ws://127.0.0.1:18789`) and use the following methods.

## 1. Authentication (Gateway Token)

The **Gateway Token** is your API password.

- **Custom**: You can set it to anything you like (e.g., `--token custom-abc`).
- **Generated**: If you don't provide one during onboarding, OpenClaw creates a random one for you.

```json
{
  "jsonrpc": "2.0",
  "method": "chat.send",
  "params": {
    "auth": { "token": "YOUR_GATEWAY_TOKEN" },
    "...": "..."
  }
}
```

---

## 2. RPC Methods

### `chat.send`

Sends a message and starts an agent "run". This is **non-blocking**; it returns immediately and the results stream back via `chat` events.

**Parameters:**

- `sessionKey` (string): Usually `main` or `agent:<agentId>:<sessionId>`.
- `message` (string): The text message.
- `idempotencyKey` (string): A unique UUID for this run.
- `thinking` (string, optional): Extra context for the agent's internal model.

**Response:**

```json
{ "runId": "uuid-123", "status": "started" }
```

### `chat.history`

Fetches past messages for a specific session.

**Parameters:**

- `sessionKey` (string): The session to fetch.
- `limit` (number, optional): Max messages to return (default 200).

**Response:**

```json
{
  "sessionKey": "main",
  "messages": [
    { "role": "user", "content": "Hello", "timestamp": 1700000000 },
    { "role": "assistant", "content": "How can I help?", "timestamp": 1700000005 }
  ]
}
```

### `chat.abort`

Stops all active runs (or a specific run) for a session.

**Parameters:**

- `sessionKey` (string): Required.
- `runId` (string, optional): If provided, stops only this specific run.

---

## 3. Real-Time Events (Server-to-Client)

The Gateway pushes these to any connected client via the `chat` event method.

### `chat` event

Streamed updates throughout an agent's run.

**Payload Structure:**

- `runId`: Matches your `idempotencyKey`.
- `state`:
  - `"started"`: The agent is calculating.
  - `"delta"`: A chunk of text is arriving (streaming).
  - `"final"`: The agent has finished and the final message is ready.
  - `"error"`: Something went wrong.
- `message`: Use this when `state` is `"final"`.
- `errorMessage`: Use this when `state` is `"error"`.

**Example Event:**

```json
{
  "method": "chat",
  "params": {
    "runId": "id-123",
    "state": "final",
    "message": {
      "role": "assistant",
      "content": [{ "type": "text", "text": "I have finished the task." }]
    }
  }
}
```
