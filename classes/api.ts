import { promises as fs } from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import express, { Request, Response, Router, RequestHandler } from 'express'
import { Chat, ChatHistory, ChatMessage, User } from './chat'
import { chat } from '../core/chat'
import chalk from 'chalk'

// Logger utility
const logger = {
    info: (method: string, message: string) => 
        console.log(chalk.blue(`[INFO] [${method}] ${message}`)),
    success: (method: string, message: string) => 
        console.log(chalk.green(`[SUCCESS] [${method}] ${message}`)),
    warn: (method: string, message: string) => 
        console.log(chalk.yellow(`[WARN] [${method}] ${message}`)),
    error: (method: string, message: string, error?: Error | null) => {
        console.log(chalk.red(`[ERROR] [${method}] ${message}`))
        if (error?.stack && process.env.NODE_ENV === 'development') {
            console.log(chalk.gray(error.stack))
        }
    },
    debug: (method: string, message: string) => 
        process.env.NODE_ENV === 'development' && console.log(chalk.gray(`[DEBUG] [${method}] ${message}`)),
    perf: (method: string, operation: string, startTime: number) => {
        const duration = Date.now() - startTime
        console.log(chalk.cyan(`[PERF] [${method}] ${operation}: ${duration}ms`))
    }
}

// Request types
interface AuthRequest extends Request {
    body: { userId: string }
}

interface MessageRequest extends Request {
    body: { userId: string, content: string }
    params: { chatId?: string }
}

interface GetChatRequest extends Request {
    query: { userId: string }
    params: { chatId: string }
}

interface UserChatsRequest extends Request {
    params: { userId: string }
}

// File system helpers
const ensureDirectoryExists = async (dirPath: string): Promise<[boolean, Error | null]> => {
    try {
        await fs.mkdir(dirPath, { recursive: true })
        return [true, null]
    } catch (error) {
        return [false, error as Error]
    }
}

const saveJsonToFile = async (filePath: string, data: any): Promise<[boolean, Error | null]> => {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2))
        return [true, null]
    } catch (error) {
        return [false, error as Error]
    }
}

const readJsonFromFile = async (filePath: string): Promise<[any, Error | null]> => {
    try {
        const data = await fs.readFile(filePath, 'utf-8')
        return [JSON.parse(data), null]
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [{}, null]
        return [null, error as Error]
    }
}

// Chat API class
export class ChatAPI {
    private readonly baseDir: string = '../.users'
    public app: express.Application

    constructor() {
        logger.info('constructor', 'Initializing ChatAPI')
        ensureDirectoryExists(this.baseDir)
            .then(([success, error]) => {
                if (error) {
                    logger.error('constructor', 'Failed to create base directory', error)
                } else {
                    logger.success('constructor', 'Base directory ensured')
                }
            })
        
        this.app = express()
        this.app.use(express.json())
        this.setupRoutes()
        logger.success('constructor', 'ChatAPI initialized successfully')
    }

    private setupRoutes() {
        const router = Router()

        // Authentication endpoint
        const authHandler: RequestHandler = async (req, res) => {
            const { userId } = (req as AuthRequest).body
            if (!userId) {
                res.status(400).json({ error: 'userId is required' })
                return
            }

            const [user, error] = await this.authenticateUser(userId)
            if (error) {
                res.status(500).json({ error: error.message })
                return
            }

            res.json(user)
        }
        router.post('/auth', authHandler)

        // Get chat by ID
        const getChatHandler: RequestHandler = async (req, res) => {
            const { userId } = (req as GetChatRequest).query
            const { chatId } = (req as GetChatRequest).params
            if (!userId) {
                res.status(400).json({ error: 'userId is required' })
                return
            }

            const [chat, error] = await this.getChat(userId as string, chatId)
            if (error) {
                res.status(500).json({ error: error.message })
                return
            }

            res.json(chat)
        }
        router.get('/chats/:chatId', getChatHandler)

        // Add message to chat (or create new chat if no chatId)
        const addMessageHandler: RequestHandler = async (req, res) => {
            const startTime = Date.now()
            const { userId, content } = (req as MessageRequest).body
            const { chatId } = (req as MessageRequest).params
            
            if (!userId || !content) {
                res.status(400).json({ error: 'userId and content are required' })
                return
            }

            let currentChatId = chatId
            if (!currentChatId) {
                const [newChat, createErr] = await this.createChat(userId)
                if (createErr) {
                    logger.error('addMessageHandler', 'Failed to create chat', createErr)
                    res.status(500).json({ error: createErr.message })
                    return
                }
                currentChatId = newChat.id
            }

            // Set a timeout for the entire request
            const requestTimeout = setTimeout(() => {
                logger.error('addMessageHandler', 'Request timed out after 35 seconds')
                res.status(504).json({ error: 'Request timed out' })
            }, 35000)

            try {
                const [message, error] = await this.addMessage(userId, currentChatId, content, "USER")
                if (error) {
                    logger.error('addMessageHandler', 'Failed to add user message', error)
                    res.status(500).json({ error: error.message })
                    return
                }

                // Generate AI response
                const [response, respError] = await this.generateResponse(userId, currentChatId)
                if (respError) {
                    logger.error('addMessageHandler', 'Failed to generate AI response', respError)
                    // We still return the user's message even if AI response failed
                    res.status(200).json({ 
                        userMessage: message, 
                        error: respError.message,
                        note: 'Your message was saved but AI response generation failed'
                    })
                    return
                }

                logger.success('addMessageHandler', `Completed request in ${Date.now() - startTime}ms`)
                res.json({ userMessage: message, aiResponse: response })
            } catch (err) {
                logger.error('addMessageHandler', 'Unexpected error in request handler', err as Error)
                res.status(500).json({ error: 'An unexpected error occurred' })
            } finally {
                clearTimeout(requestTimeout)
            }
        }
        router.post('/chats/:chatId?/messages', addMessageHandler)

        // Get user's chats
        const getUserChatsHandler: RequestHandler = async (req, res) => {
            const { userId } = (req as UserChatsRequest).params
            const [chats, error] = await this.getUserChats(userId)
            if (error) {
                res.status(500).json({ error: error.message })
                return
            }

            res.json(chats)
        }
        router.get('/users/:userId/chats', getUserChatsHandler)

        this.app.use(router)
    }

