const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

/**
 * Text-to-Speech Service supporting multiple providers
 * Handles voice synthesis for agent responses
 */
class TTSService {
  constructor() {
    this.providers = {};
    this.voiceProfiles = new Map();
    this.initialized = false;
    this.audioCache = new Map(); // Simple audio caching
  }

  /**
   * Initialize TTS providers
   */
  async initialize() {
    try {
      // Initialize ElevenLabs if API key is provided
      if (process.env.ELEVENLABS_API_KEY) {
        await this._initializeElevenLabs();
      }

      // Initialize Azure TTS if credentials are provided
      if (process.env.AZURE_TTS_KEY && process.env.AZURE_TTS_REGION) {
        await this._initializeAzureTTS();
      }

      // Initialize PlayHT if API key is provided
      if (process.env.PLAYHT_API_KEY) {
        await this._initializePlayHT();
      }

      if (Object.keys(this.providers).length === 0) {
        throw new Error('No TTS providers configured. Please provide API keys for at least one TTS service');
      }

      this.initialized = true;
      console.log('🔊 TTS Service initialized successfully');
      console.log('Available providers:', Object.keys(this.providers));
    } catch (error) {
      console.error('❌ Failed to initialize TTS Service:', error);
      throw error;
    }
  }

  /**
   * Initialize ElevenLabs provider
   * @private
   */
  async _initializeElevenLabs() {
    try {
      // Dynamic import for ElevenLabs SDK
      const { ElevenLabsAPI } = await import('@elevenlabs/elevenlabs-js');
      
      this.providers.elevenlabs = {
        client: new ElevenLabsAPI({
          apiKey: process.env.ELEVENLABS_API_KEY
        }),
        type: 'elevenlabs'
      };

      console.log('🎤 ElevenLabs provider initialized');
    } catch (error) {
      console.warn('⚠️ Failed to initialize ElevenLabs:', error.message);
    }
  }

  /**
   * Initialize Azure TTS provider
   * @private
   */
  async _initializeAzureTTS() {
    try {
      // Dynamic import for Azure SDK
      const { SpeechConfig, SpeechSynthesizer, AudioConfig } = await import('microsoft-cognitiveservices-speech-sdk');
      
      const speechConfig = SpeechConfig.fromSubscription(
        process.env.AZURE_TTS_KEY,
        process.env.AZURE_TTS_REGION
      );

      this.providers.azure = {
        speechConfig,
        SpeechSynthesizer,
        AudioConfig,
        type: 'azure'
      };

      console.log('🎤 Azure TTS provider initialized');
    } catch (error) {
      console.warn('⚠️ Failed to initialize Azure TTS:', error.message);
    }
  }

  /**
   * Initialize PlayHT provider
   * @private
   */
  async _initializePlayHT() {
    try {
      // PlayHT typically uses REST API
      this.providers.playht = {
        apiKey: process.env.PLAYHT_API_KEY,
        userId: process.env.PLAYHT_USER_ID,
        type: 'playht'
      };

      console.log('🎤 PlayHT provider initialized');
    } catch (error) {
      console.warn('⚠️ Failed to initialize PlayHT:', error.message);
    }
  }

