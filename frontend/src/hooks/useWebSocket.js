import { useState, useEffect, useCallback } from 'react';
import webSocketService from '../services/websocket';

export const useWebSocket = () => {
  const [connectionState, setConnectionState] = useState('disconnected');
  const [error, setError] = useState(null);

  const connect = useCallback(() => {
    webSocketService.connect();
  }, []);

  const disconnect = useCallback(() => {
    webSocketService.disconnect();
  }, []);

  useEffect(() => {
    const unsubscribeStatus = webSocketService.on('connection:status', (data) => {
      setConnectionState(data.status);
      if (data.error) {
        setError(data.error);
      } else {
        setError(null);
      }
    });

    // Auto-connect on mount
    connect();

    return () => {
      unsubscribeStatus();
    };
  }, [connect]);

  return {
    connectionState,
    error,
    connect,
    disconnect,
    isConnected: connectionState === 'connected',
  };
};
