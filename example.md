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
    "content": "Hello, AI!"
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
    "parent_id": 1  // Optional, for threaded replies
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