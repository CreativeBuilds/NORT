import { DatabaseMessage } from '../classes/chat';
import { client, ASSISTANT, SYSTEM, USER, END_HEADER_ID, START_HEADER_ID, SEED } from '../../constants';

const TIMEOUT_MS = 30000; // 30 second timeout

export class ChatService {
    static async generateResponse(messages: DatabaseMessage[], systemPrompt?: string): Promise<[string | null, Error | null]> {
        try {
            const prompt = this.buildPrompt(messages, systemPrompt);
            
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

            try {
                const settings = {
                    model: "deepseek/deepseek-chat:free",
                    stream: false, // Changed to false since we handle streaming via SSE
                    prompt,
                    temperature: 1.1,
                    max_tokens: 1024,
                    top_p: 0.8,
                    frequency_penalty: 0.1,
                    presence_penalty: 0.1,
                    seed: SEED,
                    stop: [USER, ASSISTANT, SYSTEM, "</tool_call>", END_HEADER_ID, START_HEADER_ID, "\n"],
                    provider: {
                        order: ["Targon"],
                        allow_fallbacks: false
                    }
                };

                const response = await client.completions.create(settings, {
                    signal: controller.signal
                });

                // Handle both streaming and non-streaming responses
                const text = 'choices' in response ? response.choices[0]?.text : '';
                if (!text) return [null, new Error('No response generated')];

                return [text.trim(), null];

            } catch (err) {
                if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
                    return [null, new Error('Request timed out after 30 seconds')];
                }
                return [null, err instanceof Error ? err : new Error('Unknown error occurred')];
            } finally {
                clearTimeout(timeout);
            }
        } catch (error) {
            return [null, error instanceof Error ? error : new Error('Failed to generate response')];
        }
    }

    private static buildPrompt(messages: DatabaseMessage[], systemPrompt?: string): string {
        const parts: string[] = [];

        if (systemPrompt) {
            parts.push(`${SYSTEM}${systemPrompt}`);
        }

        for (const message of messages) {
            const roleToken = message.participant_type === 'llm' ? ASSISTANT : USER;
            parts.push(`${roleToken}${message.content}`);
        }

        parts.push(ASSISTANT);
        return parts.join('\n');
    }
} 