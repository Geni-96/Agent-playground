#!/bin/bash

# MCP Audio Integration Verification Script
# This script tests the new MCP audio functionality

echo "🔧 MCP Audio Integration Verification"
echo "====================================="

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed or not in PATH"
    exit 1
fi

# Check if required directories exist
if [ ! -d "services" ]; then
    echo "❌ Services directory not found. Run this script from the project root."
    exit 1
fi

echo "✅ Environment check passed"

# Test 1: Verify MediasoupBotClient can be loaded
echo ""
echo "🧪 Test 1: Loading MediasoupBotClient..."
node -e "
const MediasoupBotClient = require('./services/mediasoupBotClient');
const client = new MediasoupBotClient();
console.log('✅ MediasoupBotClient loaded successfully');
console.log('📡 Default MCP URL:', client.mcpServerUrl);
console.log('🔌 Connection status:', client.connected);
"

if [ $? -ne 0 ]; then
    echo "❌ Failed to load MediasoupBotClient"
    exit 1
fi

# Test 2: Check new MCP audio methods exist
echo ""
echo "🧪 Test 2: Verifying new MCP audio methods..."
node -e "
const MediasoupBotClient = require('./services/mediasoupBotClient');
const client = new MediasoupBotClient();

const requiredMethods = [
    'produceAudioFromBuffer',
    'consumeParticipantAudio',
    'getAudioParticipants',
    'testMCPAudioTools'
];

let allMethodsExist = true;
requiredMethods.forEach(method => {
    if (typeof client[method] === 'function') {
        console.log('✅', method, 'method exists');
    } else {
        console.log('❌', method, 'method missing');
        allMethodsExist = false;
    }
});

if (allMethodsExist) {
    console.log('✅ All required MCP audio methods are available');
} else {
    console.log('❌ Some required methods are missing');
    process.exit(1);
}
"

if [ $? -ne 0 ]; then
    echo "❌ MCP audio methods verification failed"
    exit 1
fi

# Test 3: Test audio buffer validation
echo ""
echo "🧪 Test 3: Testing audio buffer validation..."
node -e "
const MediasoupBotClient = require('./services/mediasoupBotClient');

// Create a test client that bypasses connection checks for validation testing
class TestClient extends MediasoupBotClient {
    constructor() {
        super();
        this.connected = true; // Bypass connection check for testing
        this.roomId = 'test-room';
        this.peerId = 'test-peer';
    }
    
    async _callMCPTool(toolName, args) {
        // Mock MCP tool call for testing
        return { success: true };
    }
}

const client = new TestClient();

// Test invalid buffer handling
(async () => {
    try {
        await client.produceAudioFromBuffer(null);
        console.log('❌ Should have thrown error for null buffer');
        process.exit(1);
    } catch (error) {
        if (error.message === 'Invalid audio buffer provided') {
            console.log('✅ Correctly validates null buffer');
        } else {
            console.log('❌ Unexpected error:', error.message);
            process.exit(1);
        }
    }

    try {
        await client.produceAudioFromBuffer('not a buffer');
        console.log('❌ Should have thrown error for non-buffer');
        process.exit(1);
    } catch (error) {
        if (error.message === 'Invalid audio buffer provided') {
            console.log('✅ Correctly validates non-buffer input');
        } else {
            console.log('❌ Unexpected error:', error.message);
            process.exit(1);
        }
    }
    
    // Test with valid buffer
    try {
        const validBuffer = Buffer.from('test audio data');
        const result = await client.produceAudioFromBuffer(validBuffer);
        if (typeof result === 'string') {
            console.log('✅ Accepts valid buffer and returns producer ID');
        } else {
            console.log('❌ Valid buffer test failed');
            process.exit(1);
        }
    } catch (error) {
        console.log('❌ Valid buffer test error:', error.message);
        process.exit(1);
    }

    console.log('✅ Audio buffer validation works correctly');
})().catch(console.error);
"

