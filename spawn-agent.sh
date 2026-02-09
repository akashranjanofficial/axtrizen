#!/bin/bash

# OpenClaw Smart Multi-Agent Script
# Automatically detects if a gateway is already set up and either:
# 1. Starts initial onboarding (first run)
# 2. Adds a new agent to the existing gateway (subsequent runs)

PROJECT_DIR="/Users/akashranjan/Desktop/openclaw"
AGENT_NAME=$1
CONFIG_FILE="$HOME/.openclaw/openclaw.json"

if [ -z "$AGENT_NAME" ]; then
  echo "Usage: ./spawn-agent.sh <agent_name>"
  echo "Example: ./spawn-agent.sh my-new-agent"
  exit 1
fi

cd "$PROJECT_DIR"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "----------------------------------------------------------"
  echo "🌟 First-time Setup Detected"
  echo "Initiating OpenClaw Onboarding Wizard..."
  echo "----------------------------------------------------------"
  node openclaw.mjs onboard
else
  echo "----------------------------------------------------------"
  echo "🦞 Existing Gateway Detected"
  echo "Adding new isolated agent: $AGENT_NAME"
  echo "----------------------------------------------------------"
  node openclaw.mjs agents add "$AGENT_NAME"
fi

# Fetch the token so the user has it ready for their app
TOKEN=$(node openclaw.mjs config get gateway.auth.token 2>/dev/null | grep -v "lobster" | tr -d '"' | tr -d ' ')

echo ""
echo "----------------------------------------------------------"
echo "✅ Process finished for $AGENT_NAME."
if [ ! -z "$TOKEN" ]; then
  echo "🔑 YOUR GATEWAY TOKEN: $TOKEN"
  echo "   (Use this in your app to talk to $AGENT_NAME)"
fi
echo "📍 Dashboard: http://127.0.0.1:18789"
echo "----------------------------------------------------------"
