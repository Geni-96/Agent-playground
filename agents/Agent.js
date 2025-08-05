const { v4: uuidv4 } = require('uuid');
const llmService = require('../services/llmService');
const ttsService = require('../services/ttsService');

/**
 * Agent class representing an AI agent participant in the simulator
 */
class Agent {
  /**
   * Create a new Agent
   * @param {string} persona - The system prompt/persona for this agent
   * @param {string} agentId - Optional custom agent ID (auto-generated if not provided)
   * @param {Object} config - Optional configuration for LLM and TTS
   */
  constructor(persona, agentId = null, config = {}) {
    this.agentId = agentId || uuidv4();
    this.persona = persona;
    this.messageHistory = [];
    this.status = 'idle'; // idle, speaking, listening, processing, thinking
    this.createdAt = new Date().toISOString();
    this.lastActivity = new Date().toISOString();
    this.metadata = {
      totalMessages: 0,
      totalSpeakingTime: 0,
      interactions: [],
      llmCalls: 0,
      ttsCalls: 0
    };
    
    // AI Configuration
    this.config = {
      llm: {
        provider: config.llm?.provider || 'openai',
        model: config.llm?.model || 'gpt-4',
        temperature: config.llm?.temperature || 0.7,
        maxTokens: config.llm?.maxTokens || 1000
      },
      tts: {
        provider: config.tts?.provider || 'elevenlabs',
        voiceId: config.tts?.voiceId || null,
        speed: config.tts?.speed || 1.0,
        pitch: config.tts?.pitch || 1.0
      }
    };

    // Set voice profile if provided
    if (this.config.tts.voiceId) {
      this._setVoiceProfile();
    }
  }

  /**
   * Add a message to the agent's history
   * @param {Object} message - The message object
   * @param {string} message.type - Type of message (sent, received, system)
   * @param {string} message.content - The message content
   * @param {string} message.from - Who the message is from
   * @param {string} message.to - Who the message is to
   * @param {string} message.timestamp - When the message was created
   */
  addMessage(message) {
    const messageWithDefaults = {
      id: uuidv4(),
      type: message.type || 'system',
      content: message.content,
      from: message.from || 'system',
      to: message.to || this.agentId,
      timestamp: message.timestamp || new Date().toISOString(),
      ...message
    };

    this.messageHistory.push(messageWithDefaults);
    this.metadata.totalMessages += 1;
    this.lastActivity = new Date().toISOString();

    // Keep message history manageable (last 100 messages)
    if (this.messageHistory.length > 100) {
      this.messageHistory = this.messageHistory.slice(-100);
    }

    console.log(`📝 Agent ${this.agentId} added message:`, messageWithDefaults);
  }

