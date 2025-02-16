import { ChatMessage } from "../server/classes/chat";
import { ASSISTANT, client, END_HEADER_ID, SEED, START_HEADER_ID, SYSTEM, USER } from "../server/constants";
import { v4 as uuidv4 } from 'uuid'

const TIMEOUT_MS = 30000; // 30 second timeout

export async function chat(prompt: string, user_settings = {}, should_stream = false): Promise<[ChatMessage | null, string | null]> {
    if (!prompt) return [null, "NO_PROMPT"];
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        let settings = {
            model: "deepseek/deepseek-chat:free", 
            stream: true,
            prompt: prompt,
            temperature: 1.1,
            max_tokens: 1024,
            top_p: 0.8,
            frequency_penalty: 0.1,
            presence_penalty: 0.1,
            seed: SEED,
            stop: [USER, ASSISTANT, ASSISTANT, SYSTEM, "</tool_call>", END_HEADER_ID, START_HEADER_ID, "\n"],
            provider: {
                order: ["Targon"],
                allow_fallbacks: false
            }
        };

        const stream = await client.completions.create({ 
            ...settings, 
            ...user_settings
        }, {
            signal: controller.signal 
        });

        let buffer = '';
        let lastChunkTime = Date.now();

        for await (const chunk of stream as AsyncIterable<any>) {
            // Check for stalled stream (no chunks for 10 seconds)
            if (Date.now() - lastChunkTime > 10000) {
                throw new Error("Stream stalled - no data received for 10 seconds");
            }
            
            const text = chunk.choices[0]?.text || "";
            buffer += text;
            lastChunkTime = Date.now();

            if (should_stream) process.stdout.write(text);
        }

        if(should_stream) process.stdout.write("\n");

        return [{
            id: uuidv4(),
            senderId: 'VI',
            content: buffer,
            timestamp: Date.now(),
            role: 'ASSISTANT'
        }, null];

    } catch (err: unknown) {
        if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
            return [null, "Request timed out after 30 seconds"];
        }
        const error = err instanceof Error ? err.message : "Unknown error occurred";
        return [null, error];
    } finally {
        clearTimeout(timeout);
    }
}