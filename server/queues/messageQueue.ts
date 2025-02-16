import Queue from 'bull';
import { sendSSEEvent } from '../utils/sse';
import { createMessage, getParticipantById, getConversationMessages, getConversation } from '../db';
import { ChatService } from '../services/chat.service';
import { DatabaseMessage } from '../classes/chat';

// Track active generations by participant ID
const activeGenerations = new Map<number, AbortController>();

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
    // Cancel any existing generation for this participant
    const existingController = activeGenerations.get(participantId);
    if (existingController) {
      existingController.abort();
      activeGenerations.delete(participantId);
    }

    // Create new abort controller for this generation
    const controller = new AbortController();
    activeGenerations.set(participantId, controller);

    // Get LLM participant info
    const [participant, participantError] = await getParticipantById(participantId);
    if (participantError || !participant) throw new Error('Failed to get participant');

    // Verify this participant belongs in this conversation
    const [conversation, conversationError] = await getConversation(conversationId);
    if (conversationError || !conversation) throw new Error('Conversation not found');

    // Get conversation history
    const [messages, messagesError] = await getConversationMessages(conversationId);
    if (messagesError || !messages) throw new Error('Failed to fetch conversation history');

    // Verify the message we're responding to exists in this conversation
    const parentMessage = messages.find(m => m.id === messageId);
    if (!parentMessage) throw new Error('Parent message not found in conversation');

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
      participant.metadata?.system_prompt,
      participantId,
      controller // Pass the controller to the generate function
    );
    
    // Remove the controller from active generations
    activeGenerations.delete(participantId);
    
    if (error || !response) {
      // Send typing stopped and fail silently
      sendSSEEvent(conversationId, {
        type: 'typing_stopped',
        data: { 
          participant_id: participantId,
          participant_type: participant.type
        }
      });
      throw error || new Error('Failed to generate response');
    }

    // Create response message
    const [message, messageError] = await createMessage(
      conversationId,
      participantId,
      response.content,
      messageId
    );

    if (messageError || !message) throw new Error('Failed to create response message');

    // If this was targeted at another agent, check if it's an AI and queue their response
    if (response.targetId !== participantId) {
      const [targetParticipant] = await getParticipantById(response.targetId);
      if (targetParticipant?.type === 'llm') {
        await messageQueue.add('process-llm-response', {
          conversationId,
          messageId: message.id,
          participantId: response.targetId
        });
      }
    }

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
    // Remove the controller from active generations on error
    activeGenerations.delete(participantId);
    // Just throw without sending any events
    throw error;
  }
});

// Handle failed jobs
messageQueue.on('failed', (job, error) => {
  console.error(`Job ${job.id} failed:`, error);
});

// Export for use in other files
export { activeGenerations };

export default messageQueue; 