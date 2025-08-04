# Stream-Aware Agent Playground

🔍 **Turn your app into an LLM agent testing platform, where agents are represented as participants and communicate through voice/audio, not just text.**

## 🎯 Overview

The Stream-Aware Agent Playground is an AI Agent Simulator designed to test and demonstrate multi-agent interactions. Each agent has its own persona (system prompt), and agents can communicate through various channels. This project is built on Node.js with Express and uses Redis as a message bus for agent coordination.

## ✨ Features (Phase 1 Complete)

- ✅ **Multi-Agent System**: Create and manage multiple AI agents with unique personas
- ✅ **Message Bus**: Redis-powered pub/sub system for agent communication
- ✅ **REST API**: HTTP endpoints to interact with agents
- ✅ **Agent Orchestration**: Centralized agent management and coordination
- ✅ **Real-time Communication**: Agents can send direct messages or broadcast to all

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- Redis Server (running locally or accessible remotely)

### Installation

1. **Clone and install dependencies:**
   ```bash
   cd agent-simulator
   npm install
   ```

2. **Start Redis Server:**
   ```bash
   # On macOS with Homebrew
   brew services start redis
   
   # Or run directly
   redis-server
   ```

3. **Start the application:**
   ```bash
   npm start
   ```

4. **Verify it's running:**
   ```bash
   curl http://localhost:3000/health
   ```

## 📚 API Documentation

### Health Check
```bash
GET /health
```

### List All Agents
```bash
GET /agents
```

### Create a New Agent
```bash
POST /agents
Content-Type: application/json

{
  "persona": "You are a helpful AI assistant specializing in technical documentation."
}
```

## 🏗️ Architecture

```
agent-simulator/
├── app.js                     # Main Express server
├── agents/
│   └── Agent.js              # Agent class definition
├── services/
│   └── redisService.js       # Redis pub/sub service
├── orchestrator/
│   └── agentManager.js       # Agent management and orchestration
└── package.json
```

### Core Components

#### 1. Agent Class (`/agents/Agent.js`)
- Represents individual AI agents with unique personas
- Manages message history and status tracking
- Handles message processing (foundation for future LLM integration)

#### 2. Redis Service (`/services/redisService.js`)
- Manages Redis connections for pub/sub messaging
- Handles agent communication channels
- Provides reliable message delivery

#### 3. Agent Manager (`/orchestrator/agentManager.js`)
- Orchestrates all agents in the simulation
- Listens to Redis channels for agent lifecycle events
- Manages agent creation, deletion, and message routing

## 🔌 Redis Channels

The system uses several Redis channels for communication:

- `agent:create` - Trigger agent creation
- `agent:delete` - Trigger agent deletion
- `agent:message` - Direct messages between agents
- `agent:broadcast` - Broadcast messages to all agents
- `agent:created` - Notification when agent is created
- `agent:deleted` - Notification when agent is deleted

## 🧪 Testing the System

### 1. Create agents via API:
```bash
# Create a helpful agent
curl -X POST http://localhost:3000/agents \
  -H "Content-Type: application/json" \
  -d '{"persona": "You are a helpful AI assistant."}'

# Create a creative agent
curl -X POST http://localhost:3000/agents \
  -H "Content-Type: application/json" \
  -d '{"persona": "You are a creative AI that loves storytelling."}'
```

### 2. View created agents:
```bash
curl http://localhost:3000/agents
```

### 3. Send messages via Redis:
```bash
# Connect to Redis CLI
redis-cli

# Create an agent
PUBLISH agent:create '{"persona": "You are a philosophical AI."}'

# Send a broadcast message
PUBLISH agent:broadcast '{"content": "Hello everyone!", "from": "system"}'
```

## 🔧 Configuration

### Environment Variables

- `PORT` - Server port (default: 3000)
- `REDIS_HOST` - Redis server host (default: localhost)
- `REDIS_PORT` - Redis server port (default: 6379)
- `MAX_AGENTS` - Maximum number of agents (default: 10)

### Example with custom configuration:
```bash
PORT=8080 REDIS_HOST=redis.example.com MAX_AGENTS=20 npm start
```

## 📈 Phase 1 Implementation Status

### ✅ Completed Tasks
- [x] Initialize Node.js project (npm init -y)
- [x] Install initial dependencies: express, redis, uuid
- [x] Create project folder structure: /agents, /services, /orchestrator
- [x] Set up basic Express server in app.js
- [x] Implement Redis connection and pub/sub logic in /services/redisService.js
- [x] Define Agent class structure in /agents/Agent.js
- [x] Implement core logic for AgentManager in /orchestrator/agentManager.js
- [x] Connect AgentManager to Redis service for control messages

### 🏆 Acceptance Criteria Met
- ✅ Node.js/Express Application Initialized
- ✅ Message Bus Service Created (Redis)
- ✅ Agent Class Defined
- ✅ Agent Manager (Orchestrator) Implemented

## 🛠️ Development Notes

### Agent Lifecycle
1. **Creation**: Agents are created via REST API or Redis messages
2. **Communication**: Agents receive and process messages
3. **Status Management**: Agents track their current state (idle, processing, etc.)
4. **History**: All agent interactions are logged

### Message Flow
1. External request triggers agent creation via REST API
2. API publishes creation request to Redis
3. AgentManager receives message and creates agent
4. Agent is added to the manager's collection
5. Agent can now receive and respond to messages

## 🔮 Future Phases

- **Phase 2**: LLM Integration (OpenAI/Anthropic APIs)
- **Phase 3**: Text-to-Speech (TTS) and Speech-to-Text (STT)
- **Phase 4**: Mediasoup WebRTC Integration
- **Phase 5**: Web Interface and Real-time Dashboard
- **Phase 6**: RAG (Retrieval-Augmented Generation) Modules

## 🤝 Contributing

This is Phase 1 of the Stream-Aware Agent Playground. The foundation is now in place for building advanced multi-agent interactions with voice communication capabilities.

## 📄 License

ISC
