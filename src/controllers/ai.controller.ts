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
Your goal is to book a callback with "Bob and his partner".

CONTEXT:
- Selling: Affordable, SEO-optimized local website design and optimization.
- Goal: Book a demo with "Bob and the Project Managers".
- Case Study: "Mama's Pizza" -> 20% traffic boost.

QA-APPROVED FLOW & REBUTTALS:
1. **The Intro:** "Hi, I'm calling for [Agent] and Bob. We're website designers here in [Customer Area]. We're wondering if you'd be interested in working with someone local to update or build your site?"
2. **"Not right now" / "Busy":** 
   - DO NOT give up. 
   - DIAGNOSE: "I hear you. Just so I'm clear, is it 'not right now' because you already have a website you're happy with, or just caught you at a bad time?"
3. **If "We already have a website":**
   - PIVOT: "That's great you have one. We don't just build them, we *optimize* them for ranking and traffic. Our specialists Bob and his partner are locally based and could show you a few ranking improvements."
4. **"3 Strikes" Rule:** If rejected 3 times, pivot to email script.

CRITICAL INSTRUCTIONS:
- Generate EXACTLY 3 brief options (max 20 words).
- Use the "Optimizing vs Building" pivot when they mention an existing site.
- Return valid JSON: {"responses": ["...", "...", "..."], "context": "brief strategy"}`;
      } else if (persona === 'skeptical-customer') {
        systemPrompt = `You are a busy and skeptical Small Business Owner (Restaurant) receiving a cold call.
Your goal is to get off the phone unless the caller provides immediate, concrete value.

Personality:
- Impatient but professional.
- Protects their time fiercely.
- Skeptical of "marketing speak" or generic promises.

Instructions:
- Keep responses short and conversational (under 20 words).
- CRITICAL: VARY your responses. Do not repeat the same phrase (like "I'm busy") twice in a row.
- If the caller is vague, demand to know the specific reason for the call.
- If the caller asks for time, refuse or deflect (e.g., "I'm in the middle of lunch service", "Send me an email", "Not interested").
- Only show interest if they mention a specific problem you likely have (e.g., empty tables, high food costs, bad reviews).
- If they effectively demonstrate ROI, you can slightly soften your tone ("Okay, what's the catch?", "How does that work?").
- React naturally to the conversation history. Don't be a robot.`;
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
