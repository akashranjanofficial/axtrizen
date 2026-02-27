# Build & Deployment Guide

# Axtrizen AI Platform

**Version:** 1.0 | **Date:** 2026-02-26

---

## 1. Prerequisites

### System Requirements

| Requirement | Minimum                               | Recommended |
| ----------- | ------------------------------------- | ----------- |
| **OS**      | macOS 12+, Ubuntu 20.04+, Windows 10+ | macOS 14+   |
| **RAM**     | 4 GB                                  | 8 GB        |
| **Disk**    | 2 GB free                             | 5 GB free   |
| **CPU**     | 2 cores                               | 4+ cores    |

### Software Dependencies

| Tool         | Version | Purpose                                |
| ------------ | ------- | -------------------------------------- |
| **Rust**     | 1.75+   | Backend compilation                    |
| **Node.js**  | 18+     | Frontend build tooling                 |
| **pnpm**     | 8+      | Package manager                        |
| **OpenClaw** | Latest  | AI agent gateway (required at runtime) |

### Installation

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node.js (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 18

# Install pnpm
npm install -g pnpm

# Install OpenClaw (follow openclaw-core/README)
cd openclaw-core && npm install
```

---

## 2. Repository Structure

```
openclaw/
├── axtrizen-app/          # Tauri native app
│   └── src-tauri/
│       ├── src/           # Rust backend source
│       ├── Cargo.toml     # Rust dependencies
│       └── tauri.conf.json # Tauri configuration
├── axtrizenFrontEnd/      # React frontend
│   ├── src/               # TypeScript source
│   ├── package.json       # Node dependencies
│   └── vite.config.ts     # Vite build config
├── openclaw-core/         # AI gateway (git submodule)
├── documentation/         # This documentation
├── dev.sh                 # Development launcher script
└── pnpm-workspace.yaml    # Workspace config
```

---

## 3. Development Setup

### Quick Start

```bash
# 1. Clone repository
git clone https://github.com/akashranjanofficial/axtrizen.git
cd openclaw

# 2. Install all dependencies
pnpm install

# 3. Start everything (Gateway + Frontend + Tauri app)
./dev.sh
```

### What `dev.sh` Does

1. **Starts OpenClaw Gateway** on port 18789
2. **Launches Vite dev server** on port 5174 (hot-reload)
3. **Builds and starts Tauri** native app (Rust backend + WebView frontend)
4. Monitors all processes and handles graceful shutdown

### Manual Development (Without dev.sh)

```bash
# Terminal 1: Start OpenClaw Gateway
cd openclaw-core && node src/index.js

# Terminal 2: Start Vite frontend dev server
cd axtrizenFrontEnd && pnpm dev

# Terminal 3: Build and run Tauri backend
cd axtrizen-app && cargo tauri dev
```

### Environment Variables

| Variable                | Default                   | Description              |
| ----------------------- | ------------------------- | ------------------------ |
| `OPENCLAW_GATEWAY_PORT` | `18789`                   | Gateway WebSocket port   |
| `VITE_DEV_PORT`         | `5174`                    | Frontend dev server port |
| `AXTRIZEN_DB_PATH`      | `~/.axtrizen/axtrizen.db` | SQLite database path     |

---

## 4. Build Process

### Development Build

```bash
# Frontend only (fast iteration)
cd axtrizenFrontEnd && pnpm build

# Backend only (type checking)
cd axtrizen-app/src-tauri && cargo check

# Full Tauri dev build
cd axtrizen-app && cargo tauri dev
```

### Production Build

```bash
# Build production installer
cd axtrizen-app && cargo tauri build
```

**Output locations:**
| Platform | Output |
|----------|--------|
| macOS | `target/release/bundle/dmg/Axtrizen AI.dmg` |
| macOS | `target/release/bundle/macos/Axtrizen AI.app` |
| Linux | `target/release/bundle/deb/axtrizen-ai.deb` |
| Linux | `target/release/bundle/appimage/Axtrizen AI.AppImage` |
| Windows | `target/release/bundle/msi/Axtrizen AI.msi` |

### Build Performance

| Step                              | Duration (approx) |
| --------------------------------- | ----------------- |
| `cargo check`                     | ~2s (incremental) |
| `vite build`                      | ~2s               |
| `cargo tauri build` (first)       | ~5-10 min         |
| `cargo tauri build` (incremental) | ~30s              |

---

## 5. Database Management

### Location

```
~/.axtrizen/axtrizen.db
```

### Migrations

Migrations run automatically on app startup via `db::init_db()`. The `migrations` table tracks which versions have been applied.

### Backup

```bash
# Manual backup
cp ~/.axtrizen/axtrizen.db ~/.axtrizen/axtrizen_backup_$(date +%Y%m%d).db
```

### Reset

```bash
# Delete database (will recreate on next launch)
rm ~/.axtrizen/axtrizen.db
```

### Inspect

```bash
# Open SQLite CLI
sqlite3 ~/.axtrizen/axtrizen.db

# List tables
.tables

# View schema
.schema projects

# Count records
SELECT COUNT(*) FROM projects;
SELECT COUNT(*) FROM tasks;
```

---

## 6. Troubleshooting

### Common Issues

| Issue                      | Cause                  | Fix                                        |
| -------------------------- | ---------------------- | ------------------------------------------ |
| "Gateway not connected"    | OpenClaw not running   | Run `./dev.sh` or start Gateway manually   |
| "device identity required" | WebSocket auth failure | Check Gateway token in Settings            |
| Build fails at `rusqlite`  | Missing SQLite headers | Use `features = ["bundled"]` (already set) |
| Vite HMR not working       | Port conflict          | Kill process on port 5174                  |
| Tauri app blank screen     | Frontend not built     | Run `pnpm build` in axtrizenFrontEnd       |
| "Failed to initialize DB"  | Permission error       | Check `~/.axtrizen/` permissions           |

### Diagnostic Commands

```bash
# Check Gateway health
curl http://localhost:18789/health

# Check what's using ports
lsof -ti:5174
lsof -ti:18789

# View Tauri logs
RUST_LOG=debug cargo tauri dev

# Check database
sqlite3 ~/.axtrizen/axtrizen.db "SELECT name, status, phase FROM projects;"
```

---

## 7. Release Checklist

- [ ] All tests pass (`cargo test`, `pnpm test`, `pnpm test:e2e`)
- [ ] `cargo check` — no warnings
- [ ] `vite build` — no errors
- [ ] Version bumped in `Cargo.toml` + `package.json`
- [ ] CHANGELOG updated
- [ ] Database migrations backward-compatible
- [ ] Production build tested on all target platforms
- [ ] Screenshot/recording of new features
- [ ] Documentation updated
