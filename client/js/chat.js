let currentConversationId = null;
let eventSource = null;
let lastKnownMessageId = null; // Track the last message ID we've seen
let currentParticipants = []; // Track current participants

// Initialize the chat interface
async function initializeChat() {
    try {
        // Load current persona and available personas first
        await Promise.all([
            loadCurrentPersona(),
            loadParticipants()
        ]);

        // Then check for conversation ID in URL
        const pathParts = window.location.pathname.split('/');
        const conversationId = pathParts[pathParts.length - 1];
        if (conversationId && !isNaN(conversationId)) {
            currentConversationId = parseInt(conversationId);
            await loadConversation(currentConversationId);
        }
    } catch (error) {
        console.error('Error initializing chat:', error);
    }
}

// Handle sending messages
async function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value;
    const llmSelect = document.getElementById('llm-select');
    const desired_participant_id = llmSelect.value || undefined;

    // Require either content or a selected AI for continuation
    if (!content && !desired_participant_id) return [null, new Error('Please select an AI for continuation')];

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
                content: content || '',
                desired_participant_id,
                metadata: { is_continuation: !content }
            })
        });

        if (!response.ok) throw new Error('Failed to send message');

        const data = await response.json();
        
        // Set conversation ID if this is the first message
        if (!currentConversationId) {
            currentConversationId = data.conversation.id;
            displayMessages(data.messages);
            connectToSSE();
            // Update URL without reload
            window.history.pushState({}, '', `/chat/${currentConversationId}`);
        }

        // Clear input
        input.value = '';
        return [data, null];
        
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message. Please try again.');
        return [null, error];
    }
}

// Load existing conversation
async function loadConversation(conversationId) {
    try {
        const [conversationResponse, participantsResponse, lastSpeakerResponse] = await Promise.all([
            fetch(`${window.API_BASE}/chat/${conversationId}`, {
                headers: { 'Authorization': `Bearer ${window.getAuthToken()}` }
            }),
            loadConversationParticipants(conversationId),
            fetch(`${window.API_BASE}/participants/conversation/${conversationId}/last-speaker?type=llm`, {
                headers: { 'Authorization': `Bearer ${window.getAuthToken()}` }
            })
        ]);

        if (!conversationResponse.ok) throw new Error('Failed to load conversation');

        const data = await conversationResponse.json();
        displayMessages(data.messages);
        connectToSSE();

        // Try to auto-select the last AI speaker if available
        if (lastSpeakerResponse.ok) {
            const lastSpeakerData = await lastSpeakerResponse.json();
            if (lastSpeakerData.participant) {
                const llmSelect = document.getElementById('llm-select');
                if (llmSelect) {
                    // Wait for participants to load to ensure the option exists
                    setTimeout(() => {
                        llmSelect.value = lastSpeakerData.participant.id;
                    }, 100);
                }
            }
        }
    } catch (error) {
        console.error('Error loading conversation:', error);
        alert('Failed to load conversation');
    }
}

