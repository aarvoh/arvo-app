/**
 * useBrainSocket — manages the WebSocket connection to the Python brain.
 *
 * Returns:
 *   send(inputEvent)  — sends an InputEvent object to the brain
 *   connState         — 'waiting' | 'connected' | 'reconnecting'
 *   lastCard          — most recent RenderCard from the brain (or null)
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const BRAIN_URL = import.meta.env.VITE_BRAIN_URL || 'ws://localhost:8765/ws';

// backoff: 1s → 2s → 4s → 8s → cap 10s
function nextDelay(prev) {
  return Math.min(prev * 2, 10000);
}

export default function useBrainSocket() {
  const [connState, setConnState] = useState('waiting');
  const [lastCard,  setLastCard]  = useState(null);

  const wsRef         = useRef(null);
  const delayRef      = useRef(1000);
  const mountedRef    = useRef(true);
  const retryTimer    = useRef(null);
  const pingTimer     = useRef(null);
  const everConnected = useRef(false);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(BRAIN_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      everConnected.current = true;
      delayRef.current = 1000;
      setConnState('connected');
      // ping every 25s so Railway never kills the idle WebSocket
      clearInterval(pingTimer.current);
      pingTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    };

    ws.onmessage = (e) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'render_card') {
          setLastCard(msg.card);
        }
        if (msg.type === 'connection_state') {
          setConnState(msg.state);
        }
        // pong / heartbeat_ack — ignore, just keep-alive acknowledgements
      } catch {}
    };

    ws.onclose = () => {
      clearInterval(pingTimer.current);
      if (!mountedRef.current) return;
      if (everConnected.current) setConnState('reconnecting');
      retryTimer.current = setTimeout(() => {
        delayRef.current = nextDelay(delayRef.current);
        connect();
      }, delayRef.current);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(retryTimer.current);
      clearInterval(pingTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((inputEvent) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input_event', event: inputEvent }));
      return true;
    }
    return false;
  }, []);

  return { send, connState, lastCard };
}
