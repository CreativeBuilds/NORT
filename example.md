# Chat API Server Documentation

The Chat API server runs on http://localhost:3000

## API Endpoints

### 1. Register/Login User
**POST** `http://localhost:3000/auth`  
**Body:**
```json
{
    "username": "test-user-1",
    "password": "your-password"
}
```
**Response (New User - 201):**
```json
{
    "tempKey": "550e8400-e29b-41d4-a716-446655440001",
    "expiresIn": 86400000
}
```
**Response (Existing User - 200):**
```json
{
    "tempKey": "550e8400-e29b-41d4-a716-446655440001",
    "expiresIn": 86400000
}
```
**Curl Example:**
```bash
curl -X POST http://localhost:3000/auth \
  -H "Content-Type: application/json" \
  -d '{"username": "test-user-1", "password": "your-password"}'
```

### 2. Create New Chat
**POST** `http://localhost:3000/chats`  
Requires authentication via x-auth-token header.

**Body:**
```json
{
    "participants": ["other-user-1", "other-user-2"]  // Optional
}
```
**Response (201):**
```json
{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "messages": [],
    "participants": ["test-user-1", "other-user-1", "other-user-2"],
    "createdAt": 1616516481089,
    "updatedAt": 1616516481089
}
```
**Curl Example:**
```bash
curl -X POST http://localhost:3000/chats \
  -H "Content-Type: application/json" \
  -H "x-auth-token: your-auth-token" \
  -d '{"participants": ["other-user-1", "other-user-2"]}'
```

### 3. Protected Routes
All other routes require authentication using the temporary key received from the /auth endpoint.
Include the temporary key in the `x-auth-token` header for all requests.

Example protected route request:
```bash
curl -X GET http://localhost:3000/protected-route \
  -H "Content-Type: application/json" \
  -H "x-auth-token: 550e8400-e29b-41d4-a716-446655440001"
```

### 4. Send Message
**POST** `http://localhost:3000/chats/:chatId?/messages`  
Note: If chatId is not provided, a new chat will be created automatically.

**Body:**
```json
{
    "userId": "test-user-1",
    "content": "Hello, AI!"
}
```
**Response:**
```json
{
    "userMessage": {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "content": "Hello, AI!",
        "senderId": "test-user-1",
        "timestamp": 1616516481090,
        "role": "USER"
    },
    "aiResponse": {
        "id": "550e8400-e29b-41d4-a716-446655440002",
        "content": "AI response message",
        "senderId": "VI",
        "timestamp": 1616516481091,
        "role": "ASSISTANT"
    }
}
```
**Curl Examples:**
```bash
# Send message to new chat
curl -X POST http://localhost:3000/chats/messages \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-1", "content": "Hello, AI!"}'

# Send message to existing chat
curl -X POST http://localhost:3000/chats/550e8400-e29b-41d4-a716-446655440000/messages \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-1", "content": "Hello again!"}'
```

### 5. Get Chat History
**GET** `http://localhost:3000/chats/:chatId?userId=test-user-1`  
**Response:**
```json
{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "messages": [
        {
            "id": "550e8400-e29b-41d4-a716-446655440001",
            "content": "Hello, AI!",
            "senderId": "test-user-1",
            "timestamp": 1616516481090,
            "role": "USER"
        },
        {
            "id": "550e8400-e29b-41d4-a716-446655440002",
            "content": "AI response message",
            "senderId": "VI",
            "timestamp": 1616516481091,
            "role": "ASSISTANT"
        }
    ],
    "participants": ["test-user-1"],
    "createdAt": 1616516481089,
    "updatedAt": 1616516481091
}
```
**Curl Example:**
```bash
curl "http://localhost:3000/chats/550e8400-e29b-41d4-a716-446655440000?userId=test-user-1"
```

### 6. Get User's Chats
**GET** `http://localhost:3000/users/:userId/chats`  
**Response:**
```json
[
    {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "messages": [...],
        "participants": ["test-user-1"],
        "createdAt": 1616516481089,
        "updatedAt": 1616516481091
    }
]
```
**Curl Example:**
```bash
curl http://localhost:3000/users/test-user-1/chats
```

## Error Responses
All endpoints return appropriate HTTP status codes:
- `400` Bad Request - Missing or invalid parameters
- `401` Unauthorized - Invalid or missing authentication
- `404` Not Found - Chat or user not found
- `500` Internal Server Error - Server-side errors

Error Response Format:
```json
{
    "error": "Error message description"
}
```

## Notes
- All requests that include a body should have the `Content-Type: application/json` header
- The server stores all data in the `.users` directory
- Each user has their own directory containing their account data and chats
- Each chat is stored in a separate directory under the user's chats folder
- Authentication tokens expire after 24 hours
- The PASSWORD_SALT environment variable should be set for production use