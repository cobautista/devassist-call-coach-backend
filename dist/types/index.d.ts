export type ConversationStage = 'GREETING' | 'DISCOVERY' | 'VALUE_PROP' | 'OBJECTION_HANDLING' | 'NEXT_STEPS' | 'CONVERSION';
export interface DialogueOption {
    label: string;
    script: string;
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
    selectedScript: string;
    agentResponse?: TranscriptSegment;
    customerReaction?: TranscriptSegment;
    transcriptHistory: TranscriptSegment[];
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
export type CoachingState = 'IDLE' | 'DISPLAYING_TIP' | 'CAPTURING_AGENT_RESPONSE' | 'CAPTURING_CUSTOMER_REACTION' | 'GENERATING_NEXT';
export interface Conversation {
    id: string;
    agentId: string;
    startTime: number;
    endTime?: number;
    metadata?: Record<string, any>;
    transcriptHistory: TranscriptSegment[];
    lastAnalysisTime?: number;
    state?: CoachingState;
    lastSelectedRecommendationId?: string;
    lastSelectedScript?: string;
    lastScriptType?: string;
    lastScriptTimestamp?: number;
    capturedResponse?: string;
    customerReaction?: string;
    responseTimestamp?: number;
    reactionTimestamp?: number;
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
export interface AudioChunkPayload {
    chunk: string;
    sessionId: string;
    timestamp: number;
    speaker?: 'agent' | 'caller';
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
    sampleRate?: number;
    encoding?: string;
}
export interface EndTranscriptionPayload {
    sessionId: string;
}
export type WSEventType = 'START_CONVERSATION' | 'TRANSCRIPT' | 'END_CONVERSATION' | 'OPTION_SELECTED' | 'REQUEST_NEXT_TIP' | 'PING' | 'PONG' | 'AI_TIP' | 'CONVERSATION_STARTED' | 'CONVERSATION_ENDED' | 'ERROR' | 'START_TRANSCRIPTION' | 'AUDIO_CHUNK' | 'END_TRANSCRIPTION' | 'TRANSCRIPTION_RESULT';
export interface WSMessage {
    type: WSEventType;
    payload?: any;
}
//# sourceMappingURL=index.d.ts.map