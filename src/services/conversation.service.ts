import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import type { Conversation, TranscriptSegment, AITipPayload, CoachingState } from '../types';

const logger = createLogger('conversation');

/**
 * Conversation Service
 *
 * Manages active conversations in memory (no database for MVP)
 * Tracks transcript history and conversation state
 * Manages event-driven coaching state machine
 */
export class ConversationService {
  private conversations: Map<string, Conversation> = new Map();
  private recommendations: Map<string, AITipPayload> = new Map(); // Store recommendations by ID

  /**
   * Start a new conversation
   */
  startConversation(agentId: string, metadata?: Record<string, any>): Conversation {
    const conversation: Conversation = {
      id: uuidv4(),
      agentId,
      startTime: Date.now(),
      metadata: metadata || {},
      transcriptHistory: [],
      state: 'IDLE', // Initialize coaching state machine
    };

    this.conversations.set(conversation.id, conversation);
    logger.info('Conversation started', {
      conversationId: conversation.id,
      agentId,
    });

    return conversation;
  }

  /**
   * Add transcript to conversation
   */
  addTranscript(conversationId: string, transcript: TranscriptSegment): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      logger.warn('Conversation not found', { conversationId });
      return false;
    }

    conversation.transcriptHistory.push(transcript);

    // Keep last 50 transcripts to manage memory
    if (conversation.transcriptHistory.length > 50) {
      conversation.transcriptHistory = conversation.transcriptHistory.slice(-50);
    }

    return true;
  }

  /**
   * Get conversation by ID
   */
  getConversation(conversationId: string): Conversation | undefined {
    return this.conversations.get(conversationId);
  }

  /**
   * Get transcript history for conversation
   */
  getTranscriptHistory(conversationId: string): TranscriptSegment[] {
    const conversation = this.conversations.get(conversationId);
    return conversation?.transcriptHistory || [];
  }

  /**
   * End conversation
   */
  endConversation(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      logger.warn('Conversation not found', { conversationId });
      return false;
    }

    conversation.endTime = Date.now();
    logger.info('Conversation ended', {
      conversationId,
      duration: conversation.endTime - conversation.startTime,
      transcriptCount: conversation.transcriptHistory.length,
    });

    // Remove from memory after 5 minutes (cleanup)
    setTimeout(() => {
      this.conversations.delete(conversationId);
      logger.info('Conversation cleaned up from memory', { conversationId });
    }, 5 * 60 * 1000);

    return true;
  }

  /**
   * Update last analysis time (for periodic tip generation)
   */
  updateLastAnalysisTime(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return false;
    }

    conversation.lastAnalysisTime = Date.now();
    return true;
  }

  /**
   * Get all active conversations
   */
  getActiveConversations(): Conversation[] {
    return Array.from(this.conversations.values()).filter((c) => !c.endTime);
  }

  /**
   * Store a recommendation for later retrieval
   */
  storeRecommendation(recommendation: AITipPayload): void {
    this.recommendations.set(recommendation.recommendationId, recommendation);
    logger.info('Recommendation stored', {
      recommendationId: recommendation.recommendationId,
      conversationId: recommendation.conversationId,
    });

    // Clean up old recommendations (keep last 100)
    if (this.recommendations.size > 100) {
      const keys = Array.from(this.recommendations.keys());
      const toDelete = keys.slice(0, keys.length - 100);
      toDelete.forEach((key) => this.recommendations.delete(key));
    }
  }

  /**
   * Get a recommendation by ID
   */
  getRecommendation(recommendationId: string): AITipPayload | undefined {
    return this.recommendations.get(recommendationId);
  }

  /**
   * Update conversation state
   */
  updateState(conversationId: string, state: CoachingState): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      logger.warn('Conversation not found', { conversationId });
      return false;
    }

    conversation.state = state;
    logger.info('Conversation state updated', { conversationId, state });
    return true;
  }

  /**
   * Store selected script context in conversation
   */
  storeSelectedScript(
    conversationId: string,
    recommendationId: string,
    _selectedOption: 1 | 2 | 3, // Not currently used but kept for API compatibility
    scriptText: string,
    scriptType: string
  ): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      logger.warn('Conversation not found', { conversationId });
      return false;
    }

    conversation.lastSelectedRecommendationId = recommendationId;
    conversation.lastSelectedScript = scriptText;
    conversation.lastScriptType = scriptType;
    conversation.lastScriptTimestamp = Date.now();
    conversation.state = 'CAPTURING_AGENT_RESPONSE';

    // Reset captured responses
    conversation.capturedResponse = '';
    conversation.customerReaction = '';

    logger.info('Selected script stored', {
      conversationId,
      scriptType,
      scriptLength: scriptText.length,
    });

    return true;
  }

  /**
   * Append agent response to conversation
   */
  appendAgentResponse(conversationId: string, text: string): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return false;
    }

    if (!conversation.capturedResponse) {
      conversation.capturedResponse = text;
      conversation.responseTimestamp = Date.now();
    } else {
      conversation.capturedResponse += ' ' + text;
    }

    return true;
  }

  /**
   * Append customer reaction to conversation
   */
  appendCustomerReaction(conversationId: string, text: string): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return false;
    }

    if (!conversation.customerReaction) {
      conversation.customerReaction = text;
      conversation.reactionTimestamp = Date.now();
    } else {
      conversation.customerReaction += ' ' + text;
    }

    return true;
  }

  /**
   * Reset response capture state (after generating next tip)
   */
  resetResponseCapture(conversationId: string): boolean {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return false;
    }

    conversation.capturedResponse = '';
    conversation.customerReaction = '';
    conversation.state = 'DISPLAYING_TIP';

    return true;
  }
}
