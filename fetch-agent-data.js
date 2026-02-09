/**
 * OpenClaw Real-Time Data Fetcher Example
 * Demonstrates how to connect to the Gateway and fetch agent/usage data.
 */

const WebSocket = require("ws"); // In a browser, use the native WebSocket class

const GATEWAY_URL = "ws://127.0.0.1:18789";
const AUTH_TOKEN = ""; // Add your gateway token if configured

const ws = new WebSocket(GATEWAY_URL);

// helper to send JSON-RPC requests
function sendRequest(method, params = {}) {
  const id = Math.floor(Math.random() * 1000000);
  const request = {
    jsonrpc: "2.0",
    id,
    method,
    params: {
      ...params,
      ...(AUTH_TOKEN ? { auth: { token: AUTH_TOKEN } } : {}),
    },
  };
  ws.send(JSON.stringify(request));
  return id;
}

ws.on("open", () => {
  echo("✅ Connected to OpenClaw Gateway");

  // 1. Fetch Agents List
  sendRequest("agents.list");

  // 2. Fetch Usage/Token Status (last 30 days)
  sendRequest("usage.cost", { days: 30 });

  // 3. Fetch System Health
  sendRequest("last-heartbeat");
});

ws.on("message", (data) => {
  const message = JSON.parse(data);

  // Handle RPC Responses
  if (message.id) {
    if (message.error) {
      console.error(`❌ Error [${message.id}]:`, message.error);
    } else {
      console.log(`📩 Response [${message.id}]:`, JSON.stringify(message.result, null, 2));
    }
  }

  // Handle Real-Time Events (Pushes)
  else if (message.method) {
    console.log(`🔔 Event [${message.method}]:`, message.params);
  }
});

ws.on("error", (err) => console.error("Connection error:", err));
ws.on("close", () => console.log("Disconnected from Gateway"));

function echo(msg) {
  console.log(`\n--- ${msg} ---`);
}
