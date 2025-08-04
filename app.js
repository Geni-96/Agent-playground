const express = require('express');
const redisService = require('./services/redisService');
const agentManager = require('./orchestrator/agentManager');

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

// Initialize services and start server
async function startServer() {
  try {
    // Initialize Redis connection
    await redisService.connect();
    console.log('✅ Redis service connected');

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
