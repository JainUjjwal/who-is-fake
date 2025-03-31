import { io } from 'socket.io-client';

// IMPORTANT: Make sure this URL matches your backend server URL!
// If your backend runs on port 3001, this is correct.
// const SERVER_URL = 'http://localhost:3001';
const SERVER_URL = 'https://who-is-fake.onrender.com';
// Create the socket instance
// 'autoConnect: false' prevents it from connecting immediately on load.
// We will call socket.connect() manually when the user joins or creates a room.
const socket = io(SERVER_URL, {
  autoConnect: false
});

// Optional: Log socket events for debugging (can be removed later)
socket.onAny((event, ...args) => {
  console.log(`>>> socket.js [onAny] Event Received: Name='${event}', Args=`, args);
  // Specifically check for 'newRound' variations just in case
  if (event.toLowerCase() === 'newround') {
       console.log(`>>> socket.js [onAny] CONFIRMED event matching 'newround' (case-insensitive) received.`);
  }
});

export default socket;