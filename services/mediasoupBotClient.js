const mediasoupClient = require('mediasoup-client');
const WebSocket = require('ws');
const { EventEmitter } = require('events');

/**
 * Mediasoup Bot Client for server-side WebRTC connections
 * Allows agents to join rooms as virtual participants
 */
class MediasoupBotClient extends EventEmitter {
  constructor(mediasoupServerUrl = 'ws://localhost:5001') {
    super();
    this.mediasoupServerUrl = mediasoupServerUrl;
    this.ws = null;
    this.device = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.producers = new Map(); // audio producers
    this.consumers = new Map(); // audio consumers
    this.roomId = null;
    this.peerId = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
  }

  /**
   * Connect to Mediasoup server and join room
   * @param {string} roomId - Room identifier
   * @param {string} peerId - Unique peer identifier (agent ID)
   * @param {Object} options - Connection options
   */
  async connect(roomId, peerId, options = {}) {
    try {
      this.roomId = roomId;
      this.peerId = peerId;

      // Initialize WebSocket connection
      await this._connectWebSocket();

      // Initialize Mediasoup device
      await this._initializeDevice();

      // Create WebRTC transports
      await this._createTransports();

      // Join the room
      await this._joinRoom(options);

      this.connected = true;
      this.reconnectAttempts = 0;

      console.log(`🎯 Bot client connected to room ${roomId} as peer ${peerId}`);
      this.emit('connected', { roomId, peerId });

    } catch (error) {
      console.error(`❌ Failed to connect bot client:`, error);
      throw error;
    }
  }

