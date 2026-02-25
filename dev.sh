#!/bin/bash

# Cleanup function to kill all child processes on exit
cleanup() {
  echo ""
  echo "🛑 Shutting down..."
  # Kill OpenClaw Gateway if we started it
  if [ -n "$OPENCLAW_PID" ]; then
    kill $OPENCLAW_PID 2>/dev/null
    echo "   Stopped OpenClaw Gateway (PID $OPENCLAW_PID)"
  fi
  # Kill any remaining child processes
  killall -9 axtrizen-app 2>/dev/null
  lsof -ti:5174 | xargs kill -9 2>/dev/null
  echo "✅ Cleanup complete"
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Kill any existing processes (forcefully)
echo "🧹 Cleaning up old processes..."

# 1. Stop supervised OpenClaw Gateway daemon if running
echo "   Checking for supervised gateway daemons..."
./openclaw.mjs gateway stop 2>/dev/null || true
launchctl bootout gui/$UID/ai.openclaw.gateway 2>/dev/null || true

# 2. Kill remaining lingering processes
killall -9 axtrizen-app node 2>/dev/null || true
lsof -ti:5174 | xargs kill -9 2>/dev/null || true
lsof -ti:18789 | xargs kill -9 2>/dev/null || true
lsof -ti:8000 | xargs kill -9 2>/dev/null || true

# 3. Clean up lockfiles 
rm -f ~/.axtrizen/gateway.lock 2>/dev/null

# Gateway auth token (shared between Gateway and Rust backend)
export OPENCLAW_GATEWAY_TOKEN="dev-token"

# Start OpenClaw Gateway in background
# Use locally built openclaw.mjs (has agents.create) instead of installed binary
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/openclaw.mjs" ]; then
  echo "🌐 Starting OpenClaw Gateway (local build)..."
  node "$SCRIPT_DIR/openclaw.mjs" gateway --allow-unconfigured --dev --token "$OPENCLAW_GATEWAY_TOKEN" &
else
  echo "🌐 Starting OpenClaw Gateway (installed)..."
  echo "⚠️  Using installed openclaw binary. Run 'npm run build' first for full agent support."
  openclaw gateway --allow-unconfigured --dev --token "$OPENCLAW_GATEWAY_TOKEN" &
fi
OPENCLAW_PID=$!

# Wait for Gateway to be ready (check port 18789)
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

# Start Tauri Dev (Frontend will be started automatically by beforeDevCommand)
echo "🚀 Starting App..."
cd axtrizen-app/src-tauri
../../axtrizenFrontEnd/node_modules/.bin/tauri dev
