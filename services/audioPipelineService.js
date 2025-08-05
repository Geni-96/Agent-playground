const { Readable, PassThrough } = require('stream');
const { join } = require('path');
const { tmpdir } = require('os');
const { writeFileSync, unlinkSync, createReadStream } = require('fs');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const wav = require('node-wav');
const { EventEmitter } = require('events');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

/**
 * Audio Pipeline Service
 * Orchestrates the complete audio flow between TTS, WebRTC, and ASR
 */
class AudioPipelineService extends EventEmitter {
  constructor() {
    super();
    this.activePipelines = new Map(); // Track active audio pipelines
    this.audioBuffers = new Map(); // Manage audio buffering
    this.codecSettings = {
      opus: {
        sampleRate: 48000,
        channels: 1,
        bitrate: 64000
      },
      pcm: {
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16
      }
    };
    this.latencyMetrics = [];
    this.maxLatencyMetrics = 100;
  }

  /**
   * Create audio pipeline for TTS to WebRTC
   * @param {string} pipelineId - Unique pipeline identifier
   * @param {Object} options - Pipeline options
   * @returns {Object} Pipeline interface
   */
  async createTTSToWebRTCPipeline(pipelineId, options = {}) {
    if (this.activePipelines.has(pipelineId)) {
      throw new Error(`Pipeline ${pipelineId} already exists`);
    }

    const {
      outputFormat = 'opus',
      sampleRate = 48000,
      channels = 1,
      bufferSize = 4096,
      enableLatencyOptimization = true
    } = options;

    try {
      const pipeline = {
        id: pipelineId,
        inputStream: new PassThrough(),
        outputStream: new PassThrough(),
        converter: null,
        buffer: Buffer.alloc(0),
        bufferSize,
        sampleRate,
        channels,
        outputFormat,
        latencyStart: null,
        stats: {
          bytesProcessed: 0,
          chunksProcessed: 0,
          avgLatency: 0,
          errors: 0
        }
      };

      // Set up audio conversion pipeline
      await this._setupTTSConversionPipeline(pipeline);

      this.activePipelines.set(pipelineId, pipeline);

      console.log(`🎵 Created TTS-to-WebRTC pipeline: ${pipelineId} (${outputFormat}, ${sampleRate}Hz)`);
      this.emit('pipelineCreated', { pipelineId, type: 'tts-to-webrtc' });

      return {
        inputStream: pipeline.inputStream,
        outputStream: pipeline.outputStream,
        getStats: () => pipeline.stats
      };

    } catch (error) {
      console.error(`❌ Failed to create TTS-to-WebRTC pipeline:`, error);
      throw error;
    }
  }

  /**
   * Create audio pipeline for WebRTC to ASR
   * @param {string} pipelineId - Unique pipeline identifier
   * @param {Object} options - Pipeline options
   * @returns {Object} Pipeline interface
   */
  async createWebRTCToASRPipeline(pipelineId, options = {}) {
    if (this.activePipelines.has(pipelineId)) {
      throw new Error(`Pipeline ${pipelineId} already exists`);
    }

    const {
      inputFormat = 'opus',
      outputFormat = 'wav',
      sampleRate = 16000,
      channels = 1,
      bufferDuration = 1000, // milliseconds
      enableVAD = true // Voice Activity Detection
    } = options;

    try {
      const pipeline = {
        id: pipelineId,
        inputStream: new PassThrough(),
        outputStream: new PassThrough(),
        converter: null,
        buffer: Buffer.alloc(0),
        bufferDuration,
        sampleRate,
        channels,
        inputFormat,
        outputFormat,
        enableVAD,
        vadThreshold: 0.5,
        silenceBuffer: Buffer.alloc(0),
        isVoiceActive: false,
        stats: {
          bytesProcessed: 0,
          chunksProcessed: 0,
          voiceSegments: 0,
          silenceSegments: 0,
          errors: 0
        }
      };

      // Set up audio conversion pipeline
      await this._setupASRConversionPipeline(pipeline);

      this.activePipelines.set(pipelineId, pipeline);

      console.log(`🎤 Created WebRTC-to-ASR pipeline: ${pipelineId} (${inputFormat} → ${outputFormat})`);
      this.emit('pipelineCreated', { pipelineId, type: 'webrtc-to-asr' });

      return {
        inputStream: pipeline.inputStream,
        outputStream: pipeline.outputStream,
        getStats: () => pipeline.stats
      };

    } catch (error) {
      console.error(`❌ Failed to create WebRTC-to-ASR pipeline:`, error);
      throw error;
    }
  }