// Create a helper function for consistent message display
function createMessageElement(message, isOwner) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.participant_type === 'user' ? 'user' : 'llm'}`;
    messageDiv.setAttribute('data-message-id', message.id);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = message.content;
    messageDiv.appendChild(contentDiv);

    // Always add delete button since we're the conversation owner
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Delete message (Hold Shift to skip confirmation)';
    deleteBtn.onclick = async (e) => {
        e.preventDefault();
        if (!e.shiftKey && !confirm('Are you sure you want to delete this message?')) return;

        const [success, error] = await deleteMessage(currentConversationId, message.id);
        if (error) {
            showError(error.message);
            return;
        }
    };
    messageDiv.appendChild(deleteBtn);

    return messageDiv;
}

// Display messages in the UI
function displayMessages(messages) {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = ''; // Clear existing messages
    
    messages.forEach(message => {
        const messageElement = createMessageElement(message, message.participant_type === 'user');
        messagesContainer.appendChild(messageElement);
        // Update last known message ID
        if (message.id > (lastKnownMessageId || 0)) lastKnownMessageId = message.id;
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
    const url = new URL(`${window.location.origin}${window.API_BASE}/chat/${currentConversationId}/events`);
    url.searchParams.append('auth_token', authToken);
    // Only include last_message_id if we have one
    if (lastKnownMessageId !== null) url.searchParams.append('last_message_id', lastKnownMessageId);
    
    eventSource = new EventSource(url.toString());

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

            // Check if we need to add a new participant
            if (message.participant_id) {
                const userParticipants = document.getElementById('user-participants');
                const llmParticipants = document.getElementById('llm-participants');
                const existingParticipant = 
                    userParticipants.querySelector(`[data-participant-id="${message.participant_id}"]`) ||
                    llmParticipants.querySelector(`[data-participant-id="${message.participant_id}"]`);

                if (!existingParticipant) {
                    const participantElement = document.createElement('div');
                    participantElement.className = `participant-item ${message.participant_type}`;
                    participantElement.setAttribute('data-participant-id', message.participant_id);
                    
                    const badge = document.createElement('span');
                    badge.className = `participant-type-badge ${message.participant_type}`;
                    badge.textContent = message.participant_type.toUpperCase();
                    
                    const name = document.createElement('span');
                    name.textContent = message.participant_name || 'Unknown Participant';
                    
                    participantElement.appendChild(badge);
                    participantElement.appendChild(name);
                    
                    if (message.participant_type === 'user') {
                        userParticipants.appendChild(participantElement);
                    } else {
                        llmParticipants.appendChild(participantElement);
                        
                        // Also add to the LLM select if it's an AI participant
                        const llmSelect = document.getElementById('llm-select');
                        if (llmSelect && !llmSelect.querySelector(`option[value="${message.participant_id}"]`)) {
                            const option = document.createElement('option');
                            option.value = message.participant_id;
                            option.textContent = message.participant_name || 'Unknown AI';
                            llmSelect.appendChild(option);
                        }
                    }
                }
            }

            const messageElement = createMessageElement(message, message.participant_type === 'user');
            messagesContainer.appendChild(messageElement);
            messageElement.scrollIntoView({ behavior: 'smooth' });
            // Update last known message ID
            if (message.id > (lastKnownMessageId || 0)) lastKnownMessageId = message.id;
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

        case 'message_deleted':
            const messageElement = document.querySelector(`[data-message-id="${event.data.message_id}"]`);
            if (messageElement) messageElement.remove();
            break;

        case 'participant_added':
        case 'participant_removed':
        case 'participant_updated':
            if (currentConversationId) loadConversationParticipants(currentConversationId);
            break;
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

// Load and display AI participants
async function loadParticipants() {
    try {
        const response = await fetch(`${window.API_BASE}/participants/llm`, {
            headers: {
                'Authorization': `Bearer ${window.getAuthToken()}`
            }
        });

        if (!response.ok) throw new Error('Failed to load participants');

        const data = await response.json();
        if (!data.participants) {
            console.error('No participants data received:', data);
            return [null, new Error('No participants data received')];
        }

        // Deduplicate participants by ID
        const uniqueParticipants = Array.from(new Map(data.participants.map(p => [p.id, p])).values());
        currentParticipants = uniqueParticipants;
        displayParticipants(uniqueParticipants);
        return [uniqueParticipants, null];
    } catch (error) {
        console.error('Error loading participants:', error);
        return [null, error];
    }
}

// Display participants in the select dropdown
function displayParticipants(participants) {
    if (!participants) {
        console.error('No participants provided to displayParticipants');
        return;
    }

    const select = document.getElementById('llm-select');
    if (!select) {
        console.error('Could not find llm-select element');
        return;
    }

    select.innerHTML = '<option value="">Select AI (Optional)</option>';
    
    participants.forEach(participant => {
        if (!participant || !participant.id || !participant.name) {
            console.error('Invalid participant data:', participant);
            return;
        }

        const option = document.createElement('option');
        option.value = participant.id;
        
        const container = document.createElement('div');
        container.className = 'llm-option';
        
        // Add name and privacy badge
        container.innerHTML = `
            ${participant.name}
            <span class="privacy-badge ${participant.private ? 'private' : ''}">${participant.private ? 'Private' : 'Public'}</span>
        `;
        
        option.innerHTML = container.innerHTML;
        select.appendChild(option);
    });

    // Also update the management modal if it exists
    const llmList = document.getElementById('llm-list');
    if (llmList) {
        llmList.innerHTML = '';
        participants.forEach(participant => {
            if (!participant || !participant.id || !participant.name || !participant.metadata) {
                console.error('Invalid participant data for management list:', participant);
                return;
            }

            const item = document.createElement('div');
            item.className = 'llm-item';
            item.innerHTML = `
                <div class="llm-item-header">
                    <div class="llm-item-name">
                        ${participant.name}
                        <span class="privacy-badge ${participant.private ? 'private' : ''}">${participant.private ? 'Private' : 'Public'}</span>
                    </div>
                    <div class="llm-actions">
                        <button class="clone-btn" onclick="handleCloneParticipant(${participant.id})">Clone</button>
                        <button class="privacy-btn ${participant.private ? '' : 'public'}" onclick="handleTogglePrivacy(${participant.id}, ${!participant.private})">
                            Make ${participant.private ? 'Public' : 'Private'}
                        </button>
                    </div>
                </div>
                <div class="llm-item-details">
                    <div>Temperature: ${participant.metadata.temperature}</div>
                    <div>System Prompt:</div>
                    <div class="llm-item-prompt">${participant.metadata.system_prompt}</div>
                </div>
            `;
            llmList.appendChild(item);
        });
    }
}

// Create new AI participant
async function createParticipant(name, systemPrompt, temperature, isPrivate) {
    try {
        const response = await fetch(`${window.API_BASE}/participants/llm`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.getAuthToken()}`
            },
            body: JSON.stringify({
                name,
                metadata: {
                    system_prompt: systemPrompt,
                    temperature: parseFloat(temperature)
                },
                isPrivate
            })
        });

        if (!response.ok) throw new Error('Failed to create participant');

        const data = await response.json();
        // Don't reload here since we'll reload after modal closes
        return [data.participant, null];
    } catch (error) {
        console.error('Error creating participant:', error);
        return [null, error];
    }
}

