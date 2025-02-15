# Chat API Server Documentation

The Chat API server runs on http://localhost:3000

## API Endpoints

### Authentication

#### 1. Sign Up
**POST** `/signup`
```json
{
    "username": "john_doe",
    "password": "password123" // Must be at least 8 characters
}
```
**Response (201):**
```json
{
    "id": 1,
    "username": "john_doe",
    "created_at": "2024-03-21T12:00:00Z"
}
```

#### 2. Login
**POST** `/login`
```json
{
    "username": "john_doe",
    "password": "password123"
}
```
**Response (200):**
```json
{
    "user": {
        "id": 1,
        "username": "john_doe",
        "created_at": "2024-03-21T12:00:00Z"
    },
    "token": "your-bearer-token",
    "expires_at": "2024-03-28T12:00:00Z"
}
```

### Conversations

#### 1. List Conversations
**GET** `/conversations`  
**Headers:** `Authorization: Bearer <token>`
```json
{
    "conversations": [
        {
            "id": 1,
            "title": "My Chat",
            "created_by_user_id": 1,
            "visibility": "private",
            "created_at": "2024-03-21T12:00:00Z",
            "message_count": 5,
            "first_message": "Hello, AI!"
        }
    ]
}
```

#### 2. Start New Conversation
**POST** `/chat`  
**Headers:** `Authorization: Bearer <token>`
```json
{
    "content": "Hello, AI!",
    "desired_participant_id": 123  // Optional: ID of the LLM participant you want to respond
}
```
**Response (201):**
```json
{
    "conversation": {
        "id": 1,
        "created_by_user_id": 1,
        "visibility": "private",
        "created_at": "2024-03-21T12:00:00Z"
    },
    "messages": [
        {
            "id": 1,
            "conversation_id": 1,
            "participant_id": 1,
            "content": "Hello, AI!",
            "participant_name": "john_doe",
            "participant_type": "user",
            "created_at": "2024-03-21T12:00:00Z"
        }
    ]
}
```

#### 3. Send Message to Conversation
**POST** `/chat/:id`  
**Headers:** `Authorization: Bearer <token>`
```json
{
    "content": "Tell me more!",
    "parent_id": 1,  // Optional, for threaded replies
    "desired_participant_id": 123  // Optional: ID of the LLM participant you want to respond
}
```
**Response (200):**
```json
{
    "conversation": {
        "id": 1,
        "created_by_user_id": 1,
        "visibility": "private",
        "created_at": "2024-03-21T12:00:00Z"
    },
    "messages": [
        // All messages in conversation, ordered by creation time
    ]
}
```

### Real-time Updates

#### Subscribe to Conversation Events
**GET** `/chat/:id/events`  
**Headers:** `Authorization: Bearer <token>`

This endpoint uses Server-Sent Events (SSE) to push real-time updates to clients.

**Event Types:**

1. `message_added`
```json
{
    "type": "message_added",
    "data": {
        "message": {
            "id": 2,
            "conversation_id": 1,
            "participant_id": 123,
            "content": "New message content",
            "participant_name": "GPT-4",
            "participant_type": "llm",
            "created_at": "2024-03-21T12:01:00Z"
        }
    }
}
```

2. `typing_started`
```json
{
    "type": "typing_started",
    "data": {
        "participant_id": 123,
        "participant_name": "GPT-4",
        "participant_type": "llm"
    }
}
```

3. `typing_stopped`
```json
{
    "type": "typing_stopped",
    "data": {
        "participant_id": 123,
        "participant_name": "GPT-4",
        "participant_type": "llm"
    }
}
```

**JavaScript Example:**
```javascript
const eventSource = new EventSource('/chat/1/events', {
    headers: {
        'Authorization': 'Bearer your-token'
    }
});

eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    switch (data.type) {
        case 'message_added':
            console.log('New message:', data.data.message);
            break;
        case 'typing_started':
            console.log('Participant started typing:', data.data.participant_name);
            break;
        case 'typing_stopped':
            console.log('Participant stopped typing:', data.data.participant_name);
            break;
    }
};

eventSource.onerror = (error) => {
    console.error('SSE Error:', error);
    eventSource.close();
};
```

### Participants

#### List Available LLM Participants
**GET** `/participants/llm`  
**Headers:** `Authorization: Bearer <token>`
**Response (200):**
```json
{
    "participants": [
        {
            "id": 123,
            "name": "GPT-4",
            "type": "llm",
            "metadata": {
                "model": "gpt-4",
                "temperature": 0.7,
                "expertise": "general"
            },
            "created_at": "2024-03-21T12:00:00Z"
        },
        {
            "id": 124,
            "name": "Code Assistant",
            "type": "llm",
            "metadata": {
                "model": "gpt-4",
                "temperature": 0.3,
                "expertise": "programming"
            },
            "created_at": "2024-03-21T12:00:00Z"
        }
    ]
}
```

### Sharing & Collaboration

#### 1. Create Share Link
**POST** `/chat/:id/share`  
**Headers:** `Authorization: Bearer <token>`
```json
{
    "access_type": "read"  // "read" or "write"
}
```
**Response (200):**
```json
{
    "share_token": "unique-share-token"
}
```

#### 2. Access Shared Conversation
**GET** `/chat/shared/:token`  
**Headers:** `Authorization: Bearer <token>`
**Response (200):**
```json
{
    "conversation": {
        "id": 1,
        "title": "Shared Chat",
        "created_by_user_id": 1,
        "visibility": "shared",
        "created_at": "2024-03-21T12:00:00Z"
    },
    "access": {
        "access_type": "read",
        "share_token": "unique-share-token"
    }
}
```

#### 3. Fork Conversation
**POST** `/chat/:id/fork`  
**Headers:** `Authorization: Bearer <token>`
```json
{
    "title": "My Fork"  // Optional
}
```
**Response (201):**
```json
{
    "conversation": {
        "id": 2,
        "title": "My Fork",
        "created_by_user_id": 1,
        "visibility": "private",
        "forked_from_id": 1,
        "created_at": "2024-03-21T12:00:00Z"
    }
}
```

## Error Responses
All endpoints return appropriate HTTP status codes:
- `400` Bad Request - Missing or invalid parameters
- `401` Unauthorized - Invalid or missing authentication
- `403` Forbidden - Insufficient permissions
- `404` Not Found - Resource not found
- `500` Internal Server Error

Error Response Format:
```json
{
    "error": "Error message description"
}
```

## Notes
- All requests must include `Content-Type: application/json` header
- Protected routes require `Authorization: Bearer <token>` header
- Bearer tokens expire after 7 days
- Conversations are private by default
- Forked conversations inherit messages but start as private
- Read access allows viewing and forking
- Write access allows contributing to the conversation
- Use SSE for real-time updates on conversation changes
- Specify desired_participant_id to choose which LLM should respond
- LLM responses are asynchronous and progress is reported via SSE
- Multiple LLM participants can be available with different specialties