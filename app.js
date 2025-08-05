const express = require('express');
const redisService = require('./services/redisService');
const agentManager = require('./orchestrator/agentManager');
const llmService = require('./services/llmService');
const ttsService = require('./services/ttsService');
const asrService = require('./services/asrService');
const audioPipelineService = require('./services/audioPipelineService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Stream-Aware Agent Playground is running',
    timestamp: new Date().toISOString()
  });
});

// API endpoints
app.get('/agents', (req, res) => {
  const agents = agentManager.getAllAgents();
  res.json({ agents });
});

app.post('/agents', (req, res) => {
  const { persona } = req.body;
  
  if (!persona) {
    return res.status(400).json({ error: 'Persona is required' });
  }

  // Publish agent creation request to Redis
  redisService.publish('agent:create', JSON.stringify({ persona }));
  
  res.status(202).json({ 
    message: 'Agent creation requested',
    note: 'Check /agents endpoint to see created agents'
  });
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

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/agents/:agentId/speak', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    await agentManager.startAgentSpeaking(agentId, message);
    
    res.json({ 
      message: `Agent ${agentId} started speaking`,
      agentId,
      spokenMessage: message 
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

    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🤖 Agents API: http://localhost:${PORT}/agents`);
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
  process.exit(0);
});

// Start the application
startServer();

module.exports = app;
