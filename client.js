const WebSocket = require('ws');

class ChatClient {
  constructor(url = 'ws://localhost:6655') {
    this.ws = null;
    this.url = url;
    this.userName = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        console.log('Connected to server');
        resolve();
      });

      this.ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        switch(message.type) {
          case 'nameSet':
            console.log(`Name set to: ${message.name}`);
            this.userName = message.name;
            break;
          case 'message':
            console.log(`${message.name}: ${message.message}`);
            break;
          case 'userJoined':
            console.log(`${message.name} joined the chat`);
            break;
          case 'userLeft':
            console.log(`${message.name} left the chat`);
            break;
          case 'error':
            console.error(`Error: ${message.message}`);
            break;
        }
      });

      this.ws.on('close', () => {
        console.log('Disconnected from server');
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });
    });
  }

  setName(name) {
    if (!this.ws) throw new Error('Not connected to server');
    
    this.ws.send(JSON.stringify({
      type: 'setName',
      name: name
    }));
  }

  sendMessage(message) {
    if (!this.ws) throw new Error('Not connected to server');
    if (!this.userName) throw new Error('Name not set');

    this.ws.send(JSON.stringify({
      type: 'message',
      message: message
    }));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.userName = null;
    }
  }
}

module.exports = ChatClient;

// Direct execution code
if (require.main === module) {
  const readline = require('readline');
  const client = new ChatClient();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Connect and prompt for name
  client.connect('ws://localhost:6655')
    .then(() => {
      rl.question('Enter your name: ', (name) => {
        client.setName(name);
        console.log('Type your messages (press Ctrl+C to exit):');
        
        // Handle user input
        rl.on('line', (input) => {
          if (input.trim()) {
            client.sendMessage(input);
          }
        });

        // Handle exit
        rl.on('SIGINT', () => {
          console.log('\nDisconnecting...');
          client.disconnect();
          rl.close();
          process.exit(0);
        });
      });
    })
    .catch(err => {
      console.error('Failed to connect:', err);
      rl.close();
      process.exit(1);
    });
}
