import { ASSISTANT, SYSTEM, USER } from "../constants";

function determineLastSpeaker(text: string) {
    const lastAssistant = text.lastIndexOf(ASSISTANT);
    const lastUser = text.lastIndexOf(USER);
    const lastSystem = text.lastIndexOf(SYSTEM);
    const lastIndex = Math.max(lastAssistant, lastUser, lastSystem);

    if (lastIndex === -1) return [null, "NO_SPEAKER_FOUND"];
    if (lastIndex === lastAssistant) return [ASSISTANT, null];
    if (lastIndex === lastUser) return [USER, null];
    if (lastIndex === lastSystem) return [SYSTEM, null];

    return [null, "INVALID_STATE"];
}
