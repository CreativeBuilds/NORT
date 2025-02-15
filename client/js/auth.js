// Store auth token in localStorage for persistence
let authToken = localStorage.getItem('auth_token');

// API base URL - useful if we need to change it later
const API_BASE = '/api/v1';

// Add event listeners once DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Auth buttons
    document.getElementById('login-btn')?.addEventListener('click', handleLogin);
    document.getElementById('signup-btn')?.addEventListener('click', handleSignup);
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    
    // Chat input
    document.getElementById('message-input')?.addEventListener('keypress', handleKeyPress);
    document.getElementById('send-btn')?.addEventListener('click', sendMessage);
    
    // LLM modal
    document.getElementById('add-llm-btn')?.addEventListener('click', showCreateLLMModal);
    document.querySelector('.close-modal')?.addEventListener('click', hideCreateLLMModal);
    document.getElementById('create-llm-btn')?.addEventListener('click', createLLMParticipant);

    // Check auth status
    checkAuthStatus();
});

// Check auth status
async function checkAuthStatus() {
    if (authToken) {
        try {
            // Verify token is still valid by making a request
            const response = await fetch(`${API_BASE}/participants/llm`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });

            if (response.ok) {
                showChat();
                loadLLMParticipants();
                
                // Check if we're on a specific chat page
                const pathParts = window.location.pathname.split('/');
                const chatId = pathParts[pathParts.length - 1];
                if (chatId && !isNaN(chatId)) {
                    window.loadConversation?.(parseInt(chatId));
                }
                return;
            }
        } catch (error) {
            console.error('Error verifying auth token:', error);
        }

        // If we get here, token was invalid
        localStorage.removeItem('auth_token');
        authToken = null;
    }
}

async function handleLogin() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('login-error');

    if (!username || !password) {
        errorElement.textContent = 'Please enter both username and password';
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Login failed');

        // Store token in memory and localStorage
        authToken = data.token;
        localStorage.setItem('auth_token', data.token);
        
        showChat();
        
        // Load available LLM participants
        loadLLMParticipants();
    } catch (error) {
        errorElement.textContent = error.message;
    }
}

async function handleSignup() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('login-error');

    if (!username || !password) {
        errorElement.textContent = 'Please enter both username and password';
        return;
    }

    if (password.length < 8) {
        errorElement.textContent = 'Password must be at least 8 characters';
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Signup failed');

        // Auto login after successful signup
        handleLogin();
    } catch (error) {
        errorElement.textContent = error.message;
    }
}

function showChat() {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('chat-container').style.display = 'flex';
}

function logout() {
    // Clear auth token
    authToken = null;
    localStorage.removeItem('auth_token');
    
    // Close SSE connection if active
    if (window.eventSource) {
        window.eventSource.close();
    }
    
    // Reset UI state
    document.getElementById('chat-container').style.display = 'none';
    document.getElementById('login-container').style.display = 'block';
    document.getElementById('messages').innerHTML = '';
    document.getElementById('llm-select').innerHTML = '<option value="">Select AI (Optional)</option>';
    
    // Clear form fields
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    document.getElementById('login-error').textContent = '';
    
    // Reset URL
    window.history.pushState({}, '', '/');
}

async function loadLLMParticipants() {
    try {
        const response = await fetch(`${API_BASE}/participants/llm`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) throw new Error('Failed to load LLM participants');

        const data = await response.json();
        const select = document.getElementById('llm-select');
        
        // Clear existing options
        select.innerHTML = '';
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select an AI participant...';
        select.appendChild(defaultOption);
        
        // Add LLM participants
        data.participants.forEach(participant => {
            const option = document.createElement('option');
            option.value = participant.id;
            option.textContent = participant.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading LLM participants:', error);
    }
}

function showCreateLLMModal() {
    document.getElementById('create-llm-modal').classList.add('active');
}

function hideCreateLLMModal() {
    document.getElementById('create-llm-modal').classList.remove('active');
    // Clear form
    document.getElementById('llm-name').value = '';
    document.getElementById('llm-system-prompt').value = '';
    document.getElementById('llm-temperature').value = '0.7';
}

async function createLLMParticipant() {
    const name = document.getElementById('llm-name').value.trim();
    const systemPrompt = document.getElementById('llm-system-prompt').value.trim();
    const temperature = parseFloat(document.getElementById('llm-temperature').value);

    if (!name) { alert('Please enter a name for the AI participant'); return }
    if (!systemPrompt) { alert('Please enter a system prompt'); return }
    if (isNaN(temperature) || temperature < 0 || temperature > 2) { 
        alert('Temperature must be between 0 and 2'); return 
    }

    try {
        const response = await fetch(`${API_BASE}/participants/llm`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                name,
                metadata: {
                    system_prompt: systemPrompt,
                    temperature,
                    model: 'gpt-4' // You might want to make this configurable
                }
            })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to create AI participant');
        }

        // Reload LLM participants list
        await loadLLMParticipants();
        
        // Hide modal
        hideCreateLLMModal();
    } catch (error) {
        alert(error.message);
        console.error('Error creating LLM participant:', error);
    }
}

// Export for use in chat.js
window.getAuthToken = () => authToken;
window.API_BASE = API_BASE;
window.showCreateLLMModal = showCreateLLMModal;
window.hideCreateLLMModal = hideCreateLLMModal;
window.createLLMParticipant = createLLMParticipant;
window.logout = logout;
window.handleLogin = handleLogin;
window.handleSignup = handleSignup; 