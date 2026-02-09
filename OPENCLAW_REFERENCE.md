# OpenClaw Reference Guide

OpenClaw is a multi-channel AI gateway designed to host and manage AI agents locally. It connects various LLMs (Claude, GPT, Gemini, Ollama) to multiple messaging platforms (WhatsApp, Telegram, Discord, etc.).

---

## 🚀 Core Features

- **Multi-Agent Architecture**: Run multiple specialized agents (e.g., Coding, Research, Support) concurrently.
- **Multi-Channel Integration**: Communicate with agents via Telegram, WhatsApp, Discord, Slack, Lark, and more.
- **Extensible Skills**: Add tools and capabilities to agents through a plugin-like skill system.
- **Self-Hosted & Private**: Complete control over your data and agent personalities.
- **Onboarding Wizard**: Easy step-by-step setup for non-technical users.
- **Control UI**: A built-in dashboard for monitoring and configuration.

---

## 🛠 Command Reference

### **General Commands**

| Command              | Description                                          |
| :------------------- | :--------------------------------------------------- |
| `openclaw help`      | Show help info for all commands.                     |
| `openclaw onboard`   | Start the interactive onboarding wizard.             |
| `openclaw health`    | Check the system health and connectivity.            |
| `openclaw status`    | Display the status of the gateway and active agents. |
| `openclaw dashboard` | Open the web-based Control UI.                       |
| `openclaw version`   | Show the installed version.                          |

### **Agent Management**

| Command                       | Description                                 |
| :---------------------------- | :------------------------------------------ |
| `openclaw agents add`         | Add a new agent (interactive or via flags). |
| `openclaw agents list`        | List all configured agents.                 |
| `openclaw agents delete <id>` | Remove an agent and its configuration.      |
| `openclaw agents status <id>` | Show detailed status for a specific agent.  |

### **Channel Management**

| Command                         | Description                                  |
| :------------------------------ | :------------------------------------------- |
| `openclaw channels login`       | Connect to a new messaging platform account. |
| `openclaw channels list`        | List all connected channel accounts.         |
| `openclaw channels remove <id>` | Disconnect/Remove a channel account.         |
| `openclaw channels status`      | Check the status of all active connections.  |

### **Gateway Commands**

| Command                   | Description                          |
| :------------------------ | :----------------------------------- |
| `openclaw gateway start`  | Start the OpenClaw gateway service.  |
| `openclaw gateway stop`   | Stop the gateway service.            |
| `openclaw gateway status` | Check if the gateway is running.     |
| `openclaw gateway logs`   | View the gateway logs for debugging. |

### **Model & Auth**

| Command                | Description                                      |
| :--------------------- | :----------------------------------------------- |
| `openclaw models auth` | Configure API keys for LLM providers.            |
| `openclaw models list` | List available models from configured providers. |

---

## 🔌 Supported Connections (Channels)

OpenClaw supports a wide range of messaging platforms:

- **WhatsApp**: Via QR code linking.
- **Telegram**: Via Bot Token or User Account (MTProto).
- **Discord**: Via Bot Token.
- **Slack**: Via App Token.
- **Signal**: Via Signal CLI integration.
- **Lark / Feishu**: Via App credentials.
- **Line**: Via Messaging API.

---

## 👨‍💻 Development Scripts (pnpm)

If you are running from source, these scripts are useful:

- `pnpm install`: Install dependencies.
- `pnpm build`: Build the project from TypeScript to JavaScript.
- `pnpm dev`: Run the gateway in development mode.
- `pnpm gateway:watch`: Run gateway with hot-reload.
- `pnpm lint`: Run code quality checks.
- `pnpm test`: Execute the test suite.

---

## 📂 Key File Locations

- **Main Config**: `~/.openclaw/openclaw.json`
- **Agent Workspaces**: `~/.openclaw/workspaces/`
- **Agent Souls**: `~/.openclaw/workspaces/<agentId>/SOUL.md`
- **Logs**: `/tmp/openclaw/`