  /**
   * Update agent status
   * @param {string} newStatus - The new status (idle, speaking, listening, processing, thinking)
   */
  setStatus(newStatus) {
    const validStatuses = ['idle', 'speaking', 'listening', 'processing', 'thinking'];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}. Valid statuses: ${validStatuses.join(', ')}`);
    }

    const previousStatus = this.status;
    this.status = newStatus;
    this.lastActivity = new Date().toISOString();

    console.log(`🔄 Agent ${this.agentId} status changed: ${previousStatus} → ${newStatus}`);
  }

  /**
   * Get the agent's current conversation context
   * @param {number} messageLimit - Maximum number of recent messages to include
   * @returns {Array} Array of recent messages
   */
  getConversationContext(messageLimit = 10) {
    return this.messageHistory
      .slice(-messageLimit)
      .map(msg => ({
        type: msg.type,
        content: msg.content,
        from: msg.from,
        timestamp: msg.timestamp
      }));
  }

  /**
   * Process an incoming message and generate a response
   * @param {Object} incomingMessage - The incoming message
   * @returns {Object} Response message with text and optional audio
   */
  async processMessage(incomingMessage) {
    this.setStatus('processing');
    
    try {
      // Add incoming message to history
      this.addMessage({
        type: 'received',
        content: incomingMessage.content,
        from: incomingMessage.from,
        to: this.agentId
      });

      // Generate intelligent response using LLM
      const responseText = await this.generateResponse();
      
      // Create response message
      const response = {
        type: 'sent',
        content: responseText,
        from: this.agentId,
        to: incomingMessage.from || 'broadcast',
        timestamp: new Date().toISOString()
      };

      this.addMessage(response);
      this.setStatus('idle');

      return response;

    } catch (error) {
      console.error(`❌ Agent ${this.agentId} failed to process message:`, error);
      this.setStatus('idle');
      
      // Return a fallback response
      const fallbackResponse = {
        type: 'sent',
        content: "I'm having trouble processing that message right now.",
        from: this.agentId,
        to: incomingMessage.from || 'broadcast',
        timestamp: new Date().toISOString()
      };
      
      this.addMessage(fallbackResponse);
      return fallbackResponse;
    }
  }

  /**
   * Generate a response using LLM
   * @returns {string} Generated response text
   */
  async generateResponse() {
    if (!llmService.isReady()) {
      throw new Error('LLM service not ready');
    }

    this.setStatus('thinking');

    try {
      // Prepare conversation context for LLM
      const conversationHistory = this._formatMessageHistoryForLLM();
      
      // Generate response using LLM service
      const llmResponse = await llmService.generateResponse(
        this.agentId,
        this.persona,
        conversationHistory,
        this.config.llm
      );

      this.metadata.llmCalls += 1;
      console.log(`🧠 Agent ${this.agentId} generated response using ${llmResponse.provider}/${llmResponse.model}`);

      return llmResponse.text;

    } catch (error) {
      console.error(`❌ Agent ${this.agentId} LLM generation failed:`, error);
      throw error;
    }
  }

  /**
   * Convert response text to speech
   * @param {string} text - Text to convert to speech
   * @returns {Buffer} Audio buffer
   */
  async speakResponse(text) {
    if (!ttsService.isReady()) {
      throw new Error('TTS service not ready');
    }

    this.setStatus('speaking');

    try {
      const audioBuffer = await ttsService.generateSpeech(
        this.agentId,
        text,
        this.config.tts
      );

      this.metadata.ttsCalls += 1;
      console.log(`🗣️ Agent ${this.agentId} generated speech`);

      return audioBuffer;

    } catch (error) {
      console.error(`❌ Agent ${this.agentId} TTS generation failed:`, error);
      throw error;
    } finally {
      this.setStatus('idle');
    }
  }

  /**
   * Process message and generate both text and audio response
   * @param {Object} incomingMessage - The incoming message
   * @returns {Object} Response with text and audio
   */
  async processMessageWithSpeech(incomingMessage) {
    try {
      // Generate text response
      const textResponse = await this.processMessage(incomingMessage);
      
      // Generate audio for the response
      const audioBuffer = await this.speakResponse(textResponse.content);
      
      return {
        ...textResponse,
        audio: audioBuffer,
        hasAudio: true
      };

    } catch (error) {
      console.error(`❌ Agent ${this.agentId} failed to process message with speech:`, error);
      // Return text-only response as fallback
      return await this.processMessage(incomingMessage);
    }
  }

  /**
   * Set voice profile for TTS
   * @private
   */
  _setVoiceProfile() {
    if (ttsService.isReady()) {
      ttsService.setVoiceProfile(this.agentId, {
        voiceId: this.config.tts.voiceId,
        speed: this.config.tts.speed,
        pitch: this.config.tts.pitch
      });
    }
  }

  /**
   * Format message history for LLM consumption
   * @private
   * @returns {Array} Formatted messages
   */
  _formatMessageHistoryForLLM() {
    return this.messageHistory
      .filter(msg => msg.type === 'received' || msg.type === 'sent')
      .slice(-10) // Keep last 10 messages for context
      .map(msg => ({
        role: msg.type === 'sent' ? 'assistant' : 'user',
        content: `${msg.from}: ${msg.content}`
      }));
  }

  /**
   * Update AI configuration
   * @param {Object} newConfig - New configuration
   */
  updateConfig(newConfig) {
    if (newConfig.llm) {
      this.config.llm = { ...this.config.llm, ...newConfig.llm };
    }
    
    if (newConfig.tts) {
      this.config.tts = { ...this.config.tts, ...newConfig.tts };
      this._setVoiceProfile();
    }

    console.log(`⚙️ Agent ${this.agentId} configuration updated`);
  }

  /**
   * Generate agent statistics
   * @returns {Object} Agent statistics
   */
  getStats() {
    return {
      agentId: this.agentId,
      status: this.status,
      persona: this.persona,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      messageCount: this.metadata.totalMessages,
      conversationLength: this.messageHistory.length,
      llmCalls: this.metadata.llmCalls,
      ttsCalls: this.metadata.ttsCalls,
      config: this.config
    };
  }

  /**
   * Export agent data for persistence or debugging
   * @returns {Object} Complete agent data
   */
  export() {
    return {
      agentId: this.agentId,
      persona: this.persona,
      messageHistory: this.messageHistory,
      status: this.status,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      metadata: this.metadata
    };
  }

  /**
   * Create an agent from exported data
   * @param {Object} data - Exported agent data
   * @returns {Agent} Restored agent instance
   */
  static fromExport(data) {
    const agent = new Agent(data.persona, data.agentId);
    agent.messageHistory = data.messageHistory || [];
    agent.status = data.status || 'idle';
    agent.createdAt = data.createdAt;
    agent.lastActivity = data.lastActivity;
    agent.metadata = data.metadata || {
      totalMessages: 0,
      totalSpeakingTime: 0,
      interactions: []
    };
    return agent;
  }

  /**
   * Create a factory function for creating agents with predefined personas
   * @param {string} personaType - Type of persona (helpful, creative, analytical, etc.)
   * @returns {Agent} New agent with predefined persona
   */
  static createWithPersona(personaType) {
    const personas = {
      helpful: "You are a helpful and friendly AI assistant. You always try to be supportive and provide useful information.",
      creative: "You are a creative and imaginative AI. You love to think outside the box and come up with innovative ideas.",
      analytical: "You are a logical and analytical AI. You approach problems systematically and value data-driven decisions.",
      humorous: "You are a witty and humorous AI. You like to add light-hearted jokes and keep conversations entertaining.",
      philosophical: "You are a thoughtful and philosophical AI. You enjoy deep discussions about life, ethics, and meaning.",
      default: "You are an AI agent participating in a multi-agent conversation. Be engaging and collaborative."
    };

    const persona = personas[personaType] || personas.default;
    return new Agent(persona);
  }
}

module.exports = Agent;
