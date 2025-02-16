import express, { Request, Response, NextFunction } from 'express'
import { join } from 'path'
import { deleteExpiredTokens } from './db'
import authRouter from './routes/auth'
import chatRouter from './routes/chat'
import participantsRouter from './routes/participants'

const app = express()
const apiRouter = express.Router()

// Serve static files from client directory
app.use(express.static(join(__dirname, '../client')))

// Parse JSON bodies
app.use(express.json())

// Serve index.html for root path
app.get('/', (req: Request, res: Response) => {
	res.sendFile(join(__dirname, '../client', 'index.html'))
})

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

// Mount API routes
apiRouter.use('/auth', authRouter)
apiRouter.use('/chat', chatRouter)
apiRouter.use('/participants', participantsRouter)

// Mount API router under /api/v1
app.use('/api/v1', apiRouter)

// 404 handler
app.use((req: Request, res: Response): void => {
	// For API routes, return JSON error
	if (req.path.startsWith('/api/')) {
		res.status(404).json({ error: 'API endpoint not found' }); return
	}
	
	// For other routes, serve index.html (client-side routing)
	res.sendFile(join(__dirname, '../client', 'index.html'))
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`)
})