    start(port: number = 3000) {
        this.app.listen(port, () => {
            console.log(`Chat API server running on port ${port}`)
        })
    }

    async authenticateUser(userId: string): Promise<[User, Error | null]> {
        const startTime = Date.now()
        logger.debug('authenticateUser', `Authenticating user: ${userId}`)

        const userDir = path.join(this.baseDir, userId)
        const [success, dirErr] = await ensureDirectoryExists(userDir)
        if (!success) {
            logger.error('authenticateUser', `Failed to create user directory for ${userId}`, dirErr)
            return [null as any, dirErr]
        }

        const [success2, dirErr2] = await ensureDirectoryExists(path.join(userDir, 'chats'))
        if (!success2) {
            logger.error('authenticateUser', `Failed to create chats directory for ${userId}`, dirErr2)
            return [null as any, dirErr2]
        }

        const userFilePath = path.join(userDir, 'user.json')
        const [userData, readErr] = await readJsonFromFile(userFilePath)
        if (readErr) {
            logger.error('authenticateUser', `Failed to read user data for ${userId}`, readErr)
            return [null as any, readErr]
        }

        if (Object.keys(userData).length === 0) {
            logger.info('authenticateUser', `Creating new user: ${userId}`)
            const newUser: User = {
                id: userId,
                chats: []
            }
            const [saved, saveErr] = await saveJsonToFile(userFilePath, newUser)
            if (!saved) {
                logger.error('authenticateUser', `Failed to save new user data for ${userId}`, saveErr)
                return [null as any, saveErr]
            }
            logger.success('authenticateUser', `New user created: ${userId}`)
            logger.perf('authenticateUser', 'New user creation', startTime)
            return [newUser, null]
        }

        logger.success('authenticateUser', `User authenticated: ${userId}`)
        logger.perf('authenticateUser', 'User authentication', startTime)
        return [userData as User, null]
    }

    async createChat(userId: string): Promise<[Chat, Error | null]> {
        const startTime = Date.now()
        logger.debug('createChat', `Creating chat for user: ${userId}`)

        const [user, authErr] = await this.authenticateUser(userId)
        if (authErr) {
            logger.error('createChat', `Authentication failed for ${userId}`, authErr)
            return [null as any, authErr]
        }

        const newChat: Chat = {
            id: uuidv4(),
            messages: [],
            participants: [userId],
            createdAt: Date.now(),
            updatedAt: Date.now()
        }

        const chatFilePath = path.join(this.baseDir, userId, 'chats', `${newChat.id}.json`)
        const [saved, saveErr] = await saveJsonToFile(chatFilePath, newChat)
        if (!saveErr) {
            user.chats.push(newChat.id)
            await saveJsonToFile(path.join(this.baseDir, userId, 'user.json'), user)
            logger.success('createChat', `Chat created: ${newChat.id}`)
        } else {
            logger.error('createChat', `Failed to save chat ${newChat.id}`, saveErr)
        }

        logger.perf('createChat', 'Chat creation', startTime)
        return [newChat, saveErr]
    }

