// GlassChannel — BroadcastChannel for same-device, WebSocket relay for cross-device.
// When the page URL has ?code=XXXXXX, connects to the relay as 'glass'.
// Otherwise falls back to BroadcastChannel (works only in same browser).

const RELAY_URL = 'wss://arvo-app-production-5c0c.up.railway.app';

const urlCode = new URLSearchParams(window.location.search).get('code');

let channel;

if (urlCode) {
  // WebSocket relay mode — works across devices (native app → relay → glass)
  const listeners = new Map();
  let ws = null;
  let reconnectTimer = null;
  let heartbeatTimer = null;

  function announceGlass() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'glass_connected', code: urlCode, from: 'glass' }));
    }
  }

  function sendHeartbeat() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'heartbeat_glass', code: urlCode, from: 'glass' }));
    }
  }

  function connectWs() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }

    ws = new WebSocket(RELAY_URL);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', code: urlCode, role: 'glass' }));
      // Announce to any phone already waiting in the room
      setTimeout(announceGlass, 200);
      // Keep phone aware of glass every 5s
      heartbeatTimer = setInterval(sendHeartbeat, 5000);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        // When the phone joins the relay room, announce glass immediately
        if (msg.type === 'peer_joined') {
          setTimeout(announceGlass, 100);
        }
        const fakeEvent = { data: msg };
        listeners.get('message')?.forEach(fn => fn(fakeEvent));
      } catch {}
    };

    ws.onerror = () => {};

    ws.onclose = () => {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      // Reconnect without reloading the page — a reload breaks the connection loop
      reconnectTimer = setTimeout(connectWs, 3000);
    };
  }

  connectWs();

  channel = {
    postMessage(msg) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        // Include room code + role so the relay can route to the right phone
        ws.send(JSON.stringify({ ...msg, code: urlCode, channel: urlCode, from: 'glass' }));
      }
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
  };
} else {
  // BroadcastChannel mode — same browser only (web app ↔ glass HUD on same device)
  channel = typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('arvo_glass')
    : null;
}

export default channel;
