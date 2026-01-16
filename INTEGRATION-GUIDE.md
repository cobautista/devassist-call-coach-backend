# Integration Guide - Frontend + Backend

This guide explains how to integrate the DevAssist Call Coach frontend (Chrome extension) with the AI coaching backend.

## Quick Start

### 1. Backend Setup

```bash
cd /Users/cob/DevAssist/Projects/DevAssist-Call-Coach-Backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your keys
# Required:
# - OPENAI_API_KEY=sk-...
# - BACKEND_API_KEY=your-secure-random-key-here
```

### 2. Frontend Setup

```bash
cd /Users/cob/DevAssist/Projects/DevAssist-Call-Coach

# Create/update .env file
echo "VITE_BACKEND_URL=http://localhost:8080" >> .env
echo "VITE_BACKEND_API_KEY=your-secure-random-key-here" >> .env

# Rebuild extension
npm run build
```

### 3. Start Backend

```bash
cd /Users/cob/DevAssist/Projects/DevAssist-Call-Coach-Backend
npm run dev
```

You should see:
```
[info]: Server running on port 8080
[info]: Environment: development
[info]: CORS origins: http://localhost:5173, chrome-extension://your-extension-id
```

### 4. Test Connection

Open Chrome DevTools Console in the extension and check for:
```
🤖 [AI Backend] Connecting to http://localhost:8080...
✅ [AI Backend] Connected - Socket ID: abc123
```

## Environment Variables Mapping

| Backend (.env) | Frontend (.env) | Purpose |
|----------------|-----------------|---------|
| `BACKEND_API_KEY` | `VITE_BACKEND_API_KEY` | Authentication (must match) |
| `PORT=8080` | `VITE_BACKEND_URL=http://localhost:8080` | Server location |
| `OPENAI_API_KEY` | N/A | OpenAI API access (backend only) |
| `CORS_ORIGIN` | N/A | Allowed origins (extension ID) |

## Event Flow Verification

### Auto Mode (Default)

1. **Start call** → Frontend sends `START_CONVERSATION`
2. **Backend responds** → `CONVERSATION_STARTED` with conversationId
3. **Wait 3 minutes** → Backend sends first `AI_TIP` (greeting)
4. **Every 30 seconds** → Backend sends periodic `AI_TIP`
5. **End call** → Frontend sends `END_CONVERSATION`

**Console Logs to Check:**

Frontend:
```
🎯 [Background] AI conversation started: conv-uuid
💡 [Background] AI Tip received: Greeting
```

Backend:
```
[info]: Conversation started {"conversationId":"conv-uuid"}
[info]: Warmup complete - greeting sent
[info]: Periodic tip sent
```

### Event-Driven Mode

1. **Start call** → Frontend sends `START_CONVERSATION`
2. **Toggle mode** → Set "On-Demand" in side panel
3. **Wait 3 minutes** → Backend sends first `AI_TIP`
4. **Select option** → Frontend records selection, transitions to CAPTURING_RESPONSE
5. **Agent speaks** → Frontend captures transcript
6. **Customer responds** → Frontend captures reaction
7. **Frontend sends** → `REQUEST_NEXT_TIP` with full context
8. **Backend generates** → Contextual `AI_TIP` based on actual conversation
9. **Repeat** → Steps 4-8 until call ends

**Console Logs to Check:**

Frontend:
```
🎯 [AITipsSection] Event-driven mode - recording selection for contextual next tip
📝 [Background] Captured agent response: "Hey, thanks for..."
📝 [Background] Captured customer reaction: "Sure, I'm interested..."
🚀 [AI Backend] Requesting next tip with context
```

Backend:
```
[info]: Generating contextual next tip {"selectedOption":2,"hasAgentResponse":true,"hasCustomerReaction":true}
[info]: Contextual tip sent {"heading":"Address Budget"}
```

## Testing Hybrid Modes

### Test Auto Mode
```typescript
// In Chrome DevTools Console
chrome.storage.local.set({
  'devassist-settings': {
    coachingMode: 'auto'
  }
});
```

