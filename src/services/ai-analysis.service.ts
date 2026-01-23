import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import type {
  AITipPayload,
  ConversationStage,
  DialogueOption,
  TranscriptSegment,
  RequestNextTipPayload,
} from '../types';

const logger = createLogger('ai-analysis');

/**
 * AI Analysis Service
 *
 * Handles OpenAI GPT-4o-mini integration for generating coaching tips
 * Supports both:
 * - Auto mode: Generate tips every 30 seconds based on recent transcripts
 * - Event-driven mode: Generate contextual tips based on actual conversation flow
 */
export class AIAnalysisService {
  private openai: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.openai = new OpenAI({ apiKey });
    logger.info('AI Analysis Service initialized');
  }

  /**
   * Generate first greeting tip (fast, low-context)
   * Used after 3-minute warmup or in auto mode
   */
  async generateGreetingTip(
    conversationId: string,
    transcriptHistory: TranscriptSegment[]
  ): Promise<AITipPayload> {
    logger.info('Generating greeting tip', { conversationId, transcriptCount: transcriptHistory.length });

    const prompt = this.buildGreetingPrompt(transcriptHistory);

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are Perry (or Agent), Bob Hansen's assistant at Simple.Biz. Goal: callback for Bob.

FLOW:
1.  **Intro:** "Hi, I'm [Name] from Simple. Bob Hansen and I are local web designers... interested in building or updating?"
2.  **Logic:**
    -   **Non-Engaging ("Not now"):** Rebuttal 1: "Is it because you have a site, or just busy?"
        -   *If Busy:* "Sorry... mind if Bob calls later?" (Confirm Name + Authority + Topic)
        -   *If Has Site:* "Great! We optimize too. Mind if Bob calls later?" (Confirm Name + Authority + Topic)
    -   **Engaging (Asks Price/SEO/Hosting):**
        -   *Assume Authority.* SKIP authority/topic checks.
        -   *Response:* "That's a great question! I'm just Bob's assistant... mind if Bob calls later?" (Confirm Name ONLY)

Return ONLY valid JSON:
{
  "heading": "2-word max heading",
  "stage": "GREETING",
  "context": "Start with the mandated Simple.Biz intro",
  "options": [
    { "label": "Standard", "script": "Hi this is [Name] from Simple. Bob Hansen and I are local web designers here in Middletown. We're just wondering if you're interested in talking to someone local about building or updating an existing website?" }
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
        scriptLengths: parsed.options.map((o: any) => o.script?.length || 0),
      });
    } catch (error: any) {
      logger.error('Failed to parse greeting tip response', {
        error: error.message,
        rawContent: content,
      });
      throw new Error(`Failed to parse AI response: ${error.message}`);
    }

    return {
      recommendationId: uuidv4(),
      conversationId,
      stage: parsed.stage as ConversationStage,
      heading: parsed.heading,
      context: parsed.context,
      options: parsed.options as DialogueOption[],
      timestamp: Date.now(),
    };
  }

  /**
   * Generate contextual next tip (event-driven mode)
   * Analyzes what agent actually said vs suggested script
   * Considers customer reaction to adapt coaching
   */
  async generateContextualTip(payload: RequestNextTipPayload): Promise<AITipPayload> {
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
          content: `You are Perry (or Agent), Bob Hansen's assistant at Simple.Biz. Goal: callback for Bob.

SCENARIO LOGIC:
1.  **NON-ENGAGING ("Not right now" / "Not interested")**
    -   *Move 1:* Ask "Is it because you have a site, or just busy?"
    -   *If "Busy":* "Sorry I caught you at a bad time. Mind if Bob calls later today?"
    -   *If "Have site":* "Great! We don't just build, we optimize. Mind if Bob calls later?"
    -   *Required Qualifications:* 1. Confirm Callback 2. Confirm Name 3. Confirm Authority (He/She in charge?) 4. Confirm Topic (Build vs Update).

2.  **ENGAGING (Asks about SEO, Price, Hosting, etc.)**
    -   *Crucial:* DO NOT check authority. DO NOT check topic. Lead is already qualified.
    -   *Move:* "Great question! I'm just Bob's assistant... mind if Bob calls later to discuss [Topic]?"
    -   *Required Qualifications:* 1. Confirm Callback 2. Confirm Name.
    -   *Close:* "Great! Last question, may I know who I'm speaking with?"

3.  **GENERAL**
    -   3-Strikes Rule: Stop after 2 hard "No"s.
    -   Never say "I understand" or "I see".

Return ONLY valid JSON:
{
  "heading": "2-word max heading",
  "stage": "DISCOVERY" | "VALUE_PROP" | "REBUTTAL" | "CLOSING",
  "context": "Context based on Engaging vs Non-Engaging path",
  "options": [
    { "label": "Script Option", "script": "Exact words to say" },
    { "label": "Alternative", "script": "Exact words to say" }
  ]
}`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.6, // Lower temperature for strict script adherence
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
        scriptLengths: parsed.options.map((o: any) => o.script?.length || 0),
      });
    } catch (error: any) {
      logger.error('Failed to parse contextual tip response', {
        error: error.message,
        rawContent: content,
      });
      throw new Error(`Failed to parse AI response: ${error.message}`);
    }

    return {
      recommendationId: uuidv4(),
      conversationId: payload.conversationId,
      stage: parsed.stage as ConversationStage,
      heading: parsed.heading,
      context: parsed.context,
      options: parsed.options as DialogueOption[],
      timestamp: Date.now(),
    };
  }

  /**
   * Build greeting prompt (simple context)
   */
  private buildGreetingPrompt(transcriptHistory: TranscriptSegment[]): string {
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
  private buildContextualPrompt(payload: RequestNextTipPayload): string {
    const {
      selectedScript,
      agentResponse,
      customerReaction,
      transcriptHistory,
    } = payload;

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
  async generatePeriodicTip(
    conversationId: string,
    transcriptHistory: TranscriptSegment[]
  ): Promise<AITipPayload> {
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
          content: `You are Perry, Bob Hansen's assistant at Simple.Biz.

LOGIC:
1.  **NON-ENGAGING:**
    -   If "Busy" -> "Mind if Bob calls later?"
    -   If "Has Site" -> "We optimize too. Mind if Bob calls later?"
    -   *Must confirm:* Callback, Name, Authority, Topic.
2.  **ENGAGING (Questions):**
    -   "I'm just the assistant... mind if Bob calls later?"
    -   *Must confirm:* Callback, Name. (SKIP Authority/Topic).

Return ONLY valid JSON:
{
  "heading": "2-word max heading",
  "stage": "DISCOVERY" | "VALUE_PROP" | "REBUTTAL" | "CLOSING",
  "context": "Context",
  "options": [
    { "label": "Option 1", "script": "Script 1" },
    { "label": "Option 2", "script": "Script 2" }
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
        scriptLengths: parsed.options.map((o: any) => o.script?.length || 0),
      });
    } catch (error: any) {
      logger.error('Failed to parse periodic tip response', {
        error: error.message,
        rawContent: content,
      });
      throw new Error(`Failed to parse AI response: ${error.message}`);
    }

    return {
      recommendationId: uuidv4(),
      conversationId,
      stage: parsed.stage as ConversationStage,
      heading: parsed.heading,
      context: parsed.context,
      options: parsed.options as DialogueOption[],
      timestamp: Date.now(),
    };
  }

  /**
   * Clean JSON response from AI (remove markdown code blocks, extra whitespace, etc.)
   */
  private cleanJsonResponse(content: string): string {
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
