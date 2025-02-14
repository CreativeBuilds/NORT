import { ASSISTANT, client, END_HEADER_ID, SEED, START_HEADER_ID, SYSTEM, USER } from "../constants";

export async function chat(prompt: string, user_settings = {}, should_stream = false): Promise<[string, null] | [null, string]> {
    if (!prompt) return [null, "NO_PROMPT"];
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
    const stream = await client.completions.create({ ...settings, ...user_settings });

    let buffer = '';
    try {
        for await (const chunk of stream as AsyncIterable<any>) {
            const text = chunk.choices[0]?.text || "";
            buffer += text;

            if (should_stream) {
                process.stdout.write(text);
            }
        }
    } catch (err) {
        return [null, err];
    }

    if(should_stream) process.stdout.write("\n");

    return [buffer, null];
}