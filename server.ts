import express, { Request, Response, NextFunction, RequestHandler } from 'express'
import { json } from 'body-parser'
import bcrypt from 'bcrypt'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs/promises'
import path from 'path'

interface CustomRequest extends Request {
    userId?: string
    tempKey?: string
}

interface User {
    username: string
    passwordHash: string
    tempKey?: string
    tempKeyExpiry?: number
}

interface ChatMessage {
    id: string
    content: string
    senderId: string
    timestamp: number
    role: 'USER' | 'ASSISTANT'
}

interface Chat {
    id: string
    messages: ChatMessage[]
    participants: string[]
    createdAt: number
    updatedAt: number
}

const app = express()
const router = express.Router()
const port = process.env.PORT || 3000
const TEMP_KEY_EXPIRY = 24 * 60 * 60 * 1000 // 24 hours
const SALT = process.env.PASSWORD_SALT || '10' // Fallback to 10 if not set

if (!process.env.PASSWORD_SALT) {
    console.warn('WARNING: PASSWORD_SALT not set in environment variables. Using default value.')
}

app.use(json())

// Auth middleware
const authMiddleware: RequestHandler = async (req: CustomRequest, res, next) => {
    const tempKey = req.headers['x-auth-token']
    if (!tempKey || Array.isArray(tempKey)) {
        res.status(401).json({ error: 'Invalid or missing x-auth-token header' })
        return
    }

    const [user, err] = await getUserByTempKey(tempKey)
    if (err || !user) {
        res.status(401).json({ error: 'Invalid or expired authentication token' })
        return
    }

    req.userId = user.username
    req.tempKey = tempKey
    next()
}

async function getUserByTempKey(tempKey: string): Promise<[User | null, Error | null]> {
    try {
        const users = await fs.readdir('.users')
        for (const username of users) {
            const [user, err] = await readUserFile(username)
            if (err) continue
            if (user?.tempKey === tempKey && user.tempKeyExpiry && user.tempKeyExpiry > Date.now()) {
                return [user, null]
            }
        }
        return [null, new Error('User not found or key expired')]
    } catch (err) {
        return [null, err as Error]
    }
}

async function readUserFile(username: string): Promise<[User | null, Error | null]> {
    try {
        const userPath = path.join('.users', username, 'account.json')
        const data = await fs.readFile(userPath, 'utf-8')
        return [JSON.parse(data), null]
    } catch (err) {
        return [null, err as Error]
    }
}

async function writeUserFile(username: string, userData: User): Promise<[boolean, Error | null]> {
    try {
        const userDir = path.join('.users', username)
        const userPath = path.join(userDir, 'account.json')
        
        try {
            await fs.access('.users')
        } catch {
            await fs.mkdir('.users')
        }
        
        try {
            await fs.access(userDir)
        } catch {
            await fs.mkdir(userDir)
        }

        await fs.writeFile(userPath, JSON.stringify(userData, null, 2))
        return [true, null]
    } catch (err) {
        return [false, err as Error]
    }
}

// Routes that don't need authentication
router.post('/auth', async (req: CustomRequest, res) => {
    const { username, password } = req.body
    if (!username || !password) {
        res.status(400).json({ error: 'Missing username or password in request body' })
        return
    }

    try {
        const userDir = path.join('.users', username)
        const exists = await fs.access(userDir).then(() => true).catch(() => false)

        if (exists) {
            // Login flow
            const [user, err] = await readUserFile(username)
            if (err || !user) {
                res.status(500).json({ error: 'Failed to read user data' })
                return
            }

            const passwordMatch = await bcrypt.compare(password, user.passwordHash)
            if (!passwordMatch) {
                res.status(401).json({ error: 'Invalid credentials' })
                return
            }

            // Generate new temp key
            const tempKey = uuidv4()
            user.tempKey = tempKey
            user.tempKeyExpiry = Date.now() + TEMP_KEY_EXPIRY

            const [saved, saveErr] = await writeUserFile(username, user)
            if (!saved || saveErr) {
                res.status(500).json({ error: 'Failed to update user data' })
                return
            }

            res.json({ tempKey, expiresIn: TEMP_KEY_EXPIRY })
            return
        }

        // Registration flow
        const passwordHash = await bcrypt.hash(password, parseInt(SALT))
        const tempKey = uuidv4()
        const userData: User = {
            username,
            passwordHash,
            tempKey,
            tempKeyExpiry: Date.now() + TEMP_KEY_EXPIRY
        }

        const [saved, saveErr] = await writeUserFile(username, userData)
        if (!saved || saveErr) {
            res.status(500).json({ error: 'Failed to create user' })
            return
        }

        res.status(201).json({ tempKey, expiresIn: TEMP_KEY_EXPIRY })
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' })
    }
})

// Protected routes
router.use(authMiddleware)

router.post('/chats', async (req: CustomRequest, res) => {
    const { participants } = req.body
    if (!req.userId) {
        res.status(401).json({ error: 'User not authenticated' })
        return
    }

    try {
        const chatId = uuidv4()
        const chat: Chat = {
            id: chatId,
            messages: [],
            participants: [...new Set([req.userId, ...(participants || [])])],
            createdAt: Date.now(),
            updatedAt: Date.now()
        }

        const userDir = path.join('.users', req.userId)
        const chatDir = path.join(userDir, 'chats', chatId)
        
        try {
            await fs.access(path.join(userDir, 'chats'))
        } catch {
            await fs.mkdir(path.join(userDir, 'chats'))
        }

        try {
            await fs.access(chatDir)
        } catch {
            await fs.mkdir(chatDir)
        }

        await fs.writeFile(
            path.join(chatDir, 'chat.json'),
            JSON.stringify(chat, null, 2)
        )

        res.status(201).json(chat)
    } catch (err) {
        res.status(500).json({ error: 'Failed to create chat' })
    }
})

app.use(router)
app.listen(port, () => {
    console.log(`Server running on port ${port}`)
})
