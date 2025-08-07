const { EventEmitter } = require('events');
const Agent = require('../agents/Agent');
const redisService = require('../services/redisService');
const MediasoupBotClient = require('../services/mediasoupBotClient');
const audioPipelineService = require('../services/audioPipelineService');
const asrService = require('../services/asrService');
const ttsService = require('../services/ttsService');
const { v4: uuidv4 } = require('uuid');

/**
 * AgentManager - Orchestrates all agents in the simulation with Mediasoup integration
 */
class AgentManager extends EventEmitter {
  constructor() {
    super(); // Initialize EventEmitter
    this.agents = new Map(); // Map of agentId -> Agent instance
    this.agentConnections = new Map(); // Map of agentId -> MediasoupBotClient
    this.agentPipelines = new Map(); // Map of agentId -> audio pipelines
    this.roomAgents = new Map(); // Map of roomId -> Set of agentIds
    this.agentRooms = new Map(); // Map of agentId -> roomId
    this.turnTakingQueue = new Map(); // Map of roomId -> speaking queue
    this.conversationState = new Map(); // Map of roomId -> conversation state
    this.isInitialized = false;
    this.maxAgents = parseInt(process.env.MAX_AGENTS) || 10;
    this.maxAgentsPerRoom = parseInt(process.env.MAX_AGENTS_PER_ROOM) || 5;
    this.mediasoupServerUrl = process.env.MEDIASOUP_SERVER_URL || 'http://localhost:5001';
    this.speakingTimeLimit = parseInt(process.env.SPEAKING_TIME_LIMIT) || 30000; // 30 seconds
    this.channels = {
      CREATE_AGENT: 'agent:create',
      DELETE_AGENT: 'agent:delete',
      AGENT_MESSAGE: 'agent:message',
      BROADCAST: 'agent:broadcast',
      JOIN_ROOM: 'agent:join_room',
      LEAVE_ROOM: 'agent:leave_room',
      START_SPEAKING: 'agent:start_speaking',
      STOP_SPEAKING: 'agent:stop_speaking',
      TRANSCRIPTION: 'transcription:completed'
    };
  }

  /**
   * Initialize the Agent Manager
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('⚠️ Agent Manager already initialized');
      return;
    }

    try {
      // Set up Redis subscriptions for agent control
      await this.setupRedisSubscriptions();
      
      // Create a default agent for testing
      const defaultAgent = new Agent("You are a helpful AI assistant ready to participate in conversations.");
      this.addAgent(defaultAgent);
      
      this.isInitialized = true;
      console.log('🎭 Agent Manager initialized successfully');
      console.log(`📊 Current agents: ${this.agents.size}/${this.maxAgents}`);
      
    } catch (error) {
      console.error('❌ Failed to initialize Agent Manager:', error);
      throw error;
    }
  }

  /**
   * Set up Redis subscriptions for agent control messages
   */
  async setupRedisSubscriptions() {
    // Subscribe to agent creation requests
    await redisService.subscribe(this.channels.CREATE_AGENT, (message) => {
      this.handleCreateAgentRequest(message);
    });

    // Subscribe to agent deletion requests
    await redisService.subscribe(this.channels.DELETE_AGENT, (message) => {
      this.handleDeleteAgentRequest(message);
    });

    // Subscribe to agent messages
    await redisService.subscribe(this.channels.AGENT_MESSAGE, (message) => {
      this.handleAgentMessage(message);
    });

    // Subscribe to broadcast messages
    await redisService.subscribe(this.channels.BROADCAST, (message) => {
      this.handleBroadcastMessage(message);
    });

    // Subscribe to room join requests
    await redisService.subscribe(this.channels.JOIN_ROOM, (message) => {
      this.handleJoinRoomRequest(message);
    });

    // Subscribe to room leave requests
    await redisService.subscribe(this.channels.LEAVE_ROOM, (message) => {
      this.handleLeaveRoomRequest(message);
    });

    // Subscribe to transcriptions
    await redisService.subscribe(this.channels.TRANSCRIPTION, (message) => {
      this.handleTranscription(message);
    });

    console.log('📡 Redis subscriptions set up for Agent Manager');
  }

