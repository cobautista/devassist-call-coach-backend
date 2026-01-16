"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AWSTranscribeService = void 0;
const client_transcribe_streaming_1 = require("@aws-sdk/client-transcribe-streaming");
const logger_1 = require("../utils/logger");
const stream_1 = require("stream");
const logger = (0, logger_1.createLogger)('aws-transcribe');
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
class AWSTranscribeService {
    client;
    activeSessions = new Map();
    maxRetries = 3;
    retryDelay = 1000; // 1 second
    constructor() {
        const region = process.env.AWS_REGION || 'us-east-1';
        this.client = new client_transcribe_streaming_1.TranscribeStreamingClient({
            region,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
            },
        });
        logger.info('AWS Transcribe Service initialized', { region });
    }
    /**
     * Start a new transcription session
     */
    async startSession(sessionId, onTranscript, onError) {
        try {
            // Check if session already exists
            if (this.activeSessions.has(sessionId)) {
                logger.warn('Session already exists', { sessionId });
                return;
            }
            logger.info('Starting transcription session', { sessionId });
            // Create audio stream
            const audioStream = new AudioInputStream();
            // Create session
            const session = {
                sessionId,
                audioStream,
                onTranscript,
                onError,
                isActive: true,
                retryCount: 0,
                lastSpeaker: 'unknown',
            };
            this.activeSessions.set(sessionId, session);
            // Start transcription
            await this.startTranscription(session);
            logger.info('Transcription session started', { sessionId });
        }
        catch (error) {
            logger.error('Error starting session', {
                sessionId,
                error: error.message,
                stack: error.stack,
            });
            if (onError) {
                onError(error);
            }
            throw error;
        }
    }
    /**
     * Send audio chunk to active session
     */
    async sendAudioChunk(sessionId, audioData) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            logger.warn('Session not found for audio chunk', { sessionId });
            throw new Error(`Session ${sessionId} not found`);
        }
        if (!session.isActive) {
            logger.warn('Session is not active', { sessionId });
            throw new Error(`Session ${sessionId} is not active`);
        }
        try {
            // Write audio data to stream
            session.audioStream.write(audioData);
        }
        catch (error) {
            logger.error('Error sending audio chunk', {
                sessionId,
                error: error.message,
            });
            throw error;
        }
    }
    /**
     * End transcription session
     */
    async endSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            logger.warn('Session not found for ending', { sessionId });
            return;
        }
        logger.info('Ending transcription session', { sessionId });
        try {
            session.isActive = false;
            session.audioStream.end();
            this.activeSessions.delete(sessionId);
            logger.info('Transcription session ended', { sessionId });
        }
        catch (error) {
            logger.error('Error ending session', {
                sessionId,
                error: error.message,
            });
        }
    }
    /**
     * Start AWS Transcribe streaming
     */
    async startTranscription(session) {
        try {
            const audioStream = this.createAudioStream(session.audioStream);
            const command = new client_transcribe_streaming_1.StartStreamTranscriptionCommand({
                LanguageCode: 'en-US',
                MediaEncoding: 'pcm',
                MediaSampleRateHertz: 16000,
                AudioStream: audioStream,
                EnablePartialResultsStabilization: true,
                PartialResultsStability: 'medium',
                ShowSpeakerLabel: true, // Enable speaker diarization
            });
            const response = await this.client.send(command);
            // Process transcript stream
            if (response.TranscriptResultStream) {
                await this.processTranscriptStream(session, response.TranscriptResultStream);
            }
        }
        catch (error) {
            logger.error('Error in transcription stream', {
                sessionId: session.sessionId,
                error: error.message,
                retryCount: session.retryCount,
            });
            // Handle retry logic
            if (session.retryCount < this.maxRetries && session.isActive) {
                session.retryCount++;
                logger.info('Retrying transcription', {
                    sessionId: session.sessionId,
                    retryCount: session.retryCount,
                });
                // Wait before retry
                await new Promise((resolve) => setTimeout(resolve, this.retryDelay * session.retryCount));
                // Retry
                await this.startTranscription(session);
            }
            else {
                logger.error('Max retries exceeded or session closed', {
                    sessionId: session.sessionId,
                });
                if (session.onError) {
                    session.onError(error);
                }
            }
        }
    }
    /**
     * Create async iterable audio stream for AWS
     */
    async *createAudioStream(inputStream) {
        for await (const chunk of inputStream) {
            if (chunk) {
                yield { AudioEvent: { AudioChunk: chunk } };
            }
        }
    }
    /**
     * Process transcript result stream from AWS
     */
    async processTranscriptStream(session, stream) {
        try {
            for await (const event of stream) {
                if (event.TranscriptEvent?.Transcript?.Results) {
                    for (const result of event.TranscriptEvent.Transcript.Results) {
                        this.handleTranscriptResult(session, result);
                    }
                }
            }
        }
        catch (error) {
            logger.error('Error processing transcript stream', {
                sessionId: session.sessionId,
                error: error.message,
            });
            throw error;
        }
    }
    /**
     * Handle individual transcript result
     */
    handleTranscriptResult(session, result) {
        if (!result.Alternatives || result.Alternatives.length === 0) {
            return;
        }
        const alternative = result.Alternatives[0];
        const text = alternative.Transcript || '';
        const isFinal = !result.IsPartial;
        // Skip empty transcripts
        if (!text.trim()) {
            return;
        }
        // Determine speaker (basic implementation)
        // AWS Transcribe speaker labels work with longer audio streams
        // For real-time, we'll use a simple heuristic or rely on extension's speaker detection
        let speaker = 'unknown';
        if (alternative.Items && alternative.Items.length > 0) {
            // Check if any items have speaker labels
            const speakerLabel = alternative.Items.find(item => item.Speaker)?.Speaker;
            if (speakerLabel) {
                // AWS uses spk_0, spk_1, etc.
                // We'll assume spk_0 is agent, spk_1 is caller (can be configured)
                speaker = speakerLabel === 'spk_0' ? 'agent' : 'caller';
            }
        }
        // Use last known speaker if current is unknown
        if (speaker === 'unknown' && session.lastSpeaker !== 'unknown') {
            speaker = session.lastSpeaker;
        }
        else if (speaker !== 'unknown') {
            session.lastSpeaker = speaker;
        }
        // Calculate confidence (average of all items)
        let confidence = 1.0;
        if (alternative.Items && alternative.Items.length > 0) {
            const confidenceSum = alternative.Items.reduce((sum, item) => sum + (item.Confidence || 1.0), 0);
            confidence = confidenceSum / alternative.Items.length;
        }
        const transcriptResult = {
            text,
            isFinal,
            speaker,
            confidence,
            timestamp: Date.now(),
        };
        // Log for debugging
        if (isFinal) {
            logger.info('Final transcript', {
                sessionId: session.sessionId,
                text: text.substring(0, 50),
                speaker,
                confidence: confidence.toFixed(2),
            });
        }
        // Emit transcript
        session.onTranscript(transcriptResult);
    }
    /**
     * Get active session count
     */
    getActiveSessionCount() {
        return this.activeSessions.size;
    }
    /**
     * Check if session is active
     */
    isSessionActive(sessionId) {
        return this.activeSessions.has(sessionId);
    }
    /**
     * Clean up all sessions (for graceful shutdown)
     */
    async cleanup() {
        logger.info('Cleaning up all transcription sessions', {
            activeCount: this.activeSessions.size,
        });
        const sessionIds = Array.from(this.activeSessions.keys());
        for (const sessionId of sessionIds) {
            await this.endSession(sessionId);
        }
        logger.info('All sessions cleaned up');
    }
}
exports.AWSTranscribeService = AWSTranscribeService;
/**
 * Custom audio input stream that can be written to
 */
class AudioInputStream extends stream_1.Readable {
    constructor() {
        super();
    }
    _read() {
        // No-op - we'll push data manually
    }
    write(chunk) {
        return this.push(chunk);
    }
    end() {
        this.push(null);
    }
}
//# sourceMappingURL=aws-transcribe.service.js.map