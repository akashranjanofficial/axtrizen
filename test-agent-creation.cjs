#!/usr/bin/env node
/**
 * test-agent-creation.js — End-to-end test for OpenClaw Gateway agent CRUD
 *
 * Tests the full lifecycle: connect → list → create → list → delete → list
 * Uses the same protocol the Axtrizen Rust backend uses.
 *
 * Usage:
 *   # Start Gateway first (or let the script start it):
 *   OPENCLAW_GATEWAY_TOKEN=dev-token openclaw gateway --allow-unconfigured --dev --token dev-token &
 *
 *   # Run tests:
 *   node test-agent-creation.js
 *
 *   # Or with custom URL/token:
 *   GATEWAY_URL=ws://127.0.0.1:18789 GATEWAY_TOKEN=my-token node test-agent-creation.js
 */

const WebSocket = require("ws");
const crypto = require("crypto");
const { spawn, execSync } = require("child_process");
const os = require("os");
const path = require("path");

// ─── Config ───────────────────────────────────────────────────────────────────
const GATEWAY_URL = process.env.GATEWAY_URL || "ws://127.0.0.1:18789";
const GATEWAY_TOKEN =
  process.env.GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN || "dev-token";
const PROTOCOL_VERSION = 3;
const TEST_AGENT_NAME = `test-agent-${Date.now()}`;
const TEST_WORKSPACE = path.join(os.tmpdir(), `openclaw-test-${Date.now()}`);
const TIMEOUT_MS = 10000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
let ws = null;
let gatewayProcess = null;

const pending = new Map();

function uid() {
  return crypto.randomUUID();
}

function log(icon, msg) {
  console.log(`  ${icon} ${msg}`);
}

function send(frame) {
  ws.send(JSON.stringify(frame));
}

