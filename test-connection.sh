#!/bin/bash

# Test Connection Script
# Verifies backend is running and accepts connections

echo "🧪 Testing DevAssist Call Coach Backend Connection"
echo ""

# Check if server is running
echo "1️⃣ Checking health endpoint..."
HEALTH_RESPONSE=$(curl -s http://localhost:8080/health 2>&1)

if [[ $? -eq 0 ]]; then
    echo "✅ Backend is running!"
    echo "   Response: $HEALTH_RESPONSE"
else
    echo "❌ Backend is NOT running!"
    echo "   Please start backend with: npm run dev"
    exit 1
fi

echo ""
echo "2️⃣ Checking environment variables..."

if [ -f .env ]; then
    echo "✅ .env file exists"
    
    if grep -q "OPENAI_API_KEY=sk-" .env; then
        echo "✅ OPENAI_API_KEY is set"
    else
        echo "❌ OPENAI_API_KEY is missing or invalid"
    fi
    
    if grep -q "BACKEND_API_KEY=" .env; then
        echo "✅ BACKEND_API_KEY is set"
    else
        echo "❌ BACKEND_API_KEY is missing"
    fi
else
    echo "❌ .env file not found - copy .env.example to .env"
fi

echo ""
echo "3️⃣ Integration checklist:"
echo "   □ Backend running (npm run dev)"
echo "   □ Frontend .env has VITE_BACKEND_URL=http://localhost:8080"
echo "   □ Frontend .env has matching VITE_BACKEND_API_KEY"
echo "   □ Extension built (npm run build)"
echo "   □ Extension loaded in Chrome"
echo ""
echo "🎉 If all checks pass, start a call to test!"
