import { DatabaseMessage, ChatHistory } from '../classes/chat';
import { client, ASSISTANT, SYSTEM, USER, END_HEADER_ID, START_HEADER_ID, SEED } from '../constants';

const TIMEOUT_MS = 60000; // Increase to 60 seconds
const MAX_RETRIES = 2;

export class ChatService {
    private static additionalSystemPrompt: string | null = null;
    private static readonly STOP_TOKENS = [
        USER, ASSISTANT, SYSTEM,
        "</tool_call>",
        START_HEADER_ID, END_HEADER_ID,
        "<｜start_header_id｜>",
        "<｜end_header_id｜>",
        "id:"
    ];

    private static validateResponse(text: string): [string, string | null] {
        const trimmed = text.trim();

        // For regular responses, check for stop tokens and truncate at first occurrence
        let validText = trimmed;
        let stopIndex = -1;

        for (const token of this.STOP_TOKENS) {
            const index = trimmed.indexOf(token);
            if (index !== -1 && (stopIndex === -1 || index < stopIndex)) {
                stopIndex = index;
            }
        }

        // If we found a stop token, truncate the text
        if (stopIndex !== -1) {
            validText = trimmed.substring(0, stopIndex).trim();
        }

        // Only consider it invalid if the truncated text is too short
        if (validText.length < 20) {
            return ["", `Response too short after removing stop tokens: ${validText}`];
        }

        return [validText, null];
    }

    private static async makeRequestWithRetry(
        settings: any,
        controller: AbortController,
        retryCount: number = 0
    ): Promise<[string | null, Error | null]> {
        try {
            const response = await client.completions.create(settings, {
                signal: controller.signal
            });

            const text = 'choices' in response ? response.choices[0]?.text : '';
            if (!text) return [null, new Error('No response generated')];

            // Validate and potentially truncate response
            const [validText, error] = this.validateResponse(text);
            if (!validText) {
                if (retryCount < MAX_RETRIES) {
                    console.log(`Retrying due to invalid response (attempt ${retryCount + 1})`);
                    return this.makeRequestWithRetry(settings, controller, retryCount + 1);
                }
                return [null, new Error(error || 'Invalid response format')];
            }

            return [validText, null];
        } catch (err) {
            if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
                return [null, new Error('Request timed out')];
            }
            if (retryCount < MAX_RETRIES) {
                console.log(`Retrying due to error: ${err} (attempt ${retryCount + 1})`);
                return this.makeRequestWithRetry(settings, controller, retryCount + 1);
            }
            return [null, err instanceof Error ? err : new Error('Unknown error occurred')];
        }
    }

    static setAdditionalSystemPrompt(prompt: string | null): void {
        this.additionalSystemPrompt = prompt;
    }

    static async generateResponse(
        messages: DatabaseMessage[],
        systemPrompt?: string,
        nextResponderId?: number
    ): Promise<[string | null, Error | null]> {
        try {
            // Combine system prompt with additional if exists
            const finalSystemPrompt = this.additionalSystemPrompt 
                ? `${systemPrompt || ''}\n\n${this.additionalSystemPrompt}`
                : systemPrompt;

            // Create chat history with combined prompt
            const history = new ChatHistory(messages, finalSystemPrompt, nextResponderId);
            
            // Get prompt
            const [promptParts, promptError] = history.toPromptParts();
            if (promptError) return [null, promptError];
            
            const prompt = promptParts.join('\n');

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

            try {
                const [lastMessage] = history.getLastMessage();
                const isContinuation = lastMessage?.content.trim() === '';

                const settings = {
                    model: "deepseek/deepseek-chat:free",
                    stream: false,
                    prompt,
                    temperature: isContinuation ? 0.7 : 1.1,
                    max_tokens: 500,
                    top_p: 0.8,
                    frequency_penalty: 0.1,
                    presence_penalty: 0.1,
                    seed: SEED,
                    stop: this.STOP_TOKENS,
                    provider: {
                        order: ["Targon"],
                        allow_fallbacks: false
                    }
                };

                const [text, error] = await this.makeRequestWithRetry(settings, controller);
                if (error) return [null, error];
                if (!text) return [null, new Error('No response generated')];

                // For continuations, ensure we don't repeat "I"
                const finalText = isContinuation && text.startsWith('I ') ? text.slice(2) : text;

                console.log('Generated Response:', '\n', finalText, '\n', '-'.repeat(80));
                return [finalText.trim(), null];

            } catch (err) {
                return [null, err instanceof Error ? err : new Error('Failed to generate response')];
            } finally {
                clearTimeout(timeout);
            }
        } catch (error) {
            return [null, error instanceof Error ? error : new Error('Failed to generate response')];
        }
    }
} 