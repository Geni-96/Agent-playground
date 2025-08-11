/**
 * MCP Audio Integration Usage Examples
 * Demonstrates how to use the new MCP audio methods in MediasoupBotClient
 */

const MediasoupBotClient = require('../services/mediasoupBotClient');
const ttsService = require('../services/ttsService');

/**
 * Example 1: Agent sending TTS audio to room using MCP
 */
async function agentSpeakInRoom() {
  const client = new MediasoupBotClient('http://localhost:5002/mcp');
  
  try {
    // Connect to room
    await client.connect('room-123', 'agent-alice');
    console.log('✅ Agent connected to room');

    // Generate TTS audio
    const text = "Hello everyone! I'm Alice, your AI assistant.";
    const audioBuffer = await ttsService.generateSpeech(text, 'agent-alice', {
      provider: 'elevenlabs',
      voiceId: 'default',
      speed: 1.0
    });

    // Send audio to room via MCP
    const producerId = await client.produceAudioFromBuffer(audioBuffer, {
      format: 'mp3',
      sampleRate: 24000,
      channels: 1
    });

    console.log(`✅ Audio produced with ID: ${producerId}`);

    // Wait a bit then stop production
    setTimeout(async () => {
      await client.stopAudioProduction(producerId);
      console.log('✅ Audio production stopped');
    }, 5000);

  } catch (error) {
    console.error('❌ Error in agent speak example:', error);
  }
}

/**
 * Example 2: Agent listening to human participant audio using MCP
 */
async function agentListenToHuman() {
  const client = new MediasoupBotClient('http://localhost:5002/mcp');
  
  try {
    // Connect to room
    await client.connect('room-123', 'agent-bob');
    console.log('✅ Agent connected to room');

    // Get available audio participants
    const participants = await client.getAudioParticipants();
    console.log('👥 Audio participants:', participants);

    // Find a human participant
    const humanParticipant = participants.find(p => p.type === 'human' || !p.type);
    
    if (humanParticipant) {
      // Consume audio from human participant
      const consumerInfo = await client.consumeParticipantAudio(humanParticipant.id, {
        durationMs: 3000, // 3 seconds
        format: 'mp3',
        sampleRate: 24000
      });

      console.log(`✅ Consuming audio from ${humanParticipant.id}`);
      console.log(`📊 Audio data: ${consumerInfo.audioBuffer ? consumerInfo.audioBuffer.length : 0} bytes`);

      // Process the audio buffer (e.g., send to ASR service)
      if (consumerInfo.audioBuffer) {
        // Here you would typically send to ASR service for transcription
        console.log('🎙️ Audio captured successfully, ready for ASR processing');
      }

    } else {
      console.log('⚠️ No human participants found with audio');
    }

  } catch (error) {
    console.error('❌ Error in agent listen example:', error);
  }
}

/**
 * Example 3: Full conversation flow between agent and human
 */
async function fullConversationExample() {
  const client = new MediasoupBotClient('http://localhost:5002/mcp');
  
  try {
    // Connect to room
    await client.connect('room-123', 'agent-conversation');
    console.log('✅ Agent connected for conversation');

    // Test MCP audio tools availability
    const toolStatus = await client.testMCPAudioTools();
    console.log('🔧 MCP Audio Tools Status:', toolStatus);

    // Set up event listeners
    client.on('audioProduced', (data) => {
      console.log('🎵 Audio produced event:', data.producerId);
    });

    client.on('audioConsumed', (data) => {
      console.log('🎧 Audio consumed event:', data.consumerId);
    });

    // Conversation loop
    for (let i = 0; i < 3; i++) {
      console.log(`\n--- Conversation Turn ${i + 1} ---`);

      // 1. Listen for human speech
      const participants = await client.getAudioParticipants();
      const human = participants.find(p => p.type === 'human');
      
      if (human) {
        console.log('👂 Listening to human...');
        const humanAudio = await client.consumeParticipantAudio(human.id, {
          durationMs: 4000
        });

        if (humanAudio.audioBuffer) {
          console.log(`📝 Captured ${humanAudio.audioBuffer.length} bytes of human audio`);
          // Here: send to ASR service for transcription
        }
      }

      // 2. Generate and send agent response
      console.log('🤖 Agent responding...');
      const responseText = `This is response number ${i + 1}. Thank you for your input!`;
      const responseAudio = await ttsService.generateSpeech(responseText, 'agent-conversation');
      
      const producerId = await client.produceAudioFromBuffer(responseAudio, {
        format: 'mp3',
        sampleRate: 24000
      });

      // Wait before next turn
      await new Promise(resolve => setTimeout(resolve, 2000));
      await client.stopAudioProduction(producerId);
    }

    // Get final stats
    const stats = await client.getAudioStats();
    console.log('📊 Final audio stats:', stats);

  } catch (error) {
    console.error('❌ Error in conversation example:', error);
  }
}

/**
 * Example 4: Error handling and fallback behavior
 */
async function errorHandlingExample() {
  const client = new MediasoupBotClient('http://localhost:5002/mcp');
  
  try {
    await client.connect('room-123', 'agent-error-test');

    // Test with invalid audio buffer
    try {
      await client.produceAudioFromBuffer(null);
    } catch (error) {
      console.log('✅ Correctly caught invalid buffer error:', error.message);
    }

    // Test with invalid participant ID
    try {
      await client.consumeParticipantAudio('non-existent-participant');
    } catch (error) {
      console.log('✅ Correctly caught invalid participant error:', error.message);
    }

    // Test MCP server unavailability gracefully
    const clientBadUrl = new MediasoupBotClient('http://localhost:9999/mcp');
    try {
      await clientBadUrl.connect('room-123', 'agent-bad');
    } catch (error) {
      console.log('✅ Correctly handled MCP server unavailable:', error.message);
    }

  } catch (error) {
    console.error('❌ Unexpected error in error handling example:', error);
  }
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('🚀 Starting MCP Audio Integration Examples\n');

  try {
    await agentSpeakInRoom();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await agentListenToHuman();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await fullConversationExample();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await errorHandlingExample();

    console.log('\n✅ All examples completed successfully!');

  } catch (error) {
    console.error('❌ Error running examples:', error);
  }
}

// Export for use in tests
module.exports = {
  agentSpeakInRoom,
  agentListenToHuman,
  fullConversationExample,
  errorHandlingExample,
  runAllExamples
};

// Run examples if called directly
if (require.main === module) {
  runAllExamples();
}
