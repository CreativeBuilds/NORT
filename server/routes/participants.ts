import { Router, Response } from 'express'
import { getLLMParticipants, createParticipant, setParticipantPrivacy, cloneParticipant, getParticipantById } from '../db'
import { authenticate } from '../middleware/auth'
import { AuthenticatedRequest } from '../types/request'

const router = Router()

router.get('/llm', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	if (!req.user?.id) { res.status(401).json({ error: 'Unauthorized' }); return }

	try {
		const [participants, error] = await getLLMParticipants(req.user.id);
		if (error) { res.status(500).json({ error: error.message }); return }

		res.json({ participants }); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
});

router.post('/llm', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	if (!req.user?.id) { res.status(401).json({ error: 'Unauthorized' }); return }

	const { name, metadata, isPrivate = true } = req.body;
	
	if (!name?.trim()) { res.status(400).json({ error: 'Name is required' }); return }
	if (!metadata?.system_prompt) { res.status(400).json({ error: 'System prompt is required' }); return }
	if (typeof metadata.temperature !== 'number' || metadata.temperature < 0 || metadata.temperature > 2) {
		res.status(400).json({ error: 'Temperature must be between 0 and 2' }); return
	}

	try {
		const [participant, error] = await createParticipant(name, 'llm', req.user.id, metadata, isPrivate);
		if (error || !participant) { res.status(500).json({ error: error?.message || 'Failed to create participant' }); return }

		res.status(201).json({ participant }); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
});

router.patch('/llm/:id/privacy', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	if (!req.user?.id) { res.status(401).json({ error: 'Unauthorized' }); return }

	const { id } = req.params;
	const { isPrivate } = req.body;

	if (typeof isPrivate !== 'boolean') { res.status(400).json({ error: 'isPrivate must be a boolean' }); return }

	try {
		// First check if user owns this participant
		const [participant, getError] = await getParticipantById(parseInt(id));
		if (getError) { res.status(500).json({ error: getError.message }); return }
		if (!participant) { res.status(404).json({ error: 'Participant not found' }); return }
		if (participant.user_id !== req.user.id) { res.status(403).json({ error: 'Not authorized' }); return }

		const [success, error] = await setParticipantPrivacy(parseInt(id), isPrivate);
		if (error) { res.status(500).json({ error: error.message }); return }
		if (!success) { res.status(404).json({ error: 'Participant not found' }); return }

		res.json({ success: true }); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
});

router.post('/llm/:id/clone', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	if (!req.user?.id) { res.status(401).json({ error: 'Unauthorized' }); return }

	const { id } = req.params;

	try {
		const [participant, error] = await cloneParticipant(parseInt(id), req.user.id);
		if (error) { res.status(500).json({ error: error.message }); return }
		if (!participant) { res.status(404).json({ error: 'Participant not found' }); return }

		res.status(201).json({ participant }); return
	} catch (err) {
		res.status(500).json({ error: (err as Error).message }); return
	}
});

export default router