  /**
   * Handle agent creation requests from Redis
   * @param {string} message - JSON string with agent creation parameters
   */
  async handleCreateAgentRequest(message) {
    try {
      const request = JSON.parse(message);
      const { persona, agentId, personaType } = request;

      if (this.agents.size >= this.maxAgents) {
        console.log(`⚠️ Cannot create agent: maximum limit (${this.maxAgents}) reached`);
        return;
      }

      let newAgent;
      if (personaType) {
        newAgent = Agent.createWithPersona(personaType, this);
      } else {
        newAgent = new Agent(persona || "You are an AI agent participating in a conversation.", agentId, config || {}, this);
      }

      this.addAgent(newAgent);
      
      // Publish agent created event
      await redisService.publish('agent:created', JSON.stringify({
        agentId: newAgent.agentId,
        persona: newAgent.persona,
        timestamp: new Date().toISOString()
      }));

    } catch (error) {
      console.error('❌ Error handling create agent request:', error);
    }
  }

  /**
   * Handle agent deletion requests from Redis
   * @param {string} message - JSON string with agent ID to delete
   */
  async handleDeleteAgentRequest(message) {
    try {
      const request = JSON.parse(message);
      const { agentId } = request;

      if (this.removeAgent(agentId)) {
        // Publish agent deleted event
        await redisService.publish('agent:deleted', JSON.stringify({
          agentId,
          timestamp: new Date().toISOString()
        }));
      }

    } catch (error) {
      console.error('❌ Error handling delete agent request:', error);
    }
  }

  /**
   * Handle messages between agents
   * @param {string} message - JSON string with message data
   */
  async handleAgentMessage(message) {
    try {
      const messageData = JSON.parse(message);
      const { from, to, content, type } = messageData;

      if (to && this.agents.has(to)) {
        // Direct message to specific agent
        const targetAgent = this.agents.get(to);
        const response = await targetAgent.processMessage({
          content,
          from,
          type: type || 'direct'
        });

        // If agent responds, publish the response
        if (response) {
          await redisService.publish(this.channels.AGENT_MESSAGE, JSON.stringify(response));
        }
      } else {
        console.log(`⚠️ Agent ${to} not found for message delivery`);
      }

    } catch (error) {
      console.error('❌ Error handling agent message:', error);
    }
  }

  /**
   * Handle broadcast messages to all agents
   * @param {string} message - JSON string with broadcast message
   */
  async handleBroadcastMessage(message) {
    try {
      const messageData = JSON.parse(message);
      const { content, from, type } = messageData;

      console.log(`📢 Broadcasting message to ${this.agents.size} agents`);

      // Send message to all agents
      const responses = [];
      for (const [agentId, agent] of this.agents) {
        if (agentId !== from) { // Don't send to sender
          const response = await agent.processMessage({
            content,
            from: from || 'system',
            type: type || 'broadcast'
          });

          if (response) {
            responses.push(response);
          }
        }
      }

      // Publish all responses
      for (const response of responses) {
        await redisService.publish('agent:response', JSON.stringify(response));
      }

    } catch (error) {
      console.error('❌ Error handling broadcast message:', error);
    }
  }

  /**
   * Add an agent to the manager
   * @param {Agent} agent - The agent instance to add
   * @returns {boolean} Success status
   */
  addAgent(agent) {
    if (!(agent instanceof Agent)) {
      throw new Error('Invalid agent: must be instance of Agent class');
    }

    if (this.agents.has(agent.agentId)) {
      console.log(`⚠️ Agent ${agent.agentId} already exists`);
      return false;
    }

    if (this.agents.size >= this.maxAgents) {
      console.log(`⚠️ Cannot add agent: maximum limit (${this.maxAgents}) reached`);
      return false;
    }

    this.agents.set(agent.agentId, agent);
    console.log(`🤖 Agent ${agent.agentId} added to manager (${this.agents.size}/${this.maxAgents})`);
    
    // Emit agent created event
    this.emit('agent:created', {
      agentId: agent.agentId,
      persona: agent.persona,
      status: agent.status,
      roomId: agent.roomId,
      createdAt: agent.createdAt,
      metadata: {
        totalMessages: agent.metadata.totalMessages,
        llmCalls: agent.metadata.llmCalls,
        ttsCalls: agent.metadata.ttsCalls,
        voiceInteractions: agent.metadata.voiceInteractions
      },
      config: {
        llm: agent.config.llm,
        tts: agent.config.tts
      }
    });
    
    return true;
  }