// Clone an AI participant
async function cloneParticipant(id) {
    try {
        const response = await fetch(`${window.API_BASE}/participants/llm/${id}/clone`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${window.getAuthToken()}`
            }
        });

        if (!response.ok) throw new Error('Failed to clone participant');

        const data = await response.json();
        // Don't reload here since we'll reload after alert
        return [data.participant, null];
    } catch (error) {
        console.error('Error cloning participant:', error);
        return [null, error];
    }
}

// Toggle participant privacy
async function toggleParticipantPrivacy(id, isPrivate) {
    try {
        const response = await fetch(`${window.API_BASE}/participants/llm/${id}/privacy`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.getAuthToken()}`
            },
            body: JSON.stringify({ isPrivate })
        });

        if (!response.ok) throw new Error('Failed to update privacy');
        // Don't reload here since we'll reload after alert
        return [true, null];
    } catch (error) {
        console.error('Error updating privacy:', error);
        return [false, error];
    }
}

// Load and display user personas
async function loadUserPersonas() {
    try {
        const response = await fetch(`${window.API_BASE}/participants/user`, {
            headers: {
                'Authorization': `Bearer ${window.getAuthToken()}`
            }
        });

        if (!response.ok) throw new Error('Failed to load personas');

        const data = await response.json();
        if (!data.personas) {
            console.error('No personas data received:', data);
            return [null, new Error('No personas data received')];
        }

        displayUserPersonas(data.personas);
        return [data.personas, null];
    } catch (error) {
        console.error('Error loading personas:', error);
        return [null, error];
    }
}

// Load current active persona
async function loadCurrentPersona() {
    try {
        const response = await fetch(`${window.API_BASE}/participants/user/current`, {
            headers: {
                'Authorization': `Bearer ${window.getAuthToken()}`
            }
        });

        if (!response.ok) throw new Error('Failed to load current persona');

        const data = await response.json();
        if (!data.persona) {
            console.error('No current persona data received:', data);
            return [null, new Error('No current persona data received')];
        }

        // Update UI with current persona
        const personaName = document.querySelector('#current-persona .persona-name');
        if (personaName) {
            personaName.textContent = data.persona.name;
        }

        return [data.persona, null];
    } catch (error) {
        console.error('Error loading current persona:', error);
        return [null, error];
    }
}

