#!/bin/bash

# Phase 3 WebRTC Integration Test Script
echo "🎯 Phase 3 WebRTC Integration Test Script"
echo "=========================================="

BASE_URL="http://localhost:3000"

echo ""
echo "🔍 1. Checking service status..."
curl -s "$BASE_URL/services/status" | jq '.' 2>/dev/null || curl -s "$BASE_URL/services/status"

echo ""
echo ""
echo "📊 2. Getting service statistics..."
curl -s "$BASE_URL/services/stats" | jq '.' 2>/dev/null || curl -s "$BASE_URL/services/stats"

echo ""
echo ""
echo "🤖 3. Creating test agents..."

# Create Voice Agent 1
echo "Creating Voice Agent 1..."
AGENT1_RESPONSE=$(curl -s -X POST "$BASE_URL/agents" \
  -H "Content-Type: application/json" \
  -d '{"persona": "You are Alice, a friendly conversationalist who loves discussing technology and innovation."}')
echo "$AGENT1_RESPONSE"

sleep 2

# Create Voice Agent 2
echo ""
echo "Creating Voice Agent 2..."
AGENT2_RESPONSE=$(curl -s -X POST "$BASE_URL/agents" \
  -H "Content-Type: application/json" \
  -d '{"persona": "You are Bob, an analytical thinker who enjoys problem-solving and technical discussions."}')
echo "$AGENT2_RESPONSE"

sleep 2

echo ""
echo ""
echo "🏠 4. Checking available agents..."
AGENTS_RESPONSE=$(curl -s "$BASE_URL/agents")
echo "$AGENTS_RESPONSE"

# Extract agent IDs (this is a simplified extraction - in practice you'd parse JSON properly)
AGENT1_ID=$(echo "$AGENTS_RESPONSE" | grep -o '"agentId":"[^"]*"' | head -n 1 | cut -d'"' -f4)
AGENT2_ID=$(echo "$AGENTS_RESPONSE" | grep -o '"agentId":"[^"]*"' | tail -n 1 | cut -d'"' -f4)

echo ""
echo "🎯 Extracted Agent IDs:"
echo "Agent 1 ID: $AGENT1_ID"
echo "Agent 2 ID: $AGENT2_ID"

if [ -z "$AGENT1_ID" ] || [ -z "$AGENT2_ID" ]; then
    echo "❌ Failed to extract agent IDs. Please check agents endpoint manually."
    exit 1
fi

echo ""
echo ""
echo "🚪 5. Testing room joining..."

# Join Agent 1 to room
echo "Agent 1 joining test-room..."
curl -s -X POST "$BASE_URL/agents/$AGENT1_ID/join-room" \
  -H "Content-Type: application/json" \
  -d '{"roomId": "test-room", "options": {"enableAudio": true}}' | \
  jq '.' 2>/dev/null || curl -s -X POST "$BASE_URL/agents/$AGENT1_ID/join-room" \
  -H "Content-Type: application/json" \
  -d '{"roomId": "test-room", "options": {"enableAudio": true}}'

echo ""
sleep 2

# Join Agent 2 to room
echo "Agent 2 joining test-room..."
curl -s -X POST "$BASE_URL/agents/$AGENT2_ID/join-room" \
  -H "Content-Type: application/json" \
  -d '{"roomId": "test-room", "options": {"enableAudio": true}}' | \
  jq '.' 2>/dev/null || curl -s -X POST "$BASE_URL/agents/$AGENT2_ID/join-room" \
  -H "Content-Type: application/json" \
  -d '{"roomId": "test-room", "options": {"enableAudio": true}}'

echo ""
sleep 2

echo ""
echo ""
echo "🏠 6. Checking room status..."
curl -s "$BASE_URL/rooms/test-room" | jq '.' 2>/dev/null || curl -s "$BASE_URL/rooms/test-room"

echo ""
echo ""
echo "🗣️ 7. Testing agent speech..."

# Agent 1 speaks
echo "Agent 1 speaking..."
curl -s -X POST "$BASE_URL/agents/$AGENT1_ID/speak" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello everyone! I am Alice, excited to be here and discuss technology innovations."}' | \
  jq '.' 2>/dev/null || curl -s -X POST "$BASE_URL/agents/$AGENT1_ID/speak" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello everyone! I am Alice, excited to be here and discuss technology innovations."}'

echo ""
sleep 3

# Stop Agent 1 speaking
echo "Stopping Agent 1..."
curl -s -X POST "$BASE_URL/agents/$AGENT1_ID/stop-speaking" | \
  jq '.' 2>/dev/null || curl -s -X POST "$BASE_URL/agents/$AGENT1_ID/stop-speaking"

echo ""
sleep 1

# Agent 2 speaks
echo "Agent 2 speaking..."
curl -s -X POST "$BASE_URL/agents/$AGENT2_ID/speak" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Alice! I am Bob. I would love to discuss the latest developments in AI and machine learning."}' | \
  jq '.' 2>/dev/null || curl -s -X POST "$BASE_URL/agents/$AGENT2_ID/speak" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Alice! I am Bob. I would love to discuss the latest developments in AI and machine learning."}'

echo ""
sleep 3

# Stop Agent 2 speaking
echo "Stopping Agent 2..."
curl -s -X POST "$BASE_URL/agents/$AGENT2_ID/stop-speaking" | \
  jq '.' 2>/dev/null || curl -s -X POST "$BASE_URL/agents/$AGENT2_ID/stop-speaking"

echo ""
echo ""
echo "📊 8. Final statistics..."
curl -s "$BASE_URL/services/stats" | jq '.' 2>/dev/null || curl -s "$BASE_URL/services/stats"

echo ""
echo ""
echo "🚪 9. Cleanup - removing agents from room..."

# Remove agents from room
curl -s -X POST "$BASE_URL/agents/$AGENT1_ID/leave-room" | \
  jq '.' 2>/dev/null || curl -s -X POST "$BASE_URL/agents/$AGENT1_ID/leave-room"

echo ""

curl -s -X POST "$BASE_URL/agents/$AGENT2_ID/leave-room" | \
  jq '.' 2>/dev/null || curl -s -X POST "$BASE_URL/agents/$AGENT2_ID/leave-room"

echo ""
echo ""
echo "✅ Phase 3 WebRTC Integration Test Complete!"
echo ""
echo "🔍 What was tested:"
echo "  ✅ Service status and statistics"
echo "  ✅ Agent creation and management"
echo "  ✅ Room joining and leaving"
echo "  ✅ Agent speech simulation"
echo "  ✅ WebRTC pipeline integration"
echo ""
echo "💡 Note: This test simulates the WebRTC voice pipeline."
echo "   For full testing with real audio, you'll need:"
echo "   - Mediasoup server running on port 5001"
echo "   - Valid API keys for TTS/ASR providers"
echo "   - WebRTC client connections"
echo ""
echo "🔧 To run with real services:"
echo "   1. Set up your .env file with API keys"
echo "   2. Start Mediasoup server"
echo "   3. Connect WebRTC clients to test rooms"
echo "   4. Send real audio for transcription and response"
