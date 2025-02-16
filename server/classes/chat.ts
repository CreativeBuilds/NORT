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

    constructor(messages: DatabaseMessage[] = [], systemPrompt?: string) {
        this.messages = messages;
        this.systemPrompt = systemPrompt || null;
    }

    addMessage(message: DatabaseMessage): void {
        this.messages.push(message);
    }

    setSystemPrompt(prompt: string): void {
        this.systemPrompt = prompt;
    }

    private getParticipantRole(message: DatabaseMessage): Role {
        if (message.participant_type === 'llm') return 'ASSISTANT';
        return 'USER';
    }

    toPrompt(): [string, Error | null] {
        try {
            const parts: string[] = [];

            // Add system prompt if exists
            if (this.systemPrompt) {
                parts.push(`${SYSTEM}${this.systemPrompt}`);
            }

            // Add messages in chronological order
            for (const message of this.messages) {
                const role = this.getParticipantRole(message);
                const roleToken = role === 'ASSISTANT' ? ASSISTANT : USER;
                const headerInfo = `${START_HEADER_ID}id:${message.participant_id}|name:${message.participant_name || 'unknown'}${END_HEADER_ID}`;
                parts.push(`${headerInfo}${roleToken}${message.content}`);
            }

            // Add final assistant token to indicate it's the AI's turn
            parts.push(ASSISTANT);

            return [parts.join('\n'), null];
        } catch (error) {
            return ['', error instanceof Error ? error : new Error('Unknown error occurred')];
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
}