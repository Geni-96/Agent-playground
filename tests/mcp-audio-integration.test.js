/**
 * MCP Audio Integration Tests
 * Tests for the new MCP audio functionality in MediasoupBotClient
 */

const assert = require('assert');
const MediasoupBotClient = require('../services/mediasoupBotClient');

describe('MCP Audio Integration Tests', () => {
  let client;
  const testRoomId = 'test-room-audio';
  const testAgentId = 'test-agent-audio';

  beforeEach(() => {
    client = new MediasoupBotClient('http://localhost:5002/mcp');
  });

  afterEach(async () => {
    if (client && client.connected) {
      await client.disconnect();
    }
  });

  describe('Connection and Setup', () => {
    it('should connect to MCP server successfully', async () => {
      await client.connect(testRoomId, testAgentId);
      assert.strictEqual(client.connected, true);
      assert.strictEqual(client.roomId, testRoomId);
      assert.strictEqual(client.peerId, testAgentId);
    });

    it('should test MCP audio tools availability', async () => {
      await client.connect(testRoomId, testAgentId);
      const toolStatus = await client.testMCPAudioTools();
      
      assert.strictEqual(typeof toolStatus, 'object');
      assert.strictEqual(typeof toolStatus.produce_audio, 'boolean');
      assert.strictEqual(typeof toolStatus.get_human_audio, 'boolean');
    });
  });

  describe('Audio Production via MCP', () => {
    beforeEach(async () => {
      await client.connect(testRoomId, testAgentId);
    });

    it('should produce audio from buffer successfully', async () => {
      const testAudioBuffer = Buffer.from('fake audio data');
      
      const producerId = await client.produceAudioFromBuffer(testAudioBuffer, {
        format: 'mp3',
        sampleRate: 24000,
        channels: 1
      });

      assert.strictEqual(typeof producerId, 'string');
      assert.strictEqual(producerId.length > 0, true);
    });

    it('should reject invalid audio buffer', async () => {
      try {
        await client.produceAudioFromBuffer(null);
        assert.fail('Should have thrown error for null buffer');
      } catch (error) {
        assert.strictEqual(error.message, 'Invalid audio buffer provided');
      }
    });

    it('should reject non-buffer audio data', async () => {
      try {
        await client.produceAudioFromBuffer('not a buffer');
        assert.fail('Should have thrown error for non-buffer data');
      } catch (error) {
        assert.strictEqual(error.message, 'Invalid audio buffer provided');
      }
    });

    it('should handle audio production options correctly', async () => {
      const testAudioBuffer = Buffer.from('test audio');
      
      const producerId = await client.produceAudioFromBuffer(testAudioBuffer, {
        format: 'wav',
        sampleRate: 16000,
        channels: 2
      });

      assert.strictEqual(typeof producerId, 'string');
    });
  });

  describe('Audio Consumption via MCP', () => {
    beforeEach(async () => {
      await client.connect(testRoomId, testAgentId);
    });

    it('should consume participant audio successfully', async () => {
      const testParticipantId = 'test-human-participant';
      
      const consumerInfo = await client.consumeParticipantAudio(testParticipantId, {
        durationMs: 1000,
        format: 'mp3',
        sampleRate: 24000
      });

      assert.strictEqual(typeof consumerInfo, 'object');
      assert.strictEqual(consumerInfo.participantId, testParticipantId);
      assert.strictEqual(typeof consumerInfo.consumerId, 'string');
    });

    it('should reject empty participant ID', async () => {
      try {
        await client.consumeParticipantAudio('');
        assert.fail('Should have thrown error for empty participant ID');
      } catch (error) {
        assert.strictEqual(error.message, 'Participant ID is required');
      }
    });

    it('should handle consumption options correctly', async () => {
      const consumerInfo = await client.consumeParticipantAudio('participant-123', {
        durationMs: 5000,
        format: 'wav',
        sampleRate: 16000
      });

      assert.strictEqual(consumerInfo.durationMs, 5000);
      assert.strictEqual(consumerInfo.format, 'wav');
      assert.strictEqual(consumerInfo.sampleRate, 16000);
    });
  });

  describe('Audio Participants Management', () => {
    beforeEach(async () => {
      await client.connect(testRoomId, testAgentId);
    });

    it('should get audio participants list', async () => {
      const participants = await client.getAudioParticipants();
      
      assert.strictEqual(Array.isArray(participants), true);
    });
  });

  describe('Audio Statistics', () => {
    beforeEach(async () => {
      await client.connect(testRoomId, testAgentId);
    });

    it('should return audio statistics', async () => {
      const stats = await client.getAudioStats();
      
      assert.strictEqual(typeof stats, 'object');
      assert.strictEqual(stats.connected, true);
      assert.strictEqual(stats.roomId, testRoomId);
      assert.strictEqual(stats.peerId, testAgentId);
      assert.strictEqual(typeof stats.timestamp, 'string');
    });
  });

  describe('Legacy Method Compatibility', () => {
    beforeEach(async () => {
      await client.connect(testRoomId, testAgentId);
    });

    it('should support legacy produceAudio method with deprecation warning', async () => {
      const mockTrack = { kind: 'audio', id: 'test-track' };
      
      const producerId = await client.produceAudio(mockTrack);
      
      assert.strictEqual(typeof producerId, 'string');
      assert.strictEqual(producerId.startsWith('legacy_'), true);
    });

    it('should support legacy consumeAudio method with deprecation warning', async () => {
      const mockProducerId = 'test-producer-id';
      const mockRtpParams = { codecs: [] };
      
      const consumerId = await client.consumeAudio(mockProducerId, mockRtpParams);
      
      assert.strictEqual(typeof consumerId, 'string');
      assert.strictEqual(consumerId.startsWith('legacy_'), true);
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await client.connect(testRoomId, testAgentId);
    });

    it('should emit audioProduced event on successful production', (done) => {
      const testBuffer = Buffer.from('test');
      
      client.once('audioProduced', (data) => {
        assert.strictEqual(typeof data.producerId, 'string');
        assert.strictEqual(Buffer.isBuffer(data.audioBuffer), true);
        done();
      });

      client.produceAudioFromBuffer(testBuffer);
    });

    it('should emit audioConsumed event on successful consumption', (done) => {
      client.once('audioConsumed', (data) => {
        assert.strictEqual(typeof data.consumerId, 'string');
        assert.strictEqual(typeof data.participantId, 'string');
        done();
      });

      client.consumeParticipantAudio('test-participant');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when not connected to room', async () => {
      try {
        await client.produceAudioFromBuffer(Buffer.from('test'));
        assert.fail('Should have thrown error when not connected');
      } catch (error) {
        assert.strictEqual(error.message, 'Not connected to room');
      }
    });

    it('should handle MCP server errors gracefully', async () => {
      const badClient = new MediasoupBotClient('http://localhost:9999/mcp');
      
      try {
        await badClient.connect(testRoomId, testAgentId);
        assert.fail('Should have thrown error for bad MCP server');
      } catch (error) {
        assert.strictEqual(error.message.includes('MCP'), true);
      }
    });
  });

  describe('Base64 Audio Handling', () => {
    beforeEach(async () => {
      await client.connect(testRoomId, testAgentId);
    });

    it('should properly encode buffer to base64 for MCP', async () => {
      const testData = 'test audio data';
      const testBuffer = Buffer.from(testData, 'utf8');
      const expectedBase64 = testBuffer.toString('base64');
      
      // Mock the MCP call to verify base64 encoding
      const originalCall = client._callMCPTool;
      let capturedArgs = null;
      
      client._callMCPTool = async (toolName, args) => {
        capturedArgs = args;
        return { producerId: 'test-producer' };
      };

      await client.produceAudioFromBuffer(testBuffer);
      
      assert.strictEqual(capturedArgs.audioData, expectedBase64);
      
      // Restore original method
      client._callMCPTool = originalCall;
    });

    it('should properly decode base64 from MCP to buffer', async () => {
      const testData = 'received audio data';
      const testBase64 = Buffer.from(testData, 'utf8').toString('base64');
      
      // Mock the MCP call to return base64 data
      const originalCall = client._callMCPTool;
      client._callMCPTool = async (toolName, args) => {
        return {
          consumerId: 'test-consumer',
          audioData: testBase64
        };
      };

      const result = await client.consumeParticipantAudio('test-participant');
      
      assert.strictEqual(Buffer.isBuffer(result.audioBuffer), true);
      assert.strictEqual(result.audioBuffer.toString('utf8'), testData);
      
      // Restore original method
      client._callMCPTool = originalCall;
    });
  });
});

module.exports = {
  // Export test suite for integration with other test runners
  testSuite: 'MCP Audio Integration Tests'
};