  /**
   * Remove an agent from the manager
   * @param {string} agentId - The ID of the agent to remove
   * @returns {boolean} Success status
   */
  removeAgent(agentId) {
    if (!this.agents.has(agentId)) {
      console.log(`⚠️ Agent ${agentId} not found`);
      return false;
    }

    const agent = this.agents.get(agentId);
    this.agents.delete(agentId);
    console.log(`🗑️ Agent ${agentId} removed from manager (${this.agents.size}/${this.maxAgents})`);
    
    // Emit agent deleted event
    this.emit('agent:deleted', {
      agentId: agentId
    });
    
    return true;
  }

  /**
   * Get an agent by ID
   * @param {string} agentId - The agent ID
   * @returns {Agent|null} The agent instance or null if not found
   */
  getAgent(agentId) {
    return this.agents.get(agentId) || null;
  }

  /**
   * Get all agents
   * @returns {Array} Array of all agent instances
   */
  getAllAgents() {
    return Array.from(this.agents.values()).map(agent => agent.getStats());
  }

  /**
   * Get agents by status
   * @param {string} status - The status to filter by
   * @returns {Array} Array of agents with the specified status
   */
  getAgentsByStatus(status) {
    return Array.from(this.agents.values())
      .filter(agent => agent.status === status)
      .map(agent => agent.getStats());
  }

  /**
   * Create a new agent with specified parameters
   * @param {string} persona - The agent's persona
   * @param {string} agentId - Optional custom agent ID
   * @returns {Agent} The created agent
   */
  createAgent(persona, agentId = null, config = {}) {
    if (this.agents.size >= this.maxAgents) {
      throw new Error(`Cannot create agent: maximum limit (${this.maxAgents}) reached`);
    }

    const agent = new Agent(persona, agentId, config, this);
    this.addAgent(agent);
    return agent;
  }

  /**
   * Send a message from one agent to another
   * @param {string} fromId - Sender agent ID
   * @param {string} toId - Recipient agent ID
   * @param {string} content - Message content
   * @returns {Object|null} Response from recipient agent
   */
  async sendMessage(fromId, toId, content) {
    const fromAgent = this.getAgent(fromId);
    const toAgent = this.getAgent(toId);

    if (!fromAgent || !toAgent) {
      throw new Error('Invalid agent IDs');
    }

    return await toAgent.processMessage({
      content,
      from: fromId,
      type: 'direct'
    });
  }

  /**
   * Broadcast a message to all agents
   * @param {string} content - Message content
   * @param {string} fromId - Optional sender ID
   * @returns {Array} Array of responses from agents
   */
  async broadcastMessage(content, fromId = 'system') {
    const responses = [];

    for (const [agentId, agent] of this.agents) {
      if (agentId !== fromId) {
        const response = await agent.processMessage({
          content,
          from: fromId,
          type: 'broadcast'
        });

        if (response) {
          responses.push(response);
        }
      }
    }

    return responses;
  }

  /**
   * Get manager statistics
   * @returns {Object} Manager statistics
   */
  getStats() {
    const agentsByStatus = {
      idle: 0,
      speaking: 0,
      listening: 0,
      processing: 0
    };

    for (const agent of this.agents.values()) {
      agentsByStatus[agent.status] = (agentsByStatus[agent.status] || 0) + 1;
    }

    const roomStats = {};
    for (const [roomId, agentIds] of this.roomAgents) {
      roomStats[roomId] = {
        agentCount: agentIds.size,
        currentSpeaker: this._getCurrentSpeaker(roomId),
        queueLength: this.turnTakingQueue.get(roomId)?.length || 0
      };
    }

    return {
      totalAgents: this.agents.size,
      maxAgents: this.maxAgents,
      agentsByStatus,
      isInitialized: this.isInitialized,
      activeConnections: this.agentConnections.size,
      activePipelines: this.agentPipelines.size,
      activeRooms: this.roomAgents.size,
      roomStats
    };
  }

