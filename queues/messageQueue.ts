import Queue from 'bull';
import { sendSSEEvent } from '../server';
import { createMessage, getParticipantById } from '../db';

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

    // Send typing started event
    sendSSEEvent(conversationId, {
      type: 'typing_started',
      data: { participant_id: participantId }
    });

    // TODO: Implement actual LLM response generation
    // This is where you'd integrate with OpenAI or other LLM providers
    const response = "Sample LLM response"; // Replace with actual LLM integration

    // Create response message
    const [message, messageError] = await createMessage(
      conversationId,
      participantId,
      response,
      messageId
    );

    if (messageError || !message) throw new Error('Failed to create response message');

    // Send message added event
    sendSSEEvent(conversationId, {
      type: 'message_added',
      data: { message }
    });

    // Send typing stopped event
    sendSSEEvent(conversationId, {
      type: 'typing_stopped',
      data: { participant_id: participantId }
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