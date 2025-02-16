import { Response } from 'express'

// SSE setup
const clients = new Map<number, Set<Response>>();

// Add heartbeat to keep connections alive and detect stale ones
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

function sendHeartbeat(client: Response): boolean {
	try {
		client.write(':heartbeat\n\n');
		return true;
	} catch (err) {
		return false;
	}
}

// Start heartbeat for all clients
setInterval(() => {
	for (const [conversationId, conversationClients] of clients.entries()) {
		const activeClients = new Set<Response>();
		
		for (const client of conversationClients) {
			if (sendHeartbeat(client)) {
				activeClients.add(client);
			}
		}

		// Update with only active clients
		if (activeClients.size === 0) {
			clients.delete(conversationId);
		} else if (activeClients.size !== conversationClients.size) {
			clients.set(conversationId, activeClients);
		}
	}
}, HEARTBEAT_INTERVAL);

export function sendSSEEvent(conversationId: number, event: { type: string, data: any }): void {
	const conversationClients = clients.get(conversationId);
	if (!conversationClients) return;

	const eventData = `data: ${JSON.stringify(event)}\n\n`;
	console.log('Sending SSE event to conversation', conversationId, ':', eventData);
	
	const activeClients = new Set<Response>();
	
	conversationClients.forEach(client => {
		try {
			client.write(eventData);
			activeClients.add(client);
		} catch (err) {
			console.error('Error sending SSE to client:', err);
			// Client will be removed by not adding to activeClients
		}
	});

	// Update with only active clients
	if (activeClients.size === 0) {
		clients.delete(conversationId);
	} else if (activeClients.size !== conversationClients.size) {
		clients.set(conversationId, activeClients);
	}
}

export function addClient(conversationId: number, client: Response): void {
	// Clean up any existing client instances for this response object
	for (const [existingConvId, conversationClients] of clients.entries()) {
		conversationClients.delete(client);
		if (conversationClients.size === 0) {
			clients.delete(existingConvId);
		}
	}

	// Add to new conversation
	if (!clients.has(conversationId)) {
		clients.set(conversationId, new Set());
	}
	clients.get(conversationId)!.add(client);
	
	// Send initial heartbeat
	sendHeartbeat(client);
}

export function removeClient(conversationId: number, client: Response): void {
	console.log('Removing client from conversation', conversationId);
	const conversationClients = clients.get(conversationId);
	if (conversationClients) {
		conversationClients.delete(client);
		if (conversationClients.size === 0) {
			clients.delete(conversationId);
		}
	}
	
	// Also check other conversations for this client
	for (const [otherConvId, otherClients] of clients.entries()) {
		if (otherConvId !== conversationId) {
			otherClients.delete(client);
			if (otherClients.size === 0) {
				clients.delete(otherConvId);
			}
		}
	}
}
