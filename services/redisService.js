const redis = require('redis');

class RedisService {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.publisher = null;
    this.isConnected = false;
  }

  /**
   * Connect to Redis server
   */
  async connect() {
    try {
      // Create Redis clients
      this.client = redis.createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            console.error('❌ Redis server connection refused');
            return new Error('Redis server connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            console.error('❌ Redis retry time exhausted');
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            console.error('❌ Redis max retry attempts reached');
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });

      // Create separate clients for pub/sub
      this.subscriber = this.client.duplicate();
      this.publisher = this.client.duplicate();

      // Connect all clients
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect(),
        this.publisher.connect()
      ]);

      this.isConnected = true;
      console.log('🔗 Redis service connected successfully');

      // Handle connection errors
      this.client.on('error', (err) => {
        console.error('❌ Redis client error:', err);
        this.isConnected = false;
      });

      this.subscriber.on('error', (err) => {
        console.error('❌ Redis subscriber error:', err);
      });

      this.publisher.on('error', (err) => {
        console.error('❌ Redis publisher error:', err);
      });

    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    try {
      if (this.client) await this.client.quit();
      if (this.subscriber) await this.subscriber.quit();
      if (this.publisher) await this.publisher.quit();
      
      this.isConnected = false;
      console.log('🔌 Redis service disconnected');
    } catch (error) {
      console.error('❌ Error disconnecting from Redis:', error);
    }
  }

  /**
   * Publish a message to a channel
   * @param {string} channel - The channel to publish to
   * @param {string} message - The message to publish
   */
  async publish(channel, message) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    try {
      await this.publisher.publish(channel, message);
      console.log(`📤 Published message to channel '${channel}':`, message);
    } catch (error) {
      console.error(`❌ Failed to publish to channel '${channel}':`, error);
      throw error;
    }
  }

  /**
   * Subscribe to a channel and handle messages
   * @param {string} channel - The channel to subscribe to
   * @param {function} messageHandler - Function to handle received messages
   */
  async subscribe(channel, messageHandler) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    try {
      await this.subscriber.subscribe(channel, (message) => {
        console.log(`📥 Received message from channel '${channel}':`, message);
        try {
          messageHandler(message);
        } catch (error) {
          console.error(`❌ Error handling message from channel '${channel}':`, error);
        }
      });

      console.log(`📡 Subscribed to channel '${channel}'`);
    } catch (error) {
      console.error(`❌ Failed to subscribe to channel '${channel}':`, error);
      throw error;
    }
  }

  /**
   * Unsubscribe from a channel
   * @param {string} channel - The channel to unsubscribe from
   */
  async unsubscribe(channel) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    try {
      await this.subscriber.unsubscribe(channel);
      console.log(`📡 Unsubscribed from channel '${channel}'`);
    } catch (error) {
      console.error(`❌ Failed to unsubscribe from channel '${channel}':`, error);
      throw error;
    }
  }

  /**
   * Set a key-value pair
   * @param {string} key - The key
   * @param {string} value - The value
   * @param {number} ttl - Time to live in seconds (optional)
   */
  async set(key, value, ttl = null) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    try {
      if (ttl) {
        await this.client.setEx(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      console.error(`❌ Failed to set key '${key}':`, error);
      throw error;
    }
  }

  /**
   * Get a value by key
   * @param {string} key - The key
   * @returns {string|null} The value or null if not found
   */
  async get(key) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }

    try {
      return await this.client.get(key);
    } catch (error) {
      console.error(`❌ Failed to get key '${key}':`, error);
      throw error;
    }
  }

  /**
   * Check if Redis is connected
   * @returns {boolean} Connection status
   */
  isConnectedToRedis() {
    return this.isConnected;
  }
}

// Export singleton instance
module.exports = new RedisService();
