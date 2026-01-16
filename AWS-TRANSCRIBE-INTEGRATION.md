# AWS Transcribe Streaming Integration

**Status**: ✅ **COMPLETE** - Ready for Extension Integration
**Date**: 2026-01-16
**Purpose**: Fallback transcription service when Deepgram WebSocket is blocked by Chrome CSP

---

## 📋 Overview

This backend now supports **AWS Transcribe Streaming** as a fallback transcription service for the DevAssist-Call-Coach Chrome extension. When Deepgram's WebSocket connection is blocked by Chrome's Content Security Policy (CSP), the extension can route audio through this backend to AWS Transcribe instead.

---

## 🏗️ Architecture

### Data Flow

```
Chrome Extension (tabCapture)
  ↓ PCM16 audio @ 16kHz
  ↓ Via Socket.IO or HTTP POST
Backend (Node.js + Express + Socket.IO)
  ↓ Converts Base64 → Buffer
  ↓ Streams to AWS Transcribe
AWS Transcribe Streaming API
  ↓ Real-time transcription
  ↓ Partial + Final results
Backend
  ↓ Emits via Socket.IO
Chrome Extension
  ✓ Displays transcripts
```

### Audio Specifications

| Property | Value |
|----------|-------|
| **Encoding** | PCM signed 16-bit little-endian |
| **Sample Rate** | 16000 Hz |
| **Channels** | 1 (mono) |
| **Chunk Size** | ~512ms of audio per chunk |
| **Format** | Raw Int16Array → Base64 string or Buffer |

---

## 🔧 Backend Implementation

### 1. New Service: `aws-transcribe.service.ts`

**Location**: `/src/services/aws-transcribe.service.ts`

**Features**:
- Real-time streaming transcription
- Session management (start/send/end)
- Speaker detection (basic)
- Partial and final results
- Auto-retry on errors (max 3 attempts)
- Graceful cleanup

**Key Methods**:
```typescript
class AWSTranscribeService {
  async startSession(
    sessionId: string,
    onTranscript: (result: TranscriptResult) => void,
    onError?: (error: Error) => void
  ): Promise<void>

  async sendAudioChunk(sessionId: string, audioData: Buffer): Promise<void>

  async endSession(sessionId: string): Promise<void>

  getActiveSessionCount(): number
  isSessionActive(sessionId: string): boolean
  async cleanup(): Promise<void>
}
```

### 2. Socket.IO Events

#### **Client → Server**

##### `START_TRANSCRIPTION`
Start a new AWS Transcribe session.

```typescript
socket.emit('START_TRANSCRIPTION', {
  sessionId: string,
  sampleRate?: number,  // Default: 16000
  encoding?: string     // Default: 'pcm'
});
```

**Server Response**: `TRANSCRIPTION_STARTED`
```typescript
{
  type: 'TRANSCRIPTION_STARTED',
  payload: {
    sessionId: string,
    timestamp: number
  }
}
```

##### `AUDIO_CHUNK`
Send audio data for transcription.

```typescript
socket.emit('AUDIO_CHUNK', {
  chunk: string,        // Base64-encoded PCM16 audio OR Buffer
  sessionId: string,
  timestamp: number,
  speaker?: 'agent' | 'caller'  // Optional hint
});
```

**Server Response**: `TRANSCRIPTION_RESULT` (real-time)
```typescript
{
  type: 'TRANSCRIPTION_RESULT',
  payload: {
    text: string,
    isFinal: boolean,
    speaker: 'agent' | 'caller' | 'unknown',
    confidence: number,    // 0-1
    sessionId: string,
    timestamp: number
  }
}
```

##### `END_TRANSCRIPTION`
End transcription session.

```typescript
socket.emit('END_TRANSCRIPTION', {
  sessionId: string
});
```

**Server Response**: `TRANSCRIPTION_ENDED`
```typescript
{
  type: 'TRANSCRIPTION_ENDED',
  payload: {
    sessionId: string,
    timestamp: number
  }
}
```

#### **Server → Client**

##### `TRANSCRIPTION_RESULT`
Real-time transcript (partial or final).

##### `ERROR`
Transcription error occurred.

```typescript
{
  type: 'ERROR',
  payload: {
    sessionId: string,
    message: string,
    code: 'TRANSCRIPTION_ERROR' | 'INVALID_AUDIO_DATA' | ...,
    timestamp: number
  }
}
```

