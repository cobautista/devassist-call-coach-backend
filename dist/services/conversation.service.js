"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationService = void 0;
const uuid_1 = require("uuid");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('conversation');
/**
 * Conversation Service
 *
 * Manages active conversations in memory (no database for MVP)
 * Tracks transcript history and conversation state
 * Manages event-driven coaching state machine
 */
class ConversationService {
    conversations = new Map();
    recommendations = new Map(); // Store recommendations by ID
    /**
     * Start a new conversation
     */
    startConversation(agentId, metadata) {
        const conversation = {
            id: (0, uuid_1.v4)(),
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
    addTranscript(conversationId, transcript) {
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
    getConversation(conversationId) {
        return this.conversations.get(conversationId);
    }
    /**
     * Get transcript history for conversation
     */
    getTranscriptHistory(conversationId) {
        const conversation = this.conversations.get(conversationId);
        return conversation?.transcriptHistory || [];
    }
    /**
     * End conversation
     */
    endConversation(conversationId) {
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
    updateLastAnalysisTime(conversationId) {
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
    getActiveConversations() {
        return Array.from(this.conversations.values()).filter((c) => !c.endTime);
    }
    /**
     * Store a recommendation for later retrieval
     */
    storeRecommendation(recommendation) {
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
    getRecommendation(recommendationId) {
        return this.recommendations.get(recommendationId);
    }
    /**
     * Update conversation state
     */
    updateState(conversationId, state) {
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
    storeSelectedScript(conversationId, recommendationId, _selectedOption, // Not currently used but kept for API compatibility
    scriptText, scriptType) {
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
    appendAgentResponse(conversationId, text) {
        const conversation = this.conversations.get(conversationId);
        if (!conversation) {
            return false;
        }
        if (!conversation.capturedResponse) {
            conversation.capturedResponse = text;
            conversation.responseTimestamp = Date.now();
        }
        else {
            conversation.capturedResponse += ' ' + text;
        }
        return true;
    }
    /**
     * Append customer reaction to conversation
     */
    appendCustomerReaction(conversationId, text) {
        const conversation = this.conversations.get(conversationId);
        if (!conversation) {
            return false;
        }
        if (!conversation.customerReaction) {
            conversation.customerReaction = text;
            conversation.reactionTimestamp = Date.now();
        }
        else {
            conversation.customerReaction += ' ' + text;
        }
        return true;
    }
    /**
     * Reset response capture state (after generating next tip)
     */
    resetResponseCapture(conversationId) {
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
exports.ConversationService = ConversationService;
//# sourceMappingURL=conversation.service.js.map