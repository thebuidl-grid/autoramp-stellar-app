/**
 * Swap WebSocket Hook
 * 
 * Hook for connecting to swap WebSocket gateway for real-time updates
 */

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

interface TransactionUpdate {
  reference: string;
  type: 'swap' | 'offramp';
  status: string;
  swapId?: string;
  offrampId?: string;
  timestamp: string;
}

interface UseSwapWebSocketOptions {
  reference?: string;
  token?: string;
  enabled?: boolean;
  onUpdate?: (update: TransactionUpdate) => void;
}

/**
 * Hook to connect to swap WebSocket gateway
 */
export function useSwapWebSocket({
  reference,
  token,
  enabled = true,
  onUpdate,
}: UseSwapWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<TransactionUpdate | null>(null);
  const socketRef = useRef<Socket | null>(null);
  // Use ref to store the latest onUpdate callback to avoid reconnecting on callback changes
  const onUpdateRef = useRef(onUpdate);
  
  // Update the ref when onUpdate changes
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!enabled || !token) {
      return;
    }

    // Connect to WebSocket
    const socket = io(`${WS_URL}/swap`, {
      auth: {
        token,
      },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to swap WebSocket');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from swap WebSocket');
    });

    socket.on('connected', (data: { message: string }) => {
      console.log('WebSocket connected:', data.message);
      
      // Subscribe to transaction updates if reference is provided
      if (reference) {
        socket.emit('subscribe', { reference });
      }
    });

    socket.on('subscribed', (data: { reference: string }) => {
      console.log('Subscribed to transaction:', data.reference);
    });

    socket.on('transaction_update', (update: TransactionUpdate) => {
      console.log('Transaction update received:', update);
      setLastUpdate(update);
      // Use ref to call the latest callback without needing it in dependencies
      onUpdateRef.current?.(update);
    });

    socket.on('error', (error: { message: string }) => {
      console.error('WebSocket error:', error.message);
    });

    return () => {
      if (reference) {
        socket.emit('unsubscribe', { reference });
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, token, reference]); // Removed onUpdate from dependencies - using ref instead

  const subscribe = (ref: string) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('subscribe', { reference: ref });
    }
  };

  const unsubscribe = (ref: string) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('unsubscribe', { reference: ref });
    }
  };

  return {
    isConnected,
    lastUpdate,
    subscribe,
    unsubscribe,
  };
}

