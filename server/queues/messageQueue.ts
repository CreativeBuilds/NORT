import Queue from 'bull';
import { sendSSEEvent } from '../utils/sse';
import { createMessage, getParticipantById, getConversationMessages } from '../db';
import { ChatService } from '../services/chat.service';
import { DatabaseMessage } from '../classes/chat';

// Initialize queue
const messageQueue = new Queue('message-processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
  }
});

// Process LLM response generation
messageQueue.process('process-llm-response', async (job) => {
  const { conversationId, messageId, participantId } = job.data;
  
  try {
    // Get LLM participant info
    const [participant, participantError] = await getParticipantById(participantId);
    if (participantError || !participant) throw new Error('Failed to get participant');

    // Get conversation history
    const [messages, messagesError] = await getConversationMessages(conversationId);
    if (messagesError || !messages) throw new Error('Failed to fetch conversation history');

    // Cast messages to DatabaseMessage type since they include participant info
    const databaseMessages = messages as DatabaseMessage[];

    // Send typing started event
    sendSSEEvent(conversationId, {
      type: 'typing_started',
      data: { 
        participant_id: participantId,
        participant_type: participant.type
      }
    });

    // Generate LLM response
    const [response, error] = await ChatService.generateResponse(
      databaseMessages,
      participant.metadata?.system_prompt
    );
    
    if (error || !response) throw error || new Error('Failed to generate response');

    // Create response message
    const [message, messageError] = await createMessage(
      conversationId,
      participantId,
      response,
      messageId
    );

    if (messageError || !message) throw new Error('Failed to create response message');

    // Send message added event with full participant info
    sendSSEEvent(conversationId, {
      type: 'message_added',
      data: { 
        message: {
          ...message,
          participant_type: participant.type,
          participant_name: participant.name,
          participant_metadata: participant.metadata
        }
      }
    });

    // Send typing stopped event
    sendSSEEvent(conversationId, {
      type: 'typing_stopped',
      data: { 
        participant_id: participantId,
        participant_type: participant.type
      }
    });

    return message;
  } catch (error) {
    // Send error event
    sendSSEEvent(conversationId, {
      type: 'error',
      data: { 
        error: (error as Error).message,
        participant_id: participantId
      }
    });
    throw error;
  }
});

// Handle failed jobs
messageQueue.on('failed', (job, error) => {
  console.error(`Job ${job.id} failed:`, error);
});

export default messageQueue; 