"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIAnalysisService = void 0;
const openai_1 = __importDefault(require("openai"));
const uuid_1 = require("uuid");
const quality_scripts_1 = require("../constants/quality-scripts");
const logger_1 = require("../utils/logger");
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
        logger_1.logger.info('AI Analysis Service initialized');
    }
    /**
     * Generate first greeting tip (fast, low-context)
     * Used after 3-minute warmup or in auto mode
     */
    async generateGreetingTip(conversationId, transcriptHistory) {
        logger_1.logger.info('Generating greeting tip', { conversationId, transcriptCount: transcriptHistory.length });
        const prompt = this.buildGreetingPrompt(transcriptHistory);
        const completion = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are Mk1 (or Agent), Bob Hansen's assistant at Simple.Biz.
YOUR ONLY JOB IS TO SELECT A SCRIPT.
You are FORBIDDEN from generating original text.
You MUST select one valid object from the GOLDEN SCRIPTS LIBRARY below.

GOLDEN SCRIPTS LIBRARY:
${JSON.stringify(quality_scripts_1.QUALITY_SCRIPTS.filter(s => s.stage === 'GREETING'), null, 2)}

INSTRUCTIONS:
1. Identify the current conversation stage (likely GREETING).
2. Select the SINGLE BEST SCRIPT from the library.
3. Replace placeholders: [Agent Name] -> "Mark", [Location] -> "Sacramento", [Customer Name] -> Detect or "there".
4. DO NOT PARAPHRASE. Use the exact "text" field from the library.

Return ONLY valid JSON:
{
  "heading": "2-word max heading",
  "stage": "Detected Stage",
  "context": "Why this script fits",
  "options": [
    { "label": "Label from library", "script": "EXACT TEXT from library with placeholders filled" }
  ]
}`,
                },
                { role: 'user', content: prompt },
            ],
            temperature: 0.3, // Lower temperature for faster, more consistent results
            max_tokens: 200, // Reduced for latency
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
                logger_1.logger.error('Invalid options array in AI response', { options: parsed.options });
                throw new Error('AI response missing valid options array');
            }
            // Validate each option has required fields
            for (const option of parsed.options) {
                if (!option.label || !option.script) {
                    logger_1.logger.error('Invalid option in AI response', { option });
                    throw new Error('AI response has option missing label or script');
                }
            }
            logger_1.logger.info('Successfully parsed greeting tip', {
                heading: parsed.heading,
                optionCount: parsed.options.length,
                scriptLengths: parsed.options.map((o) => o.script?.length || 0),
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to parse greeting tip response', {
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
        logger_1.logger.info('Generating contextual tip', {
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
                    content: `You are Mk1 (or Agent), Bob Hansen's assistant at Simple.Biz.
YOUR ONLY JOB IS TO SELECT A SCRIPT.
You are FORBIDDEN from generating original text.
You MUST select one valid object from the GOLDEN SCRIPTS LIBRARY below.

GOLDEN SCRIPTS LIBRARY:
${JSON.stringify(quality_scripts_1.QUALITY_SCRIPTS, null, 2)}

INSTRUCTIONS:
1. Analyze the conversation history and the user's latest input.
2. Determine the current Conversation Stage (GREETING, VALUE_PROP, OBJECTION_HANDLING, CLOSING, CONVERSION).
3. Select the SINGLE BEST SCRIPT from the library that matches the context.
4. FILL PLACEHOLDERS ONLY: [Agent Name] -> "Mark", [Location] -> "Sacramento", [Customer Name] -> Detect or "there".
5. DO NOT PARAPHRASE. Use the exact "text" field from the library.

CRITICAL OVERRIDE:
The user's GOAL is to make the customer agree for a callback from Bob.
Unless the customer is completely rejecting, you MUST prioritize scripts involved with CLOSING or OBJECTION_HANDLING that lead to the "Ask for Call" (id: 'ask-callback') script.
If the conversation is in a neutral or positive state, suggest 'ask-callback'.

Return ONLY valid JSON:
{
  "heading": "2-word max heading (e.g. 'Handle Objection')",
  "stage": "Detected Stage",
  "context": "Why this specific script was selected based on the last user message",
  "options": [
    { "label": "Label from library", "script": "EXACT TEXT from library with placeholders filled" }
  ]
}`,
                },
                { role: 'user', content: prompt },
            ],
            temperature: 0.4, // Lowered for consistency
            max_tokens: 250, // Reduced for latency
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
                logger_1.logger.error('Invalid options array in AI response', { options: parsed.options });
                throw new Error('AI response missing valid options array');
            }
            // Validate each option has required fields
            for (const option of parsed.options) {
                if (!option.label || !option.script) {
                    logger_1.logger.error('Invalid option in AI response', { option });
                    throw new Error('AI response has option missing label or script');
                }
            }
            logger_1.logger.info('Successfully parsed contextual tip', {
                heading: parsed.heading,
                optionCount: parsed.options.length,
                scriptLengths: parsed.options.map((o) => o.script?.length || 0),
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to parse contextual tip response', {
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
     * Generate an alternative tip (Strict Golden Script cycling)
     * Used when user clicks "Next Tip" / "Cycle"
     * STRICTLY selects a different script from the Quality Library
     */
    async generateAlternativeTip(conversationId, currentStage, currentScriptId) {
        logger_1.logger.info('Generating alternative tip', { conversationId, currentStage, currentScriptId });
        const completion = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are Mk1. YOUR ONLY JOB IS TO SELECT A DIFFERENT SCRIPT.
You are FORBIDDEN from generating original text.
You MUST select one valid object from the GOLDEN SCRIPTS LIBRARY below.

GOLDEN SCRIPTS LIBRARY:
${JSON.stringify(quality_scripts_1.QUALITY_SCRIPTS.filter((s) => s.stage === currentStage), null, 2)}

INSTRUCTIONS:
1. Review the "GOLDEN SCRIPTS LIBRARY" for the stage: "${currentStage}".
2. Select a script that is DIFFERENT from the current script ID: "${currentScriptId || 'none'}".
3. If no other script exists for this stage, return the same one but acknowledge it's the best fit.
4. Replace placeholders: [Agent Name] -> "Mark", [Location] -> "Sacramento", [Customer Name] -> Detect or "there".
5. DO NOT PARAPHRASE. Use the exact "text" field.

Return ONLY valid JSON:
{
  "heading": "Alternative Option",
  "stage": "${currentStage}",
  "context": "Why this alternative approach might work better",
  "options": [
    { "label": "Label from library", "script": "EXACT TEXT from library", "id": "id from library" }
  ]
}`,
                },
                { role: 'user', content: `Give me an alternative script for stage: ${currentStage}` },
            ],
            temperature: 0.2, // Low temp for strict selection
            max_tokens: 250,
        });
        const content = completion.choices[0]?.message?.content;
        if (!content)
            throw new Error('No response from OpenAI');
        const cleanedContent = this.cleanJsonResponse(content);
        const parsed = JSON.parse(cleanedContent);
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
     * Build greeting prompt (simple context)
     *
     */
    buildGreetingPrompt(transcriptHistory) {
        const recentTranscripts = transcriptHistory.slice(-5);
        const conversationSummary = recentTranscripts
            .map((t) => `${t.speaker.toUpperCase()}: ${t.text}`)
            .join('\n');
        return `The agent is starting a sales call. Based on the conversation so far, generate a single, high-impact greeting recommendation.

Recent conversation:
${conversationSummary || 'No conversation yet - this is the very beginning'}

Generate a 2-word heading and 1 greeting option that:
1. Builds rapport naturally
2. Sets a consultative tone
3. Opens the door for discovery

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
        return `You are Mk1, analyzing a sales conversation in real-time. The agent selected a coaching option, and we captured what actually happened next.

## Conversation History (Last 10 exchanges)
${conversationSummary}
${analysisSection}

## Your Task
Based on the ACTUAL conversation flow (not just the suggestion), generate the SINGLE best next recommendation.
`;
    }
    /**
     * Generate periodic tip (auto mode - every 30 seconds)
     */
    async generatePeriodicTip(conversationId, transcriptHistory) {
        logger_1.logger.info('Generating periodic tip', { conversationId, transcriptCount: transcriptHistory.length });
        // Use simpler prompt for auto mode
        const recentTranscripts = transcriptHistory.slice(-10);
        const conversationSummary = recentTranscripts
            .map((t) => `${t.speaker.toUpperCase()}: ${t.text}`)
            .join('\n');
        const prompt = `Analyze this sales conversation and provide the next best coaching recommendation.

Recent conversation:
${conversationSummary}

Generate a 2-word heading and 1 high-quality coaching option that moves the conversation forward naturally.`;
        const completion = await this.openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are Mk1, Bob Hansen's assistant at Simple.Biz.
MUST USE GOLDEN SCRIPTS from the library below. Do not generate custom text.
Match the conversation stage to the best script.

GOLDEN SCRIPTS LIBRARY:
${JSON.stringify(quality_scripts_1.QUALITY_SCRIPTS, null, 2)}

INSTRUCTIONS:
1. Identify the current conversation stage and context.
2. Select the ONE best script from the library.
3. Replace placeholders: [Agent Name] -> "Mark", [Location] -> "Sacramento/Roseville", [Customer Name] -> Detect or "there".
4. Determine stage from: GREETING, VALUE_PROP, OBJECTION_HANDLING, CLOSING, CONVERSION, NEXT_STEPS.

Return ONLY valid JSON:
{
  "heading": "2-word max heading",
  "stage": "DISCOVERY" | "VALUE_PROP" | "REBUTTAL" | "CLOSING",
  "context": "Context",
  "options": [
    { "label": "Best Suggestion", "script": "Script 1" }
  ]
}`,
                },
                { role: 'user', content: prompt },
            ],
            temperature: 0.5,
            max_tokens: 150,
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
                logger_1.logger.error('Invalid options array in AI response', { options: parsed.options });
                throw new Error('AI response missing valid options array');
            }
            // Validate each option has required fields
            for (const option of parsed.options) {
                if (!option.label || !option.script) {
                    logger_1.logger.error('Invalid option in AI response', { option });
                    throw new Error('AI response has option missing label or script');
                }
            }
            logger_1.logger.info('Successfully parsed periodic tip', {
                heading: parsed.heading,
                optionCount: parsed.options.length,
                scriptLengths: parsed.options.map((o) => o.script?.length || 0),
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to parse periodic tip response', {
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