# MCP Audio Integration Documentation

## Overview

The MediasoupBotClient has been updated to support real audio operations through the Model Context Protocol (MCP) server. This integration enables agents to send TTS-generated audio to Mediasoup rooms and consume audio from human participants using real WebRTC streams instead of simulated operations.

## Prerequisites

- MCP server running at `http://localhost:5002/mcp`
- MCP server must have the following tools enabled:
  - `produce_audio`: Send audio to Mediasoup room
  - `get_human_audio`: Consume audio from participants
  - `get_audio_participants`: List audio-capable participants
  - `get_audio_stats`: Get audio operation statistics

## New Methods

### `produceAudioFromBuffer(audioBuffer, options)`

Sends TTS audio buffer to the Mediasoup room via MCP server.

**Parameters:**
- `audioBuffer` (Buffer): Audio data buffer from TTS service
- `options` (Object): Audio production options
  - `format` (string): Audio format (default: 'mp3')
  - `sampleRate` (number): Sample rate (default: 24000)
  - `channels` (number): Number of channels (default: 1)

**Returns:** Promise<string> - Producer ID

**Example:**
```javascript
const audioBuffer = await ttsService.generateSpeech('Hello world!', 'agent-id');
const producerId = await client.produceAudioFromBuffer(audioBuffer, {
  format: 'mp3',
  sampleRate: 24000,
  channels: 1
});
```

### `consumeParticipantAudio(participantId, options)`

Consumes audio from any participant in the room via MCP server.

**Parameters:**
- `participantId` (string): ID of participant to consume audio from
- `options` (Object): Audio consumption options
  - `durationMs` (number): Duration to capture in milliseconds (default: 5000)
  - `format` (string): Desired audio format (default: 'mp3')
  - `sampleRate` (number): Desired sample rate (default: 24000)

**Returns:** Promise<Object> - Consumer info with audio data

**Example:**
```javascript
const consumerInfo = await client.consumeParticipantAudio('human-123', {
  durationMs: 3000,
  format: 'mp3',
  sampleRate: 24000
});

if (consumerInfo.audioBuffer) {
  // Process the captured audio buffer
  console.log(`Captured ${consumerInfo.audioBuffer.length} bytes of audio`);
}
```

### `getAudioParticipants()`

Gets list of participants with audio capabilities.

**Returns:** Promise<Array> - List of audio-capable participants

**Example:**
```javascript
const participants = await client.getAudioParticipants();
const humans = participants.filter(p => p.type === 'human');
```

### `testMCPAudioTools()`

Tests availability of MCP audio tools.

**Returns:** Promise<Object> - Tool availability status

**Example:**
```javascript
const tools = await client.testMCPAudioTools();
console.log('produce_audio available:', tools.produce_audio);
console.log('get_human_audio available:', tools.get_human_audio);
```

## Audio Buffer Handling

### Base64 Encoding
Audio buffers are automatically converted to base64 strings for JSON-RPC compatibility when sending to the MCP server:

```javascript
// Internal conversion (automatic)
const audioBase64 = audioBuffer.toString('base64');
```

### Base64 Decoding
Audio data received from MCP server is automatically converted back to Buffer objects:

```javascript
// Internal conversion (automatic)
const audioBuffer = Buffer.from(result.audioData, 'base64');
```

## Event System

The client emits events for all audio operations:

### `audioProduced`
Emitted when audio is successfully sent to the room.

```javascript
client.on('audioProduced', (data) => {
  console.log('Audio produced:', data.producerId);
  console.log('Audio size:', data.audioBuffer.length, 'bytes');
  console.log('Format:', data.format);
});
```

### `audioConsumed`
Emitted when audio is successfully consumed from a participant.

```javascript
client.on('audioConsumed', (data) => {
  console.log('Audio consumed:', data.consumerId);
  console.log('From participant:', data.participantId);
  console.log('Audio size:', data.audioBuffer ? data.audioBuffer.length : 0, 'bytes');
});
```

## Error Handling

The integration includes comprehensive error handling:

### Connection Errors
```javascript
try {
  await client.connect('room-123', 'agent-id');
} catch (error) {
  console.error('Failed to connect to MCP server:', error.message);
}
```

### Invalid Audio Data
```javascript
try {
  await client.produceAudioFromBuffer(null);
} catch (error) {
  console.error('Invalid audio buffer:', error.message);
  // Error: Invalid audio buffer provided
}
```

