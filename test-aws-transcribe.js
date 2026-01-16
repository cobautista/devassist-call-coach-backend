#!/usr/bin/env node

/**
 * Test AWS Transcribe Integration
 *
 * This script tests the AWS Transcribe streaming integration by:
 * 1. Connecting to backend via Socket.IO
 * 2. Starting a transcription session
 * 3. Sending test audio chunks
 * 4. Receiving and displaying transcripts
 *
 * Usage:
 *   node test-aws-transcribe.js
 *
 * Requirements:
 *   - Backend running (npm run dev)
 *   - AWS credentials configured in .env
 *   - socket.io-client installed (npm install socket.io-client)
 */

import { io } from 'socket.io-client';
import { randomBytes } from 'crypto';

// Configuration
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || 'YOUR-SECURE-RANDOM-KEY-HERE';
const SESSION_ID = `test-session-${Date.now()}`;

console.log('\n🎙️  AWS Transcribe Integration Test\n');
console.log('Configuration:');
console.log(`  Backend URL: ${BACKEND_URL}`);
console.log(`  Session ID: ${SESSION_ID}`);
console.log(`  API Key: ${BACKEND_API_KEY.substring(0, 10)}...`);
console.log('\n');

// Connect to backend
const socket = io(BACKEND_URL, {
  auth: {
    apiKey: BACKEND_API_KEY,
  },
  transports: ['websocket', 'polling'],
});

let transcriptCount = 0;
let finalTranscriptCount = 0;

// Connection events
socket.on('connect', () => {
  console.log('✅ Connected to backend');
  console.log(`   Socket ID: ${socket.id}`);
  console.log('\n');

  // Start transcription
  console.log('📡 Starting transcription session...');
  socket.emit('START_TRANSCRIPTION', {
    sessionId: SESSION_ID,
    sampleRate: 16000,
    encoding: 'pcm',
  });
});

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
  process.exit(1);
});

socket.on('disconnect', (reason) => {
  console.log('\n❌ Disconnected:', reason);
});

// Transcription events
socket.on('TRANSCRIPTION_STARTED', (data) => {
  console.log('✅ Transcription session started');
  console.log(`   Session ID: ${data.payload.sessionId}`);
  console.log(`   Timestamp: ${new Date(data.payload.timestamp).toISOString()}`);
  console.log('\n');

  // Start sending audio chunks
  console.log('🎵 Sending test audio chunks...');
  console.log('   (Sending silent audio - replace with real audio for actual testing)');
  console.log('\n');

  sendTestAudioChunks();
});

socket.on('TRANSCRIPTION_RESULT', (data) => {
  const { text, isFinal, speaker, confidence, timestamp } = data.payload;

  transcriptCount++;
  if (isFinal) {
    finalTranscriptCount++;
  }

  const statusIcon = isFinal ? '✅' : '⏳';
  const typeLabel = isFinal ? 'FINAL' : 'PARTIAL';

  console.log(`${statusIcon} [${typeLabel}] Transcript #${transcriptCount}`);
  console.log(`   Text: "${text}"`);
  console.log(`   Speaker: ${speaker}`);
  console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);
  console.log(`   Time: ${new Date(timestamp).toISOString()}`);
  console.log('');
});

socket.on('TRANSCRIPTION_ENDED', (data) => {
  console.log('\n✅ Transcription session ended');
  console.log(`   Session ID: ${data.payload.sessionId}`);
  console.log(`   Timestamp: ${new Date(data.payload.timestamp).toISOString()}`);
  console.log('\n');

  // Display summary
  console.log('📊 Test Summary:');
  console.log(`   Total transcripts: ${transcriptCount}`);
  console.log(`   Final transcripts: ${finalTranscriptCount}`);
  console.log(`   Partial transcripts: ${transcriptCount - finalTranscriptCount}`);
  console.log('\n');

  // Disconnect
  setTimeout(() => {
    console.log('👋 Disconnecting...\n');
    socket.disconnect();
    process.exit(0);
  }, 1000);
});

socket.on('ERROR', (data) => {
  console.error('❌ Error:', data.payload.message);
  console.error(`   Code: ${data.payload.code}`);
  console.error(`   Session ID: ${data.payload.sessionId || 'N/A'}`);
  console.error('\n');

  // Continue or exit depending on error
  if (data.payload.code === 'START_TRANSCRIPTION_ERROR') {
    console.error('⚠️  Fatal error - cannot start transcription');
    socket.disconnect();
    process.exit(1);
  }
});

// Send test audio chunks
function sendTestAudioChunks() {
  let chunksSent = 0;
  const totalChunks = 10; // Send 10 chunks (~5 seconds of audio)

  const interval = setInterval(() => {
    if (chunksSent >= totalChunks) {
      clearInterval(interval);

      // Wait a bit for final transcripts
      setTimeout(() => {
        console.log('🛑 Ending transcription session...\n');
        socket.emit('END_TRANSCRIPTION', {
          sessionId: SESSION_ID,
        });
      }, 2000);

      return;
    }

    // Generate test audio chunk
    // NOTE: This is silent audio (zeros). Replace with real PCM16 audio for actual testing.
    const chunkSize = 16000; // 0.5 seconds @ 16kHz (16000 samples/sec * 0.5 * 2 bytes)
    const audioChunk = generateSilentAudio(chunkSize);

    // Convert to base64
    const base64Audio = audioChunk.toString('base64');

    // Send to backend
    socket.emit('AUDIO_CHUNK', {
      chunk: base64Audio,
      sessionId: SESSION_ID,
      timestamp: Date.now(),
      speaker: chunksSent % 2 === 0 ? 'agent' : 'caller', // Alternate speakers
    });

    chunksSent++;

    if (chunksSent === 1) {
      console.log(`   ✓ Chunk #${chunksSent} sent (${(chunkSize / 1024).toFixed(1)} KB)`);
    } else if (chunksSent % 5 === 0) {
      console.log(`   ✓ Chunk #${chunksSent} sent`);
    }
  }, 500); // Send chunk every 500ms
}

// Generate silent PCM16 audio (for testing only)
function generateSilentAudio(size) {
  // In real usage, this would be actual PCM16 audio from tabCapture
  return Buffer.alloc(size, 0);
}

// Alternative: Generate test tone (uncomment to test with actual audio)
/*
function generateTestTone(size, frequency = 440) {
  const buffer = Buffer.alloc(size);
  const sampleRate = 16000;
  const amplitude = 8000; // Max amplitude for 16-bit

  for (let i = 0; i < size / 2; i++) {
    const sample = Math.floor(amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate));
    buffer.writeInt16LE(sample, i * 2);
  }

  return buffer;
}
*/

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Interrupted by user');

  if (socket.connected) {
    console.log('🛑 Ending transcription session...');
    socket.emit('END_TRANSCRIPTION', {
      sessionId: SESSION_ID,
    });

    setTimeout(() => {
      socket.disconnect();
      process.exit(0);
    }, 1000);
  } else {
    process.exit(0);
  }
});

console.log('⏳ Connecting to backend...\n');
