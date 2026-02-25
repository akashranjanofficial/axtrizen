#!/bin/bash

# ══════════════════════════════════════════════════════════════════════
#  Axtrizen Dev — One command to run everything
#  Usage: ./dev.sh
# ══════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OC_DIR="$SCRIPT_DIR/openclaw-core"

# ── Cleanup on exit ─────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "🛑 Shutting down..."
  if [ -n "$OPENCLAW_PID" ]; then
    kill $OPENCLAW_PID 2>/dev/null
    echo "   Stopped OpenClaw Gateway (PID $OPENCLAW_PID)"
  fi
  killall -9 axtrizen-app 2>/dev/null || true
  lsof -ti:5174 | xargs kill -9 2>/dev/null || true
  echo "✅ Cleanup complete"
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# ── 1. Kill old processes ───────────────────────────────────────────
echo "🧹 Cleaning up old processes..."
if [ -f "$OC_DIR/openclaw.mjs" ]; then
  node "$OC_DIR/openclaw.mjs" gateway stop 2>/dev/null || true
fi
launchctl bootout gui/$UID/ai.openclaw.gateway 2>/dev/null || true
killall -9 axtrizen-app node 2>/dev/null || true
lsof -ti:5174 | xargs kill -9 2>/dev/null || true
lsof -ti:18789 | xargs kill -9 2>/dev/null || true
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
rm -f ~/.axtrizen/gateway.lock 2>/dev/null

# ── 2. Init submodule (first clone) ────────────────────────────────
if [ ! -f "$OC_DIR/package.json" ]; then
  echo "📦 Initializing openclaw-core submodule..."
  git submodule update --init --recursive
fi

# ── 3. Install OpenClaw dependencies ───────────────────────────────
if [ ! -d "$OC_DIR/node_modules" ]; then
  echo "📥 Installing OpenClaw dependencies..."
  cd "$OC_DIR" && pnpm install && cd "$SCRIPT_DIR"
fi

# ── 4. Build OpenClaw (if dist missing) ────────────────────────────
if [ ! -f "$OC_DIR/dist/entry.js" ]; then
  echo "🔨 Building OpenClaw core..."
  cd "$OC_DIR" && npm run build && cd "$SCRIPT_DIR"
fi

# ── 5. Install frontend dependencies ──────────────────────────────
if [ ! -d "$SCRIPT_DIR/axtrizenFrontEnd/node_modules" ]; then
  echo "📥 Installing frontend dependencies..."
  cd "$SCRIPT_DIR/axtrizenFrontEnd" && npm install && cd "$SCRIPT_DIR"
fi

# ── 6. Start OpenClaw Gateway ──────────────────────────────────────
export OPENCLAW_GATEWAY_TOKEN="dev-token"

echo "🌐 Starting OpenClaw Gateway..."
node "$OC_DIR/openclaw.mjs" gateway --allow-unconfigured --dev --token "$OPENCLAW_GATEWAY_TOKEN" &
OPENCLAW_PID=$!

echo "⏳ Waiting for Gateway to be ready..."
for i in $(seq 1 30); do
  if lsof -ti:18789 >/dev/null 2>&1; then
    echo "✅ Gateway is ready on port 18789!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "⚠️  Gateway might not be ready yet (waited 30s), proceeding anyway..."
  fi
  sleep 1
done

# ── 7. Start Tauri App ─────────────────────────────────────────────
echo "🚀 Starting Axtrizen App..."
cd axtrizen-app/src-tauri
../../axtrizenFrontEnd/node_modules/.bin/tauri dev
