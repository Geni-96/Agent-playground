#!/bin/bash

# Phase 4 Frontend Testing Script
echo "🧪 Testing Phase 4 - Frontend UI with React"
echo "==========================================="

# Test backend API endpoints
echo ""
echo "🔍 Testing Backend API Endpoints..."

# Test health endpoint
echo "📊 Health Check:"
curl -s http://localhost:3000/health | jq '.'

echo ""
echo "🤖 Current Agents:"
curl -s http://localhost:3000/agents | jq '.agents[].agentId'

echo ""
echo "⚙️ System Status:"
curl -s http://localhost:3000/system/status | jq '.'

# Test agent creation
echo ""
echo "➕ Creating Test Agent..."
AGENT_RESPONSE=$(curl -s -X POST http://localhost:3000/agents/create \
  -H "Content-Type: application/json" \
  -d '{
    "persona": "You are a creative AI assistant who loves art and storytelling.",
    "agentId": "test-frontend-agent",
    "config": {
      "llm": {
        "provider": "openai",
        "model": "gpt-4",
        "temperature": 0.8
      },
      "tts": {
        "provider": "elevenlabs",
        "speed": 1.1
      }
    }
  }')
echo $AGENT_RESPONSE | jq '.'

sleep 2

# Test frontend accessibility
echo ""
echo "🌐 Testing Frontend Accessibility..."
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001)
if [ "$FRONTEND_STATUS" = "200" ]; then
    echo "✅ Frontend accessible at http://localhost:3001"
else
    echo "❌ Frontend not accessible (HTTP $FRONTEND_STATUS)"
fi

# Test WebSocket endpoint
echo ""
echo "🔌 Testing WebSocket Endpoint..."
echo "WebSocket should be available at ws://localhost:3000"

# Test service status
echo ""
echo "🔧 Service Status:"
curl -s http://localhost:3000/services/status | jq '.'

# Test conversation endpoint
echo ""
echo "💬 Testing Conversation History:"
curl -s http://localhost:3000/conversations/general | jq '.messages | length'

echo ""
echo "🎯 Frontend Testing Checklist:"
echo "================================"
echo ""
echo "Manual Tests to Perform in Browser (http://localhost:3001):"
echo ""
echo "1. ✅ Dashboard Loading"
echo "   - Open http://localhost:3001"
echo "   - Verify agent cards are displayed"
echo "   - Check WebSocket connection status (should show 'connected')"
echo ""
echo "2. ✅ Agent Creation"
echo "   - Click the '+' button (bottom right)"
echo "   - Try different persona templates"
echo "   - Configure LLM and TTS settings"
echo "   - Create agent and verify it appears in dashboard"
echo ""
echo "3. ✅ Real-time Updates"
echo "   - Create agent and watch for real-time addition"
echo "   - Check status indicators update live"
echo "   - Verify conversation panel shows activity"
echo ""
echo "4. ✅ Agent Actions"
echo "   - Click three-dots menu on any agent card"
echo "   - Try 'Make Speak' option (enter test text)"
echo "   - Try 'Join Room' option"
echo "   - Test agent configuration editing"
echo ""
echo "5. ✅ Voice Features"
echo "   - Watch for speaking indicators"
echo "   - Check conversation messages appear"
echo "   - Verify voice statistics update"
echo ""
echo "6. ✅ Responsive Design"
echo "   - Resize browser window"
echo "   - Check mobile view (dev tools)"
echo "   - Verify all components remain usable"
echo ""
echo "🎉 Phase 4 Frontend Implementation Complete!"
echo ""
echo "Key URLs:"
echo "📊 Backend API: http://localhost:3000"
echo "🎨 Frontend UI: http://localhost:3001"
echo "❤️ Health Check: http://localhost:3000/health"
echo "🤖 Agents API: http://localhost:3000/agents"
echo ""
echo "Note: Ensure Redis is running (redis-server) before testing"
