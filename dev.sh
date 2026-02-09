#!/bin/bash

# Kill any existing processes (forcefully)
echo "🧹 Cleaning up old processes..."
killall -9 axtrizen-app node 2>/dev/null
lsof -ti:5174 | xargs kill -9 2>/dev/null

# Start Frontend in background
echo "🚀 Starting Frontend..."
cd axtrizenFrontEnd
npm run dev -- --port 5174 &
FRONTEND_PID=$!

# Wait for frontend to be ready
echo "⏳ Waiting for frontend..."
sleep 5

# Start Backend
echo "🦀 Starting Backend..."
cd ../axtrizen-app/src-tauri
../../axtrizenFrontEnd/node_modules/.bin/tauri dev

# Cleanup when backend exits
kill $FRONTEND_PID