// Display user personas in the management modal
function displayUserPersonas(personas) {
    const personasList = document.getElementById('personas-list');
    if (!personasList) {
        console.error('Could not find personas-list element');
        return;
    }

    personasList.innerHTML = '';
    
    personas.forEach(persona => {
        if (!persona || !persona.id || !persona.name) {
            console.error('Invalid persona data:', persona);
            return;
        }

        const item = document.createElement('div');
        item.className = `persona-item ${persona.is_default ? 'active' : ''}`;
        item.innerHTML = `
            <div class="persona-item-header">
                <div class="persona-item-name">${persona.name}</div>
                <div class="persona-item-actions">
                    <button class="set-default-btn" onclick="handleSetDefaultPersona(${persona.id})" ${persona.is_default ? 'disabled' : ''}>
                        ${persona.is_default ? 'Current' : 'Set as Current'}
                    </button>
                    ${!persona.is_default ? `<button class="delete-persona-btn" onclick="handleDeletePersona(${persona.id})">Delete</button>` : ''}
                </div>
            </div>
            <div class="persona-item-description">${persona.description || ''}</div>
        `;
        personasList.appendChild(item);
    });
}

// Create new user persona
async function createUserPersona(name, description, isDefault = false) {
    try {
        const response = await fetch(`${window.API_BASE}/participants/user`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.getAuthToken()}`
            },
            body: JSON.stringify({
                name,
                description,
                isDefault
            })
        });

        if (!response.ok) throw new Error('Failed to create persona');

        const data = await response.json();
        return [data.participant, null];
    } catch (error) {
        console.error('Error creating persona:', error);
        return [null, error];
    }
}

// Set default persona
async function setDefaultPersona(id) {
    try {
        const response = await fetch(`${window.API_BASE}/participants/user/${id}/set-default`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${window.getAuthToken()}`
            }
        });

        if (!response.ok) throw new Error('Failed to set default persona');

        const data = await response.json();
        return [data.success, null];
    } catch (error) {
        console.error('Error setting default persona:', error);
        return [false, error];
    }
}

// Handle setting default persona
async function handleSetDefaultPersona(id) {
    const [success, error] = await setDefaultPersona(id);
    if (error) {
        alert('Failed to update current persona');
        return;
    }
    
    // Reload personas to update UI
    await Promise.all([
        loadUserPersonas(),
        loadCurrentPersona()
    ]);
}

