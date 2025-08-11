const { EventEmitter } = require('events');
const axios = require('axios');

/**
 * Mediasoup Bot Client using MCP server
 * Provides WebRTC audio communication through MCP (Model Context Protocol) server integration.
 * 
 * Key Features:
 * - Real audio production via MCP produce_audio_stream tool
 * - Audio consumption from participants via MCP consume_audio_stream tool
 * - Base64 audio buffer handling for JSON-RPC compatibility
 * - Event-driven architecture for real-time audio operations
 * - Backward compatibility with legacy audio methods
 * 
 * MCP Audio Tools (as defined in mcp.json):
 * - produce_audio_stream: Send TTS audio to Mediasoup room
 * - consume_audio_stream: Consume audio from any participant
 * - join_room: Join a Mediasoup room
 * - leave_room: Leave a Mediasoup room
 * - send_message: Send message to room
 * - get_room_info: Get room information
 * - list_participants: List room participants
 * 
 * @example
 * const client = new MediasoupBotClient('http://localhost:5002/mcp');
 * await client.connect('room-123', 'agent-alice');
 * 
 * // Send TTS audio to room
 * const audioBuffer = await ttsService.generateSpeech('Hello world!', 'alice');
 * const producerId = await client.produceAudioFromBuffer(audioBuffer);
 * 
 * // Listen to human participant
 * const humanAudio = await client.consumeParticipantAudio('human-123', {
 *   durationMs: 3000,
 *   format: 'mp3'
 * });
 */
class MediasoupBotClient extends EventEmitter {
  constructor(mcpServerUrl = 'http://localhost:5002/mcp') {
    super();
    this.mcpServerUrl = mcpServerUrl;
    this.roomId = null;
    this.peerId = null;
    this.connected = false;
    this.requestId = 1;
  }

  /**
   * Connect to Mediasoup server and join room via MCP
   * @param {string} roomId - Room identifier
   * @param {string} peerId - Unique peer identifier (agent ID)
   * @param {Object} options - Connection options
   */
  async connect(roomId, peerId, options = {}) {
    try {
      this.roomId = roomId;
      this.peerId = peerId;

      // Join room via MCP server
      const result = await this._callMCPTool('join_room', {
        roomId: roomId,
        agentName: peerId
      });

      this.connected = true;

      console.log(`🎯 Bot client connected to room ${roomId} as peer ${peerId}`);
      this.emit('connected', { roomId, peerId, result });

    } catch (error) {
      console.error(`❌ Failed to connect bot client:`, error);
      throw error;
    }
  }

  /**
   * Disconnect from Mediasoup server via MCP
   */
  async disconnect() {
    try {
      this.connected = false;

      if (this.roomId) {
        // Leave room via MCP server
        await this._callMCPTool('leave_room', {
          roomId: this.roomId
        });
      }

      console.log(`🔌 Bot client disconnected from room ${this.roomId}`);
      this.emit('disconnected', { roomId: this.roomId, peerId: this.peerId });

      // Reset state
      this.roomId = null;
      this.peerId = null;

    } catch (error) {
      console.error(`❌ Error disconnecting bot client:`, error);
    }
  }

  /**
   * Send message to room via MCP
   * @param {string} message - Message to send
   */
  async sendMessage(message) {
    if (!this.roomId) {
      throw new Error('Not connected to any room');
    }

    try {
      const result = await this._callMCPTool('send_message', {
        roomId: this.roomId,
        message: message
      });

      console.log(`📨 Message sent to room ${this.roomId}: "${message}"`);
      this.emit('messageSent', { roomId: this.roomId, message, result });

      return result;

    } catch (error) {
      console.error(`❌ Failed to send message:`, error);
      throw error;
    }
  }

  /**
   * Get room information via MCP
   * @returns {Object} Room info
   */
  async getRoomInfo() {
    if (!this.roomId) {
      throw new Error('Not connected to any room');
    }

    try {
      const result = await this._callMCPTool('get_room_info', {
        roomId: this.roomId
      });

      return result;

    } catch (error) {
      console.error(`❌ Failed to get room info:`, error);
      throw error;
    }
  }

  /**
   * List participants in room via MCP
   * @returns {Array} List of participants
   */
  async listParticipants() {
    if (!this.roomId) {
      throw new Error('Not connected to any room');
    }

    try {
      const result = await this._callMCPTool('list_participants', {
        roomId: this.roomId
      });

      return result;

    } catch (error) {
      console.error(`❌ Failed to list participants:`, error);
      throw error;
    }
  }

