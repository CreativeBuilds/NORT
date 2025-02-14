export type ChatMessage = {
    id: string
    senderId: string,
    content: string,
    timestamp: number
    role: 'USER' | 'ASSISTANT' | 'SYSTEM'
}

export type Chat = {
    id: string
    messages: ChatMessage[]
    participants: string[]
    createdAt: number
    updatedAt: number
}

export type User = {
    id: string
    chats: string[]
}

export class ChatHistory {
    msgs: ChatMessage[] = []
    constructor() {}
}