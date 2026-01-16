"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIAnalysisService = void 0;
const openai_1 = __importDefault(require("openai"));
const uuid_1 = require("uuid");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('ai-analysis');
/**
 * AI Analysis Service
 *
 * Handles OpenAI GPT-4o-mini integration for generating coaching tips
 * Supports both:
 * - Auto mode: Generate tips every 30 seconds based on recent transcripts
 * - Event-driven mode: Generate contextual tips based on actual conversation flow
 */
class AIAnalysisService {
    openai;
    constructor() {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY environment variable is required');
        }
        this.openai = new openai_1.default({ apiKey });
        logger.info('AI Analysis Service initialized');
    }
    /**
     * Generate first greeting tip (fast, low-context)
     * Used after 3-minute warmup or in auto mode
     */
    async generateGreetingTip(conversationId, transcriptHistory) {
        logger.info('Generating greeting tip', { conversationId, transcriptCount: transcriptHistory.length });
        const prompt = this.buildGreetingPrompt(transcriptHistory);
        const completion = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are an expert sales coach. Generate a greeting recommendation with 3 dialogue options.
Return ONLY valid JSON matching this format:
{
  "heading": "2-word max heading",
  "stage": "GREETING",
  "context": "Brief explanation why this matters",
  "options": [
    { "label": "Professional", "script": "Exact words to say" },
    { "label": "Consultative", "script": "Exact words to say" },
    { "label": "Direct", "script": "Exact words to say" }
  ]
}`,
                },
                { role: 'user', content: prompt },
            ],
            temperature: 0.7,
            max_tokens: 500,
        });
        const content = completion.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No response from OpenAI');
        }
        // Clean and parse JSON (handle markdown code blocks, etc.)
        let parsed;
        try {
            const cleanedContent = this.cleanJsonResponse(content);
            parsed = JSON.parse(cleanedContent);
            // Validate required fields
            if (!parsed.options || !Array.isArray(parsed.options) || parsed.options.length === 0) {
                logger.error('Invalid options array in AI response', { options: parsed.options });
                throw new Error('AI response missing valid options array');
            }
            // Validate each option has required fields
            for (const option of parsed.options) {
                if (!option.label || !option.script) {
                    logger.error('Invalid option in AI response', { option });
                    throw new Error('AI response has option missing label or script');
                }
            }
            logger.info('Successfully parsed greeting tip', {
                heading: parsed.heading,
                optionCount: parsed.options.length,
                scriptLengths: parsed.options.map((o) => o.script?.length || 0),
            });
        }
        catch (error) {
            logger.error('Failed to parse greeting tip response', {
                error: error.message,
                rawContent: content,
            });
            throw new Error(`Failed to parse AI response: ${error.message}`);
        }
        return {
            recommendationId: (0, uuid_1.v4)(),
            conversationId,
            stage: parsed.stage,
            heading: parsed.heading,
            context: parsed.context,
            options: parsed.options,
            timestamp: Date.now(),
        };
    }
    /**
     * Generate contextual next tip (event-driven mode)
     * Analyzes what agent actually said vs suggested script
     * Considers customer reaction to adapt coaching
     */
    async generateContextualTip(payload) {
        logger.info('Generating contextual tip', {
            conversationId: payload.conversationId,
            selectedOption: payload.selectedOption,
            hasAgentResponse: !!payload.agentResponse,
            hasCustomerReaction: !!payload.customerReaction,
            transcriptCount: payload.transcriptHistory.length,
        });
        const prompt = this.buildContextualPrompt(payload);
        const completion = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are an expert sales coach analyzing a real conversation. Generate the NEXT coaching recommendation based on what actually happened.

Return ONLY valid JSON matching this format:
{
  "heading": "2-word max heading",
  "stage": "DISCOVERY" | "VALUE_PROP" | "OBJECTION_HANDLING" | "NEXT_STEPS" | "CONVERSION",
  "context": "Brief explanation based on actual conversation flow",
  "options": [
    { "label": "Minimal", "script": "Exact words to say" },
    { "label": "Explanative", "script": "Exact words to say" },
    { "label": "Contextual", "script": "Exact words to say" }
  ]
}

CRITICAL: Adapt to what ACTUALLY happened, not what was suggested.`,
                },
                { role: 'user', content: prompt },
            ],
            temperature: 0.8, // Higher creativity for adaptive coaching
            max_tokens: 600,
        });
        const content = completion.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No response from OpenAI');
        }
        // Clean and parse JSON (handle markdown code blocks, etc.)
        let parsed;
        try {
            const cleanedContent = this.cleanJsonResponse(content);
            parsed = JSON.parse(cleanedContent);
            // Validate required fields
            if (!parsed.options || !Array.isArray(parsed.options) || parsed.options.length === 0) {
                logger.error('Invalid options array in AI response', { options: parsed.options });
                throw new Error('AI response missing valid options array');
            }
            // Validate each option has required fields
            for (const option of parsed.options) {
                if (!option.label || !option.script) {
                    logger.error('Invalid option in AI response', { option });
                    throw new Error('AI response has option missing label or script');
                }
            }
            logger.info('Successfully parsed contextual tip', {
                heading: parsed.heading,
                optionCount: parsed.options.length,
                scriptLengths: parsed.options.map((o) => o.script?.length || 0),
            });
        }
        catch (error) {
            logger.error('Failed to parse contextual tip response', {
                error: error.message,
                rawContent: content,
            });
            throw new Error(`Failed to parse AI response: ${error.message}`);
        }
        return {
            recommendationId: (0, uuid_1.v4)(),
            conversationId: payload.conversationId,
            stage: parsed.stage,
            heading: parsed.heading,
            context: parsed.context,
            options: parsed.options,
            timestamp: Date.now(),
        };
    }
    /**
     * Build greeting prompt (simple context)
     */
    buildGreetingPrompt(transcriptHistory) {
        const recentTranscripts = transcriptHistory.slice(-5);
        const conversationSummary = recentTranscripts
            .map((t) => `${t.speaker.toUpperCase()}: ${t.text}`)
            .join('\n');
        return `The agent is starting a sales call. Based on the conversation so far, generate a greeting recommendation.

Recent conversation:
${conversationSummary || 'No conversation yet - this is the very beginning'}

Generate a 2-word heading and 3 greeting options that:
1. Build rapport naturally
2. Set a consultative tone
3. Open the door for discovery

Focus on keeping the conversation flowing, not pushing for immediate commitment.`;
    }
    /**
     * Build contextual prompt (enhanced with actual conversation flow)
     */
    buildContextualPrompt(payload) {
        const { selectedScript, agentResponse, customerReaction, transcriptHistory, } = payload;
        // Build conversation context
        const recentTranscripts = transcriptHistory.slice(-10);
        const conversationSummary = recentTranscripts
            .map((t) => `${t.speaker.toUpperCase()}: ${t.text}`)
            .join('\n');
        // Build analysis of what happened
        let analysisSection = '';
        if (agentResponse) {
            analysisSection += `\n## What Agent Actually Said
Suggested: "${selectedScript}"
Agent said: "${agentResponse.text}"

ANALYSIS NEEDED: Did the agent follow the suggestion? Did they adapt it? Was it effective?`;
        }
        if (customerReaction) {
            analysisSection += `\n\n## Customer Reaction
Customer responded: "${customerReaction.text}"

ANALYSIS NEEDED: What does this reveal about customer's mindset? Are they interested, skeptical, ready to move forward, or pushing back?`;
        }
        return `You are analyzing a sales conversation in real-time. The agent selected a coaching option, and we captured what actually happened next.

## Conversation History (Last 10 exchanges)
${conversationSummary}
${analysisSection}

## Your Task
Based on the ACTUAL conversation flow (not just the suggestion), generate the next coaching recommendation that:
1. Acknowledges what actually happened (not what was suggested)
2. Builds on the customer's real reaction
3. Moves the conversation forward naturally
4. Provides 3 options: Minimal (brief), Explanative (detailed), Contextual (highly adaptive)

Generate a 2-word heading that captures the key move to make next.`;
    }
    /**
     * Generate periodic tip (auto mode - every 30 seconds)
     */
    async generatePeriodicTip(conversationId, transcriptHistory) {
        logger.info('Generating periodic tip', { conversationId, transcriptCount: transcriptHistory.length });
        // Use simpler prompt for auto mode
        const recentTranscripts = transcriptHistory.slice(-10);
        const conversationSummary = recentTranscripts
            .map((t) => `${t.speaker.toUpperCase()}: ${t.text}`)
            .join('\n');
        const prompt = `Analyze this sales conversation and provide the next coaching recommendation.

Recent conversation:
${conversationSummary}

Generate a 2-word heading and 3 coaching options that help move the conversation forward naturally.`;
        const completion = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are an expert sales coach. Generate a coaching recommendation with 3 dialogue options.
Return ONLY valid JSON matching this format:
{
  "heading": "2-word max heading",
  "stage": "DISCOVERY" | "VALUE_PROP" | "OBJECTION_HANDLING" | "NEXT_STEPS" | "CONVERSION",
  "context": "Brief explanation",
  "options": [
    { "label": "Minimal", "script": "Exact words to say" },
    { "label": "Explanative", "script": "Exact words to say" },
    { "label": "Contextual", "script": "Exact words to say" }
  ]
}`,
                },
                { role: 'user', content: prompt },
            ],
            temperature: 0.7,
            max_tokens: 500,
        });
        const content = completion.choices[0]?.message?.content;
        if (!content) {
            throw new Error('No response from OpenAI');
        }
        // Clean and parse JSON (handle markdown code blocks, etc.)
        let parsed;
        try {
            const cleanedContent = this.cleanJsonResponse(content);
            parsed = JSON.parse(cleanedContent);
            // Validate required fields
            if (!parsed.options || !Array.isArray(parsed.options) || parsed.options.length === 0) {
                logger.error('Invalid options array in AI response', { options: parsed.options });
                throw new Error('AI response missing valid options array');
            }
            // Validate each option has required fields
            for (const option of parsed.options) {
                if (!option.label || !option.script) {
                    logger.error('Invalid option in AI response', { option });
                    throw new Error('AI response has option missing label or script');
                }
            }
            logger.info('Successfully parsed periodic tip', {
                heading: parsed.heading,
                optionCount: parsed.options.length,
                scriptLengths: parsed.options.map((o) => o.script?.length || 0),
            });
        }
        catch (error) {
            logger.error('Failed to parse periodic tip response', {
                error: error.message,
                rawContent: content,
            });
            throw new Error(`Failed to parse AI response: ${error.message}`);
        }
        return {
            recommendationId: (0, uuid_1.v4)(),
            conversationId,
            stage: parsed.stage,
            heading: parsed.heading,
            context: parsed.context,
            options: parsed.options,
            timestamp: Date.now(),
        };
    }
    /**
     * Clean JSON response from AI (remove markdown code blocks, extra whitespace, etc.)
     */
    cleanJsonResponse(content) {
        // Remove markdown code blocks (```json ... ``` or ``` ... ```)
        let cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        // Remove any text before the first { or after the last }
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        }
        return cleaned.trim();
    }
}
exports.AIAnalysisService = AIAnalysisService;
//# sourceMappingURL=ai-analysis.service.js.map