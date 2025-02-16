import { Response, NextFunction } from 'express'
import { getUserByToken } from '../../db'
import { AuthenticatedRequest } from '../types/request'

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
	const authHeader = req.headers.authorization
	if (!authHeader?.startsWith('Bearer ')) { res.status(401).json({ error: 'Unauthorized' }); return }

	const token = authHeader.split(' ')[1]
	const [user, error] = getUserByToken(token)
	
	if (error || !user) { res.status(401).json({ error: 'Invalid or expired token' }); return }
	
	req.user = user
	next()
}
