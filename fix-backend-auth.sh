#!/bin/bash
# Fix Backend Authentication - Update AWS Elastic Beanstalk Environment Variables

echo "🔧 Updating AWS Elastic Beanstalk environment variables..."

# Set the backend API key to match the extension
eb setenv \
  BACKEND_API_KEY="j88URgUHnn1MtaezUpQF57IW7fIOY2Hotgya06UgAwQ=" \
  OPENAI_API_KEY="sk-YOUR-ACTUAL-OPENAI-API-KEY-HERE" \
  CORS_ORIGIN="chrome-extension://*,http://localhost:5173" \
  NODE_ENV="production" \
  PORT="8080" \
  LOG_LEVEL="info"

echo "✅ Environment variables updated!"
echo "⏳ Elastic Beanstalk will restart the application automatically..."
echo ""
echo "Monitor the restart:"
echo "  eb status"
echo "  eb logs"