### MCP Tool Unavailability
The client gracefully handles cases where MCP audio tools are not available:

```javascript
// Automatically falls back to basic functionality
const participants = await client.getAudioParticipants();
// Will use listParticipants() if get_audio_participants tool is not available
```

## Migration from Legacy Methods

### Deprecated Methods
The following methods are now deprecated but maintained for backward compatibility:

- `produceAudio(track, options)` → Use `produceAudioFromBuffer(audioBuffer, options)`
- `consumeAudio(producerId, rtpParameters)` → Use `consumeParticipantAudio(participantId, options)`

### Migration Example

**Before (Legacy):**
```javascript
const track = await createAudioTrack(audioBuffer);
const producerId = await client.produceAudio(track);
```

**After (MCP Integration):**
```javascript
const producerId = await client.produceAudioFromBuffer(audioBuffer, {
  format: 'mp3',
  sampleRate: 24000
});
```

## Complete Integration Example

```javascript
const MediasoupBotClient = require('./services/mediasoupBotClient');
const ttsService = require('./services/ttsService');

async function agentConversation() {
  const client = new MediasoupBotClient('http://localhost:5002/mcp');
  
  try {
    // Connect to room
    await client.connect('conversation-room', 'agent-alice');
    
    // Test MCP tools
    const tools = await client.testMCPAudioTools();
    console.log('MCP tools available:', tools);
    
    // Set up event listeners
    client.on('audioProduced', (data) => {
      console.log(`🎵 Sent audio: ${data.producerId}`);
    });
    
    client.on('audioConsumed', (data) => {
      console.log(`🎧 Received audio from: ${data.participantId}`);
    });
    
    // Get available participants
    const participants = await client.getAudioParticipants();
    console.log('👥 Participants:', participants.length);
    
    // Agent speaks
    const message = "Hello! I'm ready to help you today.";
    const audioBuffer = await ttsService.generateSpeech(message, 'agent-alice');
    const producerId = await client.produceAudioFromBuffer(audioBuffer);
    
    // Listen for human response
    const human = participants.find(p => p.type === 'human');
    if (human) {
      const humanAudio = await client.consumeParticipantAudio(human.id, {
        durationMs: 5000
      });
      
      if (humanAudio.audioBuffer) {
        // Send to ASR service for transcription
        console.log('Processing human audio...');
      }
    }
    
    // Get audio statistics
    const stats = await client.getAudioStats();
    console.log('📊 Audio stats:', stats);
    
  } catch (error) {
    console.error('❌ Conversation error:', error);
  } finally {
    await client.disconnect();
  }
}
```

## Testing

Run the integration tests:

```bash
npm test tests/mcp-audio-integration.test.js
```

Run the usage examples:

```bash
node examples/mcp-audio-integration.js
```

## Troubleshooting

### MCP Server Connection Issues
1. Verify MCP server is running on the correct port
2. Check that required audio tools are available
3. Ensure network connectivity to MCP server

### Audio Quality Issues
1. Verify audio format compatibility
2. Check sample rate settings
3. Ensure buffer size is appropriate

### Performance Optimization
1. Use appropriate duration settings for audio consumption
2. Consider audio format and compression
3. Monitor memory usage with large audio buffers

## MCP Tool Requirements

The MCP server must implement these tools for full functionality:

### `produce_audio`
```json
{
  "name": "produce_audio",
  "description": "Send audio to Mediasoup room",
  "inputSchema": {
    "type": "object",
    "properties": {
      "roomId": {"type": "string"},
      "agentName": {"type": "string"},
      "audioData": {"type": "string", "description": "Base64 encoded audio"},
      "format": {"type": "string"},
      "sampleRate": {"type": "number"},
      "channels": {"type": "number"}
    }
  }
}
```

### `get_human_audio`
```json
{
  "name": "get_human_audio",
  "description": "Get audio from participant",
  "inputSchema": {
    "type": "object",
    "properties": {
      "roomId": {"type": "string"},
      "participantId": {"type": "string"},
      "durationMs": {"type": "number"},
      "format": {"type": "string"},
      "sampleRate": {"type": "number"}
    }
  }
}
```

This integration enables real audio communication between AI agents and human participants through the Mediasoup WebRTC infrastructure via MCP server coordination.
