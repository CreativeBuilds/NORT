import { Database } from 'bun:sqlite';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import crypto from 'crypto';

// Ensure data directory exists
const DATA_DIR = join(import.meta.dir, 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR);

const db = new Database(join(DATA_DIR, 'nschat.db'));

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Create users table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create auth_tokens table if it doesn't exist
db.run(`
  CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Create participants table to track both users and LLMs
db.run(`
  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('user', 'llm')),
    user_id INTEGER,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Create conversations table (replaces chats)
db.run(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    created_by_user_id INTEGER NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private', 'shared')),
    forked_from_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Create messages table with tree structure support
db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    participant_id INTEGER NOT NULL,
    parent_id INTEGER,
    content TEXT NOT NULL,
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE CASCADE
  )
`);

// Create conversation_access table for managing shared access
db.run(`
  CREATE TABLE IF NOT EXISTS conversation_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    share_token TEXT UNIQUE,
    access_type TEXT NOT NULL CHECK(access_type IN ('read', 'write')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  )
`);

type User = {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

type AuthToken = {
  id: number;
  user_id: number;
  token: string;
  expires_at: string;
  created_at: string;
}

type ParticipantType = 'user' | 'llm';

type Participant = {
  id: number;
  name: string;
  type: ParticipantType;
  user_id?: number;
  metadata?: Record<string, any>;
  created_at: string;
}

type ConversationVisibility = 'private' | 'shared';
type ConversationAccessType = 'read' | 'write';

interface ConversationAccess {
  id: number;
  conversation_id: number;
  share_token: string;
  access_type: ConversationAccessType;
  created_at: string;
}

type Conversation = {
  id: number;
  title?: string;
  created_by_user_id: number;
  visibility: ConversationVisibility;
  forked_from_id?: number;
  created_at: string;
}

type Message = {
  id: number;
  conversation_id: number;
  participant_id: number;
  parent_id?: number;
  content: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export function createUser(username: string, passwordHash: string): [User | null, Error | null] {
  try {
    const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING *');
    const user = stmt.get(username, passwordHash) as User;
    return [user, null];
  } catch (error) {
    if ((error as Error).message.includes('UNIQUE constraint failed')) 
      return [null, new Error('Username already exists')];
    
    return [null, error as Error];
  }
}

export function getUserByUsername(username: string): [User | null, Error | null] {
  try {
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    const user = stmt.get(username) as User | null;
    return [user, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function createAuthToken(userId: number, token: string, expiresAt: Date): [AuthToken | null, Error | null] {
  try {
    const stmt = db.prepare('INSERT INTO auth_tokens (user_id, token, expires_at) VALUES (?, ?, ?) RETURNING *');
    const authToken = stmt.get(userId, token, expiresAt.toISOString()) as AuthToken;
    return [authToken, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function getValidTokenByValue(token: string): [AuthToken | null, Error | null] {
  try {
    const stmt = db.prepare(`
      SELECT * FROM auth_tokens 
      WHERE token = ? 
      AND expires_at > datetime('now')
      LIMIT 1
    `);
    const authToken = stmt.get(token) as AuthToken | null;
    return [authToken, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function getUserByToken(token: string): [User | null, Error | null] {
  try {
    const stmt = db.prepare(`
      SELECT u.* FROM users u
      INNER JOIN auth_tokens t ON t.user_id = u.id
      WHERE t.token = ?
      AND t.expires_at > datetime('now')
      LIMIT 1
    `);
    const user = stmt.get(token) as User | null;
    return [user, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function deleteExpiredTokens(): [number, Error | null] {
  try {
    const result = db.run("DELETE FROM auth_tokens WHERE expires_at <= datetime('now')");
    return [result.changes, null];
  } catch (error) {
    return [0, error as Error];
  }
}

export function createParticipant(name: string, type: ParticipantType, userId?: number, metadata?: Record<string, any>): [Participant | null, Error | null] {
  try {
    const stmt = db.prepare('INSERT INTO participants (name, type, user_id, metadata) VALUES (?, ?, ?, ?) RETURNING *');
    const participant = stmt.get(name, type, userId || null, metadata ? JSON.stringify(metadata) : null) as Participant;
    return [participant, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function getParticipantByUserId(userId: number): [Participant | null, Error | null] {
  try {
    const stmt = db.prepare('SELECT * FROM participants WHERE user_id = ? AND type = "user" LIMIT 1');
    const participant = stmt.get(userId) as Participant | null;
    return [participant, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function createConversation(userId: number, title?: string): [Conversation | null, Error | null] {
  try {
    const stmt = db.prepare('INSERT INTO conversations (created_by_user_id, title) VALUES (?, ?) RETURNING *');
    const conversation = stmt.get(userId, title || null) as Conversation;
    return [conversation, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function getConversation(id: number): [Conversation | null, Error | null] {
  try {
    const stmt = db.prepare('SELECT * FROM conversations WHERE id = ?');
    const conversation = stmt.get(id) as Conversation | null;
    return [conversation, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function createMessage(
  conversationId: number, 
  participantId: number, 
  content: string,
  parentId?: number,
  metadata?: Record<string, any>
): [Message | null, Error | null] {
  try {
    const stmt = db.prepare(`
      INSERT INTO messages (conversation_id, participant_id, parent_id, content, metadata) 
      VALUES (?, ?, ?, ?, ?) 
      RETURNING *
    `);
    const message = stmt.get(
      conversationId, 
      participantId, 
      parentId || null, 
      content,
      metadata ? JSON.stringify(metadata) : null
    ) as Message;
    return [message, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function getConversationMessages(conversationId: number): [Message[] | null, Error | null] {
  try {
    const stmt = db.prepare(`
      SELECT m.*, p.name as participant_name, p.type as participant_type, p.metadata as participant_metadata
      FROM messages m
      JOIN participants p ON p.id = m.participant_id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
    `);
    const messages = stmt.all(conversationId) as (Message & { 
      participant_name: string;
      participant_type: ParticipantType;
      participant_metadata?: string;
    })[];
    
    // Parse metadata JSON strings
    return [messages.map(msg => ({
      ...msg,
      participant_metadata: msg.participant_metadata ? JSON.parse(msg.participant_metadata as string) : undefined,
      metadata: msg.metadata ? JSON.parse(msg.metadata as string) : undefined
    })), null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function getUserConversations(userId: number): [Conversation[] | null, Error | null] {
  try {
    const stmt = db.prepare(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at ASC LIMIT 1) as first_message
      FROM conversations c
      WHERE c.created_by_user_id = ?
      ORDER BY c.created_at DESC
    `);
    const conversations = stmt.all(userId) as (Conversation & { 
      message_count: number;
      first_message: string;
    })[];
    return [conversations, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function createShareLink(conversationId: number, accessType: ConversationAccessType): [ConversationAccess | null, Error | null] {
  try {
    // First check if conversation exists and user owns it
    const stmt = db.prepare(`
      UPDATE conversations 
      SET visibility = 'shared' 
      WHERE id = ? 
      RETURNING *
    `);
    const conversation = stmt.get(conversationId) as Conversation;
    
    if (!conversation) return [null, new Error('Conversation not found')];

    // Create share token
    const shareToken = crypto.randomBytes(32).toString('hex');
    
    const accessStmt = db.prepare(`
      INSERT INTO conversation_access (conversation_id, share_token, access_type)
      VALUES (?, ?, ?)
      RETURNING *
    `);
    
    const access = accessStmt.get(conversationId, shareToken, accessType) as ConversationAccess;
    return [access, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function getConversationByShareToken(shareToken: string): [{ conversation: Conversation, access: ConversationAccess } | null, Error | null] {
  try {
    const stmt = db.prepare(`
      SELECT c.*, a.access_type, a.id as access_id
      FROM conversations c
      JOIN conversation_access a ON a.conversation_id = c.id
      WHERE a.share_token = ?
    `);
    const result = stmt.get(shareToken) as (Conversation & { access_type: ConversationAccessType, access_id: number }) | null;
    
    if (!result) return [null, new Error('Invalid share token')];
    
    const { access_type, access_id, ...conversation } = result;
    return [{
      conversation,
      access: {
        id: access_id,
        conversation_id: conversation.id,
        share_token: shareToken,
        access_type,
        created_at: conversation.created_at
      }
    }, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function forkConversation(conversationId: number, userId: number, title?: string): [Conversation | null, Error | null] {
  try {
    const stmt = db.prepare(`
      INSERT INTO conversations (
        title, 
        created_by_user_id, 
        visibility,
        forked_from_id
      ) 
      VALUES (?, ?, 'private', ?)
      RETURNING *
    `);
    
    const forkedConversation = stmt.get(
      title || null,
      userId,
      conversationId
    ) as Conversation;

    // Copy all messages from original conversation
    const copyStmt = db.prepare(`
      INSERT INTO messages (conversation_id, participant_id, parent_id, content, metadata)
      SELECT ?, participant_id, parent_id, content, metadata
      FROM messages
      WHERE conversation_id = ?
    `);
    
    copyStmt.run(forkedConversation.id, conversationId);
    
    return [forkedConversation, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function canUserAccessConversation(conversationId: number, userId: number): [{ canRead: boolean, canWrite: boolean } | null, Error | null] {
  try {
    const stmt = db.prepare(`
      SELECT 
        c.created_by_user_id,
        c.visibility,
        a.access_type
      FROM conversations c
      LEFT JOIN conversation_access a ON a.conversation_id = c.id
      WHERE c.id = ?
    `);
    
    const result = stmt.get(conversationId) as {
      created_by_user_id: number;
      visibility: ConversationVisibility;
      access_type?: ConversationAccessType;
    } | null;

    if (!result) return [null, new Error('Conversation not found')];

    // Owner has full access
    if (result.created_by_user_id === userId) {
      return [{ canRead: true, canWrite: true }, null];
    }

    // Private conversations are only accessible by owner
    if (result.visibility === 'private') {
      return [{ canRead: false, canWrite: false }, null];
    }

    // Shared conversations depend on access type
    return [{
      canRead: true,
      canWrite: result.access_type === 'write'
    }, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function getLLMParticipants(): [Participant[] | null, Error | null] {
  try {
    const stmt = db.prepare('SELECT * FROM participants WHERE type = "llm" ORDER BY name ASC');
    const participants = stmt.all() as Participant[];
    
    // Parse metadata JSON strings
    return [participants.map(p => ({
      ...p,
      metadata: p.metadata ? JSON.parse(p.metadata as string) : undefined
    })), null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function getParticipantById(id: number): [Participant | null, Error | null] {
  try {
    const stmt = db.prepare('SELECT * FROM participants WHERE id = ?');
    const participant = stmt.get(id) as Participant | null;
    
    if (!participant) return [null, null];
    
    return [{
      ...participant,
      metadata: participant.metadata ? JSON.parse(participant.metadata as string) : undefined
    }, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export default db; 