  /**
   * Convert TTS audio to WebRTC format
   * @param {Buffer} ttsAudio - TTS audio data
   * @param {Object} options - Conversion options
   * @returns {Buffer} WebRTC-compatible audio
   */
  async convertTTSToWebRTC(ttsAudio, options = {}) {
    const {
      inputFormat = 'mp3',
      outputFormat = 'opus',
      sampleRate = 48000,
      channels = 1
    } = options;

    const startTime = Date.now();

    try {
      const convertedAudio = await this._convertAudio(ttsAudio, {
        inputFormat,
        outputFormat,
        sampleRate,
        channels
      });

      const latency = Date.now() - startTime;
      this._recordLatency('tts-conversion', latency);

      console.log(`🔄 Converted TTS audio: ${ttsAudio.length} → ${convertedAudio.length} bytes (${latency}ms)`);
      return convertedAudio;

    } catch (error) {
      console.error(`❌ TTS conversion failed:`, error);
      throw error;
    }
  }

  /**
   * Convert WebRTC audio to ASR format
   * @param {Buffer} webrtcAudio - WebRTC audio data
   * @param {Object} options - Conversion options
   * @returns {Buffer} ASR-compatible audio
   */
  async convertWebRTCToASR(webrtcAudio, options = {}) {
    const {
      inputFormat = 'opus',
      outputFormat = 'wav',
      sampleRate = 16000,
      channels = 1
    } = options;

    const startTime = Date.now();

    try {
      const convertedAudio = await this._convertAudio(webrtcAudio, {
        inputFormat,
        outputFormat,
        sampleRate,
        channels
      });

      const latency = Date.now() - startTime;
      this._recordLatency('asr-conversion', latency);

      console.log(`🔄 Converted WebRTC audio: ${webrtcAudio.length} → ${convertedAudio.length} bytes (${latency}ms)`);
      return convertedAudio;

    } catch (error) {
      console.error(`❌ WebRTC conversion failed:`, error);
      throw error;
    }
  }

