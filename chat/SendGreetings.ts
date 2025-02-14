import { vi_prompt, name, SYSTEM, ASSISTANT } from '../constants';
import { chat } from '../core/chat';
import { ensure } from '../helpers/ensure';
import { fstr } from '../helpers/fstr';

/**
 * Generates an AI greeting message using OpenRouter's API
 * @returns A tuple containing [response string | null, error string | null]
 */
export async function sendGreetings(): Promise<[string | null, string | null]> {
    let vi_base = fstr(vi_prompt, {
        username: name
    });
    let reply_rules = `\n${SYSTEM}You should tend to keep your replies short and sweet` +
        ` unless the User or another system prompt specifies otherwise.`;

    // let vi = ensure(vi_base + reply_rules, "ASSISTANT");
    let vi = (`${SYSTEM}You are a helpful agent and this is the start of a user's chat. Greet them with at least 4 words!\n${ASSISTANT}`)
    console.log(vi);
    let [chat_response] = await chat(vi);
    return [chat_response, null]
}
