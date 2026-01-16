import type { Conversation, TranscriptSegment, AITipPayload, CoachingState } from '../types';
/**
 * Conversation Service
 *
 * Manages active conversations in memory (no database for MVP)
 * Tracks transcript history and conversation state
 * Manages event-driven coaching state machine
 */
export declare class ConversationService {
    private conversations;
    private recommendations;
    /**
     * Start a new conversation
     */
    startConversation(agentId: string, metadata?: Record<string, any>): Conversation;
    /**
     * Add transcript to conversation
     */
    addTranscript(conversationId: string, transcript: TranscriptSegment): boolean;
    /**
     * Get conversation by ID
     */
    getConversation(conversationId: string): Conversation | undefined;
    /**
     * Get transcript history for conversation
     */
    getTranscriptHistory(conversationId: string): TranscriptSegment[];
    /**
     * End conversation
     */
    endConversation(conversationId: string): boolean;
    /**
     * Update last analysis time (for periodic tip generation)
     */
    updateLastAnalysisTime(conversationId: string): boolean;
    /**
     * Get all active conversations
     */
    getActiveConversations(): Conversation[];
    /**
     * Store a recommendation for later retrieval
     */
    storeRecommendation(recommendation: AITipPayload): void;
    /**
     * Get a recommendation by ID
     */
    getRecommendation(recommendationId: string): AITipPayload | undefined;
    /**
     * Update conversation state
     */
    updateState(conversationId: string, state: CoachingState): boolean;
    /**
     * Store selected script context in conversation
     */
    storeSelectedScript(conversationId: string, recommendationId: string, _selectedOption: 1 | 2 | 3, // Not currently used but kept for API compatibility
    scriptText: string, scriptType: string): boolean;
    /**
     * Append agent response to conversation
     */
    appendAgentResponse(conversationId: string, text: string): boolean;
    /**
     * Append customer reaction to conversation
     */
    appendCustomerReaction(conversationId: string, text: string): boolean;
    /**
     * Reset response capture state (after generating next tip)
     */
    resetResponseCapture(conversationId: string): boolean;
}
//# sourceMappingURL=conversation.service.d.ts.map