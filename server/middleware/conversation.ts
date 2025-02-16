import { Response, NextFunction } from 'express'
import { canUserAccessConversation } from '../db'
import { AuthenticatedRequest } from '../types/request'

export const checkConversationAccess = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
