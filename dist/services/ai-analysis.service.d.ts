import type { AITipPayload, TranscriptSegment, RequestNextTipPayload } from '../types';
/**
 * AI Analysis Service
 *
 * Handles OpenAI GPT-4o-mini integration for generating coaching tips
 * Supports both:
 * - Auto mode: Generate tips every 30 seconds based on recent transcripts
 * - Event-driven mode: Generate contextual tips based on actual conversation flow
 */
export declare class AIAnalysisService {
    private openai;
    constructor();
    /**
     * Generate first greeting tip (fast, low-context)
     * Used after 3-minute warmup or in auto mode
     */
    generateGreetingTip(conversationId: string, transcriptHistory: TranscriptSegment[]): Promise<AITipPayload>;
    /**
     * Generate contextual next tip (event-driven mode)
     * Analyzes what agent actually said vs suggested script
     * Considers customer reaction to adapt coaching
     */
    generateContextualTip(payload: RequestNextTipPayload): Promise<AITipPayload>;
    /**
     * Build greeting prompt (simple context)
     */
    private buildGreetingPrompt;
    /**
     * Build contextual prompt (enhanced with actual conversation flow)
     */
    private buildContextualPrompt;
    /**
     * Generate periodic tip (auto mode - every 30 seconds)
     */
    generatePeriodicTip(conversationId: string, transcriptHistory: TranscriptSegment[]): Promise<AITipPayload>;
    /**
     * Clean JSON response from AI (remove markdown code blocks, extra whitespace, etc.)
     */
    private cleanJsonResponse;
}
//# sourceMappingURL=ai-analysis.service.d.ts.map