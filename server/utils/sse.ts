import { Response } from 'express'

// SSE setup
const clients = new Map<number, Set<Response>>();

export function sendSSEEvent(conversationId: number, event: { type: string, data: any }): void {
	const conversationClients = clients.get(conversationId);
	if (!conversationClients) return;

	const eventData = `data: ${JSON.stringify(event)}\n\n`;
	console.log('Sending SSE event:', eventData);
	
	conversationClients.forEach(client => {
		try {
			client.write(eventData);
		} catch (err) {
			console.error('Error sending SSE:', err);
			// Remove failed client
			conversationClients.delete(client);
		}
	});
}

export function addClient(conversationId: number, client: Response): void {
	if (!clients.has(conversationId)) {
		clients.set(conversationId, new Set());
	}
	clients.get(conversationId)!.add(client);
}

export function removeClient(conversationId: number, client: Response): void {
	const conversationClients = clients.get(conversationId);
	if (conversationClients) {
		conversationClients.delete(client);
		if (conversationClients.size === 0) {
			clients.delete(conversationId);
		}
	}
}
