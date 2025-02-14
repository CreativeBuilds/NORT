# NSChat - AI-Powered Knowledge Assistant

NSChat is an intelligent CLI tool that leverages Large Language Models (LLM) to create natural, context-aware conversations while autonomously building a knowledge graph of your interests. It acts as your personal research assistant, capable of gathering information, generating content, and following up on topics you discuss.

## Features

- 🤖 **Natural Conversation Interface**: Simply chat about your interests and ideas through the CLI
- 🎭 **Customizable AI Persona**: Modify the AI's personality and behavior on the fly
- 🧠 **Autonomous Learning**: Automatically identifies and tracks your interests and important topics
- 🔍 **Background Research**: Performs independent research and information gathering on topics you discuss
- ⏰ **Asynchronous Tasks**: Creates and manages tasks to follow up on discussions with new insights
- 📝 **Intelligent Note-Taking**: Maintains an organized knowledge base in Obsidian without user intervention
- 🔄 **Proactive Updates**: Notifies you when it discovers relevant information or completes tasks

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/nschat.git

# Navigate to the project directory
cd nschat

# Install dependencies
npm install
```

## Configuration

1. Set up your Obsidian vault directory in `settings.json`:
```json
{
  "obsidian": {
    "vaultPath": "/path/to/your/obsidian/vault"
  },
  "notifications": {
    "enabled": true,
    "method": "cli" // or "email", "desktop", etc.
  }
}
```

2. Configure your LLM API settings (if required)

## Usage

```bash
# Start a conversation
node cli.js

# Edit AI persona
node cli.js --edit-persona

# Check pending tasks and updates
node cli.js --status
```

## How It Works

1. **Natural Conversation**: Simply chat with NSChat about any topic that interests you. The agent maintains context and builds understanding over time.

2. **Autonomous Learning**: As you converse, the agent:
   - Identifies key topics and interests
   - Recognizes patterns in your inquiries
   - Maintains detailed notes and connections
   - Creates tasks for deeper research

3. **Background Processing**: The agent works independently to:
   - Research topics you've discussed
   - Generate relevant content or analysis
   - Find connections between different conversations
   - Prepare insights for your next interaction

4. **Proactive Updates**: When the agent:
   - Completes a research task
   - Discovers relevant information
   - Generates requested content
   It will notify you during your next conversation or through configured notification channels.

5. **Knowledge Organization**: All information is automatically organized in your Obsidian vault, creating a rich knowledge base that grows over time - without requiring any manual organization.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT License](LICENSE)

## Support

For issues, questions, or suggestions, please open an issue in the GitHub repository.
