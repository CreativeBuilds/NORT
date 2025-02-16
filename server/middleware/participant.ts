import { Response, NextFunction } from 'express'
import { getParticipantByUserId, createParticipant } from '../db'
import { AuthenticatedRequest } from '../types/request'

export const ensureParticipant = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
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