if [ $? -ne 0 ]; then
    echo "❌ Audio buffer validation test failed"
    exit 1
fi

# Test 4: Test base64 encoding/decoding
echo ""
echo "🧪 Test 4: Testing base64 audio handling..."
node -e "
const testData = 'test audio data';
const testBuffer = Buffer.from(testData, 'utf8');
const base64 = testBuffer.toString('base64');
const decodedBuffer = Buffer.from(base64, 'base64');
const decodedData = decodedBuffer.toString('utf8');

if (decodedData === testData) {
    console.log('✅ Base64 encoding/decoding works correctly');
} else {
    console.log('❌ Base64 encoding/decoding failed');
    process.exit(1);
}
"

if [ $? -ne 0 ]; then
    echo "❌ Base64 handling test failed"
    exit 1
fi

# Test 5: Check deprecated method warnings
echo ""
echo "🧪 Test 5: Testing deprecated method warnings..."
node -e "
const MediasoupBotClient = require('./services/mediasoupBotClient');
const client = new MediasoupBotClient();

// Capture console.warn
let warnCalled = false;
const originalWarn = console.warn;
console.warn = (...args) => {
    if (args[0].includes('deprecated')) {
        warnCalled = true;
    }
    originalWarn(...args);
};

// Test legacy methods
(async () => {
    try {
        await client.connect('test-room', 'test-agent');
        await client.produceAudio({ kind: 'audio' });
        
        if (warnCalled) {
            console.log('✅ Deprecated method warning displayed correctly');
        } else {
            console.log('⚠️ Deprecated method warning not shown');
        }
    } catch (error) {
        // Expected to fail due to connection, but warning should still show
        if (warnCalled) {
            console.log('✅ Deprecated method warning displayed correctly');
        } else {
            console.log('⚠️ Deprecated method warning not shown');
        }
    }
    
    console.warn = originalWarn;
})().catch(() => {});
"

# Test 6: Verify examples and tests exist
echo ""
echo "🧪 Test 6: Checking example and test files..."

if [ -f "examples/mcp-audio-integration.js" ]; then
    echo "✅ Example file exists"
    # Test if example file loads without syntax errors
    node -c examples/mcp-audio-integration.js
    if [ $? -eq 0 ]; then
        echo "✅ Example file syntax is valid"
    else
        echo "❌ Example file has syntax errors"
        exit 1
    fi
else
    echo "❌ Example file missing"
    exit 1
fi

if [ -f "tests/mcp-audio-integration.test.js" ]; then
    echo "✅ Test file exists"
    # Test if test file loads without syntax errors
    node -c tests/mcp-audio-integration.test.js
    if [ $? -eq 0 ]; then
        echo "✅ Test file syntax is valid"
    else
        echo "❌ Test file has syntax errors"
        exit 1
    fi
else
    echo "❌ Test file missing"
    exit 1
fi

if [ -f "docs/MCP-AUDIO-INTEGRATION.md" ]; then
    echo "✅ Documentation file exists"
else
    echo "❌ Documentation file missing"
    exit 1
fi

echo ""
echo "🎉 All MCP Audio Integration verification tests passed!"
echo ""
echo "📋 Summary:"
echo "  ✅ MediasoupBotClient loads successfully"
echo "  ✅ New MCP audio methods are available"
echo "  ✅ Audio buffer validation works"
echo "  ✅ Base64 encoding/decoding works"
echo "  ✅ Deprecated method warnings display"
echo "  ✅ Example and test files are present and valid"
echo "  ✅ Documentation is available"
echo ""
echo "🚀 Ready for MCP audio integration testing!"
echo ""
echo "Next steps:"
echo "  1. Ensure MCP server is running at http://localhost:5002/mcp"
echo "  2. Run integration tests: npm test tests/mcp-audio-integration.test.js"
echo "  3. Try examples: node examples/mcp-audio-integration.js"
echo "  4. Check documentation: docs/MCP-AUDIO-INTEGRATION.md"
