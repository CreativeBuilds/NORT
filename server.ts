import express, { Request, Response, NextFunction } from 'express'
import { hash, compare } from 'bcrypt'
import { 
	createUser, 
	getUserByUsername, 
	createAuthToken, 
	getUserByToken, 
	deleteExpiredTokens,
	createParticipant,
	getParticipantByUserId,
	createConversation,
	getConversation,
	createMessage,
	getConversationMessages,
	getUserConversations,
	createShareLink,
	getConversationByShareToken,
	forkConversation,
	canUserAccessConversation
} from './db'
import crypto from 'crypto'

const app = express()
app.use(express.json())

// Types
interface AuthenticatedRequest extends Request {
	user?: {
		id: number;
		username: string;
		created_at: string;
	};
	participant?: {
		id: number;
		name: string;
		type: 'user' | 'llm';
		user_id?: number;
		metadata?: Record<string, any>;
		created_at: string;
	};
	conversationAccess?: {
		canRead: boolean;
		canWrite: boolean;
	};
}

// Middleware
const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
	const authHeader = req.headers.authorization
	if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return }

	const token = authHeader.split(' ')[1]
	const [user, error] = getUserByToken(token)
	
	if (error || !user) { res.status(401).json({ error: 'Invalid or expired token' }); return }
	
	req.user = user
	next()
}

// Ensure user has a participant record
const ensureParticipant = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
	if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }

	try {
		let [participant, error] = await getParticipantByUserId(req.user.id)
		
		if (!participant && !error) {
			[participant, error] = await createParticipant(req.user.username, 'user', req.user.id)
		}

		if (error || !participant) { res.status(500).json({ error: 'Failed to create participant record' }); return }
		
		req.participant = participant
		next()
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
}

// Cleanup expired tokens periodically (every hour)
setInterval(() => {
	const [deleted, error] = deleteExpiredTokens()
	if (error) console.error('Error cleaning up tokens:', error)
	else if (deleted > 0) console.log(`Cleaned up ${deleted} expired tokens`)
}, 3600000)

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
	res.status(500).json({ error: err.message }); return
})

// Public routes
app.post('/signup', async (req: Request, res: Response): Promise<void> => {
	const { username, password } = req.body
	
	if (!username?.trim()) { res.status(400).json({ error: 'Username is required' }); return }
	
	if (!password?.trim() || password.length < 8) { 
		res.status(400).json({ error: 'Password must be at least 8 characters long' }); return 
	}

	try {
		const passwordHash = await hash(password, 10)
		const [user, error] = createUser(username, passwordHash)
		
		if (error) { res.status(400).json({ error: error.message }); return }
		
		// Remove password_hash from response
		const { password_hash, ...safeUser } = user!
		res.status(201).json(safeUser); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
})

app.post('/login', async (req: Request, res: Response): Promise<void> => {
	const { username, password } = req.body
	
	if (!username?.trim() || !password?.trim()) { 
		res.status(400).json({ error: 'Username and password are required' }); return 
	}

	try {
		const [user, userError] = getUserByUsername(username)
		if (userError || !user) { res.status(401).json({ error: 'Invalid credentials' }); return }

		const validPassword = await compare(password, user.password_hash)
		if (!validPassword) { res.status(401).json({ error: 'Invalid credentials' }); return }

		// Generate token
		const token = crypto.randomBytes(32).toString('hex')
		const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now

		const [authToken, tokenError] = createAuthToken(user.id, token, expiresAt)
		if (tokenError || !authToken) { res.status(500).json({ error: 'Failed to create auth token' }); return }

		const { password_hash, ...safeUser } = user
		res.json({
			user: safeUser,
			token: authToken.token,
			expires_at: authToken.expires_at
		}); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
})

// Protected routes
app.get('/', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	try {
		res.json({ 
			message: 'Server is running',
			user: req.user
		}); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
})

// Chat endpoints
app.get('/conversations', authenticate, ensureParticipant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	try {
		const [conversations, error] = await getUserConversations(req.user!.id)
		if (error) { res.status(500).json({ error: error.message }); return }

		res.json({ conversations }); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
})

app.post('/chat', authenticate, ensureParticipant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	const { content } = req.body
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

		// Get all messages (will only be one in this case)
		const [messages, messagesError] = await getConversationMessages(conversation.id)
		if (messagesError || !messages) { res.status(500).json({ error: 'Failed to fetch messages' }); return }

		res.status(201).json({
			conversation,
			messages
		}); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
})

app.post('/chat/:id', authenticate, ensureParticipant, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	const conversationId = parseInt(req.params.id)
	const { content, parent_id } = req.body

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

		// Get all messages
		const [messages, messagesError] = await getConversationMessages(conversationId)
		if (messagesError || !messages) { res.status(500).json({ error: 'Failed to fetch messages' }); return }

		res.json({
			conversation,
			messages
		}); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
})

// Middleware to check conversation access
const checkConversationAccess = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
	const conversationId = parseInt(req.params.id)
	if (isNaN(conversationId)) { res.status(400).json({ error: 'Invalid conversation ID' }); return }

	try {
		const [access, error] = await canUserAccessConversation(conversationId, req.user!.id)
		if (error || !access) { res.status(404).json({ error: 'Conversation not found' }); return }

		req.conversationAccess = access
		next()
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
}

// Sharing endpoints
app.post('/chat/:id/share', authenticate, checkConversationAccess, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

app.get('/chat/shared/:token', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	const { token } = req.params

	try {
		const [result, error] = await getConversationByShareToken(token)
		if (error || !result) { res.status(404).json({ error: 'Invalid share token' }); return }

		res.json(result); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
})

app.post('/chat/:id/fork', authenticate, checkConversationAccess, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

// 404 handler
app.use((req: Request, res: Response): void => {
	res.status(404).json({ error: 'Not found' }); return
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`)
})