  /**
   * Generate speech from text
   * @param {string} agentId - Agent identifier
   * @param {string} text - Text to convert to speech
   * @param {Object} options - Voice options
   * @returns {Promise<Buffer>} Audio buffer
   */
  async generateSpeech(agentId, text, options = {}) {
    if (!this.initialized) {
      throw new Error('TTS Service not initialized');
    }

    const {
      provider = this._getDefaultProvider(),
      voiceId = this._getVoiceForAgent(agentId),
      speed = 1.0,
      pitch = 1.0,
      format = 'mp3'
    } = options;

    if (!this.providers[provider]) {
      throw new Error(`TTS provider ${provider} not available`);
    }

    try {
      // Check cache first
      const cacheKey = this._getCacheKey(text, provider, voiceId, speed, pitch);
      if (this.audioCache.has(cacheKey)) {
        console.log(`🎵 Using cached audio for agent ${agentId}`);
        return this.audioCache.get(cacheKey);
      }

      let audioBuffer;

      switch (provider) {
        case 'elevenlabs':
          audioBuffer = await this._generateElevenLabsAudio(text, voiceId, speed);
          break;
        case 'azure':
          audioBuffer = await this._generateAzureAudio(text, voiceId, speed, pitch);
          break;
        case 'playht':
          audioBuffer = await this._generatePlayHTAudio(text, voiceId, speed);
          break;
        default:
          throw new Error(`Unsupported TTS provider: ${provider}`);
      }

      // Cache the result
      this.audioCache.set(cacheKey, audioBuffer);

      console.log(`🎵 Generated speech for agent ${agentId} using ${provider}`);
      return audioBuffer;

    } catch (error) {
      console.error(`❌ Error generating speech for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Generate audio using ElevenLabs
   * @private
   */
  async _generateElevenLabsAudio(text, voiceId, speed) {
    const { client } = this.providers.elevenlabs;
    
    const audio = await client.generate({
      voice: voiceId,
      text: text,
      model_id: "eleven_monolingual_v1",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
        speed: speed
      }
    });

    return Buffer.from(await audio.arrayBuffer());
  }

  /**
   * Generate audio using Azure TTS
   * @private
   */
  async _generateAzureAudio(text, voiceId, speed, pitch) {
    const { speechConfig, SpeechSynthesizer, AudioConfig } = this.providers.azure;
    
    speechConfig.speechSynthesisVoiceName = voiceId;
    
    const synthesizer = new SpeechSynthesizer(speechConfig, null);
    
    const ssml = this._buildSSML(text, voiceId, speed, pitch);
    
    return new Promise((resolve, reject) => {
      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          synthesizer.close();
          if (result.audioData) {
            resolve(Buffer.from(result.audioData));
          } else {
            reject(new Error('No audio data received from Azure TTS'));
          }
        },
        (error) => {
          synthesizer.close();
          reject(error);
        }
      );
    });
  }

  /**
   * Generate audio using PlayHT
   * @private
   */
  async _generatePlayHTAudio(text, voiceId, speed) {
    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch('https://api.play.ht/api/v2/tts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.providers.playht.apiKey}`,
        'X-USER-ID': this.providers.playht.userId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        voice: voiceId,
        output_format: 'mp3',
        speed: speed
      })
    });

    if (!response.ok) {
      throw new Error(`PlayHT API error: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Set voice profile for an agent
   * @param {string} agentId - Agent identifier
   * @param {Object} voiceProfile - Voice configuration
   */
  setVoiceProfile(agentId, voiceProfile) {
    this.voiceProfiles.set(agentId, voiceProfile);
    console.log(`🎭 Voice profile set for agent ${agentId}:`, voiceProfile);
  }

  /**
   * Get voice for agent
   * @private
   */
  _getVoiceForAgent(agentId) {
    const profile = this.voiceProfiles.get(agentId);
    return profile?.voiceId || this._getDefaultVoice();
  }

  /**
   * Get default voice based on available providers
   * @private
   */
  _getDefaultVoice() {
    if (this.providers.elevenlabs) {
      return 'ErXwobaYiN019PkySvjV'; // Default ElevenLabs voice 9BWtsMINqrJLrRacOk9x
    } else if (this.providers.azure) {
      return 'en-US-AriaNeural'; // Default Azure voice
    } else if (this.providers.playht) {
      return 'jennifer'; // Default PlayHT voice
    }
    return null;
  }

  /**
   * Get default provider
   * @private
   */
  _getDefaultProvider() {
    const providers = Object.keys(this.providers);
    return providers[0] || null;
  }

  /**
   * Build SSML for Azure TTS
   * @private
   */
  _buildSSML(text, voiceId, speed, pitch) {
    return `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
        <voice name="${voiceId}">
          <prosody rate="${speed}" pitch="${pitch > 1 ? '+' : ''}${((pitch - 1) * 50).toFixed(0)}%">
            ${text}
          </prosody>
        </voice>
      </speak>
    `;
  }

  /**
   * Generate cache key
   * @private
   */
  _getCacheKey(text, provider, voiceId, speed, pitch) {
    const crypto = require('crypto');
    const content = `${text}-${provider}-${voiceId}-${speed}-${pitch}`;
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Convert audio to WebRTC compatible format
   * @param {Buffer} audioBuffer - Input audio buffer
   * @param {string} inputFormat - Input format (mp3, wav, etc.)
   * @returns {Promise<Buffer>} Converted audio buffer
   */
  async convertToWebRTCFormat(audioBuffer, inputFormat = 'mp3') {
    try {
      // This would typically use ffmpeg or similar
      // For now, return the buffer as-is
      // TODO: Implement actual audio conversion
      console.log(`🔄 Converting ${inputFormat} audio to WebRTC format`);
      return audioBuffer;
    } catch (error) {
      console.error('❌ Error converting audio format:', error);
      throw error;
    }
  }

  /**
   * Clear audio cache
   */
  clearCache() {
    this.audioCache.clear();
    console.log('🗑️ Audio cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      size: this.audioCache.size,
      providers: Object.keys(this.providers)
    };
  }

  /**
   * Check if service is ready
   * @returns {boolean} Ready status
   */
  isReady() {
    return this.initialized && Object.keys(this.providers).length > 0;
  }
}

// Export singleton instance
module.exports = new TTSService();
