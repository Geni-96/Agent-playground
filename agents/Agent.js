const { v4: uuidv4 } = require('uuid');

/**
 * Agent class representing an AI agent participant in the simulator
 */
class Agent {
  /**
   * Create a new Agent
   * @param {string} persona - The system prompt/persona for this agent
   * @param {string} agentId - Optional custom agent ID (auto-generated if not provided)
   */
  constructor(persona, agentId = null) {
    this.agentId = agentId || uuidv4();
    this.persona = persona;
    this.messageHistory = [];
    this.status = 'idle'; // idle, speaking, listening, processing
    this.createdAt = new Date().toISOString();
    this.lastActivity = new Date().toISOString();
    this.metadata = {
      totalMessages: 0,
      totalSpeakingTime: 0,
      interactions: []
    };
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
   * @param {string} newStatus - The new status (idle, speaking, listening, processing)
   */
  setStatus(newStatus) {
    const validStatuses = ['idle', 'speaking', 'listening', 'processing'];
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
   * @returns {Object} Response message or null if no response needed
   */
  async processMessage(incomingMessage) {
    this.setStatus('processing');
    
    // Add incoming message to history
    this.addMessage({
      type: 'received',
      content: incomingMessage.content,
      from: incomingMessage.from,
      to: this.agentId
    });

    // TODO: In future phases, this will integrate with LLM APIs
    // For now, create a simple echo response
    const response = {
      type: 'sent',
      content: `Agent ${this.agentId} received: "${incomingMessage.content}"`,
      from: this.agentId,
      to: incomingMessage.from || 'broadcast'
    };

    this.addMessage(response);
    this.setStatus('idle');

    return response;
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
      conversationLength: this.messageHistory.length
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
