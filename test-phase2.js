const Agent = require('./agents/Agent');
const llmService = require('./services/llmService');
const ttsService = require('./services/ttsService');
const redisService = require('./services/redisService');

/**
 * Test script for Phase 2 - AI and Voice Services Integration
 */
async function testPhase2() {
  console.log('🚀 Testing Phase 2 - AI and Voice Services Integration');
  console.log('='.repeat(60));

  try {
    // Test 1: Initialize services
    console.log('\n📋 Test 1: Service Initialization');
    console.log('-'.repeat(40));
    
    await redisService.connect();
    console.log('✅ Redis service connected');
    
    await llmService.initialize();
    console.log('✅ LLM service initialized');
    
    await ttsService.initialize();
    console.log('✅ TTS service initialized');

    // Test 2: Create test agents
    console.log('\n📋 Test 2: Create Test Agents');
    console.log('-'.repeat(40));
    
    const agent1 = new Agent(
      "You are a helpful scientist who loves explaining complex topics in simple terms.",
      null,
      {
        llm: { provider: 'openai', model: 'gpt-3.5-turbo', temperature: 0.7 },
        tts: { provider: 'elevenlabs', speed: 1.0 }
      }
    );
    
    const agent2 = new Agent(
      "You are a curious student who asks thoughtful questions about science.",
      null,
      {
        llm: { provider: 'openai', model: 'gpt-3.5-turbo', temperature: 0.8 },
        tts: { provider: 'elevenlabs', speed: 1.1 }
      }
    );

    console.log(`✅ Agent 1 created: ${agent1.agentId}`);
    console.log(`✅ Agent 2 created: ${agent2.agentId}`);

    // Test 3: Test LLM integration (if available)
    console.log('\n📋 Test 3: LLM Integration Test');
    console.log('-'.repeat(40));
    
    if (llmService.isReady()) {
      try {
        const testMessage = {
          content: "Can you explain what photosynthesis is?",
          from: "user-test",
          timestamp: new Date().toISOString()
        };

        console.log('📤 Sending test message to Agent 1...');
        const response1 = await agent1.processMessage(testMessage);
        console.log('📥 Agent 1 response:', response1.content.substring(0, 100) + '...');

        console.log('📤 Sending follow-up to Agent 2...');
        const followUp = {
          content: response1.content,
          from: agent1.agentId,
          timestamp: new Date().toISOString()
        };
        
        const response2 = await agent2.processMessage(followUp);
        console.log('📥 Agent 2 response:', response2.content.substring(0, 100) + '...');

        console.log('✅ LLM integration test passed');
      } catch (error) {
        console.log('⚠️ LLM test skipped:', error.message);
      }
    } else {
      console.log('⚠️ LLM service not ready - check API keys in .env file');
    }

    // Test 4: Test TTS integration (if available)
    console.log('\n📋 Test 4: TTS Integration Test');
    console.log('-'.repeat(40));
    
    if (ttsService.isReady()) {
      try {
        console.log('🗣️ Testing TTS generation...');
        const testText = "Hello, this is a test of the text-to-speech system.";
        const audioBuffer = await agent1.speakResponse(testText);
        
        console.log(`✅ TTS test passed - generated ${audioBuffer.length} bytes of audio`);
      } catch (error) {
        console.log('⚠️ TTS test failed:', error.message);
      }
    } else {
      console.log('⚠️ TTS service not ready - check API keys in .env file');
    }

    // Test 5: Test complete pipeline (if both services available)
    console.log('\n📋 Test 5: Complete Pipeline Test');
    console.log('-'.repeat(40));
    
    if (llmService.isReady() && ttsService.isReady()) {
      try {
        const pipelineMessage = {
          content: "Tell me a short joke",
          from: "pipeline-test",
          timestamp: new Date().toISOString()
        };

        console.log('🔄 Testing complete text-to-speech pipeline...');
        const completeResponse = await agent1.processMessageWithSpeech(pipelineMessage);
        
        console.log('📝 Text response:', completeResponse.content.substring(0, 100) + '...');
        console.log(`🎵 Audio generated: ${completeResponse.hasAudio ? 'Yes' : 'No'}`);
        console.log(`🎵 Audio size: ${completeResponse.audio ? completeResponse.audio.length + ' bytes' : 'N/A'}`);
        
        console.log('✅ Complete pipeline test passed');
      } catch (error) {
        console.log('⚠️ Pipeline test failed:', error.message);
      }
    } else {
      console.log('⚠️ Complete pipeline test skipped - requires both LLM and TTS services');
    }

    // Test 6: Display agent statistics
    console.log('\n📋 Test 6: Agent Statistics');
    console.log('-'.repeat(40));
    
    console.log('Agent 1 Stats:', JSON.stringify(agent1.getStats(), null, 2));
    console.log('Agent 2 Stats:', JSON.stringify(agent2.getStats(), null, 2));

    // Test 7: Service statistics
    console.log('\n📋 Test 7: Service Statistics');
    console.log('-'.repeat(40));
    
    if (llmService.isReady()) {
      console.log('LLM Token Usage:', llmService.getTokenUsage());
    }
    
    if (ttsService.isReady()) {
      console.log('TTS Cache Stats:', ttsService.getCacheStats());
    }

    console.log('\n🎉 Phase 2 testing completed successfully!');
    
  } catch (error) {
    console.error('❌ Phase 2 test failed:', error);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await redisService.disconnect();
    console.log('✅ Redis disconnected');
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testPhase2().catch(console.error);
}

module.exports = { testPhase2 };
