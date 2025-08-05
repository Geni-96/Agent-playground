# Stream-Aware Agent Playground

🔍 **Turn your app into an LLM agent testing platform, where agents are represented as participants and communicate through voice/audio, not just text.**

## 🎯 Overview

The Stream-Aware Agent Playground is an AI Agent Simulator designed to test and demonstrate multi-agent interactions. Each agent has its own persona (system prompt), and agents can communicate through various channels. This project is built on Node.js with Express and uses Redis as a message bus for agent coordination.

## ✨ Features (Phase 2 Complete)

- ✅ **Multi-Agent System**: Create and manage multiple AI agents with unique personas
- ✅ **Message Bus**: Redis-powered pub/sub system for agent communication
- ✅ **REST API**: HTTP endpoints to interact with agents
- ✅ **Agent Orchestration**: Centralized agent management and coordination
- ✅ **Real-time Communication**: Agents can send direct messages or broadcast to all
- ✅ **LLM Integration**: Intelligent responses using OpenAI GPT or Anthropic Claude
- ✅ **Text-to-Speech**: Voice synthesis using ElevenLabs, Azure TTS, or PlayHT
- ✅ **Smart Agents**: Agents can think, respond intelligently, and speak their responses

## 🚀 Quick Start

### Prerequisites

- Node.js (v18 or higher)
- Redis Server (running locally or accessible remotely)
- **NEW**: API keys for at least one LLM provider (OpenAI or Anthropic)
- **NEW**: API keys for at least one TTS provider (ElevenLabs, Azure TTS, or PlayHT)

### Installation

1. **Clone and install dependencies:**
   ```bash
   cd agent-simulator
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   # Copy the example environment file
   cp .env.example .env
   
   # Edit .env and add your API keys:
   # Required: At least one LLM provider
   OPENAI_API_KEY=your_openai_api_key_here
   # OR
   ANTHROPIC_API_KEY=your_anthropic_api_key_here

   # Required: At least one TTS provider
   ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
   # OR
   AZURE_TTS_KEY=your_azure_tts_key_here
   AZURE_TTS_REGION=your_azure_region_here
   # OR
   PLAYHT_API_KEY=your_playht_api_key_here
   PLAYHT_USER_ID=your_playht_user_id_here
   ```

3. **Start Redis Server:**
   ```bash
   # On macOS with Homebrew
   brew services start redis
   
   # Or run directly
   redis-server
   
   # Or with Docker
   docker run -d -p 6379:6379 redis:latest
   ```

4. **Test the setup:**
   ```bash
   npm run test:phase2
   ```

5. **Start the application:**
   ```bash
   npm start
   ```

6. **Verify it's running:**
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
│   └── Agent.js              # Enhanced Agent class with LLM/TTS integration
├── services/
│   ├── redisService.js       # Redis pub/sub service
│   ├── llmService.js         # LLM integration (OpenAI, Anthropic)
│   └── ttsService.js         # Text-to-Speech service (ElevenLabs, Azure, PlayHT)
├── orchestrator/
│   └── agentManager.js       # Agent management and orchestration
├── test-phase2.js            # Phase 2 integration tests
├── .env.example              # Environment configuration template
└── package.json
```

### Core Components

#### 1. Agent Class (`/agents/Agent.js`)
- Represents individual AI agents with unique personas and configurations
- **NEW**: Integrates with LLM services for intelligent response generation
- **NEW**: Supports Text-to-Speech for voice output
- **NEW**: Advanced message processing with context awareness
- Manages message history and status tracking (idle, thinking, speaking, etc.)

#### 2. Redis Service (`/services/redisService.js`)
- Manages Redis connections for pub/sub messaging
- Handles agent communication channels
- Provides reliable message delivery

#### 3. **NEW**: LLM Service (`/services/llmService.js`)
- Integrates with multiple LLM providers (OpenAI GPT, Anthropic Claude)
- Handles prompt templating and conversation context
- Provides token usage tracking and rate limiting
- Supports configurable model parameters

#### 4. **NEW**: TTS Service (`/services/ttsService.js`)
- Supports multiple TTS providers (ElevenLabs, Azure TTS, PlayHT)
- Manages voice profiles for different agents
- Handles audio format conversion for WebRTC compatibility
- Provides audio caching for performance

#### 5. Agent Manager (`/orchestrator/agentManager.js`)
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

## 📈 Implementation Status

### ✅ Phase 1 Completed
- [x] Node.js/Express Application
- [x] Redis Message Bus Service  
- [x] Agent Class Foundation
- [x] Agent Manager (Orchestrator)
- [x] Basic REST API

### ✅ Phase 2 Completed - AI and Voice Services Integration
- [x] LLM Service Implementation
  - [x] OpenAI GPT integration
  - [x] Anthropic Claude integration
  - [x] Prompt templating system
  - [x] Token usage tracking and rate limiting
- [x] TTS Service Implementation
  - [x] ElevenLabs integration
  - [x] Azure TTS integration
  - [x] PlayHT integration
  - [x] Voice profile management
  - [x] Audio caching system
- [x] Enhanced Agent Class
  - [x] LLM-powered response generation
  - [x] Text-to-Speech capabilities
  - [x] Advanced message processing
  - [x] Configuration management
- [x] Environment Configuration
  - [x] API key management
  - [x] Service configuration options
  - [x] Documentation and examples

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

- **Phase 3**: Mediasoup WebRTC Integration for Real-time Audio Streaming
- **Phase 4**: Audio Transcription (ASR) and Voice-first Agent Interactions
- **Phase 5**: Advanced Turn-taking Logic and Agent Coordination
- **Phase 6**: Web Interface and Real-time Dashboard
- **Phase 7**: RAG (Retrieval-Augmented Generation) and Tool Integration

## 🤝 Contributing

This is Phase 1 of the Stream-Aware Agent Playground. The foundation is now in place for building advanced multi-agent interactions with voice communication capabilities.

## 📄 License

ISC
