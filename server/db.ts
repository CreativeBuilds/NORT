import { Database } from 'bun:sqlite';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import crypto from 'crypto';

// Ensure data directory exists
const DATA_DIR = join(import.meta.dir, '/../data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR);

const db = new Database(join(DATA_DIR, 'nort.db'));

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Migration: Add private column to participants table if it doesn't exist
const tableInfo = db.prepare('PRAGMA table_info(participants)').all() as { name: string }[];

// Check for each column and add if missing
const hasPrivateColumn = tableInfo.some(column => column.name === 'private');
const hasDescriptionColumn = tableInfo.some(column => column.name === 'description');
const hasIsDefaultColumn = tableInfo.some(column => column.name === 'is_default');

if (!hasPrivateColumn) {
  try {
    db.run('ALTER TABLE participants ADD COLUMN private BOOLEAN DEFAULT 1');
    console.log('Added private column to participants table');
  } catch (error) {
    console.log('Private column already exists or could not be added:', error);
  }
}

if (!hasDescriptionColumn) {
  try {
    db.run('ALTER TABLE participants ADD COLUMN description TEXT');
    console.log('Added description column to participants table');
  } catch (error) {
    console.log('Description column already exists or could not be added:', error);
  }
}

if (!hasIsDefaultColumn) {
  try {
    db.run('ALTER TABLE participants ADD COLUMN is_default BOOLEAN DEFAULT 0');
    console.log('Added is_default column to participants table');
  } catch (error) {
    console.log('is_default column already exists or could not be added:', error);
  }
}

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
    private BOOLEAN DEFAULT 1,
    description TEXT,
    is_default BOOLEAN DEFAULT 0,
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
  private: boolean;
  description?: string;
  is_default: boolean;
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

export function createParticipant(
  name: string, 
  type: ParticipantType, 
  userId?: number, 
  metadata?: Record<string, any>,
  isPrivate: boolean = true,
  description?: string,
  isDefault: boolean = false
): [Participant | null, Error | null] {
  try {
    // If this is a default user persona, unset any existing defaults for this user
    if (isDefault && type === 'user' && userId) {
      db.prepare('UPDATE participants SET is_default = 0 WHERE user_id = ? AND type = "user"').run(userId);
    }

    const stmt = db.prepare(`
      INSERT INTO participants (
        name, 
        type, 
        user_id, 
        metadata, 
        private,
        description,
        is_default
      ) VALUES (?, ?, ?, ?, ?, ?, ?) 
      RETURNING *
    `);

    const participant = stmt.get(
      name, 
      type, 
      userId || null, 
      metadata ? JSON.stringify(metadata) : null, 
      isPrivate ? 1 : 0,
      description || null,
      isDefault ? 1 : 0
    ) as Participant;

    return [participant, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export function getParticipantByUserId(userId: number): [Participant | null, Error | null] {
  try {
    const stmt = db.prepare(`
      SELECT 
        id,
        name,
        type,
        user_id,
        metadata,
        COALESCE(private, 1) as private,
        created_at
      FROM participants 
      WHERE user_id = ? AND type = "user" 
      LIMIT 1
    `);
    const participant = stmt.get(userId) as Participant | null;
    
    if (!participant) return [null, null];

    return [{
      ...participant,
      metadata: typeof participant.metadata === 'string' ? JSON.parse(participant.metadata) : participant.metadata,
      private: Boolean(participant.private)
    }, null];
  } catch (error) {
    console.error('Error in getParticipantByUserId:', error);
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
      participant_metadata: typeof msg.participant_metadata === 'string' ? JSON.parse(msg.participant_metadata) : msg.participant_metadata,
      metadata: typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata
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

    // Copy only messages with public participants or owned by the user
    const copyStmt = db.prepare(`
      INSERT INTO messages (conversation_id, participant_id, parent_id, content, metadata)
      SELECT ?, m.participant_id, m.parent_id, m.content, m.metadata
      FROM messages m
      JOIN participants p ON p.id = m.participant_id
      WHERE m.conversation_id = ?
      AND (p.type = 'user' OR (p.type = 'llm' AND (COALESCE(p.private, 1) = 0 OR p.user_id = ?)))
    `);
    
    copyStmt.run(forkedConversation.id, conversationId, userId);
    
    return [forkedConversation, null];
  } catch (error) {
    console.error('Error in forkConversation:', error);
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

export function getLLMParticipants(userId?: number): [Participant[] | null, Error | null] {
  try {
    const stmt = db.prepare(`
      SELECT 
        id,
        name,
        type,
        user_id,
        metadata,
        COALESCE(private, 1) as private,
        created_at
      FROM participants 
      WHERE type = "llm" 
      AND (COALESCE(private, 1) = 0 OR user_id = ?)
      ORDER BY name ASC
    `);
    const participants = stmt.all(userId || null) as Participant[];
    
    return [participants.map(p => ({
      ...p,
      metadata: typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata,
      private: Boolean(p.private) // Ensure private is always a boolean
    })), null];
  } catch (error) {
    console.error('Error in getLLMParticipants:', error);
    return [null, error as Error];
  }
}

export function getParticipantById(id: number): [Participant | null, Error | null] {
  try {
    const stmt = db.prepare(`
      SELECT 
        id,
        name,
        type,
        user_id,
        metadata,
        COALESCE(private, 1) as private,
        created_at
      FROM participants 
      WHERE id = ?
    `);
    const participant = stmt.get(id) as Participant | null;
    
    if (!participant) return [null, null];
    
    return [{
      ...participant,
      metadata: typeof participant.metadata === 'string' ? JSON.parse(participant.metadata) : participant.metadata,
      private: Boolean(participant.private) // Ensure private is always a boolean
    }, null];
  } catch (error) {
    console.error('Error in getParticipantById:', error);
    return [null, error as Error];
  }
}

export function getConversationMessagesAfter(conversationId: number, lastMessageId: number): [Message[] | null, Error | null] {
    try {
        const messages = db.prepare(`
            SELECT 
              m.*,
              p.type as participant_type,
              p.metadata as participant_metadata,
              COALESCE(p.private, 1) as participant_private
            FROM messages m
            JOIN participants p ON m.participant_id = p.id
            WHERE m.conversation_id = ? AND m.id > ?
            ORDER BY m.created_at ASC
        `).all(conversationId, lastMessageId) as (Message & { 
          participant_type: string;
          participant_metadata: string;
          participant_private: number;
        })[];

        return [messages.map(m => ({
          ...m,
          participant_metadata: typeof m.participant_metadata === 'string' ? 
            JSON.parse(m.participant_metadata) : m.participant_metadata,
          participant_private: Boolean(m.participant_private)
        })), null];
    } catch (error) {
        console.error('Error in getConversationMessagesAfter:', error);
        return [null, error as Error];
    }
}

export function setParticipantPrivacy(participantId: number, isPrivate: boolean): [boolean, Error | null] {
  try {
    const stmt = db.prepare('UPDATE participants SET private = ? WHERE id = ? AND type = "llm"');
    const result = stmt.run(isPrivate ? 1 : 0, participantId);
    return [result.changes > 0, null];
  } catch (error) {
    return [false, error as Error];
  }
}

export function cloneParticipant(participantId: number, userId: number): [Participant | null, Error | null] {
  try {
    const sourceStmt = db.prepare(`
      SELECT 
        id,
        name,
        type,
        user_id,
        metadata,
        COALESCE(private, 1) as private,
        created_at
      FROM participants 
      WHERE id = ? AND type = "llm"
    `);
    const source = sourceStmt.get(participantId) as Participant;
    
    if (!source) return [null, new Error('Participant not found or not an LLM')];
    
    const [newParticipant, err] = createParticipant(
      `${source.name} (clone)`,
      'llm',
      userId,
      typeof source.metadata === 'string' ? JSON.parse(source.metadata) : source.metadata
    );

    return [newParticipant, err];
  } catch (error) {
    console.error('Error in cloneParticipant:', error);
    return [null, error as Error];
  }
}

// Add a function to get all participants for a conversation
export function getConversationParticipants(conversationId: number, userId: number): [Participant[] | null, Error | null] {
  try {
    const stmt = db.prepare(`
      SELECT DISTINCT
        p.id,
        p.name,
        p.type,
        p.user_id,
        p.metadata,
        COALESCE(p.private, 1) as private,
        p.created_at
      FROM participants p
      JOIN messages m ON m.participant_id = p.id
      WHERE m.conversation_id = ?
      AND (p.type = 'user' OR (p.type = 'llm' AND (COALESCE(p.private, 1) = 0 OR p.user_id = ?)))
      ORDER BY p.name ASC
    `);
    
    const participants = stmt.all(conversationId, userId) as Participant[];
    
    return [participants.map(p => ({
      ...p,
      metadata: typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata,
      private: Boolean(p.private)
    })), null];
  } catch (error) {
    console.error('Error in getConversationParticipants:', error);
    return [null, error as Error];
  }
}

// Add function to get user personas
export function getUserPersonas(userId: number): [Participant[] | null, Error | null] {
  try {
    const stmt = db.prepare(`
      SELECT 
        id,
        name,
        type,
        user_id,
        metadata,
        COALESCE(private, 1) as private,
        description,
        is_default,
        created_at
      FROM participants 
      WHERE user_id = ? AND type = "user"
      ORDER BY is_default DESC, name ASC
    `);
    
    const participants = stmt.all(userId) as Participant[];
    
    return [participants.map(p => ({
      ...p,
      metadata: typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata,
      private: Boolean(p.private),
      is_default: Boolean(p.is_default)
    })), null];
  } catch (error) {
    console.error('Error in getUserPersonas:', error);
    return [null, error as Error];
  }
}

// Add function to get current active persona
export function getCurrentPersona(userId: number): [Participant | null, Error | null] {
  try {
    const stmt = db.prepare(`
      SELECT 
        id,
        name,
        type,
        user_id,
        metadata,
        COALESCE(private, 1) as private,
        description,
        is_default,
        created_at
      FROM participants 
      WHERE user_id = ? AND type = "user" AND is_default = 1
      LIMIT 1
    `);
    
    const participant = stmt.get(userId) as Participant | null;
    
    if (!participant) return [null, null];
    
    return [{
      ...participant,
      metadata: typeof participant.metadata === 'string' ? JSON.parse(participant.metadata) : participant.metadata,
      private: Boolean(participant.private),
      is_default: Boolean(participant.is_default)
    }, null];
  } catch (error) {
    console.error('Error in getCurrentPersona:', error);
    return [null, error as Error];
  }
}

// Add function to set active persona
export function setDefaultPersona(userId: number, personaId: number): [boolean, Error | null] {
  try {
    // First verify the persona belongs to the user
    const verifyStmt = db.prepare('SELECT id FROM participants WHERE id = ? AND user_id = ? AND type = "user"');
    const persona = verifyStmt.get(personaId, userId);
    
    if (!persona) return [false, new Error('Persona not found or not owned by user')];
    
    // Unset any existing defaults
    db.prepare('UPDATE participants SET is_default = 0 WHERE user_id = ? AND type = "user"').run(userId);
    
    // Set the new default
    const stmt = db.prepare('UPDATE participants SET is_default = 1 WHERE id = ?');
    const result = stmt.run(personaId);
    
    return [result.changes > 0, null];
  } catch (error) {
    console.error('Error in setDefaultPersona:', error);
    return [false, error as Error];
  }
}

export function deleteMessage(messageId: number, userId: number): [boolean, Error | null] {
  try {
    // First verify the user owns the conversation this message is in
    const [message, messageError] = getMessageById(messageId);
    if (messageError || !message) return [false, new Error('Message not found')];

    const [conversation, conversationError] = getConversation(message.conversation_id);
    if (conversationError || !conversation) return [false, new Error('Conversation not found')];

    // Verify ownership
    if (conversation.created_by_user_id !== userId) {
      return [false, new Error('Not authorized to delete this message')];
    }

    // Delete the message
    const result = db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
    return [result.changes > 0, null];
  } catch (error) {
    return [false, error as Error];
  }
}

export function getMessageById(messageId: number): [Message | null, Error | null] {
  try {
    const stmt = db.prepare(`
      SELECT * FROM messages WHERE id = ?
    `);
    const message = stmt.get(messageId) as Message | null;
    return [message, null];
  } catch (error) {
    return [null, error as Error];
  }
}

export default db; 