    async getChat(userId: string, chatId: string): Promise<[Chat, Error | null]> {
        const startTime = Date.now()
        logger.debug('getChat', `Retrieving chat ${chatId} for user ${userId}`)

        const [user, authErr] = await this.authenticateUser(userId)
        if (authErr) {
            logger.error('getChat', `Authentication failed for ${userId}`, authErr)
            return [null as any, authErr]
        }

        if (!user.chats.includes(chatId)) {
            const err = new Error('Chat not found or unauthorized')
            logger.warn('getChat', `Unauthorized access to chat ${chatId} by user ${userId}`)
            return [null as any, err]
        }

        const chatFilePath = path.join(this.baseDir, userId, 'chats', `${chatId}.json`)
        const [chat, readErr] = await readJsonFromFile(chatFilePath)
        
        if (readErr) {
            logger.error('getChat', `Failed to read chat ${chatId}`, readErr)
        } else {
            logger.success('getChat', `Retrieved chat ${chatId}`)
        }

        logger.perf('getChat', 'Chat retrieval', startTime)
        return [chat, readErr]
    }

    async addMessage(userId: string, chatId: string, content: string, from: "USER" | "ASSISTANT" | "SYSTEM"): Promise<[ChatMessage, Error | null]> {
        const startTime = Date.now()
        logger.debug('addMessage', `Adding ${from} message to chat ${chatId}`)

        const [chat, chatErr] = await this.getChat(userId, chatId)
        if (chatErr) {
            logger.error('addMessage', `Failed to get chat ${chatId}`, chatErr)
            return [null as any, chatErr]
        }

        const newMessage: ChatMessage = {
            id: uuidv4(),
            content,
            senderId: from == "USER" ? userId : from == "ASSISTANT" ? 'VI' : "SYSTEM",
            timestamp: Date.now(),
            role: from
        }

        chat.messages.push(newMessage)
        chat.updatedAt = Date.now()

        const chatFilePath = path.join(this.baseDir, userId, 'chats', `${chatId}.json`)
        const [saved, saveErr] = await saveJsonToFile(chatFilePath, chat)
        
        if (!saved) {
            logger.error('addMessage', `Failed to save message to chat ${chatId}`, saveErr)
            return [null as any, saveErr]
        }

        logger.success('addMessage', `Message ${newMessage.id} added to chat ${chatId}`)
        logger.perf('addMessage', 'Message addition', startTime)
        return [newMessage, null]
    }

    async generateResponse(userId: string, chatId: string): Promise<[ChatMessage, Error | null]> {
        const startTime = Date.now()
        logger.debug('generateResponse', `Generating AI response for chat ${chatId}`)

        const [chatData, chatErr] = await this.getChat(userId, chatId)
        if (chatErr) {
            logger.error('generateResponse', `Failed to get chat ${chatId}`, chatErr)
            return [null as any, chatErr]
        }

        const history = new ChatHistory()
        chatData.messages.forEach(msg => {
            history.msgs.push({
                id: msg.id,
                senderId: msg.senderId,
                content: msg.content,
                timestamp: msg.timestamp,
                role: msg.role === 'USER' ? 'USER' : 'ASSISTANT',
            })
        })

        logger.debug('generateResponse', `Sending request to AI with ${history.msgs.length} messages`)
        const [aiResponse, error] = await chat(history.msgs[history.msgs.length - 1].content)
        if (error || !aiResponse) {
            const err = new Error(error || 'Failed to generate response')
            logger.error('generateResponse', 'AI response generation failed', err)
            return [null as any, err]
        }

        const responseMessage: ChatMessage = {
            id: uuidv4(),
            senderId: 'SYSTEM',
            content: aiResponse.content,
            timestamp: Date.now(),
            role: 'ASSISTANT'
        }

        chatData.messages.push(responseMessage)
        chatData.updatedAt = Date.now()

        const chatFilePath = path.join(this.baseDir, userId, 'chats', `${chatId}.json`)
        const [saved, saveErr] = await saveJsonToFile(chatFilePath, chatData)
        
        if (saveErr) {
            logger.error('generateResponse', `Failed to save AI response to chat ${chatId}`, saveErr)
        } else {
            logger.success('generateResponse', `AI response ${responseMessage.id} added to chat ${chatId}`)
        }

        logger.perf('generateResponse', 'AI response generation and save', startTime)
        return [responseMessage, saveErr]
    }

    async getUserChats(userId: string): Promise<[Chat[], Error | null]> {
        const startTime = Date.now()
        logger.debug('getUserChats', `Retrieving all chats for user ${userId}`)

        const [user, authErr] = await this.authenticateUser(userId)
        if (authErr) {
            logger.error('getUserChats', `Authentication failed for ${userId}`, authErr)
            return [null as any, authErr]
        }

        const chats: Chat[] = []
        for (const chatId of user.chats) {
            const [chat, err] = await this.getChat(userId, chatId)
            if (!err) {
                chats.push(chat)
            } else {
                logger.warn('getUserChats', `Failed to retrieve chat ${chatId}`)
            }
        }

        logger.success('getUserChats', `Retrieved ${chats.length} chats for user ${userId}`)
        logger.perf('getUserChats', 'Chats retrieval', startTime)
        return [chats, null]
    }
}
