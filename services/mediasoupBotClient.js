const { EventEmitter } = require('events');
const axios = require('axios');

/**
 * Mediasoup Bot Client using MCP server
 * Simplified client that uses MCP server for all WebRTC operations
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
   * Produce audio stream (simplified for MCP)
   * Since MCP server handles WebRTC, we just notify about audio production
   * @param {MediaStreamTrack} track - Audio track from TTS
   * @param {Object} options - Producer options
   * @returns {string} Producer ID
   */
  async produceAudio(track, options = {}) {
    if (!this.connected) {
      throw new Error('Not connected to room');
    }

    try {
      // For MCP integration, we'll simulate audio production
      // The actual audio streaming is handled by the MCP server
      const producerId = `producer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log(`🎵 Audio producer simulated: ${producerId}`);
      this.emit('audioProduced', { producerId, track });

      return producerId;

    } catch (error) {
      console.error(`❌ Failed to produce audio:`, error);
      throw error;
    }
  }

  /**
   * Stop audio production (simplified for MCP)
   * @param {string} producerId - Producer ID to stop
   */
  async stopAudioProduction(producerId) {
    try {
      console.log(`🛑 Stopped audio production: ${producerId}`);
      this.emit('audioProductionStopped', { producerId });

    } catch (error) {
      console.error(`❌ Error stopping audio production:`, error);
      throw error;
    }
  }

  /**
   * Consume audio from another participant (simplified for MCP)
   * @param {string} producerId - Remote producer ID
   * @param {Object} rtpParameters - RTP parameters
   * @returns {string} Consumer ID
   */
  async consumeAudio(producerId, rtpParameters) {
    if (!this.connected) {
      throw new Error('Not connected to room');
    }

    try {
      // For MCP integration, we'll simulate audio consumption
      // The actual audio streaming is handled by the MCP server
      const consumerId = `consumer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log(`🎧 Audio consumer simulated: ${consumerId}`);
      this.emit('audioConsumed', { 
        consumerId, 
        producerId, 
        track: null // MCP server handles the actual track
      });

      return consumerId;

    } catch (error) {
      console.error(`❌ Failed to consume audio:`, error);
      throw error;
    }
  }

  /**
   * Stop audio consumption (simplified for MCP)
   * @param {string} consumerId - Consumer ID to stop
   */
  async stopAudioConsumption(consumerId) {
    try {
      console.log(`🛑 Stopped audio consumption: ${consumerId}`);
      this.emit('audioConsumptionStopped', { consumerId });

    } catch (error) {
      console.error(`❌ Error stopping audio consumption:`, error);
      throw error;
    }
  }

  /**
   * Get audio statistics (simplified for MCP)
   * @returns {Object} Audio stats
   */
  async getAudioStats() {
    // Return simplified stats since MCP server handles the details
    return {
      connected: this.connected,
      roomId: this.roomId,
      peerId: this.peerId,
      timestamp: new Date().toISOString()
    };
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
