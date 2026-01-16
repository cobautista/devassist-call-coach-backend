#!/usr/bin/env node

const io = require('socket.io-client');

const BACKEND_URL = 'http://devassist-call-coach-prod.eba-qkwfpnh3.us-east-1.elasticbeanstalk.com';
const BACKEND_API_KEY = 'j88URgUHnn1MtaezUpQF57IW7fIOY2Hotgya06UgAwQ=';

console.log('🧪 Testing Socket.io Authentication...');
console.log('Backend URL:', BACKEND_URL);
console.log('API Key:', BACKEND_API_KEY.substring(0, 20) + '...');
console.log('');

const socket = io(BACKEND_URL, {
  auth: { apiKey: BACKEND_API_KEY },
  transports: ['websocket', 'polling'],
  reconnection: false,
});

socket.on('connect', () => {
  console.log('✅ Authentication SUCCESSFUL!');
  console.log('Socket ID:', socket.id);
  console.log('');
  console.log('Testing PING...');
  socket.emit('PING');
});

socket.on('connect_error', (error) => {
  console.log('❌ Authentication FAILED:', error.message);
  socket.close();
  process.exit(1);
});

socket.on('PONG', (data) => {
  console.log('✅ PONG received! Timestamp:', data.payload.timestamp);
  console.log('');
  console.log('🎉 Backend authentication is working correctly!');
  socket.close();
  process.exit(0);
});

setTimeout(() => {
  console.log('⏱️ Timeout - no response');
  socket.close();
  process.exit(1);
}, 10000);
