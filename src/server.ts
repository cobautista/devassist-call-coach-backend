import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { createLogger } from './utils/logger';
import { AIAnalysisService } from './services/ai-analysis.service';
import { ConversationService } from './services/conversation.service';
import { AWSTranscribeService } from './services/aws-transcribe.service';
import type {
  StartConversationPayload,
  TranscriptPayload,
  EndConversationPayload,
  OptionSelectedPayload,
  RequestNextTipPayload,
  TranscriptSegment,
  AudioChunkPayload,
  TranscriptionResponse,
  StartTranscriptionPayload,
  EndTranscriptionPayload,
} from './types';

// Load environment variables
dotenv.config();

const serverLogger = createLogger('server');

// Validate environment
const requiredEnv = ['OPENAI_API_KEY', 'BACKEND_API_KEY'];
for (const env of requiredEnv) {
  if (!process.env[env]) {
    serverLogger.error(`Missing required environment variable: ${env}`);
    process.exit(1);
  }
}

// Initialize services
const aiAnalysisService = new AIAnalysisService();
const conversationService = new ConversationService();

// AWS Transcribe is optional - only initialize if credentials are configured
let awsTranscribeService: AWSTranscribeService | null = null;
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  try {
    awsTranscribeService = new AWSTranscribeService();
    serverLogger.info('AWS Transcribe service initialized');
  } catch (error: any) {
    serverLogger.warn('Failed to initialize AWS Transcribe service', {
      error: error.message,
    });
  }
} else {
  serverLogger.info('AWS Transcribe service disabled (credentials not configured)');
}

// Create Express app
const app = express();
const httpServer = createServer(app);

// CORS configuration
const corsOrigin = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'];
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  })
);

app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    activeConversations: conversationService.getActiveConversations().length,
  });
});

// ============================================================================
// DEEPGRAM EPHEMERAL TOKEN ENDPOINT
// ============================================================================

/**
 * POST /api/auth/deepgram-token
 *
 * Creates a temporary Deepgram JWT token (30-second TTL) for secure client-side access.
 *
 * Security:
 * - Requires x-api-key header for authentication
 * - Master Deepgram key never leaves the server
 * - Returns short-lived JWT token (30s TTL)
 *
 * @body {string} userId - User identifier (for logging)
 * @body {string} sessionId - Session identifier (for logging)
 * @returns {Object} { token: string, expiresIn: number }
 */
app.post('/api/auth/deepgram-token', async (req, res) => {
  try {
    // ========================================================================
    // STEP 1: Authenticate Extension Request
    // ========================================================================

    const apiKey = req.headers['x-api-key'];
    const expectedApiKey = process.env.BACKEND_API_KEY;

    if (!apiKey || apiKey !== expectedApiKey) {
      serverLogger.warn('Unauthorized token request - invalid API key');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key',
      });
    }

    // ========================================================================
    // STEP 2: Validate Request Body
    // ========================================================================

    const { userId, sessionId } = req.body;

    if (!userId || !sessionId) {
      serverLogger.warn('Bad request - missing userId or sessionId');
      return res.status(400).json({
        error: 'Bad Request',
        message: 'userId and sessionId are required',
      });
    }

    serverLogger.info('Creating temporary Deepgram token', { userId, sessionId });

    // ========================================================================
    // STEP 3: Request Temporary Token from Deepgram
    // ========================================================================

    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

    if (!deepgramApiKey) {
      serverLogger.error('DEEPGRAM_API_KEY not configured in environment');
      return res.status(500).json({
        error: 'Server Configuration Error',
        message: 'Deepgram API key not configured',
      });
    }

    // Call Deepgram's /v1/auth/grant endpoint to create JWT token
    const deepgramResponse = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${deepgramApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scopes: ['usage:write'], // Required for live streaming
        // Optional: set custom expiration (default is 30 seconds)
        // expires_in: 300 // 5 minutes
      }),
    });

    if (!deepgramResponse.ok) {
      const errorText = await deepgramResponse.text();
      serverLogger.error('Deepgram API error', {
        status: deepgramResponse.status,
        error: errorText,
      });
      return res.status(500).json({
        error: 'Deepgram API Error',
        message: `Failed to create token: ${deepgramResponse.status}`,
      });
    }

    const deepgramData = (await deepgramResponse.json()) as {
      access_token?: string;
      expires_in?: number;
    };

    // Log full response for debugging
    serverLogger.info('Deepgram API response', {
      response: JSON.stringify(deepgramData),
    });

    serverLogger.info('Temporary token created', {
      userId,
      expiresIn: deepgramData.expires_in || 30,
      hasAccessToken: !!deepgramData.access_token,
    });

    // ========================================================================
    // STEP 4: Return Token to Extension
    // ========================================================================

    return res.status(200).json({
      token: deepgramData.access_token || '',
      expiresIn: deepgramData.expires_in || 30,
      createdAt: new Date().toISOString(),
    });
  } catch (error: any) {
    serverLogger.error('Unexpected error creating Deepgram token', {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to create token',
    });
  }
});