  /**
   * Spawn agent into Mediasoup room
   * @param {string} agentId - Agent identifier
   * @param {string} roomId - Room identifier
   * @param {Object} options - Room options
   */
  async spawnAgentIntoRoom(agentId, roomId, options = {}) {
    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (this.agentRooms.has(agentId)) {
      throw new Error(`Agent ${agentId} already in room ${this.agentRooms.get(agentId)}`);
    }

    // Check room capacity
    const roomAgents = this.roomAgents.get(roomId) || new Set();
    if (roomAgents.size >= this.maxAgentsPerRoom) {
      throw new Error(`Room ${roomId} is at capacity (${this.maxAgentsPerRoom})`);
    }

    try {
      // Create Mediasoup bot client
      const botClient = new MediasoupBotClient(this.mediasoupServerUrl);
      
      // Set up event handlers
      this._setupBotClientEventHandlers(botClient, agentId, roomId);

      // Connect to room
      await botClient.connect(roomId, agentId, options);

      // Create audio pipelines
      const pipelines = await this._createAgentAudioPipelines(agentId);

      // Store connections and state
      this.agentConnections.set(agentId, botClient);
      this.agentPipelines.set(agentId, pipelines);
      this.agentRooms.set(agentId, roomId);
      
      if (!this.roomAgents.has(roomId)) {
        this.roomAgents.set(roomId, new Set());
        this.turnTakingQueue.set(roomId, []);
        this.conversationState.set(roomId, {
          currentSpeaker: null,
          speakingStartTime: null,
          conversationHistory: []
        });
      }
      this.roomAgents.get(roomId).add(agentId);

      agent.setStatus('listening');

      console.log(`🎯 Agent ${agentId} spawned into room ${roomId}`);
      this.emit('agentJoinedRoom', { agentId, roomId });

      // Publish event
      await redisService.publish('agent:joined_room', JSON.stringify({
        agentId,
        roomId,
        timestamp: new Date().toISOString()
      }));

    } catch (error) {
      console.error(`❌ Failed to spawn agent ${agentId} into room ${roomId}:`, error);
      await this._cleanupAgentConnection(agentId);
      throw error;
    }
  }

  /**
   * Remove agent from room
   * @param {string} agentId - Agent identifier
   */
  async removeAgentFromRoom(agentId) {
    const roomId = this.agentRooms.get(agentId);
    if (!roomId) {
      throw new Error(`Agent ${agentId} not in any room`);
    }

    try {
      await this._cleanupAgentConnection(agentId);

      // Remove from room tracking
      const roomAgents = this.roomAgents.get(roomId);
      if (roomAgents) {
        roomAgents.delete(agentId);
        
        // Clean up empty room
        if (roomAgents.size === 0) {
          this.roomAgents.delete(roomId);
          this.turnTakingQueue.delete(roomId);
          this.conversationState.delete(roomId);
        }
      }

      const agent = this.getAgent(agentId);
      if (agent) {
        agent.setStatus('idle');
      }

      console.log(`🚪 Agent ${agentId} removed from room ${roomId}`);
      this.emit('agentLeftRoom', { agentId, roomId });

      // Publish event
      await redisService.publish('agent:left_room', JSON.stringify({
        agentId,
        roomId,
        timestamp: new Date().toISOString()
      }));

    } catch (error) {
      console.error(`❌ Failed to remove agent ${agentId} from room:`, error);
      throw error;
    }
  }

