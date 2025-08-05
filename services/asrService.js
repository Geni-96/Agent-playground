const { createReadStream, writeFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const { v4: uuidv4 } = require('uuid');
const wav = require('node-wav');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const { Deepgram } = require('@deepgram/sdk');
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const OpenAI = require('openai');
const redisService = require('./redisService');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

/**
 * ASR (Automatic Speech Recognition) Service
 * Supports multiple providers: OpenAI Whisper, Deepgram, Azure Speech
 */
class ASRService {
  constructor() {
    this.openai = null;
    this.deepgram = null;
    this.azureSpeechConfig = null;
    this.initialized = false;
    this.providers = [];
    this.activeStreams = new Map(); // Track active streaming sessions
    this.transcriptionQueue = [];
    this.processingQueue = false;
  }

  /**
   * Initialize ASR providers
   */
  async initialize() {
    try {
      // Initialize OpenAI Whisper
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        });
        this.providers.push('openai');
        console.log('🎙️ OpenAI Whisper initialized');
      }

      // Initialize Deepgram
      if (process.env.DEEPGRAM_API_KEY) {
        this.deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
        this.providers.push('deepgram');
        console.log('🎙️ Deepgram initialized');
      }

      // Initialize Azure Speech
      if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) {
        this.azureSpeechConfig = sdk.SpeechConfig.fromSubscription(
          process.env.AZURE_SPEECH_KEY,
          process.env.AZURE_SPEECH_REGION
        );
        this.azureSpeechConfig.speechRecognitionLanguage = 'en-US';
        this.providers.push('azure');
        console.log('🎙️ Azure Speech initialized');
      }

      if (this.providers.length === 0) {
        throw new Error('No ASR providers configured. Please provide API keys for OpenAI, Deepgram, or Azure Speech');
      }

      this.initialized = true;
      console.log(`✅ ASR Service initialized with providers: ${this.providers.join(', ')}`);

      // Start processing queue
      this._startQueueProcessor();

    } catch (error) {
      console.error('❌ Failed to initialize ASR Service:', error);
      throw error;
    }
  }

  /**
   * Transcribe audio file
   * @param {Buffer} audioBuffer - Audio data buffer
   * @param {Object} options - Transcription options
   * @returns {Object} Transcription result
   */
  async transcribeAudio(audioBuffer, options = {}) {
    if (!this.initialized) {
      throw new Error('ASR Service not initialized');
    }

    const {
      provider = this.providers[0],
      language = 'en-US',
      confidence_threshold = 0.7,
      format = 'webm',
      sessionId = uuidv4()
    } = options;

    try {
      let transcription;
      const startTime = Date.now();

      // Convert audio to appropriate format if needed
      const processedAudio = await this._preprocessAudio(audioBuffer, format);

      switch (provider) {
        case 'openai':
          transcription = await this._transcribeWithOpenAI(processedAudio, language);
          break;
        case 'deepgram':
          transcription = await this._transcribeWithDeepgram(processedAudio, language);
          break;
        case 'azure':
          transcription = await this._transcribeWithAzure(processedAudio, language);
          break;
        default:
          throw new Error(`Unsupported ASR provider: ${provider}`);
      }

      const result = {
        text: transcription.text,
        confidence: transcription.confidence,
        provider,
        language,
        sessionId,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime,
        wordCount: transcription.text.split(' ').length
      };

      // Filter by confidence threshold
      if (result.confidence < confidence_threshold) {
        console.log(`⚠️ Low confidence transcription (${result.confidence}): ${result.text}`);
        return null;
      }

      // Broadcast transcription via Redis
      await this._broadcastTranscription(result);

      console.log(`🎙️ Transcription completed (${provider}): "${result.text}" (confidence: ${result.confidence})`);
      return result;

    } catch (error) {
      console.error(`❌ Transcription failed with ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Start real-time streaming transcription
   * @param {string} sessionId - Unique session identifier
   * @param {Object} options - Streaming options
   * @returns {Object} Stream interface
   */
  async startStreamingTranscription(sessionId, options = {}) {
    if (!this.initialized) {
      throw new Error('ASR Service not initialized');
    }

    const {
      provider = 'deepgram', // Deepgram is best for streaming
      language = 'en-US',
      confidence_threshold = 0.7,
      interim_results = true
    } = options;

    if (this.activeStreams.has(sessionId)) {
      throw new Error(`Streaming session ${sessionId} already active`);
    }

    try {
      let streamInterface;

      switch (provider) {
        case 'deepgram':
          streamInterface = await this._startDeepgramStream(sessionId, {
            language,
            confidence_threshold,
            interim_results
          });
          break;
        case 'azure':
          streamInterface = await this._startAzureStream(sessionId, {
            language,
            confidence_threshold
          });
          break;
        default:
          throw new Error(`Streaming not supported for provider: ${provider}`);
      }

      this.activeStreams.set(sessionId, {
        provider,
        streamInterface,
        startTime: Date.now(),
        options
      });

      console.log(`🎙️ Started streaming transcription session: ${sessionId} (${provider})`);
      return streamInterface;

    } catch (error) {
      console.error(`❌ Failed to start streaming transcription:`, error);
      throw error;
    }
  }

  /**
   * Stop streaming transcription
   * @param {string} sessionId - Session to stop
   */
  async stopStreamingTranscription(sessionId) {
    const session = this.activeStreams.get(sessionId);
    if (!session) {
      throw new Error(`Streaming session ${sessionId} not found`);
    }

    try {
      if (session.streamInterface && session.streamInterface.finish) {
        session.streamInterface.finish();
      }

      this.activeStreams.delete(sessionId);
      console.log(`🛑 Stopped streaming transcription session: ${sessionId}`);

    } catch (error) {
      console.error(`❌ Error stopping streaming session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Transcribe with OpenAI Whisper
   * @private
   */
  async _transcribeWithOpenAI(audioBuffer, language) {
    const tempFile = join(tmpdir(), `whisper_${uuidv4()}.wav`);
    
    try {
      writeFileSync(tempFile, audioBuffer);
      
      const response = await this.openai.audio.transcriptions.create({
        file: createReadStream(tempFile),
        model: 'whisper-1',
        language: language.split('-')[0], // OpenAI uses language codes like 'en'
        response_format: 'verbose_json'
      });

      return {
        text: response.text,
        confidence: 0.9, // OpenAI doesn't provide confidence scores
        segments: response.segments || []
      };

    } finally {
      try {
        unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Transcribe with Deepgram
   * @private
   */
  async _transcribeWithDeepgram(audioBuffer, language) {
    const response = await this.deepgram.transcription.preRecorded({
      buffer: audioBuffer,
      mimetype: 'audio/wav'
    }, {
      punctuate: true,
      language: language,
      model: 'nova-2',
      smart_format: true,
      diarize: false,
      confidence: 0.7
    });

    const result = response.results.channels[0].alternatives[0];
    
    return {
      text: result.transcript,
      confidence: result.confidence,
      words: result.words || []
    };
  }

  /**
   * Transcribe with Azure Speech
   * @private
   */
  async _transcribeWithAzure(audioBuffer, language) {
    return new Promise((resolve, reject) => {
      const tempFile = join(tmpdir(), `azure_${uuidv4()}.wav`);
      
      try {
        writeFileSync(tempFile, audioBuffer);
        
        const audioConfig = sdk.AudioConfig.fromWavFileInput(createReadStream(tempFile));
        const recognizer = new sdk.SpeechRecognizer(this.azureSpeechConfig, audioConfig);

        recognizer.recognizeOnceAsync(
          result => {
            recognizer.close();
            
            if (result.reason === sdk.ResultReason.RecognizedSpeech) {
              resolve({
                text: result.text,
                confidence: result.properties ? parseFloat(result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)) : 0.9
              });
            } else {
              reject(new Error(`Azure Speech recognition failed: ${result.errorDetails}`));
            }
          },
          error => {
            recognizer.close();
            reject(error);
          }
        );

      } catch (error) {
        reject(error);
      } finally {
        try {
          unlinkSync(tempFile);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });
  }

  /**
   * Start Deepgram streaming
   * @private
   */
  async _startDeepgramStream(sessionId, options) {
    const connection = this.deepgram.transcription.live({
      punctuate: true,
      language: options.language,
      model: 'nova-2',
      smart_format: true,
      interim_results: options.interim_results,
      endpointing: 300 // milliseconds of silence before finalizing
    });

    connection.on('transcriptReceived', async (data) => {
      const transcript = data.channel.alternatives[0];
      
      if (transcript.confidence >= options.confidence_threshold) {
        const result = {
          text: transcript.transcript,
          confidence: transcript.confidence,
          isFinal: data.is_final,
          provider: 'deepgram',
          sessionId,
          timestamp: new Date().toISOString()
        };

        await this._broadcastTranscription(result);
      }
    });

    connection.on('error', (error) => {
      console.error(`❌ Deepgram streaming error for session ${sessionId}:`, error);
    });

    return connection;
  }

  /**
   * Start Azure streaming
   * @private
   */
  async _startAzureStream(sessionId, options) {
    const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer = new sdk.SpeechRecognizer(this.azureSpeechConfig, audioConfig);

    recognizer.recognizing = async (s, e) => {
      if (options.interim_results) {
        const result = {
          text: e.result.text,
          confidence: 0.8,
          isFinal: false,
          provider: 'azure',
          sessionId,
          timestamp: new Date().toISOString()
        };
        await this._broadcastTranscription(result);
      }
    };

    recognizer.recognized = async (s, e) => {
      if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
        const result = {
          text: e.result.text,
          confidence: 0.9,
          isFinal: true,
          provider: 'azure',
          sessionId,
          timestamp: new Date().toISOString()
        };
        await this._broadcastTranscription(result);
      }
    };

    recognizer.startContinuousRecognitionAsync();

    return {
      recognizer,
      finish: () => recognizer.stopContinuousRecognitionAsync()
    };
  }

  /**
   * Preprocess audio for different formats
   * @private
   */
  async _preprocessAudio(audioBuffer, format) {
    if (format === 'wav' || format === 'pcm') {
      return audioBuffer;
    }

    return new Promise((resolve, reject) => {
      const tempInput = join(tmpdir(), `input_${uuidv4()}.${format}`);
      const tempOutput = join(tmpdir(), `output_${uuidv4()}.wav`);

      try {
        writeFileSync(tempInput, audioBuffer);

        ffmpeg(tempInput)
          .audioCodec('pcm_s16le')
          .audioChannels(1)
          .audioFrequency(16000)
          .format('wav')
          .output(tempOutput)
          .on('end', () => {
            try {
              const convertedBuffer = require('fs').readFileSync(tempOutput);
              unlinkSync(tempInput);
              unlinkSync(tempOutput);
              resolve(convertedBuffer);
            } catch (error) {
              reject(error);
            }
          })
          .on('error', reject)
          .run();

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Broadcast transcription via Redis
   * @private
   */
  async _broadcastTranscription(transcription) {
    try {
      await redisService.publish('transcription:completed', JSON.stringify(transcription));
      console.log(`📤 Broadcasted transcription: "${transcription.text}"`);
    } catch (error) {
      console.error('❌ Failed to broadcast transcription:', error);
    }
  }

  /**
   * Start queue processor for handling transcription requests
   * @private
   */
  _startQueueProcessor() {
    setInterval(async () => {
      if (this.processingQueue || this.transcriptionQueue.length === 0) {
        return;
      }

      this.processingQueue = true;
      
      try {
        const request = this.transcriptionQueue.shift();
        await this.transcribeAudio(request.audioBuffer, request.options);
      } catch (error) {
        console.error('❌ Queue processing error:', error);
      } finally {
        this.processingQueue = false;
      }
    }, 100);
  }

  /**
   * Add transcription request to queue
   * @param {Buffer} audioBuffer - Audio data
   * @param {Object} options - Transcription options
   */
  queueTranscription(audioBuffer, options = {}) {
    this.transcriptionQueue.push({ audioBuffer, options });
    console.log(`📋 Queued transcription request (queue size: ${this.transcriptionQueue.length})`);
  }

  /**
   * Get active streaming sessions
   * @returns {Array} Active sessions
   */
  getActiveStreams() {
    return Array.from(this.activeStreams.keys());
  }

  /**
   * Get service statistics
   * @returns {Object} Service stats
   */
  getStats() {
    return {
      initialized: this.initialized,
      providers: this.providers,
      activeStreams: this.activeStreams.size,
      queueLength: this.transcriptionQueue.length,
      processingQueue: this.processingQueue
    };
  }

  /**
   * Check if service is ready
   * @returns {boolean} Ready status
   */
  isReady() {
    return this.initialized && this.providers.length > 0;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up ASR Service...');
    
    // Stop all active streams
    for (const sessionId of this.activeStreams.keys()) {
      await this.stopStreamingTranscription(sessionId);
    }
    
    this.transcriptionQueue.length = 0;
    this.initialized = false;
  }
}

// Export singleton instance
module.exports = new ASRService();
