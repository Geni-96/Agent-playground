import { io } from 'socket.io-client';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.connectionState = 'disconnected';
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect(url = 'http://localhost:3000') {
    if (this.socket) {
      console.warn('⚠️ WebSocket already connected');
      return;
    }

    console.log(`🔌 Connecting to WebSocket at ${url}`);
    
    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
    });

    this.setupEventListeners();
    return this.socket;
  }

  setupEventListeners() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected');
      this.connectionState = 'connected';
      this.reconnectAttempts = 0;
      this.emit('connection:status', { status: 'connected' });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected:', reason);
      this.connectionState = 'disconnected';
      this.emit('connection:status', { status: 'disconnected', reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
      this.connectionState = 'error';
      this.emit('connection:status', { status: 'error', error });
    });

    // Agent events
    this.socket.on('agent:created', (data) => {
      console.log('🤖 Agent created:', data);
      this.emit('agent:created', data);
    });

    this.socket.on('agent:status:changed', (data) => {
      console.log('🔄 Agent status changed:', data);
      this.emit('agent:status:changed', data);
    });

    this.socket.on('agent:updated', (data) => {
      console.log('⚙️ Agent updated:', data);
      this.emit('agent:updated', data);
    });

    this.socket.on('agent:deleted', (data) => {
      console.log('🗑️ Agent deleted:', data);
      this.emit('agent:deleted', data);
    });

    // Voice and conversation events
    this.socket.on('agent:speaking:start', (data) => {
      console.log('🗣️ Agent started speaking:', data);
      this.emit('agent:speaking:start', data);
    });

    this.socket.on('agent:speaking:end', (data) => {
      console.log('🤐 Agent stopped speaking:', data);
      this.emit('agent:speaking:end', data);
    });

    this.socket.on('conversation:message', (data) => {
      console.log('💬 New conversation message:', data);
      this.emit('conversation:message', data);
    });

    this.socket.on('transcription:update', (data) => {
      console.log('🎙️ Transcription update:', data);
      this.emit('transcription:update', data);
    });

    // Room events
    this.socket.on('room:joined', (data) => {
      console.log('🏠 Room joined:', data);
      this.emit('room:joined', data);
    });

    this.socket.on('room:left', (data) => {
      console.log('🚪 Room left:', data);
      this.emit('room:left', data);
    });

    // System events
    this.socket.on('system:error', (data) => {
      console.error('⚠️ System error:', data);
      this.emit('system:error', data);
    });

    this.socket.on('system:status', (data) => {
      console.log('📊 System status:', data);
      this.emit('system:status', data);
    });
  }

  // Subscribe to events
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    // Return unsubscribe function
    return () => {
      const eventListeners = this.listeners.get(event);
      if (eventListeners) {
        eventListeners.delete(callback);
        if (eventListeners.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  // Emit events to listeners
  emit(event, data) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  // Send message to server
  send(event, data) {
    if (this.socket && this.connectionState === 'connected') {
      this.socket.emit(event, data);
    } else {
      console.warn('⚠️ Cannot send message - WebSocket not connected');
    }
  }

  // Disconnect
  disconnect() {
    if (this.socket) {
      console.log('🔌 Disconnecting WebSocket');
      this.socket.disconnect();
      this.socket = null;
      this.connectionState = 'disconnected';
      this.listeners.clear();
    }
  }

  // Get connection status
  getConnectionState() {
    return this.connectionState;
  }

  // Check if connected
  isConnected() {
    return this.connectionState === 'connected';
  }
}

// Create singleton instance
const webSocketService = new WebSocketService();

export default webSocketService;
