export interface TranscriptResult {
    text: string;
    isFinal: boolean;
    speaker: 'agent' | 'caller' | 'unknown';
    confidence: number;
    timestamp: number;
}
export interface AudioChunk {
    chunk: Buffer;
    sessionId: string;
    timestamp: number;
}
/**
 * AWS Transcribe Streaming Service
 *
 * Handles real-time audio transcription using AWS Transcribe Streaming API.
 * Supports PCM16 audio at 16kHz mono.
 *
 * Features:
 * - Real-time streaming transcription
 * - Speaker detection (basic)
 * - Partial and final results
 * - Auto-reconnection on errors
 * - Session management
 */
export declare class AWSTranscribeService {
    private client;
    private activeSessions;
    private readonly maxRetries;
    private readonly retryDelay;
    constructor();
    /**
     * Start a new transcription session
     */
    startSession(sessionId: string, onTranscript: (result: TranscriptResult) => void, onError?: (error: Error) => void): Promise<void>;
    /**
     * Send audio chunk to active session
     */
    sendAudioChunk(sessionId: string, audioData: Buffer): Promise<void>;
    /**
     * End transcription session
     */
    endSession(sessionId: string): Promise<void>;
    /**
     * Start AWS Transcribe streaming
     */
    private startTranscription;
    /**
     * Create async iterable audio stream for AWS
     */
    private createAudioStream;
    /**
     * Process transcript result stream from AWS
     */
    private processTranscriptStream;
    /**
     * Handle individual transcript result
     */
    private handleTranscriptResult;
    /**
     * Get active session count
     */
    getActiveSessionCount(): number;
    /**
     * Check if session is active
     */
    isSessionActive(sessionId: string): boolean;
    /**
     * Clean up all sessions (for graceful shutdown)
     */
    cleanup(): Promise<void>;
}
//# sourceMappingURL=aws-transcribe.service.d.ts.map