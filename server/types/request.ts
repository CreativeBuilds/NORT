import { Request } from 'express'

export interface AuthenticatedRequest extends Request {
	user?: {
		id: number;
		username: string;
		created_at: string;
	};
	participant?: {
		id: number;
		name: string;
		type: 'user' | 'llm';
		user_id?: number;
		metadata?: Record<string, any>;
		created_at: string;
	};
	conversationAccess?: {
		canRead: boolean;
		canWrite: boolean;
	};
}
