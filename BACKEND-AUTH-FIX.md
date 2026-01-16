# Backend Authentication Fix

## Problem Summary

The extension is sending this API key:
```
j88URgUHnn1MtaezUpQF57IW7fIOY2Hotgya06UgAwQ=
```

But the AWS Elastic Beanstalk backend doesn't have it configured, causing:
```
❌ [AI Backend] Connection error: Authentication failed
```

## Solution

You need to set environment variables on AWS Elastic Beanstalk to match the extension's configuration.

### Method 1: AWS Elastic Beanstalk CLI (Recommended)

1. **Navigate to backend directory**:
   ```bash
   cd /Users/cob/DevAssist/Projects/DevAssist-Call-Coach-Backend
   ```

2. **Set environment variables** (replace `YOUR_OPENAI_KEY` with your actual OpenAI API key):
   ```bash
   eb setenv \
     BACKEND_API_KEY="j88URgUHnn1MtaezUpQF57IW7fIOY2Hotgya06UgAwQ=" \
     OPENAI_API_KEY="sk-YOUR_ACTUAL_OPENAI_KEY_HERE" \
     CORS_ORIGIN="chrome-extension://*,http://localhost:5173" \
     NODE_ENV="production" \
     PORT="8080" \
     LOG_LEVEL="info"
   ```

3. **Wait for restart** (automatic, takes 2-3 minutes):
   ```bash
   eb status  # Check deployment status
   ```

4. **Verify deployment**:
   ```bash
   eb logs  # Check for "Client authenticated" logs
   ```

### Method 2: AWS Console (Alternative)

1. Go to [AWS Elastic Beanstalk Console](https://console.aws.amazon.com/elasticbeanstalk/)
2. Select application: `devassist-call-coach`
3. Select environment: `devassist-call-coach-prod`
4. Click **Configuration** → **Software** → **Edit**
5. Add environment properties:
   - `BACKEND_API_KEY` = `j88URgUHnn1MtaezUpQF57IW7fIOY2Hotgya06UgAwQ=`
   - `OPENAI_API_KEY` = `sk-YOUR_ACTUAL_OPENAI_KEY_HERE`
   - `CORS_ORIGIN` = `chrome-extension://*,http://localhost:5173`
   - `NODE_ENV` = `production`
   - `PORT` = `8080`
   - `LOG_LEVEL` = `info`
6. Click **Apply** and wait for restart

### Method 3: Quick Script (Requires OpenAI Key)

```bash
cd /Users/cob/DevAssist/Projects/DevAssist-Call-Coach-Backend

# Replace with your actual OpenAI API key
export OPENAI_KEY="sk-proj-YOUR_KEY_HERE"

eb setenv \
  BACKEND_API_KEY="j88URgUHnn1MtaezUpQF57IW7fIOY2Hotgya06UgAwQ=" \
  OPENAI_API_KEY="$OPENAI_KEY" \
  CORS_ORIGIN="chrome-extension://*,http://localhost:5173" \
  NODE_ENV="production"
```

## Testing After Fix

1. **Reload the extension** in Chrome
2. **Make a call** on CallTools.io
3. **Click "Start AI Coaching"** button
4. **Check console** - you should see:
   ```
   ✅ [AI Backend] Connected - Socket ID: xyz123
   🎯 [AI Backend] Conversation started: conv-xyz
   ```

## Expected Backend Logs

After the fix, AWS logs should show:
```
Client authenticated { socketId: 'xyz123' }
Starting conversation { agentId: 'agent-123' }
Conversation started { conversationId: 'conv-xyz' }
```

## What Was Wrong

**Backend Authentication Code** (server.ts:70-79):
```typescript
io.use((socket, next) => {
  const apiKey = socket.handshake.auth.apiKey;
  if (apiKey === process.env.BACKEND_API_KEY) {  // ← This was undefined/placeholder
    next();
  } else {
    next(new Error('Authentication failed'));  // ← This was executing
  }
});
```

The `process.env.BACKEND_API_KEY` was either undefined or set to a placeholder value on the deployed backend, so authentication always failed.

## About the Git Push Issue

The `cobb-simple` remote repository doesn't exist on GitHub:
```
fatal: repository 'https://github.com/Cobb-Simple/devassist-call-coach.git/' not found
```

**Solutions**:
1. Create the repository at: https://github.com/Cobb-Simple/devassist-call-coach
2. Or continue using the `aivate` remote (already has the audio fix pushed)

## Summary

- ✅ **Audio degradation**: FIXED and committed
- ⚠️ **Backend authentication**: Needs AWS environment variable update
- ⚠️ **Git remote**: `cobb-simple` repository doesn't exist

Once you update the AWS environment variables, the backend authentication will work and you'll get AI coaching tips during calls!
