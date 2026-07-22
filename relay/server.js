const { WebSocketServer } = require('ws');
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ARVO Relay OK');
});

const wss = new WebSocketServer({ server });

// rooms: pairingCode → Set of connected clients
const rooms = new Map();

wss.on('connection', (ws) => {
  let joinedRoom = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'join') {
        joinedRoom = msg.code;
        if (!rooms.has(joinedRoom)) rooms.set(joinedRoom, new Set());
        rooms.get(joinedRoom).add(ws);
        ws.send(JSON.stringify({ type: 'joined', code: joinedRoom, peers: rooms.get(joinedRoom).size }));
        broadcast(joinedRoom, ws, { type: 'peer_joined', peers: rooms.get(joinedRoom).size });
        return;
      }

      if (joinedRoom) broadcast(joinedRoom, ws, msg);
    } catch {}
  });

  ws.on('close', () => {
    if (!joinedRoom || !rooms.has(joinedRoom)) return;
    rooms.get(joinedRoom).delete(ws);
    if (rooms.get(joinedRoom).size === 0) {
      rooms.delete(joinedRoom);
    } else {
      broadcast(joinedRoom, ws, { type: 'peer_left', peers: rooms.get(joinedRoom).size });
    }
  });

  ws.on('error', () => {});
});

function broadcast(code, sender, msg) {
  const peers = rooms.get(code);
  if (!peers) return;
  const str = JSON.stringify(msg);
  for (const peer of peers) {
    if (peer !== sender && peer.readyState === 1) peer.send(str);
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`ARVO Relay on :${PORT}`));
