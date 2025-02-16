import { ASSISTANT, SYSTEM, USER, START_HEADER_ID, END_HEADER_ID } from "../constants";

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

export type DatabaseMessage = {
    id: number;
    conversation_id: number;
    participant_id: number;
    parent_id?: number;
    content: string;
    metadata?: Record<string, any>;
    created_at: string;
    participant_type: 'user' | 'llm';
    participant_metadata?: Record<string, any>;
    participant_name?: string;
}

export type Role = 'USER' | 'ASSISTANT' | 'SYSTEM';

export class ChatHistory {
    private messages: DatabaseMessage[] = [];
    private systemPrompt: string | null = null;
    private conversationId: number = 0;
    private nextResponderId: number | null = null;

    constructor(messages: DatabaseMessage[] = [], systemPrompt?: string, nextResponderId?: number) {
        // Ensure all messages are from the same conversation
        if (messages.length > 0) {
            this.conversationId = messages[0].conversation_id;
            
            // Validate all messages belong to the same conversation
            const invalidMessage = messages.find(m => m.conversation_id !== this.conversationId);
            if (invalidMessage) {
                throw new Error(`Message ${invalidMessage.id} belongs to conversation ${invalidMessage.conversation_id} but expected ${this.conversationId}`);
            }
            
            // Sort messages by creation time to ensure correct order
            this.messages = [...messages].sort((a, b) => 
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
        }
        this.systemPrompt = systemPrompt || null;
        this.nextResponderId = nextResponderId || null;
    }

    addMessage(message: DatabaseMessage): void {
        // Validate message belongs to the same conversation
        if (this.messages.length > 0 && message.conversation_id !== this.conversationId) {
            throw new Error(`Cannot add message from conversation ${message.conversation_id} to history of conversation ${this.conversationId}`);
        }
        
        // Set conversation ID if this is the first message
        if (this.messages.length === 0) {
            this.conversationId = message.conversation_id;
        }
        
        this.messages.push(message);
    }

    setSystemPrompt(prompt: string): void {
        this.systemPrompt = prompt;
    }

    private getParticipantRole(message: DatabaseMessage): Role {
        if (message.participant_type === 'llm') return 'ASSISTANT';
        return 'USER';
    }

    toPromptParts(): [string[], Error | null] {
        try {
            if (!this.conversationId) return [[], new Error('No conversation ID set')];
            if (!this.nextResponderId) return [[], new Error('No next responder set')];

            const parts: string[] = [];

            // Add system prompt if exists
            if (this.systemPrompt) {
                parts.push(`${SYSTEM}${this.systemPrompt}`);
            }

            // Add messages in chronological order
            for (const message of this.messages) {
                // Double-check message belongs to this conversation
                if (message.conversation_id !== this.conversationId) {
                    return [[], new Error(`Message ${message.id} belongs to wrong conversation`)];
                }

                // Skip empty continuation messages entirely
                if (message.metadata?.is_continuation) continue;

                const role = this.getParticipantRole(message);
                const roleToken = role === 'ASSISTANT' ? ASSISTANT : USER;
                const headerInfo = `${START_HEADER_ID}id:${message.participant_id}|name:${message.participant_name || 'unknown'}${END_HEADER_ID}`;
                parts.push(`${headerInfo}${roleToken}${message.content}`);
            }

            parts.push(`${SYSTEM}Do not use emojis in your response.`)

            // Get last message to check if it's from the same assistant
            const [lastMessage, err] = this.getLastMessage();
            const isContinuation = !err && lastMessage?.content === '';

            if (isContinuation) {
                // For continuations, add a newline and continuation marker
                parts.push(`\nI`);
            } else {
                // Otherwise add the standard assistant header and token
                parts.push(`${START_HEADER_ID}id:${this.nextResponderId}${END_HEADER_ID}${ASSISTANT}`);
            }

            return [parts, null];
        } catch (error) {
            return [[], error instanceof Error ? error : new Error('Unknown error occurred')];
        }
    }

    getLastMessage(): [DatabaseMessage | null, Error | null] {
        if (!this.messages.length) return [null, new Error('No messages in history')];
        return [this.messages[this.messages.length - 1], null];
    }

    getLastUserMessage(): [DatabaseMessage | null, Error | null] {
        for (let i = this.messages.length - 1; i >= 0; i--) {
            if (this.messages[i].participant_type === 'user') {
                return [this.messages[i], null];
            }
        }
        return [null, new Error('No user messages found')];
    }

    getLastAssistantMessage(): [DatabaseMessage | null, Error | null] {
        for (let i = this.messages.length - 1; i >= 0; i--) {
            if (this.messages[i].participant_type === 'llm') {
                return [this.messages[i], null];
            }
        }
        return [null, new Error('No assistant messages found')];
    }

    getMessageCount(): number {
        return this.messages.length;
    }

    clear(): void {
        this.messages = [];
        this.systemPrompt = null;
    }

    setNextResponder(participantId: number): void {
        this.nextResponderId = participantId;
    }
}