  /**
   * Disconnect from Mediasoup server
   */
  async disconnect() {
    try {
      this.connected = false;

      // Close all producers
      for (const producer of this.producers.values()) {
        producer.close();
      }
      this.producers.clear();

      // Close all consumers
      for (const consumer of this.consumers.values()) {
        consumer.close();
      }
      this.consumers.clear();

      // Close transports
      if (this.sendTransport) {
        this.sendTransport.close();
        this.sendTransport = null;
      }

      if (this.recvTransport) {
        this.recvTransport.close();
        this.recvTransport = null;
      }

      // Close WebSocket
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }

      console.log(`🔌 Bot client disconnected from room ${this.roomId}`);
      this.emit('disconnected', { roomId: this.roomId, peerId: this.peerId });

    } catch (error) {
      console.error(`❌ Error disconnecting bot client:`, error);
    }
  }

  /**
   * Produce audio stream (for TTS output)
   * @param {MediaStreamTrack} track - Audio track from TTS
   * @param {Object} options - Producer options
   * @returns {string} Producer ID
   */
  async produceAudio(track, options = {}) {
    if (!this.sendTransport) {
      throw new Error('Send transport not available');
    }

    try {
      const producer = await this.sendTransport.produce({
        kind: 'audio',
        track,
        codecOptions: {
          opusStereo: false,
          opusFec: true,
          opusDtx: true,
          opusMaxPlaybackRate: 48000,
          ...options.codecOptions
        },
        ...options
      });

      this.producers.set(producer.id, producer);

      producer.on('transportclose', () => {
        this.producers.delete(producer.id);
        console.log(`🔊 Audio producer ${producer.id} transport closed`);
      });

      producer.on('@close', () => {
        this.producers.delete(producer.id);
        console.log(`🔊 Audio producer ${producer.id} closed`);
      });

      console.log(`🎵 Audio producer created: ${producer.id}`);
      this.emit('audioProduced', { producerId: producer.id, track });

      return producer.id;

    } catch (error) {
      console.error(`❌ Failed to produce audio:`, error);
      throw error;
    }
  }

  /**
   * Stop audio production
   * @param {string} producerId - Producer ID to stop
   */
  async stopAudioProduction(producerId) {
    const producer = this.producers.get(producerId);
    if (!producer) {
      throw new Error(`Producer ${producerId} not found`);
    }

    try {
      producer.close();
      this.producers.delete(producerId);
      console.log(`🛑 Stopped audio production: ${producerId}`);
      this.emit('audioProductionStopped', { producerId });

    } catch (error) {
      console.error(`❌ Error stopping audio production:`, error);
      throw error;
    }
  }

  /**
   * Consume audio from another participant
   * @param {string} producerId - Remote producer ID
   * @param {Object} rtpParameters - RTP parameters
   * @returns {string} Consumer ID
   */
  async consumeAudio(producerId, rtpParameters) {
    if (!this.recvTransport) {
      throw new Error('Receive transport not available');
    }

    try {
      const consumer = await this.recvTransport.consume({
        id: producerId,
        producerId,
        kind: 'audio',
        rtpParameters
      });

      this.consumers.set(consumer.id, consumer);

      consumer.on('transportclose', () => {
        this.consumers.delete(consumer.id);
        console.log(`🎧 Audio consumer ${consumer.id} transport closed`);
      });

      consumer.on('@close', () => {
        this.consumers.delete(consumer.id);
        console.log(`🎧 Audio consumer ${consumer.id} closed`);
      });

      consumer.on('trackended', () => {
        console.log(`🎧 Audio consumer ${consumer.id} track ended`);
      });

      consumer.on('layerschange', (layers) => {
        console.log(`🎧 Audio consumer ${consumer.id} layers changed:`, layers);
      });

      // Resume consumer to start receiving media
      await consumer.resume();

      console.log(`🎧 Audio consumer created: ${consumer.id}`);
      this.emit('audioConsumed', { 
        consumerId: consumer.id, 
        producerId, 
        track: consumer.track 
      });

      return consumer.id;

    } catch (error) {
      console.error(`❌ Failed to consume audio:`, error);
      throw error;
    }
  }

  /**
   * Stop audio consumption
   * @param {string} consumerId - Consumer ID to stop
   */
  async stopAudioConsumption(consumerId) {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) {
      throw new Error(`Consumer ${consumerId} not found`);
    }

    try {
      consumer.close();
      this.consumers.delete(consumerId);
      console.log(`🛑 Stopped audio consumption: ${consumerId}`);
      this.emit('audioConsumptionStopped', { consumerId });

    } catch (error) {
      console.error(`❌ Error stopping audio consumption:`, error);
      throw error;
    }
  }

  /**
   * Get audio statistics
   * @returns {Object} Audio stats
   */
  async getAudioStats() {
    const stats = {
      producers: {},
      consumers: {}
    };

    // Get producer stats
    for (const [id, producer] of this.producers) {
      try {
        stats.producers[id] = await producer.getStats();
      } catch (error) {
        console.error(`Error getting producer stats for ${id}:`, error);
      }
    }

    // Get consumer stats
    for (const [id, consumer] of this.consumers) {
      try {
        stats.consumers[id] = await consumer.getStats();
      } catch (error) {
        console.error(`Error getting consumer stats for ${id}:`, error);
      }
    }

    return stats;
  }

  /**
   * Initialize WebSocket connection
   * @private
   */
  async _connectWebSocket() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.mediasoupServerUrl);

      this.ws.on('open', () => {
        console.log(`📡 WebSocket connected to ${this.mediasoupServerUrl}`);
        resolve();
      });

      this.ws.on('error', (error) => {
        console.error(`❌ WebSocket error:`, error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log(`🔌 WebSocket disconnected`);
        this.connected = false;
        this._handleReconnection();
      });

      this.ws.on('message', (data) => {
        this._handleWebSocketMessage(JSON.parse(data.toString()));
      });
    });
  }

  /**
   * Initialize Mediasoup device
   * @private
   */
  async _initializeDevice() {
    try {
      this.device = new mediasoupClient.Device();

      // Get router RTP capabilities from server
      const routerRtpCapabilities = await this._sendRequest('getRouterRtpCapabilities');

      // Load device with router capabilities
      await this.device.load({ routerRtpCapabilities });

      console.log(`📱 Mediasoup device loaded`);

    } catch (error) {
      console.error(`❌ Failed to initialize device:`, error);
      throw error;
    }
  }

  /**
   * Create WebRTC transports
   * @private
   */
  async _createTransports() {
    try {
      // Create send transport
      const sendTransportOptions = await this._sendRequest('createWebRtcTransport', {
        producing: true,
        consuming: false
      });

      this.sendTransport = this.device.createSendTransport(sendTransportOptions);

      this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await this._sendRequest('connectWebRtcTransport', {
            transportId: this.sendTransport.id,
            dtlsParameters
          });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      this.sendTransport.on('produce', async (parameters, callback, errback) => {
        try {
          const { id } = await this._sendRequest('produce', {
            transportId: this.sendTransport.id,
            kind: parameters.kind,
            rtpParameters: parameters.rtpParameters,
            appData: parameters.appData
          });
          callback({ id });
        } catch (error) {
          errback(error);
        }
      });

      // Create receive transport
      const recvTransportOptions = await this._sendRequest('createWebRtcTransport', {
        producing: false,
        consuming: true
      });

      this.recvTransport = this.device.createRecvTransport(recvTransportOptions);

      this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await this._sendRequest('connectWebRtcTransport', {
            transportId: this.recvTransport.id,
            dtlsParameters
          });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      console.log(`🚛 WebRTC transports created`);

    } catch (error) {
      console.error(`❌ Failed to create transports:`, error);
      throw error;
    }
  }

  /**
   * Join room
   * @private
   */
  async _joinRoom(options) {
    try {
      await this._sendRequest('join', {
        roomId: this.roomId,
        peerId: this.peerId,
        rtpCapabilities: this.device.rtpCapabilities,
        ...options
      });

      console.log(`🚪 Joined room ${this.roomId} as ${this.peerId}`);

    } catch (error) {
      console.error(`❌ Failed to join room:`, error);
      throw error;
    }
  }

  /**
   * Send request to server
   * @private
   */
  async _sendRequest(method, data = {}) {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).substr(2, 9);
      const request = {
        id,
        method,
        data
      };

      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout: ${method}`));
      }, 10000);

      const handleResponse = (message) => {
        if (message.id === id) {
          clearTimeout(timeout);
          this.ws.off('message', handleResponse);
          
          if (message.error) {
            reject(new Error(message.error));
          } else {
            resolve(message.data);
          }
        }
      };

      this.ws.on('message', (data) => {
        handleResponse(JSON.parse(data.toString()));
      });

      this.ws.send(JSON.stringify(request));
    });
  }

  /**
   * Handle WebSocket messages
   * @private
   */
  _handleWebSocketMessage(message) {
    switch (message.method) {
      case 'newProducer':
        this.emit('newProducer', message.data);
        break;
      case 'producerClosed':
        this.emit('producerClosed', message.data);
        break;
      case 'newPeer':
        this.emit('newPeer', message.data);
        break;
      case 'peerClosed':
        this.emit('peerClosed', message.data);
        break;
      default:
        // Handle other messages
        break;
    }
  }

  /**
   * Handle reconnection logic
   * @private
   */
  async _handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Max reconnection attempts reached`);
      this.emit('reconnectionFailed');
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    setTimeout(async () => {
      try {
        await this.connect(this.roomId, this.peerId);
        this.emit('reconnected');
      } catch (error) {
        console.error(`❌ Reconnection attempt failed:`, error);
        this._handleReconnection();
      }
    }, this.reconnectDelay * this.reconnectAttempts);
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
      producerCount: this.producers.size,
      consumerCount: this.consumers.size,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * Check if client is ready
   * @returns {boolean} Ready status
   */
  isReady() {
    return this.connected && this.device && this.sendTransport && this.recvTransport;
  }
}

module.exports = MediasoupBotClient;
