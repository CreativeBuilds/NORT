const WebSocket = require('ws');
const http = require('http');

// Create HTTP server
const server = http.createServer();

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients and their names
const clients = new Map();

// Handle new WebSocket connections
wss.on('connection', (ws) => {
  let userName = null;

  ws.on('message', (message) => {
    const data = JSON.parse(message);

    // Handle setting username
    if (data.type === 'setName') {
      userName = data.name;
      clients.set(ws, userName);
      
      // Send confirmation back to user
      ws.send(JSON.stringify({
        type: 'nameSet',
        name: userName
      }));

      // Broadcast user joined message
      broadcast({
        type: 'userJoined',
        name: userName
      });

      return;
    }

    // Only allow messages if username is set
    if (!userName) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Please set your name first'
      }));
      return;
    }

    // Handle chat messages
    if (data.type === 'message') {
      broadcast({
        type: 'message',
        name: userName,
        message: data.message
      });
    }
  });

  // Handle client disconnection
  ws.on('close', () => {
    if (userName) {
      broadcast({
        type: 'userLeft',
        name: userName
      });
      clients.delete(ws);
    }
  });
});

// Broadcast message to all connected clients
function broadcast(message) {
  const messageStr = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageStr);
    }
  }
}

// Start server
const PORT = process.env.PORT || 6655;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
