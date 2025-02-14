export type Message = {
    content: string,
    from: "ASSISTANT" | "USER" | "SYSTEM"
}

export class ChatHistory {
    msgs: Message[] = []
    constructor() {}
}