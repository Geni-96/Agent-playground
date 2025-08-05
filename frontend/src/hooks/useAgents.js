import { useState, useEffect, useCallback } from 'react';
import { agentAPI } from '../services/api';
import webSocketService from '../services/websocket';

export const useAgents = () => {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch agents from API
  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await agentAPI.getAgents();
      setAgents(response.data.agents || []);
    } catch (err) {
      console.error('❌ Error fetching agents:', err);
      setError(err.message || 'Failed to fetch agents');
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new agent
  const createAgent = useCallback(async (agentData) => {
    try {
      const response = await agentAPI.createAgent(agentData);
      const newAgent = response.data.agent;
      setAgents(prev => [...prev, newAgent]);
      return newAgent;
    } catch (err) {
      console.error('❌ Error creating agent:', err);
      throw err;
    }
  }, []);

  // Update agent
  const updateAgent = useCallback(async (agentId, updates) => {
    try {
      const response = await agentAPI.updateAgent(agentId, updates);
      const updatedAgent = response.data.agent;
      setAgents(prev => 
        prev.map(agent => 
          agent.agentId === agentId ? { ...agent, ...updatedAgent } : agent
        )
      );
      return updatedAgent;
    } catch (err) {
      console.error('❌ Error updating agent:', err);
      throw err;
    }
  }, []);

  // Delete agent
  const deleteAgent = useCallback(async (agentId) => {
    try {
      await agentAPI.deleteAgent(agentId);
      setAgents(prev => prev.filter(agent => agent.agentId !== agentId));
    } catch (err) {
      console.error('❌ Error deleting agent:', err);
      throw err;
    }
  }, []);

  // Get agent by ID
  const getAgent = useCallback((agentId) => {
    return agents.find(agent => agent.agentId === agentId);
  }, [agents]);

  // Set up WebSocket listeners for real-time updates
  useEffect(() => {
    const unsubscribeCreated = webSocketService.on('agent:created', (data) => {
      setAgents(prev => {
        const exists = prev.some(agent => agent.agentId === data.agentId);
        if (!exists) {
          return [...prev, data];
        }
        return prev;
      });
    });

    const unsubscribeStatusChanged = webSocketService.on('agent:status:changed', (data) => {
      setAgents(prev => 
        prev.map(agent => 
          agent.agentId === data.agentId 
            ? { ...agent, status: data.status, lastActivity: data.timestamp }
            : agent
        )
      );
    });

    const unsubscribeUpdated = webSocketService.on('agent:updated', (data) => {
      setAgents(prev => 
        prev.map(agent => 
          agent.agentId === data.agentId 
            ? { ...agent, ...data }
            : agent
        )
      );
    });

    const unsubscribeDeleted = webSocketService.on('agent:deleted', (data) => {
      setAgents(prev => prev.filter(agent => agent.agentId !== data.agentId));
    });

    return () => {
      unsubscribeCreated();
      unsubscribeStatusChanged();
      unsubscribeUpdated();
      unsubscribeDeleted();
    };
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return {
    agents,
    loading,
    error,
    fetchAgents,
    createAgent,
    updateAgent,
    deleteAgent,
    getAgent,
  };
};
