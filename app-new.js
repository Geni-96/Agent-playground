const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const redisService = require('./services/redisService');
const agentManager = require('./orchestrator/agentManager');
const llmService = require('./services/llmService');
const ttsService = require('./services/ttsService');
const asrService = require('./services/asrService');
const audioPipelineService = require('./services/audioPipelineService');

const app = express();
const server = http.createServer(app);

// Configure CORS for both Express and Socket.IO
const corsOptions = {
  origin: [
    'http://localhost:3001', // React development server
    'http://localhost:3000', // In case React runs on 3000
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3000'
  ],
  credentials: true
};

app.use(cors(corsOptions));

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store connected clients
const connectedClients = new Set();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  connectedClients.add(socket.id);

  socket.on('disconnect', (reason) => {
    console.log(`🔌 Client disconnected: ${socket.id} (${reason})`);
    connectedClients.delete(socket.id);
  });

  // Send current system status on connect
  socket.emit('system:status', {
    connectedClients: connectedClients.size,
    agents: agentManager.getAllAgents().length,
    services: {
      redis: redisService.isConnectedToRedis(),
      llm: llmService.isReady(),
      tts: ttsService.isReady(),
      asr: asrService.isReady(),
    }
  });
});

// Function to broadcast events to all connected clients
const broadcast = (event, data) => {
  io.emit(event, data);
  console.log(`📡 Broadcasting ${event}:`, data);
};

// Set up Agent Manager event listeners for real-time updates
const setupAgentManagerListeners = () => {
  // Listen for agent events
  agentManager.on('agent:created', (data) => {
    broadcast('agent:created', data);
  });

  agentManager.on('agent:status:changed', (data) => {
    broadcast('agent:status:changed', data);
  });

  agentManager.on('agent:updated', (data) => {
    broadcast('agent:updated', data);
  });

  agentManager.on('agent:deleted', (data) => {
    broadcast('agent:deleted', data);
  });

  agentManager.on('agent:speaking:start', (data) => {
    broadcast('agent:speaking:start', data);
  });

  agentManager.on('agent:speaking:end', (data) => {
    broadcast('agent:speaking:end', data);
  });

  agentManager.on('conversation:message', (data) => {
    broadcast('conversation:message', data);
  });

  agentManager.on('transcription:update', (data) => {
    broadcast('transcription:update', data);
  });
};

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Stream-Aware Agent Playground is running',
    timestamp: new Date().toISOString(),
    connectedClients: connectedClients.size
  });
});

// System status endpoint
app.get('/system/status', (req, res) => {
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    connectedClients: connectedClients.size,
    agents: agentManager.getAllAgents().length,
    services: {
      redis: redisService.isConnectedToRedis(),
      llm: llmService.isReady(),
      tts: ttsService.isReady(),
      asr: asrService.isReady(),
      audioPipeline: audioPipelineService.isReady()
    }
  });
});

// Enhanced agents endpoint
app.get('/agents', (req, res) => {
  const agents = agentManager.getAllAgents();
  res.json({ 
    agents: agents.map(agent => ({
      agentId: agent.agentId,
      persona: agent.persona,
      status: agent.status,
      roomId: agent.roomId,
      createdAt: agent.createdAt,
      lastActivity: agent.lastActivity,
      metadata: agent.metadata,
      config: agent.config
    }))
  });
});

// Get specific agent
app.get('/agents/:agentId', (req, res) => {
  const { agentId } = req.params;
  const agent = agentManager.getAgent(agentId);
  
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  res.json({ agent });
});

// Create agent endpoint (enhanced)
app.post('/agents/create', (req, res) => {
  const { persona, agentId, roomId, config } = req.body;
  
  if (!persona) {
    return res.status(400).json({ error: 'Persona is required' });
  }

  // Publish agent creation request to Redis with additional data
  const agentData = { 
    persona, 
    agentId: agentId || null, 
    roomId: roomId || null,
    config: config || {}
  };
  
  redisService.publish('agent:create', JSON.stringify(agentData));
  
  res.status(202).json({ 
    message: 'Agent creation requested',
    agentData,
    note: 'Check /agents endpoint to see created agents'
  });
});