### Test Event-Driven Mode
```typescript
// In Chrome DevTools Console
chrome.storage.local.set({
  'devassist-settings': {
    coachingMode: 'event-driven'
  }
});
```

## Common Integration Issues

### Issue: "Authentication failed"

**Symptom**: Extension can't connect, error in backend logs

**Fix**:
```bash
# Ensure both .env files have matching API key
# Backend
echo "BACKEND_API_KEY=test-key-12345" > .env

# Frontend
echo "VITE_BACKEND_API_KEY=test-key-12345" >> .env

# Rebuild frontend
npm run build
```

### Issue: "CORS error"

**Symptom**: Browser blocks WebSocket connection

**Fix**:
```bash
# Backend .env
CORS_ORIGIN=http://localhost:5173,chrome-extension://YOUR_EXTENSION_ID

# Get extension ID from chrome://extensions
```

### Issue: "No tips generated"

**Symptom**: Connection works but no AI_TIP events

**Fix**:
1. Check OPENAI_API_KEY is valid
2. Verify transcripts are being sent (check backend logs)
3. Wait full 3 minutes for warmup
4. Check OpenAI account has credits

### Issue: "REQUEST_NEXT_TIP not working"

**Symptom**: Event-driven mode doesn't generate contextual tips

**Fix**:
1. Verify coaching mode is set to 'event-driven'
2. Check that selection was recorded (frontend logs)
3. Ensure agent speech was captured (final transcript with confidence > 0.7)
4. Verify customer reaction was captured
5. Check backend logs for REQUEST_NEXT_TIP event

## Production Deployment

### Backend (AWS Elastic Beanstalk)

```bash
cd DevAssist-Call-Coach-Backend

# Deploy to EB
eb deploy

# Get URL
eb status
# Example: devassist-call-coach.us-east-1.elasticbeanstalk.com

# Set production env vars
eb setenv OPENAI_API_KEY=sk-prod-...
eb setenv BACKEND_API_KEY=secure-prod-key
eb setenv CORS_ORIGIN=chrome-extension://PROD_EXTENSION_ID
```

### Frontend (Chrome Extension)

```bash
cd DevAssist-Call-Coach

# Update .env for production
echo "VITE_BACKEND_URL=https://devassist-call-coach.us-east-1.elasticbeanstalk.com" > .env
echo "VITE_BACKEND_API_KEY=secure-prod-key" >> .env

# Build production extension
npm run build

# Upload to Chrome Web Store
```

## Health Monitoring

### Backend Health Check
```bash
curl http://localhost:8080/health

# Response:
{
  "status": "healthy",
  "timestamp": 1704067200000,
  "activeConversations": 3
}
```

### Frontend Connection Status

Check in extension popup or side panel:
- **Green dot** = Connected (AI Ready)
- **Yellow dot** = Connecting
- **Red dot** = Error
- **Gray dot** = Disconnected

## Cost Monitoring

Track OpenAI API usage in backend logs:
```
[info]: Generating contextual tip {...}
```

Each log entry = 1 API call.

**Auto mode**: ~20 calls per 10-minute call = $0.04
**Event-driven mode**: ~7 calls per 10-minute call = $0.02

## Next Steps

1. ✅ Backend running locally (port 8080)
2. ✅ Frontend .env configured
3. ✅ Extension built and loaded
4. ✅ Start test call on CallTools
5. ✅ Verify tips appearing every 30 seconds (auto mode)
6. ✅ Toggle to event-driven mode
7. ✅ Select option and verify contextual tip
8. ✅ Deploy to production (AWS + Chrome Web Store)

## Support

- Backend logs: Check terminal where `npm run dev` is running
- Frontend logs: Chrome DevTools → Console → Filter by "Background" or "AI Backend"
- WebSocket traffic: Chrome DevTools → Network → WS tab

For issues, check:
1. Both servers running
2. API keys match
3. CORS configured
4. Firewall allows port 8080
5. OpenAI API key valid
