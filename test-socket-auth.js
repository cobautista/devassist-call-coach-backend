#!/usr/bin/env node
/**
 * Test Socket.io Authentication
 * Verifies that the BACKEND_API_KEY environment variable is working correctly
 */

const io = require('socket.io-client');

const BACKEND_URL = 'http://devassist-call-coach-prod.eba-qkwfpnh3.us-east-1.elasticbeanstalk.com';
const API_KEY = 'j88URgUHnn1MtaezUpQF57IW7fIOY2Hotgya06UgAwQ=';

console.log('🧪 Testing Socket.io Authentication...');
console.log(`🔗 Backend URL: ${BACKEND_URL}`);
console.log(`🔑 API Key: ${API_KEY.substring(0, 20)}...`);
console.log('');

const socket = io(BACKEND_URL, {
  auth: {
    apiKey: API_KEY,
  },
  transports: ['websocket', 'polling'],
  reconnection: false, // Don't auto-reconnect for this test
});

socket.on('connect', () => {
  console.log('✅ SUCCESS: Socket.io connected!');
  console.log(`📡 Socket ID: ${socket.id}`);
  console.log('');
  console.log('🎯 BACKEND AUTHENTICATION IS WORKING!');
  console.log('');

  // Send a PING to test full communication
  console.log('🏓 Sending PING...');
  socket.emit('PING');
});

socket.on('PONG', (data) => {
  console.log('✅ Received PONG:', data);
  console.log('');
  console.log('🎉 Backend is fully operational!');

  // Disconnect after successful test
  socket.disconnect();
  process.exit(0);
});

socket.on('connect_error', (error) => {
  console.log('❌ FAILED: Socket.io connection error');
  console.log(`Error: ${error.message}`);
  console.log('');

  if (error.message === 'Authentication failed') {
    console.log('💡 The BACKEND_API_KEY environment variable may not be set correctly on AWS.');
    console.log('   Run: cd /Users/cob/DevAssist/Projects/DevAssist-Call-Coach-Backend');
    console.log('   Then: eb setenv BACKEND_API_KEY="j88URgUHnn1MtaezUpQF57IW7fIOY2Hotgya06UgAwQ="');
  }

  process.exit(1);
});

socket.on('disconnect', (reason) => {
  console.log(`🔌 Disconnected: ${reason}`);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('⏱️  Test timeout - no response from backend');
  process.exit(1);
}, 10000);