  /**
   * Create audio track from buffer for WebRTC
   * @param {Buffer} audioBuffer - Audio data
   * @param {Object} options - Track options
   * @returns {MediaStreamTrack} Audio track
   */
  async createAudioTrackFromBuffer(audioBuffer, options = {}) {
    const {
      sampleRate = 48000,
      channels = 1,
      loop = false
    } = options;

    try {
      // Convert to proper format if needed
      const formattedBuffer = await this._formatForWebRTC(audioBuffer, {
        sampleRate,
        channels
      });

      // Create audio context and buffer
      const audioContext = new (require('node-web-audio-api').AudioContext)({
        sampleRate,
        channels
      });

      const audioBufferSource = audioContext.createBufferSource();
      const audioData = new Float32Array(formattedBuffer.length / 4);
      
      // Convert buffer to Float32Array
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = formattedBuffer.readFloatLE(i * 4);
      }

      const buffer = audioContext.createBuffer(channels, audioData.length / channels, sampleRate);
      buffer.copyToChannel(audioData, 0);
      
      audioBufferSource.buffer = buffer;
      audioBufferSource.loop = loop;

      // Create MediaStreamTrack equivalent
      const track = {
        kind: 'audio',
        id: uuidv4(),
        enabled: true,
        muted: false,
        readyState: 'live',
        stop: () => {
          audioBufferSource.stop();
          track.readyState = 'ended';
        }
      };

      console.log(`🎵 Created audio track from buffer: ${audioBuffer.length} bytes`);
      return track;

    } catch (error) {
      console.error(`❌ Failed to create audio track:`, error);
      throw error;
    }
  }

  /**
   * Create buffered audio stream
   * @param {number} bufferDuration - Buffer duration in milliseconds
   * @param {Object} options - Stream options
   * @returns {Object} Buffered stream interface
   */
  createBufferedAudioStream(bufferDuration, options = {}) {
    const {
      sampleRate = 16000,
      channels = 1,
      chunkSize = 1024
    } = options;

    const streamId = uuidv4();
    const buffer = {
      id: streamId,
      data: Buffer.alloc(0),
      maxSize: Math.floor((bufferDuration / 1000) * sampleRate * channels * 2), // 16-bit samples
      stream: new PassThrough(),
      chunks: [],
      lastFlush: Date.now()
    };

    this.audioBuffers.set(streamId, buffer);

    const streamInterface = {
      id: streamId,
      write: (chunk) => this._writeToBuffer(streamId, chunk),
      read: () => this._readFromBuffer(streamId),
      flush: () => this._flushBuffer(streamId),
      close: () => this._closeBuffer(streamId),
      getStats: () => ({
        bufferSize: buffer.data.length,
        maxSize: buffer.maxSize,
        utilization: buffer.data.length / buffer.maxSize,
        chunks: buffer.chunks.length
      })
    };

    console.log(`📦 Created buffered audio stream: ${streamId} (${bufferDuration}ms buffer)`);
    return streamInterface;
  }

  /**
   * Destroy pipeline
   * @param {string} pipelineId - Pipeline to destroy
   */
  async destroyPipeline(pipelineId) {
    const pipeline = this.activePipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    try {
      // Close streams
      if (pipeline.inputStream) pipeline.inputStream.destroy();
      if (pipeline.outputStream) pipeline.outputStream.destroy();
      if (pipeline.converter) pipeline.converter.kill();

      this.activePipelines.delete(pipelineId);

      console.log(`🗑️ Destroyed pipeline: ${pipelineId}`);
      this.emit('pipelineDestroyed', { pipelineId });

    } catch (error) {
      console.error(`❌ Error destroying pipeline ${pipelineId}:`, error);
      throw error;
    }
  }

  /**
   * Setup TTS conversion pipeline
   * @private
   */
  async _setupTTSConversionPipeline(pipeline) {
    pipeline.inputStream.on('data', async (chunk) => {
      try {
        pipeline.latencyStart = Date.now();
        pipeline.buffer = Buffer.concat([pipeline.buffer, chunk]);
        pipeline.stats.bytesProcessed += chunk.length;

        // Process when buffer reaches threshold
        if (pipeline.buffer.length >= pipeline.bufferSize) {
          const processedChunk = await this._processTTSChunk(pipeline);
          if (processedChunk) {
            pipeline.outputStream.write(processedChunk);
            const latency = Date.now() - pipeline.latencyStart;
            this._recordLatency('tts-processing', latency);
          }
        }

      } catch (error) {
        pipeline.stats.errors++;
        console.error(`❌ TTS pipeline processing error:`, error);
      }
    });

    pipeline.inputStream.on('end', async () => {
      // Process remaining buffer
      if (pipeline.buffer.length > 0) {
        const processedChunk = await this._processTTSChunk(pipeline);
        if (processedChunk) {
          pipeline.outputStream.write(processedChunk);
        }
      }
      pipeline.outputStream.end();
    });
  }

  /**
   * Setup ASR conversion pipeline
   * @private
   */
  async _setupASRConversionPipeline(pipeline) {
    pipeline.inputStream.on('data', async (chunk) => {
      try {
        pipeline.buffer = Buffer.concat([pipeline.buffer, chunk]);
        pipeline.stats.bytesProcessed += chunk.length;

        // Voice Activity Detection
        if (pipeline.enableVAD) {
          const isVoice = this._detectVoiceActivity(chunk, pipeline.vadThreshold);
          
          if (isVoice && !pipeline.isVoiceActive) {
            pipeline.isVoiceActive = true;
            pipeline.stats.voiceSegments++;
            console.log(`🎙️ Voice activity detected in pipeline ${pipeline.id}`);
          } else if (!isVoice && pipeline.isVoiceActive) {
            pipeline.isVoiceActive = false;
            pipeline.stats.silenceSegments++;
            console.log(`🔇 Voice activity ended in pipeline ${pipeline.id}`);
          }
        }

        // Process audio chunks based on duration
        const chunkDuration = this._calculateChunkDuration(pipeline.buffer, pipeline.sampleRate, pipeline.channels);
        
        if (chunkDuration >= pipeline.bufferDuration) {
          const processedChunk = await this._processASRChunk(pipeline);
          if (processedChunk) {
            pipeline.outputStream.write(processedChunk);
          }
        }

      } catch (error) {
        pipeline.stats.errors++;
        console.error(`❌ ASR pipeline processing error:`, error);
      }
    });
  }

  /**
   * Process TTS audio chunk
   * @private
   */
  async _processTTSChunk(pipeline) {
    if (pipeline.buffer.length === 0) return null;

    const chunk = pipeline.buffer.slice(0, pipeline.bufferSize);
    pipeline.buffer = pipeline.buffer.slice(pipeline.bufferSize);
    pipeline.stats.chunksProcessed++;

    // Convert to target format
    return await this._convertAudio(chunk, {
      inputFormat: 'raw',
      outputFormat: pipeline.outputFormat,
      sampleRate: pipeline.sampleRate,
      channels: pipeline.channels
    });
  }

  /**
   * Process ASR audio chunk
   * @private
   */
  async _processASRChunk(pipeline) {
    if (pipeline.buffer.length === 0) return null;

    const bytesPerSample = 2; // 16-bit
    const bytesPerSecond = pipeline.sampleRate * pipeline.channels * bytesPerSample;
    const bytesForDuration = Math.floor((pipeline.bufferDuration / 1000) * bytesPerSecond);

    const chunk = pipeline.buffer.slice(0, bytesForDuration);
    pipeline.buffer = pipeline.buffer.slice(bytesForDuration);
    pipeline.stats.chunksProcessed++;

    // Convert to target format
    return await this._convertAudio(chunk, {
      inputFormat: pipeline.inputFormat,
      outputFormat: pipeline.outputFormat,
      sampleRate: pipeline.sampleRate,
      channels: pipeline.channels
    });
  }

  /**
   * Generic audio conversion
   * @private
   */
  async _convertAudio(audioBuffer, options) {
    const {
      inputFormat,
      outputFormat,
      sampleRate,
      channels
    } = options;

    if (inputFormat === outputFormat) {
      return audioBuffer;
    }

    return new Promise((resolve, reject) => {
      const tempInput = join(tmpdir(), `input_${uuidv4()}.${inputFormat}`);
      const tempOutput = join(tmpdir(), `output_${uuidv4()}.${outputFormat}`);

      try {
        writeFileSync(tempInput, audioBuffer);

        let command = ffmpeg(tempInput)
          .audioChannels(channels)
          .audioFrequency(sampleRate);

        // Set codec based on output format
        switch (outputFormat) {
          case 'opus':
            command = command.audioCodec('libopus').audioBitrate('64k');
            break;
          case 'wav':
            command = command.audioCodec('pcm_s16le');
            break;
          case 'mp3':
            command = command.audioCodec('mp3').audioBitrate('128k');
            break;
          default:
            command = command.audioCodec('pcm_s16le');
        }

        command
          .format(outputFormat)
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
          .on('error', (error) => {
            try {
              unlinkSync(tempInput);
              unlinkSync(tempOutput);
            } catch (e) {
              // Ignore cleanup errors
            }
            reject(error);
          })
          .run();

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Format audio for WebRTC
   * @private
   */
  async _formatForWebRTC(audioBuffer, options) {
    return await this._convertAudio(audioBuffer, {
      inputFormat: 'wav',
      outputFormat: 'raw',
      sampleRate: options.sampleRate,
      channels: options.channels
    });
  }

  /**
   * Detect voice activity
   * @private
   */
  _detectVoiceActivity(audioChunk, threshold) {
    // Simple energy-based VAD
    let energy = 0;
    for (let i = 0; i < audioChunk.length; i += 2) {
      const sample = audioChunk.readInt16LE(i);
      energy += sample * sample;
    }
    
    const rms = Math.sqrt(energy / (audioChunk.length / 2));
    return rms > threshold * 32767; // Normalize to 16-bit range
  }

  /**
   * Calculate chunk duration
   * @private
   */
  _calculateChunkDuration(buffer, sampleRate, channels) {
    const bytesPerSample = 2; // 16-bit
    const totalSamples = buffer.length / (bytesPerSample * channels);
    return (totalSamples / sampleRate) * 1000; // milliseconds
  }

  /**
   * Write to audio buffer
   * @private
   */
  _writeToBuffer(streamId, chunk) {
    const buffer = this.audioBuffers.get(streamId);
    if (!buffer) return false;

    buffer.data = Buffer.concat([buffer.data, chunk]);
    buffer.chunks.push({ data: chunk, timestamp: Date.now() });

    // Trim buffer if too large
    if (buffer.data.length > buffer.maxSize) {
      const excess = buffer.data.length - buffer.maxSize;
      buffer.data = buffer.data.slice(excess);
    }

    return true;
  }

  /**
   * Read from audio buffer
   * @private
   */
  _readFromBuffer(streamId) {
    const buffer = this.audioBuffers.get(streamId);
    if (!buffer || buffer.data.length === 0) return null;

    const data = buffer.data;
    buffer.data = Buffer.alloc(0);
    buffer.chunks = [];
    
    return data;
  }

  /**
   * Flush audio buffer
   * @private
   */
  _flushBuffer(streamId) {
    const buffer = this.audioBuffers.get(streamId);
    if (!buffer) return null;

    const data = this._readFromBuffer(streamId);
    buffer.lastFlush = Date.now();
    
    return data;
  }

  /**
   * Close audio buffer
   * @private
   */
  _closeBuffer(streamId) {
    const buffer = this.audioBuffers.get(streamId);
    if (buffer) {
      buffer.stream.destroy();
      this.audioBuffers.delete(streamId);
    }
  }

  /**
   * Record latency metrics
   * @private
   */
  _recordLatency(operation, latency) {
    this.latencyMetrics.push({
      operation,
      latency,
      timestamp: Date.now()
    });

    // Keep only recent metrics
    if (this.latencyMetrics.length > this.maxLatencyMetrics) {
      this.latencyMetrics = this.latencyMetrics.slice(-this.maxLatencyMetrics);
    }
  }

  /**
   * Get pipeline statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const pipelineStats = {};
    for (const [id, pipeline] of this.activePipelines) {
      pipelineStats[id] = pipeline.stats;
    }

    const latencyStats = {};
    for (const metric of this.latencyMetrics) {
      if (!latencyStats[metric.operation]) {
        latencyStats[metric.operation] = [];
      }
      latencyStats[metric.operation].push(metric.latency);
    }

    // Calculate averages
    for (const operation in latencyStats) {
      const latencies = latencyStats[operation];
      latencyStats[operation] = {
        avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        min: Math.min(...latencies),
        max: Math.max(...latencies),
        count: latencies.length
      };
    }

    return {
      activePipelines: this.activePipelines.size,
      activeBuffers: this.audioBuffers.size,
      pipelineStats,
      latencyStats
    };
  }

  /**
   * Check if service is ready
   * @returns {boolean} Ready status
   */
  isReady() {
    return true; // Audio pipeline service is always ready
  }

  /**
   * Cleanup all resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up Audio Pipeline Service...');

    // Destroy all pipelines
    for (const pipelineId of this.activePipelines.keys()) {
      await this.destroyPipeline(pipelineId);
    }

    // Close all buffers
    for (const streamId of this.audioBuffers.keys()) {
      this._closeBuffer(streamId);
    }

    this.latencyMetrics = [];
  }
}

// Export singleton instance
module.exports = new AudioPipelineService();
