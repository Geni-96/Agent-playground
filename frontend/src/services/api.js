import axios from 'axios';

const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? process.env.REACT_APP_API_URL || 'http://localhost:3000'
  : 'http://localhost:3000';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`🔄 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('❌ API Response Error:', error);
    return Promise.reject(error);
  }
);

// Agent API endpoints
export const agentAPI = {
  // Get all agents
  getAgents: () => api.get('/agents'),
  
  // Get specific agent
  getAgent: (agentId) => api.get(`/agents/${agentId}`),
  
  // Create new agent
  createAgent: (agentData) => api.post('/agents/create', agentData),
  
  // Update agent configuration
  updateAgent: (agentId, updates) => api.put(`/agents/${agentId}`, updates),
  
  // Delete agent
  deleteAgent: (agentId) => api.delete(`/agents/${agentId}`),
  
  // Get agent stats
  getAgentStats: (agentId) => api.get(`/agents/${agentId}/stats`),
  
  // Get agent voice stats
  getAgentVoiceStats: (agentId) => api.get(`/agents/${agentId}/voice-stats`),
  
  // Make agent speak
  speakAgent: (agentId, text, options = {}) => 
    api.post(`/agents/${agentId}/speak`, { text, ...options }),
  
  // Join agent to room
  joinRoom: (agentId, roomId) => 
    api.post(`/agents/${agentId}/join-room`, { roomId }),
  
  // Leave room
  leaveRoom: (agentId) => api.post(`/agents/${agentId}/leave-room`),
};

// System API endpoints
export const systemAPI = {
  // Get system health
  getHealth: () => api.get('/health'),
  
  // Get system status
  getStatus: () => api.get('/system/status'),
  
  // Get service status
  getServiceStatus: () => api.get('/system/services'),
  
  // Get conversation history
  getConversationHistory: (roomId, limit = 50) => 
    api.get(`/conversations/${roomId}?limit=${limit}`),
};

// Room API endpoints
export const roomAPI = {
  // Get all rooms
  getRooms: () => api.get('/rooms'),
  
  // Get room details
  getRoom: (roomId) => api.get(`/rooms/${roomId}`),
  
  // Create room
  createRoom: (roomData) => api.post('/rooms', roomData),
  
  // Get room participants
  getRoomParticipants: (roomId) => api.get(`/rooms/${roomId}/participants`),
};

export default api;
