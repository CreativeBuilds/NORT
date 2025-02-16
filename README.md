# N.O.R.T. - Nexial Oracle Reasoning Traverser

nort is an intelligent CLI tool that leverages Large Language Models (LLM) to create natural, context-aware conversations while autonomously building a knowledge graph of your interests. It acts as your personal research assistant, capable of gathering information, generating content, and following up on topics you discuss.

## Features

- 🚀 **Real-time Communication**: Instant message delivery using Server-Sent Events (SSE)
- 🤖 **AI Integration**: Support for multiple AI participants in conversations
- 👥 **Multi-User Support**: Full authentication system with secure user management
- 💬 **Conversation Management**: Create, join, and manage multiple chat conversations
- 🔄 **Message Queuing**: Reliable message processing with background queue system
- 🔐 **Access Control**: Fine-grained permissions for conversation access
- 🔗 **Shareable Links**: Generate and manage conversation share links
- 🎨 **Modern UI**: Clean, responsive interface with real-time typing indicators

## Installation

```bash
# Clone the repository
git clone https://github.com/creativebuilds/NORT.git ./nort

# Navigate to the project directory
cd nort

# Install dependencies
npm install

# Set up your environment variables
cp .env.example .env
# Edit .env with your configuration
```

## Configuration

1. Set up your environment variables in `.env`:
```env
DATABASE_URL=your_database_url
JWT_SECRET=your_jwt_secret
API_KEY=your_ai_service_api_key
```

2. Configure your database (PostgreSQL recommended)

## Usage

```bash
# Start the development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Architecture

1. **Backend (Node.js + TypeScript)**:
   - Express.js server with TypeScript
   - PostgreSQL database for data persistence
   - Server-Sent Events for real-time updates
   - Message queue for processing AI responses
   - JWT authentication

2. **Frontend**:
   - Vanilla JavaScript for lightweight client
   - Server-Sent Events for real-time updates
   - Modern CSS with responsive design
   - Clean and intuitive UI

3. **Key Components**:
   - Real-time message delivery
   - User authentication and authorization
   - Conversation management
   - AI participant integration
   - Message queuing system

## API Endpoints

- `POST /auth/login` - User authentication
- `GET /chat/conversations` - List user conversations
- `GET /chat/:id` - Get conversation details
- `POST /chat/` - Create new conversation
- `POST /chat/:id` - Send message to conversation
- `GET /chat/:id/events` - SSE endpoint for real-time updates

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT License](LICENSE)

## Support

For issues, questions, or suggestions, please open an issue in the GitHub repository.
