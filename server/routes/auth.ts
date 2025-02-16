import { Router, Request, Response } from 'express'
import { hash, compare } from 'bcrypt'
import crypto from 'crypto'
import { createUser, getUserByUsername, createAuthToken } from '../../db'

const router = Router()

router.post('/signup', async (req: Request, res: Response): Promise<void> => {
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