function request(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = uid();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout waiting for response to ${method} (${TIMEOUT_MS}ms)`));
    }, TIMEOUT_MS);

    pending.set(id, { resolve, reject, timer });
    send({ type: "req", id, method, params });
  });
}

function handleMessage(data) {
  let frame;
  try {
    frame = JSON.parse(data.toString());
  } catch {
    return;
  }

  if (frame.type === "res" && frame.id && pending.has(frame.id)) {
    const { resolve, reject, timer } = pending.get(frame.id);
    clearTimeout(timer);
    pending.delete(frame.id);

    if (frame.ok) {
      resolve(frame.payload || null);
    } else {
      const errMsg = frame.error?.message || "Unknown error";
      reject(new Error(`${errMsg} (code: ${frame.error?.code || "?"})`));
    }
  }
  // Ignore events (health, tick, etc.)
}

async function assert(name, fn) {
  try {
    await fn();
    passed++;
    log("✅", name);
  } catch (err) {
    failed++;
    log("❌", `${name} — ${err.message}`);
  }
}

// ─── Gateway Management ──────────────────────────────────────────────────────

function isGatewayRunning() {
  try {
    execSync("lsof -ti:18789", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function ensureGateway() {
  if (isGatewayRunning()) {
    log("🌐", "Gateway already running on port 18789");
    return;
  }

  // Prefer locally built openclaw.mjs (has agents.create) over installed binary
  const fs = require("fs");
  const localBuild = path.join(__dirname, "openclaw.mjs");
  const useLocal = fs.existsSync(localBuild);
  const cmd = useLocal ? process.execPath : "openclaw";
  const args = useLocal
    ? [localBuild, "gateway", "--allow-unconfigured", "--dev", "--token", GATEWAY_TOKEN]
    : ["gateway", "--allow-unconfigured", "--dev", "--token", GATEWAY_TOKEN];

  log("🌐", `Starting Gateway${useLocal ? " (local build)" : " (installed)"}...`);
  gatewayProcess = spawn(cmd, args, {
    stdio: "pipe",
    env: { ...process.env, OPENCLAW_GATEWAY_TOKEN: GATEWAY_TOKEN },
  });

  gatewayProcess.stderr.on("data", (d) => {
    const msg = d.toString().trim();
    if (msg) {
      log("  ", `[gw] ${msg}`);
    }
  });

  // Wait for it to be ready
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (isGatewayRunning()) {
      log("🌐", "Gateway started successfully");
      return;
    }
  }
  throw new Error("Gateway failed to start within 30s");
}

// ─── Connect ──────────────────────────────────────────────────────────────────

function connectWebSocket() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(GATEWAY_URL);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("WebSocket connection timed out"));
    }, TIMEOUT_MS);

    socket.on("open", () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function performHandshake() {
  const id = uid();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Connect handshake timed out"));
    }, TIMEOUT_MS);

    pending.set(id, {
      resolve: (payload) => {
        clearTimeout(timer);
        resolve(payload);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
      timer,
    });

    send({
      type: "req",
      id,
      method: "connect",
      params: {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client: {
          id: "gateway-client",
          displayName: "Axtrizen Test Runner",
          version: "0.1.0",
          platform: process.platform,
          mode: "backend",
        },
        role: "operator",
        scopes: ["operator.admin"],
        auth: { token: GATEWAY_TOKEN },
      },
    });
  });
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

async function run() {
  console.log("\n🧪 OpenClaw Agent Creation Test Suite\n");
  console.log(`   Gateway: ${GATEWAY_URL}`);
  console.log(`   Token:   ${GATEWAY_TOKEN.substring(0, 4)}...`);
  console.log(`   Agent:   ${TEST_AGENT_NAME}`);
  console.log(`   Workspace: ${TEST_WORKSPACE}\n`);
  console.log("───────────────────────────────────────\n");

  // 0. Ensure Gateway is running
  await ensureGateway();

  // 1. WebSocket connect
  let connectPayload;
  await assert("WebSocket connects to Gateway", async () => {
    ws = await connectWebSocket();
    ws.on("message", handleMessage);
  });

  // 2. Protocol handshake
  await assert("Connect handshake succeeds (protocol v3)", async () => {
    connectPayload = await performHandshake();
    if (!connectPayload) {
      throw new Error("No payload in connect response");
    }
  });

  await assert("Server reports version and features", async () => {
    if (!connectPayload.server) {
      throw new Error("Missing server info");
    }
    if (!connectPayload.features) {
      throw new Error("Missing features");
    }
    log(
      "  ",
      `Server: v${connectPayload.server.version} (${connectPayload.server.host || "localhost"})`,
    );
    log("  ", `Methods: ${connectPayload.features.methods.length} available`);
    const agentMethods = connectPayload.features.methods.filter(
      (m) => m.startsWith("agents.") || m.startsWith("agent."),
    );
    log("  ", `Agent methods: ${agentMethods.join(", ") || "NONE"}`);
  });

  // 3. List agents (baseline)
  let initialAgents;
  await assert("agents.list returns initial agent list", async () => {
    const result = await request("agents.list", {});
    if (!result.agents) {
      throw new Error("Missing agents array");
    }
    if (!Array.isArray(result.agents)) {
      throw new Error("agents is not an array");
    }
    initialAgents = result.agents;
    log("  ", `Found ${initialAgents.length} existing agent(s)`);
  });

  // 4. Create agent
  let createdAgent;
  await assert("agents.create creates a new agent", async () => {
    const result = await request("agents.create", {
      name: TEST_AGENT_NAME,
      workspace: TEST_WORKSPACE,
      agentType: "manager",
    });
    if (!result.ok) {
      throw new Error("Response ok !== true");
    }
    if (!result.agentId) {
      throw new Error("Missing agentId in response");
    }
    if (!result.name) {
      throw new Error("Missing name in response");
    }
    if (!result.workspace) {
      throw new Error("Missing workspace in response");
    }
    createdAgent = result;
    log("  ", `Created: id="${result.agentId}" name="${result.name}"`);
    log("  ", `Workspace: ${result.workspace}`);
  });

  // 5. List agents (should include new agent)
  await assert("agents.list includes newly created agent", async () => {
    const result = await request("agents.list", {});
    const found = result.agents.find((a) => a.id === createdAgent.agentId);
    if (!found) {
      throw new Error(`Agent "${createdAgent.agentId}" not found in list`);
    }
    log("  ", `Verified: agent "${found.id}" is in the list`);
  });

  // 6. Create duplicate (should fail)
  await assert("agents.create rejects duplicate name", async () => {
    try {
      await request("agents.create", {
        name: TEST_AGENT_NAME,
        workspace: TEST_WORKSPACE,
      });
      throw new Error("Should have thrown an error for duplicate");
    } catch (err) {
      if (err.message.includes("already exists")) {
        log("  ", `Correctly rejected: ${err.message}`);
      } else {
        throw err;
      }
    }
  });

  // 7. Delete agent
  await assert("agents.delete removes the agent", async () => {
    const result = await request("agents.delete", {
      agentId: createdAgent.agentId,
      deleteFiles: true,
    });
    if (!result.ok) {
      throw new Error("Response ok !== true");
    }
    log("  ", `Deleted: id="${result.agentId}"`);
  });

  // 8. List agents (should be back to initial)
  await assert("agents.list no longer includes deleted agent", async () => {
    const result = await request("agents.list", {});
    const found = result.agents.find((a) => a.id === createdAgent.agentId);
    if (found) {
      throw new Error(`Agent "${createdAgent.agentId}" still in list after deletion`);
    }
    log("  ", `Verified: agent removed, ${result.agents.length} agent(s) remaining`);
  });

  // 9. Delete non-existent (should fail)
  await assert("agents.delete rejects non-existent agent", async () => {
    try {
      await request("agents.delete", {
        agentId: "non-existent-agent-12345",
      });
      throw new Error("Should have thrown an error");
    } catch (err) {
      if (
        err.message.toLowerCase().includes("not found") ||
        err.message.toLowerCase().includes("does not exist") ||
        err.message.toLowerCase().includes("no agent")
      ) {
        log("  ", `Correctly rejected: ${err.message}`);
      } else {
        throw err;
      }
    }
  });

  // Done
  console.log("\n───────────────────────────────────────");
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  // Cleanup
  if (ws) {
    ws.close();
  }
  if (gatewayProcess) {
    gatewayProcess.kill("SIGTERM");
    log("🧹", "Stopped test Gateway");
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("\n💥 Fatal error:", err.message);
  if (ws) {
    ws.close();
  }
  if (gatewayProcess) {
    gatewayProcess.kill("SIGTERM");
  }
  process.exit(2);
});