  /**
   * Produce audio from buffer using MCP server
   * Sends TTS audio buffer to the room via MCP produce_audio_stream tool
   * @param {Buffer} audioBuffer - Audio data buffer from TTS
   * @param {Object} options - Audio production options
   * @param {string} options.format - Audio format (default: 'mp3')
   * @param {number} options.sampleRate - Sample rate (default: 24000)
   * @param {number} options.channels - Number of channels (default: 1)
   * @returns {Promise<string>} Producer ID
   */
  async produceAudioFromBuffer(audioBuffer, options = {}) {
    if (!this.connected) {
      throw new Error('Not connected to room');
    }

    if (!audioBuffer || !Buffer.isBuffer(audioBuffer)) {
      throw new Error('Invalid audio buffer provided');
    }

    try {
      const {
        format = 'mp3',
        sampleRate = 24000,
        channels = 1
      } = options;

      // Convert buffer to base64 for JSON-RPC compatibility
      const audioBase64 = audioBuffer.toString('base64');

      // Call MCP produce_audio_stream tool (correct tool name)
      const result = await this._callMCPTool('produce_audio_stream', {
        roomId: this.roomId,
        agentName: this.peerId,
        audioData: audioBase64,
        format: format,
        sampleRate: sampleRate,
        channels: channels
      });

      const producerId = result.producerId || `producer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log(`🎵 Audio produced via MCP: ${producerId} (${audioBuffer.length} bytes, ${format})`);
      this.emit('audioProduced', { 
        producerId, 
        audioBuffer, 
        format, 
        sampleRate, 
        channels,
        result 
      });

      return producerId;

    } catch (error) {
      console.error(`❌ Failed to produce audio via MCP:`, error);
      throw error;
    }
  }

  /**
   * Consume audio from any participant in the room via MCP server
   * Fetches audio stream from specified participant using MCP consume_audio_stream tool
   * @param {string} participantId - ID of participant to consume audio from
   * @param {Object} options - Audio consumption options
   * @param {number} options.durationMs - Duration to capture in milliseconds (default: 5000)
   * @param {string} options.format - Desired audio format (default: 'mp3')
   * @param {number} options.sampleRate - Desired sample rate (default: 24000)
   * @returns {Promise<Object>} Consumer info with audio data
   */
  async consumeParticipantAudio(participantId, options = {}) {
    if (!this.connected) {
      throw new Error('Not connected to room');
    }

    if (!participantId) {
      throw new Error('Participant ID is required');
    }

    try {
      const {
        durationMs = 5000,
        format = 'mp3',
        sampleRate = 24000
      } = options;

      // Call MCP consume_audio_stream tool (correct tool name)
      const result = await this._callMCPTool('consume_audio_stream', {
        roomId: this.roomId,
        participantId: participantId,
        durationMs: durationMs,
        format: format,
        sampleRate: sampleRate
      });

      const consumerId = result.consumerId || `consumer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Convert base64 audio data back to buffer if provided
      let audioBuffer = null;
      if (result.audioData) {
        audioBuffer = Buffer.from(result.audioData, 'base64');
      }

      console.log(`🎧 Audio consumed via MCP: ${consumerId} from participant ${participantId} (${audioBuffer ? audioBuffer.length : 0} bytes)`);
      
      const consumerInfo = {
        consumerId,
        participantId,
        audioBuffer,
        format,
        sampleRate,
        durationMs,
        timestamp: new Date().toISOString(),
        result
      };

      this.emit('audioConsumed', consumerInfo);

      return consumerInfo;

    } catch (error) {
      console.error(`❌ Failed to consume participant audio via MCP:`, error);
      throw error;
    }
  }

  /**
   * Produce audio stream (deprecated - use produceAudioFromBuffer instead)
   * @deprecated Use produceAudioFromBuffer for MCP integration
   * @param {MediaStreamTrack} track - Audio track from TTS
   * @param {Object} options - Producer options
   * @returns {string} Producer ID
   */
  async produceAudio(track, options = {}) {
    console.warn('⚠️ produceAudio is deprecated. Use produceAudioFromBuffer for MCP integration.');
    
    if (!this.connected) {
      throw new Error('Not connected to room');
    }

    try {
      // Legacy simulation for backward compatibility
      const producerId = `legacy_producer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log(`🎵 Audio producer (legacy): ${producerId}`);
      this.emit('audioProduced', { producerId, track });

      return producerId;

    } catch (error) {
      console.error(`❌ Failed to produce audio (legacy):`, error);
      throw error;
    }
  }

  /**
   * Consume audio from another participant (deprecated - use consumeParticipantAudio instead)
   * @deprecated Use consumeParticipantAudio for MCP integration
   * @param {string} producerId - Remote producer ID
   * @param {Object} rtpParameters - RTP parameters
   * @returns {string} Consumer ID
   */
  async consumeAudio(producerId, rtpParameters) {
    console.warn('⚠️ consumeAudio is deprecated. Use consumeParticipantAudio for MCP integration.');
    
    if (!this.connected) {
      throw new Error('Not connected to room');
    }

    try {
      // Legacy simulation for backward compatibility
      const consumerId = `legacy_consumer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log(`🎧 Audio consumer (legacy): ${consumerId}`);
      this.emit('audioConsumed', { 
        consumerId, 
        producerId, 
        track: null
      });

      return consumerId;

    } catch (error) {
      console.error(`❌ Failed to consume audio (legacy):`, error);
      throw error;
    }
  }

