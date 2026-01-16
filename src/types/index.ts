// Backend types matching frontend expectations

export type ConversationStage =
  | 'GREETING'
  | 'DISCOVERY'
  | 'VALUE_PROP'
  | 'OBJECTION_HANDLING'
  | 'NEXT_STEPS'
  | 'CONVERSION';

export interface DialogueOption {
  label: string; // "Minimal", "Explanative", "Contextual"
  script: string; // Exact words to say
}

export interface AITipPayload {
  recommendationId: string;
  conversationId: string;
  stage: ConversationStage;
  heading: string;
  context: string;
  options: DialogueOption[];
  timestamp: number;
}

export interface TranscriptSegment {
  speaker: 'caller' | 'agent';
  text: string;
  timestamp: number;
  confidence: number;
}

export interface RequestNextTipPayload {
  conversationId: string;
  selectedRecommendationId: string;
  selectedOption: 1 | 2 | 3;
  selectedScript: string; // What user clicked
  agentResponse?: TranscriptSegment; // What agent actually said
  customerReaction?: TranscriptSegment; // How customer responded
  transcriptHistory: TranscriptSegment[]; // Last 20 exchanges
  timestamp: number;
}

export interface StartConversationPayload {
  agentId: string;
  metadata?: Record<string, any>;
}

export interface TranscriptPayload {
  conversationId: string;
  speaker: 'caller' | 'agent';
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export interface EndConversationPayload {
  conversationId: string;
}

export interface OptionSelectedPayload {
  recommendationId: string;
  selectedOption: 1 | 2 | 3;
}

export interface AIErrorPayload {
  conversationId?: string;
  message: string;
  code: string;
  timestamp: number;
}

// Coaching state machine states
export type CoachingState =
  | 'IDLE' // No active coaching session
  | 'DISPLAYING_TIP' // Showing recommendation, waiting for selection
  | 'CAPTURING_AGENT_RESPONSE' // Listening for agent speech after selection
  | 'CAPTURING_CUSTOMER_REACTION' // Listening for customer response
  | 'GENERATING_NEXT'; // AI analyzing and generating next tip

// Database models
export interface Conversation {
  id: string;
  agentId: string;
  startTime: number;
  endTime?: number;
  metadata?: Record<string, any>;
  transcriptHistory: TranscriptSegment[];
  lastAnalysisTime?: number;

  // Event-driven coaching state machine
  state?: CoachingState;
  lastSelectedRecommendationId?: string; // ID of last recommendation
  lastSelectedScript?: string; // Script text user clicked
  lastScriptType?: string; // "Minimal", "Explanative", or "Contextual"
  lastScriptTimestamp?: number; // When script was selected
  capturedResponse?: string; // Agent's actual response (accumulated)
  customerReaction?: string; // Customer's reaction (accumulated)
  responseTimestamp?: number; // When agent started speaking
  reactionTimestamp?: number; // When customer started responding
}

export interface AIRecommendation {
  id: string;
  conversationId: string;
  recommendationId: string;
  stage: ConversationStage;
  heading: string;
  context: string;
  options: DialogueOption[];
  selectedOption?: 1 | 2 | 3;
  timestamp: number;
}

// Audio transcription types (AWS Transcribe fallback)
export interface AudioChunkPayload {
  chunk: string; // Base64-encoded PCM16 audio data OR raw Buffer
  sessionId: string;
  timestamp: number;
  speaker?: 'agent' | 'caller'; // Optional speaker hint from extension
}

export interface TranscriptionResponse {
  text: string;
  isFinal: boolean;
  speaker: 'agent' | 'caller' | 'unknown';
  confidence: number;
  sessionId: string;
  timestamp: number;
}

export interface StartTranscriptionPayload {
  sessionId: string;
  sampleRate?: number; // Default: 16000
  encoding?: string; // Default: 'pcm'
}

export interface EndTranscriptionPayload {
  sessionId: string;
}

// WebSocket event types
export type WSEventType =
  | 'START_CONVERSATION'
  | 'TRANSCRIPT'
  | 'END_CONVERSATION'
  | 'OPTION_SELECTED'
  | 'REQUEST_NEXT_TIP'
  | 'PING'
  | 'PONG'
  | 'AI_TIP'
  | 'CONVERSATION_STARTED'
  | 'CONVERSATION_ENDED'
  | 'ERROR'
  | 'START_TRANSCRIPTION'
  | 'AUDIO_CHUNK'
  | 'END_TRANSCRIPTION'
  | 'TRANSCRIPTION_RESULT';

export interface WSMessage {
  type: WSEventType;
  payload?: any;
}
