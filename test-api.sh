#!/bin/bash

# Stream-Aware Agent Playground - Quick Test Script
echo "🚀 Stream-Aware Agent Playground - API Test Script"
echo "=================================================="

BASE_URL="http://localhost:3000"

echo ""
echo "1️⃣ Testing Health Check..."
curl -s "$BASE_URL/health" | jq '.' 2>/dev/null || curl -s "$BASE_URL/health"

echo ""
echo ""
echo "2️⃣ Testing Agent List (should show default agent)..."
curl -s "$BASE_URL/agents" | jq '.' 2>/dev/null || curl -s "$BASE_URL/agents"

echo ""
echo ""
echo "3️⃣ Creating a helpful agent..."
curl -s -X POST "$BASE_URL/agents" \
  -H "Content-Type: application/json" \
  -d '{"persona": "You are a helpful AI assistant specializing in technical documentation."}' | \
  jq '.' 2>/dev/null || curl -s -X POST "$BASE_URL/agents" \
  -H "Content-Type: application/json" \
  -d '{"persona": "You are a helpful AI assistant specializing in technical documentation."}'

echo ""
echo ""
echo "4️⃣ Creating a creative agent..."
curl -s -X POST "$BASE_URL/agents" \
  -H "Content-Type: application/json" \
  -d '{"persona": "You are a creative AI that loves storytelling and imagination."}' | \
  jq '.' 2>/dev/null || curl -s -X POST "$BASE_URL/agents" \
  -H "Content-Type: application/json" \
  -d '{"persona": "You are a creative AI that loves storytelling and imagination."}'

echo ""
echo ""
echo "5️⃣ Checking all agents (should show 3 agents now)..."
curl -s "$BASE_URL/agents" | jq '.' 2>/dev/null || curl -s "$BASE_URL/agents"

echo ""
echo ""
echo "✅ API Test Complete!"
echo ""
echo "💡 Tip: You can also test Redis messaging with:"
echo "   redis-cli"
echo "   PUBLISH agent:create '{\"persona\": \"You are a philosophical AI.\"}'"
echo "   PUBLISH agent:broadcast '{\"content\": \"Hello everyone!\", \"from\": \"system\"}'"
