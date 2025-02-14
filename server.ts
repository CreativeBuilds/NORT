import { ChatAPI } from './classes/api'
import dotenv from 'dotenv'
import morgan from 'morgan'
import chalk from 'chalk'

// Load environment variables
dotenv.config()

// Custom logging utility
const log = {
    info: (message: string) => console.log(chalk.blue(`[INFO] ${message}`)),
    success: (message: string) => console.log(chalk.green(`[SUCCESS] ${message}`)),
    warn: (message: string) => console.log(chalk.yellow(`[WARN] ${message}`)),
    error: (message: string) => console.log(chalk.red(`[ERROR] ${message}`)),
    debug: (message: string) => process.env.NODE_ENV === 'development' && console.log(chalk.gray(`[DEBUG] ${message}`))
}

// Validate required environment variables
const requiredEnvVars = ['OPENROUTER_API_KEY']
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar])

if (missingEnvVars.length > 0) {
    log.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`)
    process.exit(1)
}

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000
const isDev = process.env.NODE_ENV === 'development'

// Create and start the API server
const api = new ChatAPI()

// Add verbose request logging
api.app.use(morgan((tokens, req, res) => {
    const status = parseInt(tokens.status(req, res) || '0')
    const statusColor = status >= 500 ? chalk.red(status)
        : status >= 400 ? chalk.yellow(status)
        : status >= 300 ? chalk.cyan(status)
        : status >= 200 ? chalk.green(status)
        : chalk.gray(status)

    return [
        chalk.gray(tokens.date(req, res)),
        chalk.magenta(tokens.method(req, res)),
        chalk.cyan(tokens['url'](req, res)),
        statusColor,
        chalk.yellow(tokens['response-time'](req, res) + 'ms'),
        chalk.gray('- ' + tokens['user-agent'](req, res))
    ].join(' ')
}))

// Add request body logging in development
if (isDev) {
    api.app.use((req, res, next) => {
        if (req.body && Object.keys(req.body).length > 0) {
            log.debug(`Request Body: ${JSON.stringify(req.body, null, 2)}`)
        }
        next()
    })
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    log.info('SIGTERM received. Shutting down gracefully...')
    process.exit(0)
})

process.on('SIGINT', () => {
    log.info('SIGINT received. Shutting down gracefully...')
    process.exit(0)
})

// Error handling
process.on('uncaughtException', (error) => {
    log.error(`Uncaught Exception: ${error.message}`)
    log.debug(error.stack || 'No stack trace available')
    process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
    log.error(`Unhandled Rejection at: ${promise}`)
    log.debug(`Reason: ${reason}`)
})

// Start the server
try {
    api.start(PORT)
    log.success(`
🚀 Chat API Server is running!

Server Information:
------------------
${chalk.cyan('Port:')} ${PORT}
${chalk.cyan('Environment:')} ${process.env.NODE_ENV || 'development'}
${chalk.cyan('Base URL:')} http://localhost:${PORT}
${chalk.cyan('Logging:')} ${isDev ? 'Verbose (Development)' : 'Basic (Production)'}

Available Endpoints:
------------------
${chalk.green('POST')}   /auth                      - Authenticate user
${chalk.green('POST')}   /chats/:chatId?/messages   - Send message (creates new chat if no chatId)
${chalk.green('GET')}    /chats/:chatId            - Get chat history
${chalk.green('GET')}    /users/:userId/chats      - Get user's chats

${chalk.gray('For detailed API documentation, see example.md')}
`)
} catch (error) {
    log.error('Failed to start server:')
    log.debug(error instanceof Error ? error.stack || error.message : String(error))
    process.exit(1)
} 