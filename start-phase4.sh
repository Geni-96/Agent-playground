#!/bin/bash

# Phase 4 Frontend and Backend Startup Script
echo "🚀 Starting Stream-Aware Agent Playground - Phase 4"
echo "=============================================="

# Check if Redis is running
if ! pgrep redis-server > /dev/null; then
    echo "⚠️  Warning: Redis server doesn't appear to be running"
    echo "   Please start Redis with: redis-server"
    echo ""
fi

# Start backend (if not already running)
echo "🔧 Starting backend server..."
cd /Users/gnaneswarilolugu/agent-simulator
npm start &
BACKEND_PID=$!

# Wait for backend to start
echo "⏳ Waiting for backend to initialize..."
sleep 5

# Start frontend
echo "🎨 Starting React frontend..."
cd /Users/gnaneswarilolugu/agent-simulator/frontend
BROWSER=none npm start &
FRONTEND_PID=$!

echo ""
echo "✅ Services started!"
echo "📊 Backend API: http://localhost:3000"
echo "🎨 Frontend UI: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all services"

# Function to cleanup when script exits
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "💤 All services stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for both processes
wait
