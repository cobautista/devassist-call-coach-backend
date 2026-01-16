# DevAssist Call Coach Backend - Deployment Guide

**Date**: January 11, 2026
**Status**: Ready for deployment

---

## Prerequisites Completed ✅

- [x] Backend code written
- [x] Dependencies installed (`npm install`)
- [x] TypeScript compilation successful (`npm run build`)
- [x] `.env` file created from template

---

## Step 1: Configure API Keys

### 1.1 Get OpenAI API Key

1. Visit: https://platform.openai.com/api-keys
2. Sign in to your OpenAI account
3. Click "Create new secret key"
4. Copy the key (starts with `sk-...`)
5. **IMPORTANT**: Save it securely - you won't see it again!

### 1.2 Generate Backend API Key

Run this command to generate a secure random key:

```bash
openssl rand -hex 32
```

Copy the output (64-character hex string).

### 1.3 Update .env File

Edit `/Users/cob/DevAssist/Projects/DevAssist-Call-Coach-Backend/.env`:

```bash
# Replace these placeholders with your actual keys:
OPENAI_API_KEY=sk-YOUR-ACTUAL-OPENAI-API-KEY-HERE
BACKEND_API_KEY=YOUR-SECURE-RANDOM-KEY-HERE
```

**Security Note**: Never commit `.env` to git. It's already in `.gitignore`.

---

## Step 2: Test Backend Locally

### 2.1 Start Development Server

```bash
cd /Users/cob/DevAssist/Projects/DevAssist-Call-Coach-Backend
npm run dev
```

Expected output:
```
[INFO] Server running on port 8080
[INFO] Environment: development
[INFO] CORS origins: http://localhost:5173, chrome-extension://*
```

### 2.2 Verify Health Endpoint

In a new terminal:

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": 1736611200000,
  "activeConversations": 0
}
```

### 2.3 Test Socket.io Connection

Use the provided test script:

```bash
chmod +x test-connection.sh
./test-connection.sh
```

This script:
- Connects to the backend WebSocket
- Authenticates with your API key
- Sends a PING message
- Receives a PONG response

**Success Criteria**:
- Connection established
- Authentication successful
- PONG received within 1 second

---

## Step 3: Update Frontend Configuration

### 3.1 Update Extension .env

Edit `/Users/cob/DevAssist/Projects/DevAssist-Call-Coach/.env`:

```bash
# For local testing
VITE_BACKEND_URL=http://localhost:8080
VITE_BACKEND_API_KEY=YOUR-SECURE-RANDOM-KEY-HERE  # Same as backend .env

# For production (update after deploying to AWS)
# VITE_BACKEND_URL=https://your-backend.us-east-1.elasticbeanstalk.com
# VITE_BACKEND_API_KEY=YOUR-SECURE-RANDOM-KEY-HERE
```

### 3.2 Rebuild Extension

```bash
cd /Users/cob/DevAssist/Projects/DevAssist-Call-Coach
npm run build
```

### 3.3 Reload Extension in Chrome

1. Open `chrome://extensions`
2. Find "DevAssist Call Coach"
3. Click reload button (circular arrow)

---

## Step 4: End-to-End Local Testing

### 4.1 Test Auto Mode (30-second intervals)

1. Ensure backend is running (`npm run dev`)
2. Open Chrome extension
3. Navigate to CallTools
4. Start a call
5. Wait 3 minutes (warmup)
6. Verify:
   - First AI tip appears after 3 minutes
   - Subsequent tips appear every 30 seconds
   - Tips are contextually relevant

**Check Backend Logs**:
```
[INFO] Client connected
[INFO] Starting conversation
[INFO] Warmup complete - greeting sent
[INFO] Periodic tip sent
```

### 4.2 Test Event-Driven Mode

1. Toggle to "On-Demand" mode in side panel
2. Start a call
3. Wait 3 minutes (warmup)
4. First tip appears → Select an option
5. Speak the suggested script (or variation)
6. Wait for customer response
7. Verify:
   - State changes: "Listening to your response..." → "Analyzing customer reaction..." → "Generating next tip..."
   - Next tip adapts to actual conversation
   - Tips reflect what you actually said vs what was suggested

**Check Backend Logs**:
```
[INFO] Client connected
[INFO] Starting conversation
[INFO] Warmup complete - greeting sent
[INFO] Generating contextual next tip
[INFO] Contextual tip sent
```

