import { Router, Response } from 'express'
import { getLLMParticipants, createParticipant } from '../../db'
import { authenticate } from '../middleware/auth'
import { AuthenticatedRequest } from '../types/request'

const router = Router()

router.get('/llm', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	try {
		const [participants, error] = await getLLMParticipants();
		if (error) { res.status(500).json({ error: error.message }); return }

		res.json({ participants }); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
});

router.post('/llm', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	const { name, metadata } = req.body;
	
	if (!name?.trim()) { res.status(400).json({ error: 'Name is required' }); return }
	if (!metadata?.system_prompt) { res.status(400).json({ error: 'System prompt is required' }); return }
	if (typeof metadata.temperature !== 'number' || metadata.temperature < 0 || metadata.temperature > 2) {
		res.status(400).json({ error: 'Temperature must be between 0 and 2' }); return
	}

	try {
		const [participant, error] = await createParticipant(name, 'llm', undefined, metadata);
		if (error || !participant) { res.status(500).json({ error: error?.message || 'Failed to create participant' }); return }

		res.status(201).json({ participant }); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
});

export default router
