import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
  TranscriptResultStream,
  Result,
} from '@aws-sdk/client-transcribe-streaming';
import { createLogger } from '../utils/logger';
import { Readable } from 'stream';

const logger = createLogger('aws-transcribe');

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
export class AWSTranscribeService {
  private client: TranscribeStreamingClient;
  private activeSessions: Map<string, TranscriptionSession> = new Map();
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1';

    this.client = new TranscribeStreamingClient({
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
  async startSession(
    sessionId: string,
    onTranscript: (result: TranscriptResult) => void,
    onError?: (error: Error) => void
  ): Promise<void> {
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
      const session: TranscriptionSession = {
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
    } catch (error: any) {
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
  async sendAudioChunk(sessionId: string, audioData: Buffer): Promise<void> {
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
    } catch (error: any) {
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
  async endSession(sessionId: string): Promise<void> {
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
    } catch (error: any) {
      logger.error('Error ending session', {
        sessionId,
        error: error.message,
      });
    }
  }

  /**
   * Start AWS Transcribe streaming
   */
  private async startTranscription(session: TranscriptionSession): Promise<void> {
    try {
      const audioStream = this.createAudioStream(session.audioStream);

      const command = new StartStreamTranscriptionCommand({
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
        await this.processTranscriptStream(
          session,
          response.TranscriptResultStream
        );
      }
    } catch (error: any) {
      // Check if this is a premature close error (expected when client disconnects)
      const isPrematureClose = error.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
                                error.message?.includes('Premature close');

      if (isPrematureClose) {
        logger.warn('Transcription stream closed prematurely', {
          sessionId: session.sessionId,
          message: 'Client likely disconnected before sending audio',
        });
        // Clean up session without retrying
        session.isActive = false;
        this.activeSessions.delete(session.sessionId);
        return;
      }

      logger.error('Error in transcription stream', {
        sessionId: session.sessionId,
        error: error.message,
        code: error.code,
        retryCount: session.retryCount,
      });

      // Handle retry logic for non-premature-close errors
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
      } else {
        logger.error('Max retries exceeded or session closed', {
          sessionId: session.sessionId,
        });

        // Clean up session
        session.isActive = false;
        this.activeSessions.delete(session.sessionId);

        if (session.onError) {
          session.onError(error);
        }
      }
    }
  }

  /**
   * Create async iterable audio stream for AWS
   */
  private async *createAudioStream(
    inputStream: AudioInputStream
  ): AsyncIterable<AudioStream> {
    try {
      for await (const chunk of inputStream) {
        if (chunk) {
          yield { AudioEvent: { AudioChunk: chunk } };
        }
      }
    } catch (error: any) {
      // Handle stream errors gracefully (e.g., premature close)
      if (error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
        logger.warn('Audio stream closed prematurely', {
          message: 'Client disconnected before sending audio data',
        });
      } else {
        logger.error('Error in audio stream', {
          error: error.message,
          code: error.code,
        });
      }
      // Don't rethrow - allow graceful termination
    }
  }

  /**
   * Process transcript result stream from AWS
   */
  private async processTranscriptStream(
    session: TranscriptionSession,
    stream: AsyncIterable<TranscriptResultStream>
  ): Promise<void> {
    try {
      for await (const event of stream) {
        if (event.TranscriptEvent?.Transcript?.Results) {
          for (const result of event.TranscriptEvent.Transcript.Results) {
            this.handleTranscriptResult(session, result);
          }
        }
      }
    } catch (error: any) {
      // Handle stream errors gracefully
      if (error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
        logger.warn('Transcript stream closed prematurely', {
          sessionId: session.sessionId,
          message: 'Stream ended before transcription completed',
        });
      } else {
        logger.error('Error processing transcript stream', {
          sessionId: session.sessionId,
          error: error.message,
          code: error.code,
        });
      }
      // Don't rethrow - allow graceful cleanup
    }
  }

  /**
   * Handle individual transcript result
   */
  private handleTranscriptResult(session: TranscriptionSession, result: Result): void {
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
    let speaker: 'agent' | 'caller' | 'unknown' = 'unknown';

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
    } else if (speaker !== 'unknown') {
      session.lastSpeaker = speaker;
    }

    // Calculate confidence (average of all items)
    let confidence = 1.0;
    if (alternative.Items && alternative.Items.length > 0) {
      const confidenceSum = alternative.Items.reduce(
        (sum, item) => sum + (item.Confidence || 1.0),
        0
      );
      confidence = confidenceSum / alternative.Items.length;
    }

    const transcriptResult: TranscriptResult = {
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
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Check if session is active
   */
  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Clean up all sessions (for graceful shutdown)
   */
  async cleanup(): Promise<void> {
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

/**
 * Custom audio input stream that can be written to
 */
class AudioInputStream extends Readable {
  constructor() {
    super();

    // Add error handler to prevent unhandled errors from crashing the process
    this.on('error', (error: any) => {
      logger.warn('AudioInputStream error', {
        error: error.message,
        code: error.code,
      });
      // Error is logged but not rethrown - prevents process crash
    });
  }

  _read(): void {
    // No-op - we'll push data manually
  }

  write(chunk: Buffer): boolean {
    return this.push(chunk);
  }

  end(): void {
    this.push(null);
  }
}

/**
 * Internal session tracking
 */
interface TranscriptionSession {
  sessionId: string;
  audioStream: AudioInputStream;
  onTranscript: (result: TranscriptResult) => void;
  onError?: (error: Error) => void;
  isActive: boolean;
  retryCount: number;
  lastSpeaker: 'agent' | 'caller' | 'unknown';
}
