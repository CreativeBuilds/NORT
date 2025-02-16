import { ASSISTANT, SYSTEM, USER } from "../constants";

// Helper Functions
export function ensure(text: string, name = 'assistant') {
    let token;
    switch (name) {
        case 'assistant': token = ASSISTANT; break;
        case 'user': token = USER; break;
        case 'system': token = SYSTEM; break;
        default: token = ASSISTANT; break;
    }

    if (!text.endsWith(token)) {
        text = text.endsWith('\n') ? text + token : text + '\n' + token;
    }

    return text;
}
