import { userInput } from '../helpers/userInput';
import { chat } from './chat';
import { ensure } from '../helpers/ensure';
import { Message } from '../classes/chat';



/**
 * Manages a recursive chat loop between user and assistant
 * @param history Array of previous messages
 * @returns Tuple containing [Message[] | null, error string | null]
 */
export async function chatLoop(history: Message[] = []): Promise<[Message[] | null, string | null]> {
    // Format full chat context with history
    const context = history.reduce((acc, msg) => {
        return acc + `${msg.from}\n${msg.content}\n`;
    }, "");

    // Get AI response
    const [response, chatErr] = await chat(ensure(context));
    if (chatErr) return [null, chatErr];

    // Store assistant message
    const assistantMsg: Message = {
        content: response as string,
        from: "ASSISTANT"
    };
    history.push(assistantMsg);

    // Get user input
    const [input, inputErr] = await userInput();
    if (inputErr) return [null, inputErr];

    // Store user message
    const userMsg: Message = {
        content: input as string,
        from: "USER" 
    };
    history.push(userMsg);

    // Recursive call with updated history
    return chatLoop(history);
}

