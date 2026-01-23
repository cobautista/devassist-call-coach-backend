import { Request, Response } from 'express';
import OpenAI from 'openai';
import { createLogger } from '../utils/logger';

const logger = createLogger('ai-controller');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface GenerateRequest {
  persona: 'sales-coach' | 'skeptical-customer';
  context: string;
  systemPrompt?: string; // Optional override, but we prefer server-side prompts for security
}

export class AIController {
  
  /**
   * Universal AI Generation Endpoint
   * POST /api/ai/generate
   */
  async generate(req: Request, res: Response) {
    try {
      const { persona, context } = req.body as GenerateRequest;

      if (!context) {
        res.status(400).json({ error: 'Context is required' });
        return;
      }

      let systemPrompt = '';
      let temperature = 0.7;
      let maxTokens = 300;

      // Select Persona Logic
      if (persona === 'sales-coach') {
        systemPrompt = `You are a Top-Performing Lead Generation Specialist coaching a sales agent.
Your goal is to help the agent book a meeting, not just "have a chat".

CRITICAL INSTRUCTIONS:
- NEVER use "I understand", "I see", or "That makes sense".
- Be professional but enthusiastic and persistent.
- Focus on VALUE and ROI (Return on Investment).
- Generate EXACTLY 3 brief response options (max 20 words each).
- Return valid JSON: {"responses": ["...", "...", "..."], "context": "brief strategy"}`;
      } else if (persona === 'skeptical-customer') {
        systemPrompt = `You are a Skeptical Small Business Owner (Restaurant).
You are busy, pragmatic, and get annoyed by sales calls.
Current Context: A sales rep is calling you.

Instructions:
- Keep it brief (under 15 words).
- If the rep is vague -> Ask "What is this about?" or "Who are you?"
- If the rep talks price -> Ask "How much?" or say "We have no budget."
- If the rep mentions ROI/Value -> Show slight interest ("Go on..." or "Does it work?")
- If the rep asks for time -> Be resistant ("I'm busy", "Send an email") unless they proved value.
- Be realistic. Don't be a pushover.`;
        temperature = 0.9; // Higher creativity for customer
        maxTokens = 60;
      } else {
        res.status(400).json({ error: 'Invalid persona' });
        return;
      }

      logger.info(`🤖 Generating AI response for persona: ${persona}`);

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: context },
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: persona === 'sales-coach' ? { type: "json_object" } : undefined,
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('OpenAI returned empty response');
      }

      // Return result
      res.json({ 
        success: true, 
        data: content,
        timestamp: Date.now() 
      });

    } catch (error: any) {
      logger.error('Error generating AI response', { error: error.message });
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Internal Server Error' 
      });
    }
  }
}