  /**
   * Stop audio production
   * @param {string} producerId - Producer ID to stop
   */
  async stopAudioProduction(producerId) {
    try {
      console.log(`🛑 Stopped audio production: ${producerId}`);
      this.emit('audioProductionStopped', { producerId });

      // Note: No dedicated MCP tool for stopping production
      // The MCP server handles stream lifecycle internally

    } catch (error) {
      console.error(`❌ Error stopping audio production:`, error);
      throw error;
    }
  }

  /**
   * Stop audio consumption
   * @param {string} consumerId - Consumer ID to stop
   */
  async stopAudioConsumption(consumerId) {
    try {
      console.log(`🛑 Stopped audio consumption: ${consumerId}`);
      this.emit('audioConsumptionStopped', { consumerId });

      // Note: No dedicated MCP tool for stopping consumption
      // The MCP server handles stream lifecycle internally

    } catch (error) {
      console.error(`❌ Error stopping audio consumption:`, error);
      throw error;
    }
  }

  /**
   * Get audio statistics including MCP operations
   * @returns {Object} Audio stats
   */
  async getAudioStats() {
    try {
      const baseStats = {
        connected: this.connected,
        roomId: this.roomId,
        peerId: this.peerId,
        timestamp: new Date().toISOString(),
        mcpServerUrl: this.mcpServerUrl
      };

      // Try to get room info which may include audio-related statistics
      if (this.connected) {
        try {
          const roomInfo = await this.getRoomInfo();
          
          return {
            ...baseStats,
            roomInfo: roomInfo
          };
        } catch (error) {
          console.warn(`⚠️ Could not get room info: ${error.message}`);
        }
      }

      return baseStats;

    } catch (error) {
      console.error(`❌ Error getting audio stats:`, error);
      // Return basic stats even if room info fails
      return {
        connected: this.connected,
        roomId: this.roomId,
        peerId: this.peerId,
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Get available audio participants in the room
   * Uses the existing list_participants tool since there's no dedicated audio participants tool
   * @returns {Promise<Array>} List of participants with audio capabilities
   */
  async getAudioParticipants() {
    if (!this.connected) {
      throw new Error('Not connected to room');
    }

    try {
      // Use the existing list_participants tool
      const participants = await this.listParticipants();
      
      // Return all participants since we don't have a specific audio filter
      // The MCP server will handle audio capability filtering internally
      return participants;

    } catch (error) {
      console.error(`❌ Failed to get audio participants:`, error);
      return [];
    }
  }

  /**
   * Test MCP audio tools availability
   * @returns {Promise<Object>} Tool availability status
   */
  async testMCPAudioTools() {
    const tools = {
      produce_audio_stream: false,
      consume_audio_stream: false
    };

    for (const toolName of Object.keys(tools)) {
      try {
        // Test with minimal parameters to check tool availability
        await this._callMCPTool(toolName, { test: true });
        tools[toolName] = true;
      } catch (error) {
        // Tool not available or test failed
        console.warn(`⚠️ MCP tool ${toolName} not available: ${error.message}`);
      }
    }

    return tools;
  }

  /**
   * Call MCP tool
   * @private
   * @param {string} toolName - Name of the MCP tool
   * @param {Object} args - Tool arguments
   * @returns {Promise<Object>} Tool result
   */
  async _callMCPTool(toolName, args) {
    try {
      const response = await axios.post(this.mcpServerUrl, {
        jsonrpc: '2.0',
        id: this.requestId++,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data.error) {
        throw new Error(`MCP Error: ${response.data.error.message}`);
      }

      return response.data.result;

    } catch (error) {
      if (error.response) {
        throw new Error(`MCP Server Error: ${error.response.status} - ${error.response.data}`);
      }
      throw error;
    }
  }

  /**
   * Get connection status
   * @returns {Object} Connection info
   */
  getConnectionInfo() {
    return {
      connected: this.connected,
      roomId: this.roomId,
      peerId: this.peerId,
      mcpServerUrl: this.mcpServerUrl
    };
  }

  /**
   * Check if client is ready
   * @returns {boolean} Ready status
   */
  isReady() {
    return this.connected;
  }
}

module.exports = MediasoupBotClient;
