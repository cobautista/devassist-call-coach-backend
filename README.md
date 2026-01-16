# DevAssist Call Coach - AI Coaching Backend

Real-time AI coaching backend for DevAssist Call Coach Chrome extension. Provides Socket.io WebSocket server with OpenAI GPT-4o-mini integration for intelligent sales coaching.

## Features

- **Socket.io WebSocket Server** - Real-time bidirectional communication
- **Hybrid Coaching Modes**:
  - **Auto Mode**: AI tips every 30 seconds after 3-minute warmup
  - **Event-Driven Mode**: Contextual tips based on actual conversation flow
- **OpenAI GPT-4o-mini Integration** - Fast, cost-effective AI analysis
- **Conversation Management** - In-memory conversation tracking with transcript history
- **Authentication** - API key-based client authentication
- **Production Ready** - AWS Elastic Beanstalk deployment configuration

## Architecture

```
src/
├── services/
│   ├── ai-analysis.service.ts    # OpenAI integration + tip generation
│   └── conversation.service.ts   # Conversation state management
├── utils/
│   └── logger.ts                 # Winston logger
├── types/
│   └── index.ts                  # TypeScript type definitions
└── server.ts                     # Express + Socket.io server
```

## Prerequisites

- Node.js 20.x or higher
- npm 10.x or higher
- OpenAI API key
- PostgreSQL 15+ (optional, for production)

## Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env and add your keys
# Required: OPENAI_API_KEY, BACKEND_API_KEY
```

## Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...
BACKEND_API_KEY=your-secure-random-key

# Optional
NODE_ENV=development
PORT=8080
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=info
```

## Development

```bash
# Start development server with hot reload
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Run tests
npm test
```

## WebSocket Events

### Client → Server

- **START_CONVERSATION** - Initialize new coaching session
- **TRANSCRIPT** - Send transcript segment (final only)
- **OPTION_SELECTED** - User selected dialogue option (analytics)
- **REQUEST_NEXT_TIP** - Request contextual tip (event-driven mode)
- **END_CONVERSATION** - End session
- **PING** - Connection test

### Server → Client

- **CONVERSATION_STARTED** - Session initialized
- **AI_TIP** - New coaching recommendation
- **CONVERSATION_ENDED** - Session ended
- **ERROR** - Error occurred
- **PONG** - Ping response

## Event-Driven Mode Flow

1. **Warmup** (3 minutes) → First AI tip generated
2. **User selects option** → Frontend captures selection
3. **Agent speaks** → Transcript captured
4. **Customer responds** → Reaction captured
5. **REQUEST_NEXT_TIP sent** with full context:
   - Selected option
   - Agent's actual words (vs suggested script)
   - Customer's reaction
   - Last 20 transcript segments
6. **AI generates contextual tip** adapting to actual conversation flow
7. Repeat steps 2-6 until call ends

## Auto Mode Flow

1. **Warmup** (3 minutes) → First AI tip
2. **Every 30 seconds** → New tip based on recent transcripts
3. No user interaction required
4. Simpler prompts, faster generation

## Deployment (AWS Elastic Beanstalk)

```bash
# Initialize EB
eb init

# Create environment
eb create devassist-call-coach-prod

# Set environment variables
eb setenv OPENAI_API_KEY=sk-... BACKEND_API_KEY=...

# Deploy
eb deploy

# Check status
eb status

# View logs
eb logs
```

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure PostgreSQL DATABASE_URL
- [ ] Set secure BACKEND_API_KEY (min 32 chars)
- [ ] Configure CORS_ORIGIN with extension ID
- [ ] Enable SSL/TLS (handled by ALB)
- [ ] Set up CloudWatch logging
- [ ] Configure auto-scaling (min 2 instances)
- [ ] Set up health check monitoring
- [ ] Configure RDS backups
- [ ] Set up cost alerts

## API Costs

**GPT-4o-mini** (as of Jan 2025):
- Input: $0.15 / 1M tokens
- Output: $0.60 / 1M tokens

**Estimated per-call cost**:
- Auto mode (10 min call): ~15-20 tips = $0.03-0.05
- Event-driven mode (10 min): ~5-10 tips = $0.02-0.03

**Monthly estimates** (100 calls/day):
- Auto mode: ~$120/month
- Event-driven mode: ~$75/month

## Security

- API key authentication for WebSocket connections
- CORS validation for allowed origins
- No sensitive data in logs
- Environment variables for secrets
- HTTPS enforced in production (ALB)

## Monitoring

Health check endpoint: `GET /health`

```json
{
  "status": "healthy",
  "timestamp": 1704067200000,
  "activeConversations": 5
}
```

## Troubleshooting

**Connection refused**:
- Check PORT environment variable
- Verify firewall allows port 8080
- Check security group rules (AWS)

**Authentication failed**:
- Verify BACKEND_API_KEY matches frontend .env
- Check Socket.io handshake auth in frontend

**Tips not generating**:
- Verify OPENAI_API_KEY is valid
- Check OpenAI API status
- Review server logs for errors

**WebSocket timeout**:
- AWS ALB has 60s idle timeout for WebSockets
- Send periodic PING to keep connection alive

## License

MIT
