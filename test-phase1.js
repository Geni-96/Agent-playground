const redisService = require('./services/redisService');
const Agent = require('./agents/Agent');
const agentManager = require('./orchestrator/agentManager');

// Test script for Phase 1 implementation
async function testImplementation() {
  console.log('🧪 Testing Phase 1 Implementation...\n');

  // Test 1: Agent Creation
  console.log('1️⃣ Testing Agent Class...');
  try {
    const testAgent = new Agent("I am a test agent for verification purposes.");
    console.log(`✅ Agent created with ID: ${testAgent.agentId}`);
    console.log(`✅ Agent persona: ${testAgent.persona}`);
    
    // Test message handling
    testAgent.addMessage({
      type: 'system',
      content: 'Test message',
      from: 'test-system'
    });
    console.log(`✅ Agent message history: ${testAgent.messageHistory.length} messages`);
    
    // Test status update
    testAgent.setStatus('processing');
    console.log(`✅ Agent status: ${testAgent.status}`);
    testAgent.setStatus('idle');
    
  } catch (error) {
    console.error('❌ Agent test failed:', error.message);
  }

  console.log('\n2️⃣ Testing Agent Manager (without Redis)...');
  try {
    // Test agent manager without Redis connection
    const testAgent2 = new Agent("I am another test agent.");
    const success = agentManager.addAgent(testAgent2);
    console.log(`✅ Agent added to manager: ${success}`);
    
    const allAgents = agentManager.getAllAgents();
    console.log(`✅ Total agents in manager: ${allAgents.length}`);
    
    const stats = agentManager.getStats();
    console.log(`✅ Manager stats: ${JSON.stringify(stats, null, 2)}`);
    
  } catch (error) {
    console.error('❌ Agent Manager test failed:', error.message);
  }

  console.log('\n3️⃣ Testing Redis Service Connection...');
  try {
    // This will test if Redis service handles connection gracefully
    console.log('📡 Redis connection status:', redisService.isConnectedToRedis());
    console.log('✅ Redis service module loaded successfully');
    console.log('ℹ️ Note: Full Redis functionality requires a running Redis server');
    
  } catch (error) {
    console.error('❌ Redis service test failed:', error.message);
  }

  console.log('\n🎉 Phase 1 Core Components Test Complete!');
  console.log('\n📋 Next Steps:');
  console.log('1. Start Redis server: brew services start redis');
  console.log('2. Run the application: npm start');
  console.log('3. Test the API endpoints');
}

// Run the test
testImplementation().catch(console.error);