### 3. REST API Endpoints

#### `POST /api/transcribe/start`

**Purpose**: Initialize transcription session (optional - can auto-start).

**Headers**:
```
x-api-key: <BACKEND_API_KEY>
Content-Type: application/json
```

**Body**:
```json
{
  "sessionId": "call-12345"
}
```

**Response**:
```json
{
  "success": true,
  "sessionId": "call-12345",
  "message": "Session ready. Send audio chunks to /api/transcribe/chunk"
}
```

#### `POST /api/transcribe/chunk`

**Purpose**: Send audio chunk (REST fallback - Socket.IO preferred).

**Headers**:
```
x-api-key: <BACKEND_API_KEY>
Content-Type: application/json
```

**Body**:
```json
{
  "chunk": "base64-encoded-pcm16-audio-data",
  "sessionId": "call-12345",
  "timestamp": 1234567890,
  "speaker": "agent"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Audio chunk received"
}
```

**Note**: Transcripts are NOT returned in HTTP response. Use Socket.IO `TRANSCRIPTION_RESULT` event for real-time results.

#### `POST /api/transcribe/end`

**Purpose**: End transcription session.

**Headers**:
```
x-api-key: <BACKEND_API_KEY>
Content-Type: application/json
```

**Body**:
```json
{
  "sessionId": "call-12345"
}
```

**Response**:
```json
{
  "success": true,
  "sessionId": "call-12345"
}
```

---

## ⚙️ Configuration

### Environment Variables

Add to `.env`:

```bash
# AWS Transcribe Streaming (for audio transcription fallback)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
```

### AWS IAM Permissions

Required IAM policy for AWS credentials:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "transcribe:StartStreamTranscription"
      ],
      "Resource": "*"
    }
  ]
}
```

### Getting AWS Credentials

1. **Go to AWS IAM Console**: https://console.aws.amazon.com/iam/
2. **Create New User**:
   - User name: `devassist-transcribe-service`
   - Access type: ✓ Programmatic access
3. **Attach Policy**:
   - Create custom policy with permissions above
   - OR use managed policy: `TranscribeFullAccess` (broader permissions)
4. **Save Credentials**:
   - Copy `Access Key ID` and `Secret Access Key`
   - Add to `.env` file

---

## 🧪 Testing

### Test with curl (REST API)

```bash
# 1. Start session
curl -X POST http://localhost:8080/api/transcribe/start \
  -H "x-api-key: YOUR_BACKEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test-session-1"}'

# 2. Send audio chunk (base64-encoded PCM16)
curl -X POST http://localhost:8080/api/transcribe/chunk \
  -H "x-api-key: YOUR_BACKEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "chunk": "BASE64_ENCODED_AUDIO_DATA",
    "sessionId": "test-session-1",
    "timestamp": 1234567890
  }'

# 3. End session
curl -X POST http://localhost:8080/api/transcribe/end \
  -H "x-api-key: YOUR_BACKEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test-session-1"}'
```

### Test with Socket.IO (JavaScript)

See `test-aws-transcribe.js` for complete example.

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8080', {
  auth: {
    apiKey: process.env.BACKEND_API_KEY
  }
});

// Start transcription
socket.emit('START_TRANSCRIPTION', {
  sessionId: 'test-session-1'
});

// Listen for results
socket.on('TRANSCRIPTION_RESULT', (data) => {
  console.log('Transcript:', data.payload.text);
  console.log('Is Final:', data.payload.isFinal);
  console.log('Speaker:', data.payload.speaker);
});

// Send audio chunks
socket.emit('AUDIO_CHUNK', {
  chunk: base64AudioData,
  sessionId: 'test-session-1',
  timestamp: Date.now()
});

// End session
socket.emit('END_TRANSCRIPTION', {
  sessionId: 'test-session-1'
});
```

---

## 🔌 Extension Integration

### Recommended Flow