### 4.3 Verify Transcription Flow

**Expected Console Logs in Chrome DevTools**:
```
✅ [Offscreen] Deepgram CALLER WebSocket connected
✅ [Offscreen] Deepgram AGENT WebSocket connected
📝 [Background] Transcription from AGENT (FINAL): "Hello, how are you today?"
📝 [Background] Transcription from CALLER (FINAL): "I'm doing well, thanks!"
```

**Verify**:
- Transcripts finalize within 1-2 seconds (not 3-4 seconds)
- Text is clear and accurate (Nova-3 model)
- No "staticky" feeling

---

## Step 5: Deploy to AWS Elastic Beanstalk (Production)

### 5.1 Install AWS CLI and EB CLI

```bash
# Install AWS CLI
brew install awscli

# Configure AWS credentials
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Region: us-east-1
# Output format: json

# Install Elastic Beanstalk CLI
brew install aws-elasticbeanstalk
```

### 5.2 Initialize Elastic Beanstalk

```bash
cd /Users/cob/DevAssist/Projects/DevAssist-Call-Coach-Backend

# Initialize EB application
eb init

# Follow prompts:
# - Select region: us-east-1
# - Application name: devassist-call-coach-backend
# - Platform: Node.js
# - Platform version: Node.js 20
# - SSH keypair: (optional, for debugging)
```

### 5.3 Create Production Environment

```bash
# Create environment
eb create devassist-backend-prod

# This will:
# - Create EC2 instance
# - Configure load balancer
# - Set up security groups
# - Deploy your application
# - Takes ~5-10 minutes
```

### 5.4 Set Environment Variables

```bash
# Set OpenAI API key
eb setenv OPENAI_API_KEY=sk-YOUR-ACTUAL-OPENAI-API-KEY-HERE

# Set Backend API key
eb setenv BACKEND_API_KEY=YOUR-SECURE-RANDOM-KEY-HERE

# Set Node environment
eb setenv NODE_ENV=production

# Set CORS origin (replace with your extension ID)
eb setenv CORS_ORIGIN=chrome-extension://YOUR-EXTENSION-ID

# Set port (EB uses 8080 by default)
eb setenv PORT=8080
```

### 5.5 Verify Deployment

```bash
# Check application status
eb status

# Open application in browser (shows health endpoint)
eb open

# View logs
eb logs
```

**Expected Output**:
```
Environment details for: devassist-backend-prod
  Application name: devassist-call-coach-backend
  Region: us-east-1
  Platform: Node.js 20
  CNAME: devassist-backend-prod.us-east-1.elasticbeanstalk.com
  Status: Ready
  Health: Green
```

### 5.6 Get Production URL

```bash
eb status | grep CNAME
```

Example output:
```
CNAME: devassist-backend-prod.us-east-1.elasticbeanstalk.com
```

Your production URL is: `https://devassist-backend-prod.us-east-1.elasticbeanstalk.com`

---

## Step 6: Update Frontend for Production

### 6.1 Update Extension .env

Edit `/Users/cob/DevAssist/Projects/DevAssist-Call-Coach/.env`:

```bash
# Production backend
VITE_BACKEND_URL=https://devassist-backend-prod.us-east-1.elasticbeanstalk.com
VITE_BACKEND_API_KEY=YOUR-SECURE-RANDOM-KEY-HERE
```

### 6.2 Rebuild Extension

```bash
cd /Users/cob/DevAssist/Projects/DevAssist-Call-Coach
npm run build
```

### 6.3 Reload Extension

1. Open `chrome://extensions`
2. Reload "DevAssist Call Coach"
3. Test connection to production backend

---

## Step 7: Production Testing

### 7.1 Verify Connection

Open Chrome DevTools console during call:

```
✅ [AI Backend] Connected to backend
✅ [AI Backend] Authenticated
```

### 7.2 Monitor Backend Logs

```bash
eb logs --stream
```

Watch for:
```
[INFO] Client connected
[INFO] Starting conversation
[INFO] Warmup complete - greeting sent
[INFO] Periodic tip sent
```

### 7.3 Test Both Modes

**Auto Mode**:
- Tips appear every 30 seconds after warmup
- Consistent timing

**Event-Driven Mode**:
- Tips appear only after selection
- Contextual adaptation to actual conversation
- State transitions visible in UI

