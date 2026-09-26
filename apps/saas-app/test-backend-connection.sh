#!/bin/bash

# Test Cyoda Backend Connection
# This script tests the connectivity to the Cyoda backend

echo "=========================================="
echo "Testing Cyoda Backend Connection"
echo "=========================================="
echo ""

BACKEND_URL="https://cyoda-develop.kube3.cyoda.org"

# Test 1: Check if backend is reachable
echo "Test 1: Checking backend reachability..."
if curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BACKEND_URL" > /dev/null 2>&1; then
    echo "✓ Backend is reachable at $BACKEND_URL"
else
    echo "✗ Backend is not reachable at $BACKEND_URL"
    echo "  Please check your network connection and backend URL"
fi
echo ""

# Test 2: Check API endpoint
echo "Test 2: Checking API endpoint..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BACKEND_URL/api" 2>/dev/null)
if [ "$HTTP_CODE" != "000" ]; then
    echo "✓ API endpoint responded with HTTP $HTTP_CODE"
else
    echo "✗ API endpoint did not respond"
fi
echo ""

# Test 3: Check platform-api endpoint
echo "Test 3: Checking platform-api endpoint..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BACKEND_URL/platform-api" 2>/dev/null)
if [ "$HTTP_CODE" != "000" ]; then
    echo "✓ Platform API endpoint responded with HTTP $HTTP_CODE"
else
    echo "✗ Platform API endpoint did not respond"
fi
echo ""

# Test 4: Check processing API endpoint
echo "Test 4: Checking processing API endpoint..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BACKEND_URL/api/processing" 2>/dev/null)
if [ "$HTTP_CODE" != "000" ]; then
    echo "✓ Processing API endpoint responded with HTTP $HTTP_CODE"
else
    echo "✗ Processing API endpoint did not respond"
fi
echo ""

# Test 5: Check environment variables
echo "Test 5: Checking environment variables..."
if [ -f ".env" ]; then
    echo "✓ .env file exists"

    if grep -q "VITE_APP_API_BASE=/api" .env; then
        echo "✓ VITE_APP_API_BASE is configured correctly"
    else
        echo "✗ VITE_APP_API_BASE is not configured correctly"
    fi

    if grep -q "VITE_APP_BASE_URL=https://cyoda-develop.kube3.cyoda.org" .env; then
        echo "✓ VITE_APP_BASE_URL is configured correctly"
    else
        echo "✗ VITE_APP_BASE_URL is not configured correctly"
    fi

else
    echo "✗ .env file not found"
    echo "  Please create .env file from .env.example"
fi
echo ""

echo "=========================================="
echo "Connection Test Complete"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Start the development server: npm run dev"
echo "2. Navigate to http://localhost:3000"
echo "3. Try logging in with Cyoda credentials"
echo "4. Check browser console for API calls"
echo ""