// ============================================================================
// AWS TRANSCRIBE STREAMING ENDPOINTS
// ============================================================================

/**
 * POST /api/transcribe/start
 *
 * Start a new AWS Transcribe streaming session
 *
 * @body {string} sessionId - Transcription session ID
 * @returns {Object} { success: boolean, sessionId: string }
 */
app.post('/api/transcribe/start', async (req, res) => {
  try {
    // Check if AWS Transcribe is enabled
    if (!awsTranscribeService) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'AWS Transcribe service is not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.',
      });
    }

    // Authenticate
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.BACKEND_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'sessionId is required',
      });
    }

    serverLogger.info('Starting AWS Transcribe session via REST', { sessionId });

    // Note: Session will be started when first audio chunk arrives
    // This endpoint is just for initialization/acknowledgment

    return res.status(200).json({
      success: true,
      sessionId,
      message: 'Session ready. Send audio chunks to /api/transcribe/chunk',
    });
  } catch (error: any) {
    serverLogger.error('Error starting transcription session', {
      error: error.message,
    });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * POST /api/transcribe/chunk
 *
 * Send audio chunk for transcription (REST fallback)
 *
 * Note: This is a synchronous endpoint that returns empty response.
 * Transcripts are delivered via Socket.IO TRANSCRIPTION_RESULT event.
 * For full streaming, use Socket.IO AUDIO_CHUNK event instead.
 *
 * @body {string} chunk - Base64-encoded PCM16 audio data
 * @body {string} sessionId - Transcription session ID
 * @body {number} timestamp - Chunk timestamp
 * @body {string} [speaker] - Optional speaker hint ('agent' | 'caller')
 * @returns {Object} { success: boolean }
 */
app.post('/api/transcribe/chunk', async (req, res) => {
  try {
    // Check if AWS Transcribe is enabled
    if (!awsTranscribeService) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'AWS Transcribe service is not configured',
      });
    }

    // Authenticate
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.BACKEND_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { chunk, sessionId } = req.body;

    if (!chunk || !sessionId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'chunk and sessionId are required',
      });
    }

    // Convert base64 to Buffer
    let audioBuffer: Buffer;
    try {
      audioBuffer = Buffer.from(chunk, 'base64');
    } catch (error) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid base64 audio data',
      });
    }

    // Check if session exists, if not, start it
    if (!awsTranscribeService.isSessionActive(sessionId)) {
      serverLogger.info('Auto-starting transcription session for REST request', {
        sessionId,
      });

      // Start session with transcript callback
      // Note: REST API can't send transcripts back synchronously
      // They would need to be retrieved via polling or Socket.IO
      await awsTranscribeService.startSession(
        sessionId,
        (result) => {
          // Log transcript (client should use Socket.IO for real-time results)
          serverLogger.info('Transcript (REST session)', {
            sessionId,
            text: result.text.substring(0, 50),
            isFinal: result.isFinal,
          });
        },
        (error) => {
          serverLogger.error('Transcription error (REST session)', {
            sessionId,
            error: error.message,
          });
        }
      );
    }

    // Send audio chunk
    await awsTranscribeService.sendAudioChunk(sessionId, audioBuffer);

    return res.status(200).json({
      success: true,
      message: 'Audio chunk received',
    });
  } catch (error: any) {
    serverLogger.error('Error processing audio chunk', {
      error: error.message,
      sessionId: req.body.sessionId,
    });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

/**
 * POST /api/transcribe/end
 *
 * End AWS Transcribe streaming session
 *
 * @body {string} sessionId - Transcription session ID
 * @returns {Object} { success: boolean }
 */
app.post('/api/transcribe/end', async (req, res) => {
  try {
    // Check if AWS Transcribe is enabled
    if (!awsTranscribeService) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'AWS Transcribe service is not configured',
      });
    }

    // Authenticate
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.BACKEND_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'sessionId is required',
      });
    }

    serverLogger.info('Ending AWS Transcribe session via REST', { sessionId });

    await awsTranscribeService.endSession(sessionId);

    return res.status(200).json({
      success: true,
      sessionId,
    });
  } catch (error: any) {
    serverLogger.error('Error ending transcription session', {
      error: error.message,
    });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

// Socket.io server
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Authentication middleware for Socket.io
io.use((socket, next) => {
  const apiKey = socket.handshake.auth.apiKey;
  if (apiKey === process.env.BACKEND_API_KEY) {
    serverLogger.info('Client authenticated', { socketId: socket.id });
    next();
  } else {
    serverLogger.warn('Authentication failed', { socketId: socket.id });
    next(new Error('Authentication failed'));
  }
});

// Socket.io connection handler
io.on('connection', (socket: Socket) => {
  serverLogger.info('Client connected', { socketId: socket.id });

  // Track active timers for auto mode
  const autoModeTimers: Map<string, NodeJS.Timeout> = new Map();

  // Track response capture timeouts (event-driven mode)
  const responseTimeouts: Map<string, NodeJS.Timeout> = new Map();
  const reactionTimeouts: Map<string, NodeJS.Timeout> = new Map();

  // ========================================================================
  // START_CONVERSATION - Initialize new conversation session
  // ========================================================================
  socket.on('START_CONVERSATION', async (payload: StartConversationPayload) => {
    try {
      serverLogger.info('Starting conversation', { agentId: payload.agentId });

      const conversation = conversationService.startConversation(
        payload.agentId,
        payload.metadata
      );

      socket.emit('CONVERSATION_STARTED', {
        type: 'CONVERSATION_STARTED',
        payload: {
          conversationId: conversation.id,
          timestamp: Date.now(),
        },
      });

      serverLogger.info('Conversation started', { conversationId: conversation.id });

      // Start 3-minute warmup timer
      setTimeout(async () => {
        try {
          const transcriptHistory = conversationService.getTranscriptHistory(conversation.id);
          const greeting = await aiAnalysisService.generateGreetingTip(
            conversation.id,
            transcriptHistory
          );

          // Store recommendation for later retrieval
          conversationService.storeRecommendation(greeting);
          conversationService.updateState(conversation.id, 'DISPLAYING_TIP');

          socket.emit('AI_TIP', {
            type: 'AI_TIP',
            payload: greeting,
          });

          serverLogger.info('Warmup complete - greeting sent', {
            conversationId: conversation.id,
          });

          // Start auto mode periodic tips (every 30 seconds)
          const periodicTimer = setInterval(async () => {
            try {
              const history = conversationService.getTranscriptHistory(conversation.id);
              const tip = await aiAnalysisService.generatePeriodicTip(conversation.id, history);

              // Store recommendation
              conversationService.storeRecommendation(tip);
              conversationService.updateState(conversation.id, 'DISPLAYING_TIP');

              socket.emit('AI_TIP', {
                type: 'AI_TIP',
                payload: tip,
              });

              conversationService.updateLastAnalysisTime(conversation.id);
              serverLogger.info('Periodic tip sent', { conversationId: conversation.id });
            } catch (error: any) {
              serverLogger.error('Error generating periodic tip', {
                conversationId: conversation.id,
                error: error.message,
              });
            }
          }, 30 * 1000);

          autoModeTimers.set(conversation.id, periodicTimer);
        } catch (error: any) {
          serverLogger.error('Error generating greeting', {
            conversationId: conversation.id,
            error: error.message,
          });

          socket.emit('ERROR', {
            type: 'ERROR',
            payload: {
              conversationId: conversation.id,
              message: 'Failed to generate greeting',
              code: 'GREETING_ERROR',
              timestamp: Date.now(),
            },
          });
        }
      }, 3 * 60 * 1000); // 3 minutes
    } catch (error: any) {
      serverLogger.error('Error starting conversation', { error: error.message });
      socket.emit('ERROR', {
        type: 'ERROR',
        payload: {
          message: 'Failed to start conversation',
          code: 'START_ERROR',
          timestamp: Date.now(),
        },
      });
    }
  });

  // ========================================================================
  // TRANSCRIPT - Receive transcript from client
  // ========================================================================
  socket.on('TRANSCRIPT', async (payload: TranscriptPayload) => {
    try {
      const { conversationId, speaker, text, isFinal, timestamp } = payload;

      if (!isFinal) {
        // Ignore interim transcripts
        return;
      }

      const transcript: TranscriptSegment = {
        speaker,
        text,
        timestamp,
        confidence: 1.0, // Deepgram provides this, but we'll default to 1.0
      };

      // Always store transcript in history
      const success = conversationService.addTranscript(conversationId, transcript);
      if (!success) {
        serverLogger.warn('Failed to add transcript - conversation not found', {
          conversationId,
        });
        return;
      }

      // Get conversation to check state
      const conversation = conversationService.getConversation(conversationId);
      if (!conversation || !conversation.state) {
        return; // No state machine active
      }

      // ============================================================
      // STATE MACHINE: Event-Driven Coaching
      // ============================================================

      // STATE: CAPTURING_AGENT_RESPONSE
      // Listening for agent to speak after selecting a script
      if (conversation.state === 'CAPTURING_AGENT_RESPONSE' && speaker === 'agent') {
        serverLogger.info('Capturing agent response', {
          conversationId,
          textLength: text.length,
        });

        // Append agent response
        conversationService.appendAgentResponse(conversationId, text);

        // Clear existing timeout
        const existingTimeout = responseTimeouts.get(conversationId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }

        // Set new timeout - 3 seconds of silence = agent finished
        const newTimeout = setTimeout(async () => {
          const conv = conversationService.getConversation(conversationId);
          if (!conv) return;

          serverLogger.info('Agent finished speaking - listening for customer reaction', {
            conversationId,
            capturedResponse: conv.capturedResponse?.substring(0, 100),
          });

          // Transition to next state
          conversationService.updateState(conversationId, 'CAPTURING_CUSTOMER_REACTION');

          // Start customer reaction timeout (30 seconds)
          const reactionTimeout = setTimeout(async () => {
            serverLogger.warn('Customer reaction timeout - generating tip anyway', {
              conversationId,
            });
            await generateContextualNextTip(conversationId);
          }, 30000);

          reactionTimeouts.set(conversationId, reactionTimeout);
        }, 3000); // 3 seconds of silence

        responseTimeouts.set(conversationId, newTimeout);
      }

      // STATE: CAPTURING_CUSTOMER_REACTION
      // Listening for customer to respond
      else if (conversation.state === 'CAPTURING_CUSTOMER_REACTION' && speaker === 'caller') {
        serverLogger.info('Capturing customer reaction', {
          conversationId,
          textLength: text.length,
        });

        // Append customer reaction
        conversationService.appendCustomerReaction(conversationId, text);

        // Clear existing timeout
        const existingTimeout = reactionTimeouts.get(conversationId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }

        // Set new timeout - 3 seconds of silence = customer finished
        const newTimeout = setTimeout(async () => {
          const conv = conversationService.getConversation(conversationId);
          if (!conv) return;

          serverLogger.info('Customer finished responding - generating next tip', {
            conversationId,
            customerReaction: conv.customerReaction?.substring(0, 100),
          });

          // Generate next tip NOW
          await generateContextualNextTip(conversationId);
        }, 3000); // 3 seconds of silence

        reactionTimeouts.set(conversationId, newTimeout);
      }
    } catch (error: any) {
      serverLogger.error('Error processing transcript', {
        error: error.message,
        conversationId: payload.conversationId,
      });
    }
  });

  // ========================================================================
  // HELPER: Generate contextual next tip
  // ========================================================================
  async function generateContextualNextTip(conversationId: string): Promise<void> {
    try {
      const conversation = conversationService.getConversation(conversationId);
      if (!conversation) {
        serverLogger.warn('Conversation not found for tip generation', { conversationId });
        return;
      }

      // Update state
      conversationService.updateState(conversationId, 'GENERATING_NEXT');

      // Build payload for AI analysis
      const payload: RequestNextTipPayload = {
        conversationId,
        selectedRecommendationId: conversation.lastSelectedRecommendationId || '',
        selectedOption: 1, // Not used in contextual generation
        selectedScript: conversation.lastSelectedScript || '',
        agentResponse: conversation.capturedResponse
          ? {
              speaker: 'agent',
              text: conversation.capturedResponse,
              timestamp: conversation.responseTimestamp || Date.now(),
              confidence: 1.0,
            }
          : undefined,
        customerReaction: conversation.customerReaction
          ? {
              speaker: 'caller',
              text: conversation.customerReaction,
              timestamp: conversation.reactionTimestamp || Date.now(),
              confidence: 1.0,
            }
          : undefined,
        transcriptHistory: conversationService.getTranscriptHistory(conversationId),
        timestamp: Date.now(),
      };

      serverLogger.info('Generating contextual tip with captured context', {
        conversationId,
        hasAgentResponse: !!payload.agentResponse,
        hasCustomerReaction: !!payload.customerReaction,
        historyLength: payload.transcriptHistory.length,
      });

      // Generate tip
      const tip = await aiAnalysisService.generateContextualTip(payload);

      // Store recommendation
      conversationService.storeRecommendation(tip);

      // Reset response capture state
      conversationService.resetResponseCapture(conversationId);

      // Send to client
      socket.emit('AI_TIP', {
        type: 'AI_TIP',
        payload: tip,
      });

      serverLogger.info('Contextual tip sent', {
        conversationId,
        heading: tip.heading,
        responseTime: Date.now() - (conversation.lastScriptTimestamp || Date.now()),
      });
    } catch (error: any) {
      serverLogger.error('Error generating contextual tip', {
        conversationId,
        error: error.message,
      });

      // Reset state on error
      conversationService.updateState(conversationId, 'DISPLAYING_TIP');

      socket.emit('ERROR', {
        type: 'ERROR',
        payload: {
          conversationId,
          message: 'Failed to generate next tip',
          code: 'CONTEXTUAL_TIP_ERROR',
          timestamp: Date.now(),
        },
      });
    }
  }

  // ========================================================================
  // OPTION_SELECTED - User selected a dialogue option
  // ========================================================================
  socket.on('OPTION_SELECTED', (payload: OptionSelectedPayload) => {
    try {
      serverLogger.info('Option selected', {
        recommendationId: payload.recommendationId,
        option: payload.selectedOption,
      });

      // Get the recommendation
      const recommendation = conversationService.getRecommendation(payload.recommendationId);
      if (!recommendation) {
        serverLogger.warn('Recommendation not found', {
          recommendationId: payload.recommendationId,
        });
        return;
      }

      // Get selected script text and type
      const selectedOption = recommendation.options[payload.selectedOption - 1];
      if (!selectedOption) {
        serverLogger.warn('Invalid option number', {
          recommendationId: payload.recommendationId,
          option: payload.selectedOption,
        });
        return;
      }

      // Store selected script in conversation context
      const success = conversationService.storeSelectedScript(
        recommendation.conversationId,
        payload.recommendationId,
        payload.selectedOption,
        selectedOption.script,
        selectedOption.label
      );

      if (success) {
        serverLogger.info('Script selection stored - listening for agent response', {
          conversationId: recommendation.conversationId,
          scriptType: selectedOption.label,
          scriptPreview: selectedOption.script.substring(0, 50) + '...',
        });
      }
    } catch (error: any) {
      serverLogger.error('Error processing option selection', {
        error: error.message,
        recommendationId: payload.recommendationId,
      });
    }
  });

  // ========================================================================
  // REQUEST_NEXT_TIP - Event-driven mode: Generate contextual next tip
  // ========================================================================
  socket.on('REQUEST_NEXT_TIP', async (payload: RequestNextTipPayload) => {
    try {
      serverLogger.info('Generating contextual next tip', {
        conversationId: payload.conversationId,
        selectedOption: payload.selectedOption,
        hasAgentResponse: !!payload.agentResponse,
        hasCustomerReaction: !!payload.customerReaction,
      });

      // Generate contextual tip based on actual conversation flow
      const tip = await aiAnalysisService.generateContextualTip(payload);

      socket.emit('AI_TIP', {
        type: 'AI_TIP',
        payload: tip,
      });

      serverLogger.info('Contextual tip sent', {
        conversationId: payload.conversationId,
        heading: tip.heading,
      });
    } catch (error: any) {
      serverLogger.error('Error generating contextual tip', {
        conversationId: payload.conversationId,
        error: error.message,
      });

      socket.emit('ERROR', {
        type: 'ERROR',
        payload: {
          conversationId: payload.conversationId,
          message: 'Failed to generate next tip',
          code: 'CONTEXTUAL_TIP_ERROR',
          timestamp: Date.now(),
        },
      });
    }
  });

  // ========================================================================
  // END_CONVERSATION - End conversation session
  // ========================================================================
  socket.on('END_CONVERSATION', (payload: EndConversationPayload) => {
    try {
      const { conversationId } = payload;

      // Clear auto mode timer if exists
      const timer = autoModeTimers.get(conversationId);
      if (timer) {
        clearInterval(timer);
        autoModeTimers.delete(conversationId);
      }

      conversationService.endConversation(conversationId);

      socket.emit('CONVERSATION_ENDED', {
        type: 'CONVERSATION_ENDED',
        payload: {
          conversationId,
          timestamp: Date.now(),
        },
      });

      serverLogger.info('Conversation ended', { conversationId });
    } catch (error: any) {
      serverLogger.error('Error ending conversation', {
        error: error.message,
        conversationId: payload.conversationId,
      });
    }
  });

  // ========================================================================
  // PING - Connection test
  // ========================================================================
  socket.on('PING', () => {
    socket.emit('PONG', {
      type: 'PONG',
      payload: {
        timestamp: Date.now(),
      },
    });
  });

  // ========================================================================
  // AWS TRANSCRIBE STREAMING - Real-time audio transcription
  // ========================================================================

  /**
   * START_TRANSCRIPTION - Start AWS Transcribe streaming session
   */
  socket.on('START_TRANSCRIPTION', async (payload: StartTranscriptionPayload) => {
    try {
      // Check if AWS Transcribe is enabled
      if (!awsTranscribeService) {
        socket.emit('ERROR', {
          type: 'ERROR',
          payload: {
            sessionId: payload.sessionId,
            message: 'AWS Transcribe service is not configured',
            code: 'SERVICE_UNAVAILABLE',
            timestamp: Date.now(),
          },
        });
        return;
      }

      const { sessionId } = payload;

      serverLogger.info('Starting transcription session', {
        socketId: socket.id,
        sessionId,
      });

      // Start AWS Transcribe session
      await awsTranscribeService.startSession(
        sessionId,
        (result) => {
          // Emit transcript back to client
          const response: TranscriptionResponse = {
            text: result.text,
            isFinal: result.isFinal,
            speaker: result.speaker,
            confidence: result.confidence,
            sessionId,
            timestamp: result.timestamp,
          };

          socket.emit('TRANSCRIPTION_RESULT', {
            type: 'TRANSCRIPTION_RESULT',
            payload: response,
          });

          serverLogger.debug('Transcript emitted', {
            sessionId,
            textLength: result.text.length,
            isFinal: result.isFinal,
            speaker: result.speaker,
          });
        },
        (error) => {
          // Emit error to client
          socket.emit('ERROR', {
            type: 'ERROR',
            payload: {
              sessionId,
              message: `Transcription error: ${error.message}`,
              code: 'TRANSCRIPTION_ERROR',
              timestamp: Date.now(),
            },
          });

          serverLogger.error('Transcription error', {
            sessionId,
            error: error.message,
          });
        }
      );

      // Acknowledge session start
      socket.emit('TRANSCRIPTION_STARTED', {
        type: 'TRANSCRIPTION_STARTED',
        payload: {
          sessionId,
          timestamp: Date.now(),
        },
      });

      serverLogger.info('Transcription session started', { sessionId });
    } catch (error: any) {
      serverLogger.error('Error starting transcription', {
        error: error.message,
        sessionId: payload.sessionId,
      });

      socket.emit('ERROR', {
        type: 'ERROR',
        payload: {
          sessionId: payload.sessionId,
          message: 'Failed to start transcription',
          code: 'START_TRANSCRIPTION_ERROR',
          timestamp: Date.now(),
        },
      });
    }
  });

  /**
   * AUDIO_CHUNK - Send audio chunk for transcription
   */
  socket.on('AUDIO_CHUNK', async (payload: AudioChunkPayload) => {
    try {
      // Check if AWS Transcribe is enabled
      if (!awsTranscribeService) {
        socket.emit('ERROR', {
          type: 'ERROR',
          payload: {
            sessionId: payload.sessionId,
            message: 'AWS Transcribe service is not configured',
            code: 'SERVICE_UNAVAILABLE',
            timestamp: Date.now(),
          },
        });
        return;
      }

      const { chunk, sessionId, timestamp } = payload;

      // Convert chunk to Buffer
      let audioBuffer: Buffer;

      if (typeof chunk === 'string') {
        // Base64-encoded string
        try {
          audioBuffer = Buffer.from(chunk, 'base64');
        } catch (error) {
          serverLogger.error('Invalid base64 audio data', { sessionId });
          socket.emit('ERROR', {
            type: 'ERROR',
            payload: {
              sessionId,
              message: 'Invalid base64 audio data',
              code: 'INVALID_AUDIO_DATA',
              timestamp: Date.now(),
            },
          });
          return;
        }
      } else if (Buffer.isBuffer(chunk)) {
        // Already a Buffer
        audioBuffer = chunk;
      } else if (ArrayBuffer.isView(chunk) || (chunk as any) instanceof ArrayBuffer) {
        // ArrayBuffer or TypedArray
        audioBuffer = Buffer.from(chunk as any);
      } else {
        serverLogger.error('Unsupported audio chunk type', {
          sessionId,
          type: typeof chunk,
        });
        socket.emit('ERROR', {
          type: 'ERROR',
          payload: {
            sessionId,
            message: 'Unsupported audio chunk type',
            code: 'INVALID_AUDIO_TYPE',
            timestamp: Date.now(),
          },
        });
        return;
      }

      // Send to AWS Transcribe
      await awsTranscribeService.sendAudioChunk(sessionId, audioBuffer);

      // Log periodically (every 100 chunks to avoid spam)
      if (Math.random() < 0.01) {
        serverLogger.debug('Audio chunk processed', {
          sessionId,
          chunkSize: audioBuffer.length,
          timestamp,
        });
      }
    } catch (error: any) {
      serverLogger.error('Error processing audio chunk', {
        error: error.message,
        sessionId: payload.sessionId,
      });

      socket.emit('ERROR', {
        type: 'ERROR',
        payload: {
          sessionId: payload.sessionId,
          message: `Audio chunk error: ${error.message}`,
          code: 'AUDIO_CHUNK_ERROR',
          timestamp: Date.now(),
        },
      });
    }
  });

  /**
   * END_TRANSCRIPTION - End AWS Transcribe session
   */
  socket.on('END_TRANSCRIPTION', async (payload: EndTranscriptionPayload) => {
    try {
      // Check if AWS Transcribe is enabled
      if (!awsTranscribeService) {
        socket.emit('ERROR', {
          type: 'ERROR',
          payload: {
            sessionId: payload.sessionId,
            message: 'AWS Transcribe service is not configured',
            code: 'SERVICE_UNAVAILABLE',
            timestamp: Date.now(),
          },
        });
        return;
      }

      const { sessionId } = payload;

      serverLogger.info('Ending transcription session', { sessionId });

      await awsTranscribeService.endSession(sessionId);

      socket.emit('TRANSCRIPTION_ENDED', {
        type: 'TRANSCRIPTION_ENDED',
        payload: {
          sessionId,
          timestamp: Date.now(),
        },
      });

      serverLogger.info('Transcription session ended', { sessionId });
    } catch (error: any) {
      serverLogger.error('Error ending transcription', {
        error: error.message,
        sessionId: payload.sessionId,
      });

      socket.emit('ERROR', {
        type: 'ERROR',
        payload: {
          sessionId: payload.sessionId,
          message: 'Failed to end transcription',
          code: 'END_TRANSCRIPTION_ERROR',
          timestamp: Date.now(),
        },
      });
    }
  });

  // ========================================================================
  // DISCONNECT - Client disconnected
  // ========================================================================
  socket.on('disconnect', (reason) => {
    serverLogger.info('Client disconnected', { socketId: socket.id, reason });

    // Clean up all auto mode timers for this socket
    autoModeTimers.forEach((timer) => clearInterval(timer));
    autoModeTimers.clear();

    // Clean up response capture timeouts
    responseTimeouts.forEach((timeout) => clearTimeout(timeout));
    responseTimeouts.clear();

    reactionTimeouts.forEach((timeout) => clearTimeout(timeout));
    reactionTimeouts.clear();

    // Clean up transcription sessions
    // Note: We don't have socket-to-session mapping here
    // Sessions should be ended explicitly by clients via END_TRANSCRIPTION
    // But we'll log active sessions for monitoring
    if (awsTranscribeService) {
      const activeSessionCount = awsTranscribeService.getActiveSessionCount();
      if (activeSessionCount > 0) {
        serverLogger.warn('Client disconnected with active transcription sessions', {
          socketId: socket.id,
          activeSessionCount,
        });
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 8080;
httpServer.listen(PORT, () => {
  serverLogger.info(`Server running on port ${PORT}`);
  serverLogger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  serverLogger.info(`CORS origins: ${corsOrigin.join(', ')}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  serverLogger.info('SIGTERM received, shutting down gracefully');

  // Clean up AWS Transcribe sessions
  if (awsTranscribeService) {
    try {
      await awsTranscribeService.cleanup();
      serverLogger.info('AWS Transcribe sessions cleaned up');
    } catch (error: any) {
      serverLogger.error('Error cleaning up AWS Transcribe', {
        error: error.message,
      });
    }
  }

  httpServer.close(() => {
    serverLogger.info('Server closed');
    process.exit(0);
  });
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', async () => {
  serverLogger.info('SIGINT received, shutting down gracefully');

  // Clean up AWS Transcribe sessions
  if (awsTranscribeService) {
    try {
      await awsTranscribeService.cleanup();
      serverLogger.info('AWS Transcribe sessions cleaned up');
    } catch (error: any) {
      serverLogger.error('Error cleaning up AWS Transcribe', {
        error: error.message,
      });
    }
  }

  httpServer.close(() => {
    serverLogger.info('Server closed');
    process.exit(0);
  });
});
