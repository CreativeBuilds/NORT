# Chat API Server Documentation

The Chat API server runs on http://localhost:3000

## API Endpoints

### 1. Authenticate User
**POST** `http://localhost:3000/auth`  
**Body:**
```json
{
    "userId": "test-user-1"
}
```
**Response:**
```json
{
    "id": "test-user-1",
    "chats": []
}
```
**Curl Example:**
```bash
curl -X POST http://localhost:3000/auth \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user-1"}'
```

### 2. Send Message
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

### 3. Get Chat History
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

### 4. Get User's Chats
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
- Each user has their own directory containing their chats
- Chat IDs are UUIDs and should be replaced with actual IDs in the examples
- The AI response is automatically generated when sending a message
- You can start a new chat simply by sending a message without a chatId