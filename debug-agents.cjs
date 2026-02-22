const WebSocket = require("ws");
const ws = new WebSocket("ws://127.0.0.1:18789");

function send(method, params, id) {
  ws.send(
    JSON.stringify({
      type: "req",
      id: id.toString(),
      method: method,
      params: params || {},
    }),
  );
}

ws.on("open", () => {
  console.log("Connected to Gateway");
  // Handshake
  send(
    "connect",
    {
      minProtocol: 3,
      maxProtocol: 3,
      client: { id: "gateway-client", version: "0.1.0", platform: "darwin", mode: "backend" },
      auth: { token: "dev-token" },
    },
    1,
  );
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === "res" && msg.id === "1") {
    console.log("Handshake OK");
    // List agents
    send("agents.list", {}, 2);
  }

  if (msg.type === "res" && msg.id === "2") {
    console.log("--- AGENTS LIST RAW ---");
    console.log(JSON.stringify(msg, null, 2));

    // Try to delete "aside" if it exists
    const result = msg.payload || {};
    const agents = result.agents || [];
    const aside = agents.find((a) => a.name === "Aside" || a.id === "aside" || a.name === "aside");

    if (aside) {
      console.log(`Found agent: ${aside.name} (${aside.id})`);
      console.log("Attempting to delete...");
      send("agents.delete", { agentId: aside.id, deleteFiles: true }, 3);
    } else {
      console.log('Agent "Aside" not found in list.');
      process.exit(0);
    }
  }

  if (msg.type === "res" && msg.id === "3") {
    console.log("--- DELETE RESULT ---");
    if (msg.error) {
      console.error("Delete failed:", msg.error);
    } else {
      console.log("Delete success:", msg.result);
    }
    ws.close();
  }
});