```typescript
// 1. Try Deepgram first (if available)
try {
  const deepgramSocket = new WebSocket('wss://api.deepgram.com/...');
  // Use Deepgram WebSocket
} catch (error) {
  console.warn('Deepgram WebSocket blocked by CSP, falling back to AWS Transcribe');

  // 2. Fall back to AWS Transcribe via backend
  const backendSocket = io('https://your-backend.com', {
    auth: { apiKey: BACKEND_API_KEY }
  });

  backendSocket.emit('START_TRANSCRIPTION', {
    sessionId: callId
  });

  backendSocket.on('TRANSCRIPTION_RESULT', handleTranscript);

  // Send audio chunks
  audioProcessor.addEventListener('audiodata', (event) => {
    const audioChunk = event.data; // Int16Array
    const base64Audio = arrayBufferToBase64(audioChunk.buffer);

    backendSocket.emit('AUDIO_CHUNK', {
      chunk: base64Audio,
      sessionId: callId,
      timestamp: Date.now()
    });
  });
}
```

### Audio Conversion Helper

```typescript
// Convert Int16Array to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
```

---

## 📊 Performance Considerations

### Latency

| Method | Latency | Use Case |
|--------|---------|----------|
| **Socket.IO** | ~100-200ms | Real-time transcription (recommended) |
| **REST API** | ~200-400ms | Fallback or batch processing |

### Bandwidth

- **Audio**: ~32 KB/s (16kHz mono PCM16)
- **Transcripts**: ~1-5 KB/s (text)
- **Total**: ~33-37 KB/s per active call

### AWS Costs

- **AWS Transcribe**: $0.0004/second = $0.024/minute = $1.44/hour
- **Data Transfer**: Minimal (< $0.01/hour)
- **Total**: ~$1.50/hour per active call

---

## 🐛 Troubleshooting

### Error: "Unauthorized"

**Cause**: Missing or invalid `x-api-key` header or Socket.IO auth.

**Fix**: Ensure `BACKEND_API_KEY` is set in extension and matches backend `.env`.

### Error: "Invalid base64 audio data"

**Cause**: Audio chunk is not properly base64-encoded.

**Fix**: Use `btoa()` or `Buffer.from().toString('base64')` to encode audio.

### Error: "Session not found"

**Cause**: Session ended or never started.

**Fix**: Call `START_TRANSCRIPTION` before sending audio chunks.

### No Transcripts Received

**Possible Causes**:
1. AWS credentials not configured
2. Audio format incorrect (must be PCM16 @ 16kHz)
3. Audio chunks too small (< 100ms)
4. Socket.IO not connected

**Debug Steps**:
1. Check backend logs: `npm run dev`
2. Verify AWS credentials in `.env`
3. Inspect audio chunk size (should be ~16KB for 512ms)
4. Test with `test-aws-transcribe.js` script

---

## 📚 Additional Resources

- **AWS Transcribe Streaming Docs**: https://docs.aws.amazon.com/transcribe/latest/dg/streaming.html
- **Socket.IO Client Docs**: https://socket.io/docs/v4/client-api/
- **Chrome Extension Audio**: https://developer.chrome.com/docs/extensions/reference/tabCapture/

---

## ✅ Implementation Checklist

- [x] Install `@aws-sdk/client-transcribe-streaming`
- [x] Create `aws-transcribe.service.ts`
- [x] Add Socket.IO handlers (`START_TRANSCRIPTION`, `AUDIO_CHUNK`, `END_TRANSCRIPTION`)
- [x] Add REST endpoints (`/api/transcribe/start`, `/api/transcribe/chunk`, `/api/transcribe/end`)
- [x] Add environment variables (`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- [x] Update types (`AudioChunkPayload`, `TranscriptionResponse`, etc.)
- [x] Add graceful cleanup on shutdown
- [x] Test build successfully
- [ ] Configure AWS credentials
- [ ] Test with real audio data
- [ ] Update Chrome extension to use fallback
- [ ] Deploy to production

---

## 🚀 Next Steps

1. **Configure AWS Credentials**:
   - Add real AWS keys to `.env`
   - Test connection: `npm run dev`

2. **Test Locally**:
   - Run backend: `npm run dev`
   - Use `test-aws-transcribe.js` to send test audio
   - Verify transcripts are received

3. **Update Extension**:
   - Implement fallback logic in extension
   - Test with blocked Deepgram WebSocket
   - Verify audio quality and latency

4. **Deploy to Production**:
   - Update production `.env` with AWS credentials
   - Deploy backend to AWS Elastic Beanstalk
   - Test end-to-end with production extension

---

**Implementation Date**: 2026-01-16
**Backend Version**: 1.0.0
**Status**: ✅ Ready for Integration
