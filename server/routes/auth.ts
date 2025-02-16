import { Router, Request, Response } from 'express'
import { hash, compare } from 'bcrypt'
import crypto from 'crypto'
import { createUser, getUserByUsername, createAuthToken } from '../db'
import { createParticipant } from '../db'
import { AuthenticatedRequest } from '../types/request'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

router.post('/signup', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
	const { username, password } = req.body
	
	if (!username?.trim()) { res.status(400).json({ error: 'Username is required' }); return }
	if (!password?.trim()) { res.status(400).json({ error: 'Password is required' }); return }
	if (password.length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters' }); return }

	try {
		// Hash password
		const passwordHash = await hash(password, 10)
		
		// Create user
		const [user, userError] = await createUser(username, passwordHash)
		if (userError || !user) { res.status(500).json({ error: userError?.message || 'Failed to create user' }); return }

		// Create default persona for the user
		const [persona, personaError] = await createParticipant(
			username, 
			'user', 
			user.id,
			undefined, // no metadata needed
			true, // private by default
			`Default persona for ${username}`, // description
			true // set as default
		)
		if (personaError) { res.status(500).json({ error: personaError.message }); return }

		// Create auth token
		const token = uuidv4()
		const expiresAt = new Date()
		expiresAt.setDate(expiresAt.getDate() + 7) // Token expires in 7 days
		
		const [authToken, tokenError] = await createAuthToken(user.id, token, expiresAt)
		if (tokenError || !authToken) { res.status(500).json({ error: tokenError?.message || 'Failed to create auth token' }); return }

		res.status(201).json({ token })
	} catch (err) {
		res.status(500).json({ error: (err as Error).message })
	}
})

router.post('/login', async (req: Request, res: Response): Promise<void> => {
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

export default router