  /**
   * Start agent speaking turn
   * @param {string} agentId - Agent identifier
   * @param {string} message - Message to speak
   */
  async startAgentSpeaking(agentId, message) {
    const roomId = this.agentRooms.get(agentId);
    if (!roomId) {
      throw new Error(`Agent ${agentId} not in any room`);
    }

    const conversationState = this.conversationState.get(roomId);
    if (conversationState.currentSpeaker && conversationState.currentSpeaker !== agentId) {
      throw new Error(`Another agent is currently speaking in room ${roomId}`);
    }

    const agent = this.getAgent(agentId);
    const botClient = this.agentConnections.get(agentId);
    const pipelines = this.agentPipelines.get(agentId);

    if (!agent || !botClient || !pipelines) {
      throw new Error(`Agent ${agentId} not properly connected`);
    }

    try {
      // Update conversation state
      conversationState.currentSpeaker = agentId;
      conversationState.speakingStartTime = Date.now();
      
      agent.setStatus('speaking');

      // Generate TTS audio
      const ttsResult = await ttsService.generateSpeech(message, {
        voice: agent.voiceId || 'default',
        speed: 1.0,
        format: 'mp3'
      });

      // Convert TTS to WebRTC format
      const webrtcAudio = await audioPipelineService.convertTTSToWebRTC(
        ttsResult.audioBuffer,
        { inputFormat: 'mp3', outputFormat: 'opus' }
      );

      // Create audio track
      const audioTrack = await audioPipelineService.createAudioTrackFromBuffer(webrtcAudio);

      // Produce audio to WebRTC
      const producerId = await botClient.produceAudio(audioTrack);

      // Set speaking timeout
      const speakingTimeout = setTimeout(async () => {
        await this.stopAgentSpeaking(agentId);
      }, this.speakingTimeLimit);

      // Store timeout reference
      pipelines.speakingTimeout = speakingTimeout;
      pipelines.currentProducerId = producerId;

      console.log(`🗣️ Agent ${agentId} started speaking in room ${roomId}: "${message}"`);

      // Add to conversation history
      conversationState.conversationHistory.push({
        agentId,
        message,
        timestamp: new Date().toISOString(),
        type: 'speech'
      });

      // Emit speaking start event
      this.emit('agent:speaking:start', {
        agentId,
        roomId,
        message,
        timestamp: new Date().toISOString()
      });

      // Broadcast speaking event
      await redisService.publish('agent:speaking', JSON.stringify({
        agentId,
        roomId,
        message,
        timestamp: new Date().toISOString()
      }));

    } catch (error) {
      console.error(`❌ Failed to start agent speaking:`, error);
      await this.stopAgentSpeaking(agentId);
      throw error;
    }
  }

  /**
   * Stop agent speaking turn
   * @param {string} agentId - Agent identifier
   */
  async stopAgentSpeaking(agentId) {
    const roomId = this.agentRooms.get(agentId);
    if (!roomId) {
      return; // Agent not in room
    }

    const conversationState = this.conversationState.get(roomId);
    const agent = this.getAgent(agentId);
    const botClient = this.agentConnections.get(agentId);
    const pipelines = this.agentPipelines.get(agentId);

    try {
      // Clear speaking timeout
      if (pipelines?.speakingTimeout) {
        clearTimeout(pipelines.speakingTimeout);
        pipelines.speakingTimeout = null;
      }

      // Stop audio production
      if (pipelines?.currentProducerId) {
        await botClient.stopAudioProduction(pipelines.currentProducerId);
        pipelines.currentProducerId = null;
      }

      // Update state
      if (conversationState.currentSpeaker === agentId) {
        conversationState.currentSpeaker = null;
        conversationState.speakingStartTime = null;
      }

      if (agent) {
        agent.setStatus('listening');
      }

      console.log(`🤐 Agent ${agentId} stopped speaking in room ${roomId}`);

      // Emit speaking end event
      this.emit('agent:speaking:end', {
        agentId,
        roomId,
        timestamp: new Date().toISOString()
      });

      // Process next in queue
      await this._processNextSpeaker(roomId);

      // Broadcast stop speaking event
      await redisService.publish('agent:stopped_speaking', JSON.stringify({
        agentId,
        roomId,
        timestamp: new Date().toISOString()
      }));

    } catch (error) {
      console.error(`❌ Error stopping agent speaking:`, error);
    }
  }

  /**
   * Handle transcription from ASR
   * @param {string} message - Transcription message
   */
  async handleTranscription(message) {
    try {
      const transcription = JSON.parse(message);
      const { text, sessionId, confidence, isFinal } = transcription;

      if (!isFinal || confidence < 0.7) {
        return; // Only process final transcriptions with good confidence
      }

      // Find the room associated with this session
      const roomId = this._findRoomBySessionId(sessionId);
      if (!roomId) {
        return;
      }

      // Add to conversation history
      const conversationState = this.conversationState.get(roomId);
      if (conversationState) {
        conversationState.conversationHistory.push({
          sessionId,
          text,
          confidence,
          timestamp: new Date().toISOString(),
          type: 'transcription'
        });
      }

      // Trigger agent responses
      await this._triggerAgentResponses(roomId, text);

    } catch (error) {
      console.error(`❌ Error handling transcription:`, error);
    }
  }

