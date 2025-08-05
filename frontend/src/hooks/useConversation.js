import { useState, useEffect, useCallback } from 'react';
import { systemAPI } from '../services/api';
import webSocketService from '../services/websocket';

export const useConversation = (roomId) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [transcription, setTranscription] = useState(null);

  // Fetch conversation history
  const fetchConversation = useCallback(async () => {
    if (!roomId) return;
    
    try {
      setLoading(true);
      setError(null);
      const response = await systemAPI.getConversationHistory(roomId);
      setMessages(response.data.messages || []);
    } catch (err) {
      console.error('❌ Error fetching conversation:', err);
      setError(err.message || 'Failed to fetch conversation');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  // Add message to conversation
  const addMessage = useCallback((message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  // Clear conversation
  const clearConversation = useCallback(() => {
    setMessages([]);
  }, []);

  // Set up WebSocket listeners for real-time updates
  useEffect(() => {
    const unsubscribeMessage = webSocketService.on('conversation:message', (data) => {
      if (data.roomId === roomId || !roomId) {
        addMessage(data);
      }
    });

    const unsubscribeTranscription = webSocketService.on('transcription:update', (data) => {
      setTranscription(data);
    });

    return () => {
      unsubscribeMessage();
      unsubscribeTranscription();
    };
  }, [roomId, addMessage]);

  // Initial fetch
  useEffect(() => {
    if (roomId) {
      fetchConversation();
    }
  }, [fetchConversation, roomId]);

  return {
    messages,
    loading,
    error,
    transcription,
    addMessage,
    clearConversation,
    fetchConversation,
  };
};

export const useVoiceInteraction = () => {
  const [speakingAgents, setSpeakingAgents] = useState(new Set());
  const [voiceStats, setVoiceStats] = useState({});

  useEffect(() => {
    const unsubscribeSpeakingStart = webSocketService.on('agent:speaking:start', (data) => {
      setSpeakingAgents(prev => new Set([...prev, data.agentId]));
      setVoiceStats(prev => ({
        ...prev,
        [data.agentId]: { ...prev[data.agentId], speaking: true, ...data }
      }));
    });

    const unsubscribeSpeakingEnd = webSocketService.on('agent:speaking:end', (data) => {
      setSpeakingAgents(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.agentId);
        return newSet;
      });
      setVoiceStats(prev => ({
        ...prev,
        [data.agentId]: { ...prev[data.agentId], speaking: false, ...data }
      }));
    });

    return () => {
      unsubscribeSpeakingStart();
      unsubscribeSpeakingEnd();
    };
  }, []);

  return {
    speakingAgents,
    voiceStats,
  };
};