// Handle deleting a persona
async function handleDeletePersona(id) {
    if (!confirm('Are you sure you want to delete this persona?')) return;

    try {
        const response = await fetch(`${window.API_BASE}/participants/user/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${window.getAuthToken()}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            showError(error.error || 'Failed to delete persona');
            return;
        }

        // Reload personas to update UI
        await Promise.all([
            loadUserPersonas(),
            loadCurrentPersona()
        ]);
    } catch (error) {
        console.error('Error deleting persona:', error);
        showError('Failed to delete persona');
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize chat interface
    initializeChat().catch(console.error);

    // Handle create AI form submission
    const createLLMModal = document.getElementById('create-llm-modal');
    const manageLLMModal = document.getElementById('manage-llm-modal');
    const managePersonasModal = document.getElementById('manage-personas-modal');
    const createLLMBtn = document.getElementById('create-llm-btn');
    const createPersonaBtn = document.getElementById('create-persona-btn');
    const addLLMBtn = document.getElementById('add-llm-btn');
    const manageLLMBtn = document.createElement('button');
    manageLLMBtn.className = 'manage-llm-btn';
    manageLLMBtn.textContent = 'Manage';
    document.getElementById('llm-container').appendChild(manageLLMBtn);

    // Manage personas button
    document.getElementById('manage-personas-btn').addEventListener('click', async () => {
        await loadUserPersonas();
        managePersonasModal.classList.add('active');
    });
    
    // Create persona button
    createPersonaBtn.addEventListener('click', async () => {
        const name = document.getElementById('persona-name').value.trim();
        const description = document.getElementById('persona-description').value.trim();

        if (!name || !description) {
            alert('Please fill in all required fields');
            return;
        }

        const [participant, error] = await createUserPersona(name, description, true);
        if (error) {
            alert('Failed to create persona');
            return;
        }

        // Clear form
        document.getElementById('persona-name').value = '';
        document.getElementById('persona-description').value = '';

        // Close the modal
        document.getElementById('manage-personas-modal').classList.remove('active');

        // Reload personas and current persona
        await Promise.all([
            loadUserPersonas(),
            loadCurrentPersona()
        ]);
    });
    
    // Close modal buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', async () => {
            // Check if any modal is active before closing
            const wasActive = createLLMModal.classList.contains('active') || 
                            manageLLMModal.classList.contains('active') ||
                            managePersonasModal.classList.contains('active');
            
            // Close all modals
            createLLMModal.classList.remove('active');
            manageLLMModal.classList.remove('active');
            managePersonasModal.classList.remove('active');
            
            // Only reload if a modal was active
            if (wasActive) {
                await Promise.all([
                    loadParticipants(),
                    loadCurrentPersona()
                ]);
            }
        });
    });

    // Open create modal
    addLLMBtn.addEventListener('click', () => {
        createLLMModal.classList.add('active');
    });

    // Open manage modal
    manageLLMBtn.addEventListener('click', () => {
        manageLLMModal.classList.add('active');
    });
    
    createLLMBtn.addEventListener('click', async () => {
        const name = document.getElementById('llm-name').value.trim();
        const systemPrompt = document.getElementById('llm-system-prompt').value.trim();
        const temperature = document.getElementById('llm-temperature').value;
        const isPrivate = document.getElementById('llm-private').checked;

        if (!name || !systemPrompt) {
            alert('Please fill in all required fields');
            return;
        }

        const [participant, error] = await createParticipant(name, systemPrompt, temperature, isPrivate);
        if (error) {
            alert('Failed to create AI participant');
            return;
        }

        // Close modal and reset form
        createLLMModal.classList.remove('active');
        document.getElementById('llm-name').value = '';
        document.getElementById('llm-system-prompt').value = '';
        document.getElementById('llm-temperature').value = '0.7';
        document.getElementById('llm-private').checked = true;
        
        // Store the current selection before reloading
        const llmSelect = document.getElementById('llm-select');
        const previousSelection = llmSelect ? llmSelect.value : null;
        
        // Reload participants and handle selection
        const [participants] = await loadParticipants();
        
        // Wait for a short delay to ensure DOM is updated
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // If we have a new participant, select it, otherwise restore previous selection
        if (llmSelect) {
            if (participant) {
                llmSelect.value = participant.id;
            } else if (previousSelection) {
                llmSelect.value = previousSelection;
            }
        }
    });
});

// Handle cloning a participant
async function handleCloneParticipant(id) {
    const [participant, error] = await cloneParticipant(id);
    if (error) {
        alert('Failed to clone AI participant');
        return;
    }
    alert('AI participant cloned successfully!');
    await loadParticipants(); // Reload after successful clone
}

// Handle toggling participant privacy
async function handleTogglePrivacy(id, makePrivate) {
    const [success, error] = await toggleParticipantPrivacy(id, makePrivate);
    if (error) {
        alert('Failed to update AI privacy settings');
        return;
    }
    alert('AI privacy settings updated successfully!');
    await loadParticipants(); // Reload after successful privacy update
}

// Export functions for global use
window.handleSetDefaultPersona = handleSetDefaultPersona;
window.handleDeletePersona = handleDeletePersona;

async function deleteMessage(conversationId, messageId) {
    try {
        const response = await fetch(`${window.API_BASE}/chat/${conversationId}/messages/${messageId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.getAuthToken()}`
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete message');
        }

        return [true, null];
    } catch (error) {
        return [false, error];
    }
}

function showError(message) {
    alert(message);
}

// Load conversation participants
async function loadConversationParticipants(conversationId) {
    try {
        const response = await fetch(`${window.API_BASE}/participants/conversation/${conversationId}`, {
            headers: { 'Authorization': `Bearer ${window.getAuthToken()}` }
        });

        if (!response.ok) throw new Error('Failed to load participants');

        const data = await response.json();
        displayConversationParticipants(data.participants);
        return [data.participants, null];
    } catch (error) {
        console.error('Error loading conversation participants:', error);
        return [null, error];
    }
}

// Display conversation participants in the sidebar
function displayConversationParticipants(participants) {
    const userParticipantsContainer = document.getElementById('user-participants');
    const llmParticipantsContainer = document.getElementById('llm-participants');
    
    userParticipantsContainer.innerHTML = '';
    llmParticipantsContainer.innerHTML = '';

    participants.forEach(participant => {
        const participantElement = document.createElement('div');
        participantElement.className = `participant-item ${participant.type}`;
        participantElement.setAttribute('data-participant-id', participant.id);
        
        const badge = document.createElement('span');
        badge.className = `participant-type-badge ${participant.type}`;
        badge.textContent = participant.type.toUpperCase();
        
        const name = document.createElement('span');
        name.textContent = participant.name;
        
        participantElement.appendChild(badge);
        participantElement.appendChild(name);
        
        if (participant.type === 'user') userParticipantsContainer.appendChild(participantElement);
        else llmParticipantsContainer.appendChild(participantElement);
    });
}