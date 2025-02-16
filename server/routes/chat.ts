import { Router, Response } from 'express'
import { 
	createConversation, 
	getConversation, 
	createMessage, 
	getConversationMessages,
	getConversationMessagesAfter,
	getUserConversations,
	createShareLink,
	getConversationByShareToken,
	forkConversation,
	getUserByToken,
	canUserAccessConversation
} from '../../db'
import { authenticate } from '../middleware/auth'
import { ensureParticipant } from '../middleware/participant'
import { checkConversationAccess } from '../middleware/conversation'
import { AuthenticatedRequest } from '../types/request'
import { addClient, removeClient, sendSSEEvent } from '../utils/sse'
import messageQueue from '../../queues/messageQueue'

const router = Router()

router.get('/conversations', authenticate, ensureParticipant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	try {
		const [conversations, error] = await getUserConversations(req.user!.id)
		if (error) { res.status(500).json({ error: error.message }); return }

		res.json({ conversations }); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
})

router.get('/:id', authenticate, checkConversationAccess, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	const conversationId = parseInt(req.params.id);
	
	if (!req.conversationAccess?.canRead) { res.status(403).json({ error: 'Not authorized to access this conversation' }); return }

	try {
		// Get conversation
		const [conversation, conversationError] = await getConversation(conversationId);
		if (conversationError || !conversation) { res.status(404).json({ error: 'Conversation not found' }); return }

		// Get messages
		const [messages, messagesError] = await getConversationMessages(conversationId);
		if (messagesError) { res.status(500).json({ error: 'Failed to fetch messages' }); return }

		res.json({
			conversation,
			messages: messages || []
		}); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
});

router.get('/:id/events', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	const conversationId = parseInt(req.params.id);
	const authToken = req.query.auth_token as string;
	const lastMessageId = req.query.last_message_id ? parseInt(req.query.last_message_id as string) : null;
	
	if (!authToken) { res.status(401).json({ error: 'No auth token provided' }); return }

	// Verify auth token
	const [user, userError] = await getUserByToken(authToken);
	if (userError || !user) { res.status(401).json({ error: 'Invalid auth token' }); return }
	req.user = user;

	// Check conversation access
	const [access, accessError] = await canUserAccessConversation(conversationId, user.id);
	if (accessError || !access) { res.status(404).json({ error: 'Conversation not found' }); return }
	if (!access.canRead) { res.status(403).json({ error: 'Not authorized to access this conversation' }); return }

	// Set up SSE headers
	res.setHeader('Content-Type', 'text/event-stream');
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('Connection', 'keep-alive');
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Credentials', 'true');
	
	// Send initial connection established event
	res.write('event: connected\ndata: {}\n\n');

	// If lastMessageId is provided, send any missed messages
	// If not provided, send all messages for initial load
	const [messages, error] = lastMessageId !== null ? 
		await getConversationMessagesAfter(conversationId, lastMessageId) :
		await getConversationMessages(conversationId);

	if (!error && messages && messages.length > 0) {
		messages.forEach(message => {
			const eventData = `data: ${JSON.stringify({
				type: 'message_added',
				data: { message }
			})}\n\n`;
			res.write(eventData);
		});
	}

	// Add client to tracking
	addClient(conversationId, res);

	// Handle client disconnect
	req.on('close', () => {
		console.log('Client disconnected from SSE');
		removeClient(conversationId, res);
	});
});

router.post('/', authenticate, ensureParticipant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	const { content, desired_participant_id } = req.body
	if (!content?.trim()) { res.status(400).json({ error: 'Message content is required' }); return }

	try {
		// Create new conversation
		const [conversation, conversationError] = await createConversation(req.user!.id)
		if (conversationError || !conversation) { res.status(500).json({ error: 'Failed to create conversation' }); return }

		// Create first message
		const [message, messageError] = await createMessage(
			conversation.id,
			req.participant!.id,
			content
		)
		if (messageError || !message) { res.status(500).json({ error: 'Failed to create message' }); return }

		// Get all messages
		const [messages, messagesError] = await getConversationMessages(conversation.id)
		if (messagesError || !messages) { res.status(500).json({ error: 'Failed to fetch messages' }); return }

		// Find the full message with participant info
		const fullMessage = messages.find(m => m.id === message.id);

		// Notify clients about new message
		sendSSEEvent(conversation.id, {
			type: 'message_added',
			data: { message: fullMessage }
		});

		// If an LLM participant is requested, queue their response
		if (desired_participant_id) {
			await messageQueue.add('process-llm-response', {
				conversationId: conversation.id,
				messageId: message.id,
				participantId: desired_participant_id
			});
		}

		res.status(201).json({
			conversation,
			messages
		}); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
});

router.post('/:id', authenticate, ensureParticipant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	const conversationId = parseInt(req.params.id)
	const { content, parent_id, desired_participant_id } = req.body

	if (isNaN(conversationId)) { res.status(400).json({ error: 'Invalid conversation ID' }); return }
	if (!content?.trim()) { res.status(400).json({ error: 'Message content is required' }); return }

	try {
		// Verify conversation exists
		const [conversation, conversationError] = await getConversation(conversationId)
		if (conversationError || !conversation) { res.status(404).json({ error: 'Conversation not found' }); return }

		// Create message
		const [message, messageError] = await createMessage(
			conversationId,
			req.participant!.id,
			content,
			parent_id
		)
		if (messageError || !message) { res.status(500).json({ error: 'Failed to create message' }); return }

		// Get full message with participant info
		const [messages, messagesError] = await getConversationMessages(conversationId)
		if (messagesError || !messages) { res.status(500).json({ error: 'Failed to fetch messages' }); return }

		// Find the full message with participant info
		const fullMessage = messages.find(m => m.id === message.id);

		// Notify clients about new message
		sendSSEEvent(conversationId, {
			type: 'message_added',
			data: { message: fullMessage }
		});

		// If an LLM participant is requested, queue their response
		if (desired_participant_id) {
			await messageQueue.add('process-llm-response', {
				conversationId,
				messageId: message.id,
				participantId: desired_participant_id
			});
		}

		res.json({
			conversation,
			messages
		}); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
});

router.post('/:id/share', authenticate, checkConversationAccess, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	const conversationId = parseInt(req.params.id)
	const { access_type } = req.body

	if (!req.conversationAccess?.canWrite) { res.status(403).json({ error: 'Not authorized to share this conversation' }); return }
	if (!access_type || !['read', 'write'].includes(access_type)) { 
		res.status(400).json({ error: 'Invalid access type. Must be "read" or "write"' }); return 
	}

	try {
		const [access, error] = await createShareLink(conversationId, access_type)
		if (error || !access) { res.status(500).json({ error: error?.message || 'Failed to create share link' }); return }

		res.json({ share_token: access.share_token }); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
})

router.get('/shared/:token', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	const { token } = req.params

	try {
		const [result, error] = await getConversationByShareToken(token)
		if (error || !result) { res.status(404).json({ error: 'Invalid share token' }); return }

		res.json(result); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
})

router.post('/:id/fork', authenticate, checkConversationAccess, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	const conversationId = parseInt(req.params.id)
	const { title } = req.body

	if (!req.conversationAccess?.canRead) { res.status(403).json({ error: 'Not authorized to fork this conversation' }); return }

	try {
		const [forked, error] = await forkConversation(conversationId, req.user!.id, title)
		if (error || !forked) { res.status(500).json({ error: error?.message || 'Failed to fork conversation' }); return }

		res.status(201).json({ conversation: forked }); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
})

export default router