---

## Troubleshooting

### Backend Won't Start Locally

**Error**: `Missing required environment variable: OPENAI_API_KEY`

**Fix**: Ensure `.env` file exists and contains valid keys:
```bash
cat .env | grep OPENAI_API_KEY
# Should show: OPENAI_API_KEY=sk-...
```

### Extension Can't Connect

**Error**: `WebSocket connection failed`

**Check**:
1. Backend is running: `curl http://localhost:8080/health`
2. Frontend .env has correct URL: `cat .env | grep VITE_BACKEND_URL`
3. CORS origins include extension: Check backend logs for "CORS origins: ..."

**Fix**:
```bash
# Backend .env should have:
CORS_ORIGIN=http://localhost:5173,chrome-extension://*
```

### Authentication Failed

**Error**: `Authentication failed` in Socket.io logs

**Check**: API keys match between backend and frontend
```bash
# Backend
cat /Users/cob/DevAssist/Projects/DevAssist-Call-Coach-Backend/.env | grep BACKEND_API_KEY

# Frontend
cat /Users/cob/DevAssist/Projects/DevAssist-Call-Coach/.env | grep VITE_BACKEND_API_KEY
```

They must be identical.

### OpenAI API Errors

**Error**: `401 Unauthorized` from OpenAI

**Fix**:
1. Verify API key is valid: https://platform.openai.com/api-keys
2. Check account has credits: https://platform.openai.com/usage
3. Regenerate key if needed and update `.env`

### EB Deployment Fails

**Error**: `Platform requires npm version >= 10.0.0`

**Fix**: Update `package.json` engines:
```json
"engines": {
  "node": ">=20.0.0",
  "npm": ">=10.0.0"
}
```

Then redeploy:
```bash
eb deploy
```

---

## Cost Monitoring

### OpenAI Usage

Monitor at: https://platform.openai.com/usage

**Expected Costs** (per 10-minute call):

**Auto Mode**:
- ~20 AI calls (every 30 seconds)
- Cost: ~$0.05 per call

**Event-Driven Mode**:
- ~5-10 AI calls (after selections)
- Cost: ~$0.02-$0.03 per call

**Model**: GPT-4o-mini ($0.150/1M input tokens, $0.600/1M output tokens)

### AWS Costs

**Elastic Beanstalk** (t3.micro):
- EC2 instance: ~$7-10/month
- Data transfer: ~$1-3/month
- Load balancer: ~$16/month

**Total**: ~$25-30/month for production backend

**Free Tier Eligible**: First 12 months on new AWS accounts

---

## Rollback Plan

### Revert to Local Backend

If production issues occur:

```bash
# Frontend .env
VITE_BACKEND_URL=http://localhost:8080
VITE_BACKEND_API_KEY=YOUR-LOCAL-KEY

# Rebuild extension
npm run build

# Start local backend
cd DevAssist-Call-Coach-Backend
npm run dev
```

### Revert Code Changes

```bash
# Backend
cd /Users/cob/DevAssist/Projects/DevAssist-Call-Coach-Backend
git checkout main

# Frontend
cd /Users/cob/DevAssist/Projects/DevAssist-Call-Coach
git checkout main
npm run build
```

---

## Next Steps After Deployment

1. ✅ Backend deployed to production
2. ✅ Extension connected to production backend
3. ⏳ Monitor OpenAI usage and costs
4. ⏳ Collect user feedback on event-driven mode
5. ⏳ A/B test auto vs event-driven modes
6. ⏳ Optimize prompts based on usage data
7. ⏳ Add database persistence (optional)
8. ⏳ Set up error monitoring (Sentry, DataDog)

---

## Support

### Check Status

```bash
# Local backend
curl http://localhost:8080/health

# Production backend
curl https://devassist-backend-prod.us-east-1.elasticbeanstalk.com/health
```

### View Logs

```bash
# Local backend
# Check terminal running npm run dev

# Production backend
eb logs --stream
```

### Common Issues

1. **No tips appearing**: Check backend logs for errors
2. **Tips not contextual**: Verify event-driven mode is active
3. **High latency**: Check OpenAI API response times in logs
4. **Authentication failures**: Verify API keys match

---

**Deployment Status**: Ready to deploy
**Last Updated**: January 11, 2026
**Next Action**: Configure API keys and test locally