  /**
   * Handle room join request
   * @param {string} message - Join request message
   */
  async handleJoinRoomRequest(message) {
    try {
      const request = JSON.parse(message);
      const { agentId, roomId, options } = request;

      await this.spawnAgentIntoRoom(agentId, roomId, options);

    } catch (error) {
      console.error(`❌ Error handling join room request:`, error);
    }
  }

  /**
   * Handle room leave request
   * @param {string} message - Leave request message
   */
  async handleLeaveRoomRequest(message) {
    try {
      const request = JSON.parse(message);
      const { agentId } = request;

      await this.removeAgentFromRoom(agentId);

    } catch (error) {
      console.error(`❌ Error handling leave room request:`, error);
    }
  }

  /**
   * Setup bot client event handlers
   * @private
   */
  _setupBotClientEventHandlers(botClient, agentId, roomId) {
    botClient.on('connected', () => {
      console.log(`🔗 Bot client connected for agent ${agentId}`);
    });

    botClient.on('disconnected', () => {
      console.log(`🔌 Bot client disconnected for agent ${agentId}`);
    });

    botClient.on('audioConsumed', async ({ consumerId, track }) => {
      // Start ASR pipeline for incoming audio
      await this._startASRForTrack(agentId, track);
    });

    botClient.on('newProducer', async ({ producerId, kind }) => {
      if (kind === 'audio') {
        // Consume audio from other participants
        await this._consumeAudioFromProducer(agentId, producerId);
      }
    });

    botClient.on('reconnected', () => {
      console.log(`🔄 Bot client reconnected for agent ${agentId}`);
    });

    botClient.on('reconnectionFailed', () => {
      console.error(`❌ Bot client reconnection failed for agent ${agentId}`);
      this._cleanupAgentConnection(agentId);
    });
  }

  /**
   * Create audio pipelines for agent
   * @private
   */
  async _createAgentAudioPipelines(agentId) {
    const ttsToWebRTCPipeline = await audioPipelineService.createTTSToWebRTCPipeline(
      `${agentId}_tts_to_webrtc`,
      { outputFormat: 'opus', sampleRate: 48000 }
    );

    const webRTCToASRPipeline = await audioPipelineService.createWebRTCToASRPipeline(
      `${agentId}_webrtc_to_asr`,
      { inputFormat: 'opus', outputFormat: 'wav', sampleRate: 16000 }
    );

    return {
      ttsToWebRTC: ttsToWebRTCPipeline,
      webRTCToASR: webRTCToASRPipeline,
      speakingTimeout: null,
      currentProducerId: null,
      asrSessionId: null
    };
  }

