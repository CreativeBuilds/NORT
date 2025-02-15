let currentConversationId = null;
let eventSource = null;

// Check for conversation ID in URL on load
window.addEventListener('load', () => {
    const pathParts = window.location.pathname.split('/');
    const conversationId = pathParts[pathParts.length - 1];
    if (conversationId && !isNaN(conversationId)) {
        currentConversationId = parseInt(conversationId);
        loadConversation(currentConversationId);
    }
});

// Handle sending messages
async function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    const llmSelect = document.getElementById('llm-select');
    const desired_participant_id = llmSelect.value || undefined;

    if (!content) return;

    try {
        const endpoint = currentConversationId ? 
            `${window.API_BASE}/chat/${currentConversationId}` : 
            `${window.API_BASE}/chat`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.getAuthToken()}`
            },
            body: JSON.stringify({
                content,
                desired_participant_id
            })
        });

        if (!response.ok) throw new Error('Failed to send message');

        const data = await response.json();
        
        // Set conversation ID if this is the first message
        if (!currentConversationId) {
            currentConversationId = data.conversation.id;
            // Update URL without reload
            window.history.pushState({}, '', `/chat/${currentConversationId}`);
            // Connect to SSE for real-time updates
            connectToSSE();
            // Display initial messages
            displayMessages(data.messages);
        }

        // Clear input
        input.value = '';
        
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message. Please try again.');
    }
}

// Load existing conversation
async function loadConversation(conversationId) {
    try {
        const response = await fetch(`${window.API_BASE}/chat/${conversationId}`, {
            headers: {
                'Authorization': `Bearer ${window.getAuthToken()}`
            }
        });

        if (!response.ok) throw new Error('Failed to load conversation');

        const data = await response.json();
        displayMessages(data.messages);
        connectToSSE();
    } catch (error) {
        console.error('Error loading conversation:', error);
        alert('Failed to load conversation');
    }
}

// Create a helper function for consistent message display
function createMessageElement(message) {
    const messageElement = document.createElement('div');
    // Ensure we're using the correct participant type for styling
    const type = message.participant_type || (message.participant_metadata ? 'llm' : 'user');
    messageElement.className = `message ${type}`;
    messageElement.textContent = message.content;
    return messageElement;
}

// Display messages in the UI
function displayMessages(messages) {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = ''; // Clear existing messages
    
    messages.forEach(message => {
        const messageElement = createMessageElement(message);
        messagesContainer.appendChild(messageElement);
    });
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Handle Enter key in input
function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Connect to Server-Sent Events
function connectToSSE() {
    if (eventSource) {
        eventSource.close();
    }

    // Get auth token
    const authToken = window.getAuthToken();
    if (!authToken) {
        console.error('No auth token available for SSE connection');
        return;
    }

    // Ensure we use absolute path for SSE URL and include auth token
    const url = `${window.location.origin}${window.API_BASE}/chat/${currentConversationId}/events?auth_token=${authToken}`;
    eventSource = new EventSource(url);

    eventSource.onopen = () => {
        console.log('SSE connection established');
    };

    eventSource.onmessage = (event) => {
        console.log('SSE message received:', event.data);
        const data = JSON.parse(event.data);
        handleSSEEvent(data);
    };

    eventSource.onerror = (error) => {
        console.error('SSE Error:', error);
        eventSource.close();
        // Try to reconnect after a delay
        setTimeout(connectToSSE, 5000);
    };
}

// Handle different types of SSE events
function handleSSEEvent(event) {
    const messagesContainer = document.getElementById('messages');
    console.log('Handling SSE event:', event);
    
    switch (event.type) {
        case 'message_added': {
            const message = event.data.message;
            console.log('Adding message:', message); // Debug log
            const messageElement = createMessageElement(message);
            messagesContainer.appendChild(messageElement);
            messageElement.scrollIntoView({ behavior: 'smooth' });
            break;
        }

        case 'typing_started': {
            const existingIndicator = document.querySelector('.typing-indicator');
            if (!existingIndicator) {
                const typingIndicator = document.createElement('div');
                typingIndicator.className = 'typing-indicator';
                typingIndicator.textContent = 'AI is typing...';
                messagesContainer.appendChild(typingIndicator);
                typingIndicator.scrollIntoView({ behavior: 'smooth' });
            }
            break;
        }

        case 'typing_stopped': {
            const indicator = document.querySelector('.typing-indicator');
            if (indicator) {
                indicator.remove();
            }
            break;
        }

        case 'error': {
            console.error('Server error:', event.data.error);
            alert(`Error: ${event.data.error}`);
            break;
        }
    }
}

// Handle browser navigation
window.addEventListener('popstate', () => {
    const pathParts = window.location.pathname.split('/');
    const conversationId = pathParts[pathParts.length - 1];
    if (conversationId && !isNaN(conversationId)) {
        currentConversationId = parseInt(conversationId);
        loadConversation(currentConversationId);
    }
});

// Export functions needed by auth.js
window.handleKeyPress = handleKeyPress;
window.sendMessage = sendMessage;
window.loadConversation = loadConversation; 