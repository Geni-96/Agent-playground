const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

/**
 * LLM Service for handling multiple AI providers
 * Supports OpenAI GPT and Anthropic Claude models
 */
class LLMService {
  constructor() {
    this.openai = null;
    this.anthropic = null;
    this.tokenUsage = {
      total: 0,
      byModel: {}
    };
    this.rateLimiter = new Map(); // Simple rate limiting per agent
    this.initialized = false;
  }

  /**
   * Initialize LLM providers
   */
  async initialize() {
    try {
      // Initialize OpenAI if API key is provided
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        });
        console.log('🤖 OpenAI client initialized');
      }

      // Initialize Anthropic if API key is provided
      if (process.env.ANTHROPIC_API_KEY) {
        this.anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY
        });
        console.log('🧠 Anthropic client initialized');
      }

      if (!this.openai && !this.anthropic) {
        throw new Error('No LLM providers configured. Please provide OPENAI_API_KEY or ANTHROPIC_API_KEY');
      }

      this.initialized = true;
      console.log('✅ LLM Service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize LLM Service:', error);
      throw error;
    }
  }

  /**
   * Generate a response using the specified model
   * @param {string} agentId - Unique agent identifier
   * @param {string} persona - Agent's system prompt/persona
   * @param {Array} messageHistory - Conversation history
   * @param {Object} options - Model options (provider, model, temperature, etc.)
   * @returns {Object} Response with text and metadata
   */
  async generateResponse(agentId, persona, messageHistory, options = {}) {
    if (!this.initialized) {
      throw new Error('LLM Service not initialized');
    }

    // Check rate limiting
    if (this._isRateLimited(agentId)) {
      throw new Error(`Agent ${agentId} is rate limited`);
    }

    const {
      provider = 'openai',
      model = provider === 'openai' ? 'gpt-4' : 'claude-3-sonnet-20240229',
      temperature = 0.7,
      maxTokens = 1000,
      stream = false
    } = options;

    try {
      let response;
      let tokenCount = 0;

      if (provider === 'openai' && this.openai) {
        response = await this._generateOpenAIResponse(persona, messageHistory, {
          model,
          temperature,
          maxTokens,
          stream
        });
        tokenCount = response.usage?.total_tokens || 0;
      } else if (provider === 'anthropic' && this.anthropic) {
        response = await this._generateAnthropicResponse(persona, messageHistory, {
          model,
          temperature,
          maxTokens,
          stream
        });
        tokenCount = response.usage?.input_tokens + response.usage?.output_tokens || 0;
      } else {
        throw new Error(`Provider ${provider} not available or not configured`);
      }

      // Track token usage
      this._trackTokenUsage(model, tokenCount);

      // Update rate limiter
      this._updateRateLimit(agentId);

      return {
        text: this._extractResponseText(response, provider),
        provider,
        model,
        tokenCount,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ Error generating response for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Generate response using OpenAI
   * @private
   */
  async _generateOpenAIResponse(persona, messageHistory, options) {
    const messages = this._formatMessagesForOpenAI(persona, messageHistory);

    const response = await this.openai.chat.completions.create({
      model: options.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: options.stream
    });

    return response;
  }

  /**
   * Generate response using Anthropic Claude
   * @private
   */
  async _generateAnthropicResponse(persona, messageHistory, options) {
    const messages = this._formatMessagesForAnthropic(messageHistory);

    const response = await this.anthropic.messages.create({
      model: options.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      system: persona,
      messages,
      stream: options.stream
    });

    return response;
  }

  /**
   * Format messages for OpenAI API
   * @private
   */
  _formatMessagesForOpenAI(persona, messageHistory) {
    const messages = [
      { role: 'system', content: persona }
    ];

    messageHistory.forEach(msg => {
      messages.push({
        role: msg.role || 'user',
        content: msg.content
      });
    });

    return messages;
  }

  /**
   * Format messages for Anthropic API
   * @private
   */
  _formatMessagesForAnthropic(messageHistory) {
    return messageHistory.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content
    }));
  }

  /**
   * Extract response text from API response
   * @private
   */
  _extractResponseText(response, provider) {
    if (provider === 'openai') {
      return response.choices[0]?.message?.content || '';
    } else if (provider === 'anthropic') {
      return response.content[0]?.text || '';
    }
    return '';
  }

  /**
   * Track token usage for monitoring
   * @private
   */
  _trackTokenUsage(model, tokenCount) {
    this.tokenUsage.total += tokenCount;
    if (!this.tokenUsage.byModel[model]) {
      this.tokenUsage.byModel[model] = 0;
    }
    this.tokenUsage.byModel[model] += tokenCount;
  }

  /**
   * Simple rate limiting check
   * @private
   */
  _isRateLimited(agentId) {
    const now = Date.now();
    const agentLimiter = this.rateLimiter.get(agentId);
    
    if (!agentLimiter) {
      return false;
    }

    const timeSinceLastRequest = now - agentLimiter.lastRequest;
    const minInterval = parseInt(process.env.LLM_MIN_INTERVAL_MS) || 2000; // 2 seconds default

    return timeSinceLastRequest < minInterval;
  }

  /**
   * Update rate limiter for agent
   * @private
   */
  _updateRateLimit(agentId) {
    this.rateLimiter.set(agentId, {
      lastRequest: Date.now()
    });
  }

  /**
   * Get token usage statistics
   * @returns {Object} Token usage stats
   */
  getTokenUsage() {
    return { ...this.tokenUsage };
  }

  /**
   * Reset token usage statistics
   */
  resetTokenUsage() {
    this.tokenUsage = {
      total: 0,
      byModel: {}
    };
  }

  /**
   * Check if service is ready
   * @returns {boolean} Ready status
   */
  isReady() {
    return this.initialized && (this.openai || this.anthropic);
  }
}

// Export singleton instance
module.exports = new LLMService();
