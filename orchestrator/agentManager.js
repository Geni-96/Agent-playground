const Agent = require('../agents/Agent');
const redisService = require('../services/redisService');
const { v4: uuidv4 } = require('uuid');

/**
 * AgentManager - Orchestrates all agents in the simulation
 */
class AgentManager {
  constructor() {
    this.agents = new Map(); // Map of agentId -> Agent instance
    this.isInitialized = false;
    this.maxAgents = parseInt(process.env.MAX_AGENTS) || 10;
    this.channels = {
      CREATE_AGENT: 'agent:create',
      DELETE_AGENT: 'agent:delete',
      AGENT_MESSAGE: 'agent:message',
      BROADCAST: 'agent:broadcast'
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
        newAgent = Agent.createWithPersona(personaType);
      } else {
        newAgent = new Agent(persona || "You are an AI agent participating in a conversation.", agentId);
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

    this.agents.delete(agentId);
    console.log(`🗑️ Agent ${agentId} removed from manager (${this.agents.size}/${this.maxAgents})`);
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
  createAgent(persona, agentId = null) {
    if (this.agents.size >= this.maxAgents) {
      throw new Error(`Cannot create agent: maximum limit (${this.maxAgents}) reached`);
    }

    const agent = new Agent(persona, agentId);
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

    return {
      totalAgents: this.agents.size,
      maxAgents: this.maxAgents,
      agentsByStatus,
      isInitialized: this.isInitialized
    };
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up Agent Manager...');
    this.agents.clear();
    this.isInitialized = false;
  }
}

// Export singleton instance
module.exports = new AgentManager();