// Update agent configuration
app.put('/agents/:agentId', (req, res) => {
  const { agentId } = req.params;
  const updates = req.body;
  
  try {
    const agent = agentManager.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Update agent configuration
    if (updates.config) {
      agent.updateConfig(updates.config);
    }

    // Update persona if provided
    if (updates.persona) {
      agent.persona = updates.persona;
    }

    res.json({ 
      message: 'Agent updated successfully',
      agent: {
        agentId: agent.agentId,
        persona: agent.persona,
        config: agent.config
      }
    });

    // Broadcast update
    broadcast('agent:updated', { agentId, ...updates });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete agent endpoint
app.delete('/agents/:agentId', (req, res) => {
  const { agentId } = req.params;
  
  try {
    const removed = agentManager.removeAgent(agentId);
    
    if (!removed) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ 
      message: 'Agent deleted successfully',
      agentId 
    });

    // Broadcast deletion
    broadcast('agent:deleted', { agentId });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get agent stats
app.get('/agents/:agentId/stats', (req, res) => {
  const { agentId } = req.params;
  const agent = agentManager.getAgent(agentId);
  
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  res.json({ stats: agent.getStats() });
});

// Get agent voice stats
app.get('/agents/:agentId/voice-stats', (req, res) => {
  const { agentId } = req.params;
  const agent = agentManager.getAgent(agentId);
  
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  res.json({ voiceStats: agent.getVoiceStats() });
});

// WebRTC and Room Management endpoints
app.post('/agents/:agentId/join-room', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { roomId, options = {} } = req.body;

    if (!roomId) {
      return res.status(400).json({ error: 'Room ID is required' });
    }

    await agentManager.spawnAgentIntoRoom(agentId, roomId, options);
    
    res.json({ 
      message: `Agent ${agentId} joined room ${roomId}`,
      agentId,
      roomId 
    });

    // Broadcast room join
    broadcast('room:joined', { agentId, roomId });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/agents/:agentId/leave-room', async (req, res) => {
  try {
    const { agentId } = req.params;

    await agentManager.removeAgentFromRoom(agentId);
    
    res.json({ 
      message: `Agent ${agentId} left room`,
      agentId 
    });

    // Broadcast room leave
    broadcast('room:left', { agentId });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/agents/:agentId/speak', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { text, options = {} } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    await agentManager.startAgentSpeaking(agentId, text, options);
    
    res.json({ 
      message: `Agent ${agentId} started speaking`,
      agentId,
      text 
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/agents/:agentId/stop-speaking', async (req, res) => {
  try {
    const { agentId } = req.params;

    await agentManager.stopAgentSpeaking(agentId);
    
    res.json({ 
      message: `Agent ${agentId} stopped speaking`,
      agentId 
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Service status endpoints
app.get('/services/status', (req, res) => {
  res.json({
    redis: redisService.isConnectedToRedis(),
    llm: llmService.isReady(),
    tts: ttsService.isReady(),
    asr: asrService.isReady(),
    audioPipeline: audioPipelineService.isReady()
  });
});

app.get('/services/stats', async (req, res) => {
  try {
    res.json({
      agentManager: agentManager.getStats(),
      llm: llmService.getTokenUsage(),
      asr: asrService.getStats(),
      audioPipeline: audioPipelineService.getStats()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Room management endpoints
app.get('/rooms', (req, res) => {
  const stats = agentManager.getStats();
  res.json({ rooms: stats.roomStats });
});

app.get('/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const stats = agentManager.getStats();
  
  if (!stats.roomStats[roomId]) {
    return res.status(404).json({ error: 'Room not found' });
  }

  res.json({ room: stats.roomStats[roomId] });
});

// Conversation history endpoint
app.get('/conversations/:roomId', (req, res) => {
  const { roomId } = req.params;
  const { limit = 50 } = req.query;
  
  try {
    // Get messages from agents in the room
    const agents = agentManager.getAllAgents().filter(agent => agent.roomId === roomId);
    const messages = [];
    
    agents.forEach(agent => {
      const agentMessages = agent.messageHistory
        .filter(msg => msg.type === 'voice_received' || msg.type === 'voice_response')
        .slice(-limit);
      messages.push(...agentMessages);
    });

    // Sort by timestamp
    messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.json({ 
      messages: messages.slice(-limit),
      roomId,
      totalMessages: messages.length
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Initialize services and start server
async function startServer() {
  try {
    // Initialize Redis connection
    await redisService.connect();
    console.log('✅ Redis service connected');

    // Initialize LLM service
    try {
      await llmService.initialize();
      console.log('✅ LLM service initialized');
    } catch (error) {
      console.log('⚠️ LLM service not initialized (missing API keys)');
    }

    // Initialize TTS service
    try {
      await ttsService.initialize();
      console.log('✅ TTS service initialized');
    } catch (error) {
      console.log('⚠️ TTS service not initialized (missing API keys)');
    }

    // Initialize ASR service
    try {
      await asrService.initialize();
      console.log('✅ ASR service initialized');
    } catch (error) {
      console.log('⚠️ ASR service not initialized (missing API keys)');
    }

    // Audio Pipeline service is always ready
    console.log('✅ Audio Pipeline service ready');

    // Initialize Agent Manager
    await agentManager.initialize();
    console.log('✅ Agent Manager initialized');

    // Set up real-time event listeners
    setupAgentManagerListeners();
    console.log('✅ WebSocket event listeners configured');

    // Start HTTP server with Socket.IO
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🤖 Agents API: http://localhost:${PORT}/agents`);
      console.log(`🔌 WebSocket server ready for connections`);
      console.log(`🌐 Frontend should connect to: http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await redisService.disconnect();
  server.close(() => {
    console.log('💤 Server closed');
    process.exit(0);
  });
});

// Start the application
startServer();

module.exports = { app, server, io };