  /**
   * Start ASR for audio track
   * @private
   */
  async _startASRForTrack(agentId, track) {
    const pipelines = this.agentPipelines.get(agentId);
    if (!pipelines) return;

    try {
      const sessionId = `${agentId}_${Date.now()}`;
      pipelines.asrSessionId = sessionId;

      const streamInterface = await asrService.startStreamingTranscription(sessionId, {
        provider: 'deepgram',
        language: 'en-US',
        confidence_threshold: 0.7
      });

      // Connect audio track to ASR pipeline
      const mediaStream = new MediaStream([track]);
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(mediaStream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        const inputBuffer = e.inputBuffer.getChannelData(0);
        const audioBuffer = Buffer.from(inputBuffer.buffer);
        
        // Send to ASR pipeline
        pipelines.webRTCToASR.inputStream.write(audioBuffer);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      console.log(`🎙️ Started ASR for agent ${agentId} track`);

    } catch (error) {
      console.error(`❌ Failed to start ASR for agent ${agentId}:`, error);
    }
  }

  /**
   * Consume audio from producer
   * @private
   */
  async _consumeAudioFromProducer(agentId, producerId) {
    const botClient = this.agentConnections.get(agentId);
    if (!botClient) return;

    try {
      // Get RTP parameters for the producer (would normally come from signaling)
      const rtpParameters = await this._getRTPParameters(producerId);
      
      const consumerId = await botClient.consumeAudio(producerId, rtpParameters);
      console.log(`🎧 Agent ${agentId} consuming audio from producer ${producerId}`);

    } catch (error) {
      console.error(`❌ Failed to consume audio for agent ${agentId}:`, error);
    }
  }

  /**
   * Get RTP parameters for producer
   * @private
   */
  async _getRTPParameters(producerId) {
    // This would normally be implemented by querying the Mediasoup server
    // For now, return default parameters
    return {
      codecs: [{
        mimeType: 'audio/opus',
        payloadType: 111,
        clockRate: 48000,
        channels: 2
      }],
      headerExtensions: [],
      encodings: [{ ssrc: Math.floor(Math.random() * 1000000) }],
      rtcp: { cname: `agent_${Date.now()}` }
    };
  }

  /**
   * Process next speaker in queue
   * @private
   */
  async _processNextSpeaker(roomId) {
    const queue = this.turnTakingQueue.get(roomId);
    if (!queue || queue.length === 0) return;

    const nextAgentId = queue.shift();
    const nextRequest = queue.find(req => req.agentId === nextAgentId);
    
    if (nextRequest) {
      await this.startAgentSpeaking(nextAgentId, nextRequest.message);
    }
  }

  /**
   * Find room by session ID
   * @private
   */
  _findRoomBySessionId(sessionId) {
    // Extract agent ID from session ID format: agentId_timestamp
    const agentId = sessionId.split('_')[0];
    return this.agentRooms.get(agentId);
  }

  /**
   * Trigger agent responses to transcription
   * @private
   */
  async _triggerAgentResponses(roomId, transcribedText) {
    const roomAgents = this.roomAgents.get(roomId);
    if (!roomAgents) return;

    const conversationState = this.conversationState.get(roomId);
    
    // Don't respond if someone is currently speaking
    if (conversationState.currentSpeaker) return;

    // Simple turn-taking: random agent responds
    const availableAgents = Array.from(roomAgents).filter(agentId => {
      const agent = this.getAgent(agentId);
      return agent && agent.status === 'listening';
    });

    if (availableAgents.length === 0) return;

    const randomAgentId = availableAgents[Math.floor(Math.random() * availableAgents.length)];
    const agent = this.getAgent(randomAgentId);

    try {
      // Generate response using LLM
      const response = await agent.processMessage({
        content: transcribedText,
        from: 'human',
        type: 'voice'
      });

      if (response && response.content) {
        // Queue or start speaking
        const queue = this.turnTakingQueue.get(roomId);
        if (conversationState.currentSpeaker) {
          queue.push({ agentId: randomAgentId, message: response.content });
        } else {
          await this.startAgentSpeaking(randomAgentId, response.content);
        }
      }

    } catch (error) {
      console.error(`❌ Error triggering agent response:`, error);
    }
  }

  /**
   * Get current speaker in room
   * @private
   */
  _getCurrentSpeaker(roomId) {
    const conversationState = this.conversationState.get(roomId);
    return conversationState?.currentSpeaker || null;
  }

  /**
   * Cleanup agent connection
   * @private
   */
  async _cleanupAgentConnection(agentId) {
    try {
      // Stop any ongoing speaking
      await this.stopAgentSpeaking(agentId);

      // Disconnect bot client
      const botClient = this.agentConnections.get(agentId);
      if (botClient) {
        await botClient.disconnect();
        this.agentConnections.delete(agentId);
      }

      // Cleanup pipelines
      const pipelines = this.agentPipelines.get(agentId);
      if (pipelines) {
        if (pipelines.asrSessionId) {
          await asrService.stopStreamingTranscription(pipelines.asrSessionId);
        }
        
        await audioPipelineService.destroyPipeline(`${agentId}_tts_to_webrtc`);
        await audioPipelineService.destroyPipeline(`${agentId}_webrtc_to_asr`);
        
        this.agentPipelines.delete(agentId);
      }

      // Remove from room tracking
      this.agentRooms.delete(agentId);

      console.log(`🧹 Cleaned up connection for agent ${agentId}`);

    } catch (error) {
      console.error(`❌ Error cleaning up agent connection:`, error);
    }
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up Agent Manager...');
    
    // Cleanup all agent connections
    for (const agentId of this.agentConnections.keys()) {
      await this._cleanupAgentConnection(agentId);
    }
    
    this.agents.clear();
    this.agentConnections.clear();
    this.agentPipelines.clear();
    this.roomAgents.clear();
    this.agentRooms.clear();
    this.turnTakingQueue.clear();
    this.conversationState.clear();
    this.isInitialized = false;
  }
}

// Export singleton instance
module.exports = new AgentManager();
