import { Response, NextFunction } from 'express'
import { getCurrentPersona } from '../db'
import { AuthenticatedRequest } from '../types/request'

export const ensureParticipant = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
	if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return }

	try {
		// Get current persona
		const [participant, error] = await getCurrentPersona(req.user.id);
		
		if (error) { res.status(500).json({ error: 'Failed to get current persona' }); return }
		if (!participant) { res.status(400).json({ error: 'No active persona found. Please create or select a persona.' }); return }
		
		req.participant = participant;
		next();
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
}
