// Import necessary modules
const express = require('express');
const http = require('http'); // Required to create an HTTP server for Socket.IO
const { Server } = require("socket.io"); // Import the Server class from socket.io
const cors = require('cors'); // Import the CORS middleware
const { v4: uuidv4 } = require('uuid'); // Import UUID generator
const fs = require('fs');
const path = require('path'); // To handle file paths correctly

// --- Configuration ---
const PORT = process.env.PORT || 3001; // Port for the backend server
const CLIENT_URL = 'http://localhost:5173'; // Make sure this matches your frontend (Vite default is 5173)

// --- Initialize Express App ---
const app = express();

// --- Apply CORS Middleware ---
app.use(cors({
  origin: CLIENT_URL, // Allow only your frontend origin
  methods: ["GET", "POST"] // Specify allowed HTTP methods
}));

// --- Create HTTP Server ---
const server = http.createServer(app);

// --- Initialize Socket.IO Server ---
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL, // Allow connections from your frontend origin
    methods: ["GET", "POST"] // Specify allowed methods for Socket.IO transport
  }
});

// ==============================================================
// --- In-Memory Storage for Rooms ---
// ==============================================================
const rooms = {};

// Helper function to generate a short, somewhat unique room code
const generateRoomCode = () => {
  return uuidv4().substring(0, 6).toUpperCase();
};

// ==============================================================
// --- Question Bank Loading ---
// ==============================================================
let questionsData = {};
try {
    const questionsPath = path.join(__dirname, 'data', 'questions.json'); // Assume data folder is sibling to server.js
    const rawData = fs.readFileSync(questionsPath);
    questionsData = JSON.parse(rawData);
    console.log(`Successfully loaded ${Object.keys(questionsData).length} question pairs.`);
} catch (error) {
    console.error("!!! Failed to load questions.json:", error);
    console.error("!!! Ensure 'data/questions.json' exists relative to server.js and is valid JSON.");
    questionsData = {}; // Ensure it's an empty object if loading fails
}
const allQuestionKeys = Object.keys(questionsData); // Get all question keys once
// --- End Load Questions ---


// --- Basic Express Route ---
app.get('/', (req, res) => {
  res.send('<h1>Game Server is Running</h1>');
});


// ==============================================================
// --- Socket.IO Connection Handling ---
// ==============================================================
io.on('connection', (socket) => {
  console.log(`User Connected: ${socket.id}`);

  // --- Room Creation Logic ---
  socket.on('createRoom', (data) => {
    try {
      const playerName = data.playerName || 'Creator';
      const settings = data.settings || { turnTimer: 30, guessTimer: 300, totalQuestions: 10 };

      let roomCode = generateRoomCode();
      while (rooms[roomCode]) {
        roomCode = generateRoomCode();
      }

      const creator = {
        id: socket.id,
        name: playerName,
        isCreator: true,
        hasAnswered: false // Initialize player status
      };

      // Create the room object with updated gameState structure
      rooms[roomCode] = {
        roomCode,
        settings,
        players: [creator],
        // --- CORRECTED gameState Initialization ---
        gameState: {
          status: 'lobby',
          roundNumber: 0,           // Use roundNumber instead of index
          usedQuestionKeys: [],     // Add array to track used questions
          answers: {},
          imposterId: null,
          currentQuestion: null,   // Holds { real: '...', fake: '...' }
          // guessTimerTimeoutId: null, // Remove if not using server guess timer
          // turnTimerTimeoutId: null,  // Remove if not using server turn timer
          revealedData: null
        }
        // --- End corrected gameState ---
      };

      socket.join(roomCode);
      console.log(`Room [${roomCode}] created by ${playerName} (${socket.id})`);

      // Send confirmation back to the creator
      socket.emit('roomCreated', {
        roomCode,
        players: rooms[roomCode].players,
        settings: rooms[roomCode].settings
      });

    } catch (error) {
      console.error("Error creating room:", error);
      socket.emit('creationError', { message: 'Failed to create room. Please try again.' });
    }
  });

  // --- Room Joining Logic ---
  socket.on('joinRoom', (data) => {
    try {
      const { roomCode, playerName = 'Player' } = data;
      const room = rooms[roomCode];

      // Validations
      if (!room) {
        socket.emit('joinError', { message: 'Room not found.' }); return;
      }
      if (room.gameState.status !== 'lobby') {
        socket.emit('joinError', { message: 'Game already in progress.' }); return;
      }
      if (room.players.some(p => p.id === socket.id)) {
          console.log(`Player ${socket.id} already in room [${roomCode}]. Rejoining.`);
      } else {
          const newPlayer = {
              id: socket.id, name: playerName, isCreator: false, hasAnswered: false
          };
          room.players.push(newPlayer);
          console.log(`${playerName} (${socket.id}) joined room [${roomCode}]`);
      }

      socket.join(roomCode);

      socket.emit('joinSuccess', {
        roomCode, players: room.players, settings: room.settings
      });

      io.to(roomCode).emit('updateRoomState', {
        roomCode, players: room.players, settings: room.settings
      });
    } catch (error) {
      console.error(`Error joining room ${data?.roomCode}:`, error);
      socket.emit('joinError', { message: 'Failed to join room. An server error occurred.' });
    }
  });


  // =======================================================
  // --- Start Game Logic (with Random Questions) ---
  // =======================================================
  socket.on('startGame', (data) => {
    try {
      const { roomCode } = data;
      const room = rooms[roomCode];
      const requestingPlayer = room?.players.find(p => p.id === socket.id);

      // --- Validation ---
      if (!room || !requestingPlayer || !requestingPlayer.isCreator || room.gameState.status !== 'lobby' || room.players.length < 2) {
        console.warn(`StartGame validation failed for room [${roomCode}] by ${socket.id}`);
        socket.emit('lobbyError', { message: 'Cannot start game.' });
        return;
      }
      if (allQuestionKeys.length === 0 || room.settings.totalQuestions <= 0) {
        console.error(`StartGame Error: Invalid question setup for room [${roomCode}]. Available: ${allQuestionKeys.length}, Needed: ${room.settings.totalQuestions}`);
        socket.emit('lobbyError', { message: 'Error with game questions configuration.' });
        return;
      }
      // Adjust total questions if more requested than available
      if (room.settings.totalQuestions > allQuestionKeys.length) {
        console.warn(`StartGame Warning: Requested ${room.settings.totalQuestions} questions, but only ${allQuestionKeys.length} available. Adjusting totalQuestions.`);
        room.settings.totalQuestions = allQuestionKeys.length;
      }
      console.log(`Attempting to start game in room [${roomCode}] by ${requestingPlayer.name}`);

      // --- Update Game State ---
      room.gameState.status = 'playing'; // Set status *before* selecting question
      room.gameState.roundNumber = 1; // First round
      room.gameState.usedQuestionKeys = []; // Reset used keys
      room.gameState.answers = {};
      room.gameState.revealedData = null;
      room.players.forEach(p => { p.hasAnswered = false; delete p.isRevealedImposter; delete p.currentAnswer; }); // Reset player status
      // Clear timers if applicable (using timeout IDs stored in gameState)
      // if (room.gameState.guessTimerTimeoutId) { clearTimeout(room.gameState.guessTimerTimeoutId); room.gameState.guessTimerTimeoutId = null; }

      // --- Select **RANDOM UNUSED** Question ---
      const availableKeys = allQuestionKeys.filter(key => !room.gameState.usedQuestionKeys.includes(key));
      if (availableKeys.length === 0) {
         console.error(`StartGame Error: No available questions left to start game?`);
         socket.emit('lobbyError', { message: 'Error finding a question.' });
         room.gameState.status = 'lobby'; return;
      }
      const randomIndex = Math.floor(Math.random() * availableKeys.length);
      const randomKey = availableKeys[randomIndex];
      room.gameState.usedQuestionKeys.push(randomKey); // Mark as used
      if (!questionsData[randomKey]) { // Add safety check
           console.error(`StartGame Error: Selected question key '${randomKey}' not found in loaded data!`);
           socket.emit('lobbyError', { message: 'Internal error selecting question.' });
           room.gameState.status = 'lobby'; return;
      }
      const [realQ, fakeQ] = questionsData[randomKey];
      room.gameState.currentQuestion = { real: realQ, fake: fakeQ }; // Set currentQuestion
      console.log(`Selected question for round 1 [${roomCode}]: Key='${randomKey}'`);

      // --- Select Imposter ---
      const playerIds = room.players.map(p => p.id);
      const imposterIndex = Math.floor(Math.random() * playerIds.length);
      const imposterId = playerIds[imposterIndex];
      room.gameState.imposterId = imposterId;
      console.log(`Selected imposter in room [${roomCode}]: ${room.players[imposterIndex].name} (${imposterId})`);

      // --- Emit 'gameStarted' (for navigation) ---
      io.to(roomCode).emit('gameStarted', { roomCode });
      console.log(`Emitted 'gameStarted' to room [${roomCode}]`);

      // --- Emit 'newRound' Individually ---
      const roundNumber = room.gameState.roundNumber;
      const totalQuestions = room.settings.totalQuestions;
      const turnTimerDuration = room.settings.turnTimer;
      room.players.forEach(player => {
        const isPlayerImposter = player.id === imposterId;
        const questionToSend = isPlayerImposter ? fakeQ : realQ;
        const payload = {
          roomCode, roundNumber, totalQuestions, turnTimerDuration,
          question: questionToSend, isImposter: isPlayerImposter,
          players: room.players
        };
        const eventName = 'newRound';
        console.log(`SERVER EMITTING ===> Event Name: '${eventName}', Target: ${player.id}`);
        io.to(player.id).emit(eventName, payload);
      });
      console.log(`Emitted 'newRound' for round ${roundNumber} individually to players in room [${roomCode}]`);

      // TODO: Start Server-Side Turn Timer (If needed)

    } catch (error) {
      console.error(`Critical error starting game in room ${data?.roomCode}:`, error);
      socket.emit('lobbyError', { message: 'A server error occurred while starting the game.' });
      if (rooms[data?.roomCode]) { rooms[data.roomCode].gameState.status = 'lobby'; }
    }
  });

  // =======================================================
  // --- Submit Answer Logic ---
  // =======================================================
  socket.on('submitAnswer', (data) => {
      try {
          const { roomCode, answerText } = data;
          const playerId = socket.id;
          const room = rooms[roomCode];

          if (!room) { /* ... validation ... */ return; }
          const player = room.players.find(p => p.id === playerId);
          if (!player) { /* ... validation ... */ return; }
          if (room.gameState.status !== 'playing') { /* ... validation ... */ return; }
          if (room.gameState.answers[playerId]) { /* ... validation ... */ return; }

          const sanitizedAnswer = (answerText || '').trim().substring(0, 150);

          // Store Answer & Update Player Status
          room.gameState.answers[playerId] = sanitizedAnswer;
          player.hasAnswered = true;
          console.log(`Answer received from ${player.name} in room [${roomCode}]: "${sanitizedAnswer}"`);

          // Emit Updated State to Everyone (to show who answered)
          io.to(roomCode).emit('updateRoomState', {
              roomCode, players: room.players, settings: room.settings
          });
          console.log(`Emitted 'updateRoomState' after answer from ${player.name}`);

          // Check if All Answers Are In
          const expectedAnswerCount = room.players.length;
          const currentAnswerCount = Object.keys(room.gameState.answers).length;
          console.log(`Room [${roomCode}] Answer Count: ${currentAnswerCount} / ${expectedAnswerCount}`);

          if (currentAnswerCount >= expectedAnswerCount) {
              console.log(`All answers received for round ${room.gameState.roundNumber} in room [${roomCode}]`);

              // Clear Server Turn Timer TODO if applicable

              room.gameState.status = 'guessing';

              const realQuestion = room.gameState.currentQuestion?.real || 'Error: Question not found';

              // Prepare payload for 'allAnswersIn'
              const payload = {
                  roomCode,
                  answers: room.gameState.answers,
                  guessTimerDuration: room.settings.guessTimer,
                  realQuestion: realQuestion,
                  players: room.players
              };

              io.to(roomCode).emit('allAnswersIn', payload);
              console.log(`Emitted 'allAnswersIn' with real question to room [${roomCode}]`);

              // Start Server Guess Timer TODO if applicable
          }

      } catch (error) {
          console.error(`Error processing submitAnswer for room ${data?.roomCode}:`, error);
          socket.emit('gameError', { message: 'Error processing your answer.' });
      }
  });

  // =======================================================
  // --- Timer Control Logic (Skip Only - No Server Timer) ---
  // =======================================================
  socket.on('pauseGuessTimer', (data) => { /* Removed - Not using server timer */ });
  socket.on('resumeGuessTimer', (data) => { /* Removed - Not using server timer */ });

  socket.on('skipGuessTimer', (data) => {
      try {
          const { roomCode } = data;
          const playerId = socket.id;
          const room = rooms[roomCode];

          if (!room) { return; }
          const player = room.players.find(p => p.id === playerId);
          if (!player || !player.isCreator || room.gameState.status !== 'guessing') { return; }

          console.log(`Creator ${player.name} skipped guess timer in room [${roomCode}]`);

          // ** No timer to clear **

          room.gameState.status = 'revealing';

          const { imposterId, currentQuestion } = room.gameState;
          if (!imposterId || !currentQuestion) { /* ... error handling ... */ return; }

          const imposter = room.players.find(p => p.id === imposterId);
          const imposterName = imposter ? imposter.name : 'Unknown Name';
          const fakeQuestion = currentQuestion.fake;

          console.log(`Revealing imposter in room [${roomCode}]: ${imposterName} (${imposterId})`);

          io.to(roomCode).emit('reveal', {
              roomCode, imposterId, imposterName, fakeQuestion
          });
          console.log(`Emitted 'reveal' with name to room [${roomCode}] after skip.`);

      } catch (error) {
          console.error(`Error processing skipGuessTimer for room ${data?.roomCode}:`, error);
          socket.emit('gameError', { message: 'Error processing skip timer request.' });
      }
  });

  // =======================================================
  // --- Next Question Logic (with Random Questions) ---
  // =======================================================
  socket.on('nextQuestion', (data) => {
      try {
          const { roomCode } = data;
          const playerId = socket.id;
          const room = rooms[roomCode];

          // Validation
          if (!room) { console.error(`nextQ Error: Room ${roomCode} not found`); return; }
          const player = room.players.find(p => p.id === playerId);
          if (!player || !player.isCreator) { console.error(`nextQ Error: Invalid player/permission ${playerId}`); return; }
          if (room.gameState.status !== 'revealing') { console.warn(`nextQ Warn: Not in revealing state ${roomCode}`); return; }

          // Check Game Over Condition
          const currentRoundNumber = room.gameState.roundNumber; // Use roundNumber
          const totalQuestions = room.settings.totalQuestions;
          console.log(`[nextQuestion] Room [${roomCode}]: Currently finished round ${currentRoundNumber}. Total set to ${totalQuestions}.`);
          if (currentRoundNumber >= totalQuestions) { // Check based on roundNumber
              console.log(`[nextQuestion] Room [${roomCode}]: Game Over condition MET!`);
              room.gameState.status = 'gameover';
              const summary = { message: `Game finished after ${totalQuestions} rounds.` };
              console.log(`[nextQuestion] Room [${roomCode}]: Emitting 'gameOver'...`);
              io.to(roomCode).emit('gameOver', { roomCode, summary });
              console.log(`[nextQuestion] Room [${roomCode}]: Successfully emitted 'gameOver'.`);
              return; // Stop
          }

          // If Game Continues: Setup Next Round
          const nextRoundNumber = currentRoundNumber + 1;
          console.log(`[nextQuestion] Room [${roomCode}]: Setting up round ${nextRoundNumber}.`);

          // Update State *Before* Selecting Question
          room.gameState.status = 'playing'; // Set status early
          room.gameState.roundNumber = nextRoundNumber; // Increment round number
          room.gameState.answers = {};
          room.gameState.imposterId = null;
          room.gameState.currentQuestion = null; // Reset current question before selecting
          room.gameState.revealedData = null;
          room.players.forEach(p => { p.hasAnswered = false; delete p.isRevealedImposter; }); // Reset player status
          // Clear any leftover timers if applicable
          // if (room.gameState.guessTimerTimeoutId) { clearTimeout(room.gameState.guessTimerTimeoutId); room.gameState.guessTimerTimeoutId = null; }


          // --- Select **RANDOM UNUSED** Question ---
          const availableKeys = allQuestionKeys.filter(key => !room.gameState.usedQuestionKeys.includes(key));
          if (availableKeys.length === 0) {
              console.error(`nextQuestion Error: No available questions left for round ${nextRoundNumber} in room [${roomCode}]! Ending game.`);
              room.gameState.status = 'gameover';
              const summary = { message: `Game ended early - ran out of unique questions after round ${currentRoundNumber}.` };
              io.to(roomCode).emit('gameOver', { roomCode, summary });
              return;
          }
          const randomIndex = Math.floor(Math.random() * availableKeys.length);
          const randomKey = availableKeys[randomIndex];
          room.gameState.usedQuestionKeys.push(randomKey); // Mark as used
           if (!questionsData[randomKey]) { // Add safety check
               console.error(`nextQuestion Error: Selected question key '${randomKey}' not found in loaded data!`);
               socket.emit('gameError', { message: 'Internal error selecting question.' });
               room.gameState.status = 'revealing'; // Revert status? Or end game?
               return;
          }
          const [realQ, fakeQ] = questionsData[randomKey];
          // Set currentQuestion *before* emitting newRound
          room.gameState.currentQuestion = { real: realQ, fake: fakeQ };
          console.log(`Selected question for round ${nextRoundNumber} [${roomCode}]: Key='${randomKey}'`);


          // --- Select New Imposter ---
          const playerIds = room.players.map(p => p.id);
          const imposterIndex = Math.floor(Math.random() * playerIds.length);
          const imposterId = playerIds[imposterIndex];
          room.gameState.imposterId = imposterId;
          console.log(`Selected imposter for round ${nextRoundNumber} in room [${roomCode}]: ${room.players[imposterIndex].name}`);


          // --- Emit 'newRound' Individually ---
          const turnTimerDuration = room.settings.turnTimer;
          room.players.forEach(p => {
              const isPlayerImposter = p.id === imposterId;
              const questionToSend = isPlayerImposter ? fakeQ : realQ;
              const payload = {
                  roomCode, roundNumber: nextRoundNumber, totalQuestions, turnTimerDuration,
                  question: questionToSend, isImposter: isPlayerImposter,
                  players: room.players
              };
              const eventName = 'newRound';
              console.log(`SERVER EMITTING ===> Event Name: '${eventName}', Target: ${p.id}`);
              io.to(p.id).emit(eventName, payload);
          });
          console.log(`Emitted 'newRound' for round ${nextRoundNumber} individually in room [${roomCode}]`);

          // --- TODO: Start Server-Side Turn Timer ---

      } catch (error) {
          console.error(`Error processing nextQuestion for room ${data?.roomCode}:`, error);
          socket.emit('gameError', { message: 'Error starting next round.' });
      }
  });

  // =======================================================
  // --- State Request Handlers ---
  // =======================================================
  socket.on('getLobbyState', (data) => {
      try {
          const { roomCode } = data;
          const room = rooms[roomCode];
          if (room && room.gameState.status === 'lobby') {
              console.log(`Sending lobby state for room [${roomCode}] to ${socket.id}`);
              socket.emit('updateRoomState', {
                  roomCode, players: room.players, settings: room.settings
              });
          } else if (room) {
               console.warn(`getLobbyState: Room [${roomCode}] requested by ${socket.id}, but state is not 'lobby' (${room.gameState.status})`);
               socket.emit('lobbyError', { message: 'Game is already in progress.' });
          } else {
              console.log(`Lobby state request failed: Room [${roomCode}] not found for ${socket.id}`);
              socket.emit('lobbyError', { message: `Room ${roomCode} not found.` });
          }
      } catch (error) {
          console.error(`Error getting lobby state for room ${data?.roomCode}:`, error);
          socket.emit('lobbyError', { message: 'Error retrieving room state.' });
      }
  });

  socket.on('getGameRoundState', (data) => {
      try {
          const { roomCode } = data;
          const room = rooms[roomCode];
          const player = room?.players.find(p => p.id === socket.id);

          if (!room || !player) {
               console.warn(`getGameRoundState: Invalid room [${roomCode}] or player ${socket.id}`);
               socket.emit('gameError', { message: 'Error finding your game state.' });
               return;
           }

          // Check if game state has necessary info. Status should be 'playing'
          // Also check if currentQuestion is actually set
          if (room.gameState.status !== 'playing' || !room.gameState.currentQuestion) {
              console.warn(`getGameRoundState: Player ${player.name} requested state for room [${roomCode}], but status is '${room.gameState.status}' or question missing.`);
              socket.emit('gameError', { message: 'Game state not ready yet, please wait a moment.'});
              return;
          }

          console.log(`Player ${player.name} requested game state for room [${roomCode}]. Sending current round info.`);

          // Reconstruct the 'newRound' payload based on current state
          const { roundNumber, imposterId, currentQuestion } = room.gameState; // Use roundNumber
          const { totalQuestions, turnTimer } = room.settings;
          const isPlayerImposter = player.id === imposterId;
          const questionToSend = isPlayerImposter ? currentQuestion.fake : currentQuestion.real;

          const payload = {
              roomCode, roundNumber, totalQuestions,
              question: questionToSend, isImposter: isPlayerImposter,
              turnTimerDuration: turnTimer,
              players: room.players
          };

          const eventName = 'newRound';
          console.log(`SERVER EMITTING (in getGameRoundState) ===> Event Name: '${eventName}', Target: ${player.id}`);
          socket.emit(eventName, payload); // Use socket.emit

      } catch (error) {
          console.error(`Error in getGameRoundState for room ${data?.roomCode}:`, error);
          socket.emit('gameError', { message: 'Error retrieving current game state.' });
      }
  });


  // =======================================================
  // --- Disconnection Handling ---
  // =======================================================
  socket.on('disconnect', () => {
      console.log(`User Disconnected: ${socket.id}`);
      // Find which room the user was in and remove them
      let roomCodeFound = null;
      let wasCreator = false;

      for (const roomCode in rooms) {
          const room = rooms[roomCode];
          const playerIndex = room.players.findIndex(p => p.id === socket.id);

          if (playerIndex !== -1) {
              roomCodeFound = roomCode;
              const disconnectedPlayer = room.players[playerIndex];
              wasCreator = disconnectedPlayer.isCreator;
              console.log(`${disconnectedPlayer.name} left room [${roomCodeFound}]`);

              room.players.splice(playerIndex, 1);

              if (room.players.length === 0) {
                  console.log(`Room [${roomCodeFound}] is now empty and closing.`);
                  delete rooms[roomCodeFound];
              } else {
                  // Assign new creator if needed
                  if (wasCreator) {
                      room.players[0].isCreator = true;
                      console.log(`Assigned ${room.players[0].name} as new creator for room [${roomCodeFound}]`);
                  }
                  // Notify remaining players
                  io.to(roomCodeFound).emit('updateRoomState', {
                      roomCode: roomCodeFound,
                      players: room.players,
                      settings: room.settings
                  });
                  // If game was in progress, check if minimum players still met, etc. (Optional advanced logic)
              }
              break; // Player found
          }
      }
  });


}); // End io.on('connection')

// --- Start the Server ---
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Allowing connections from: ${CLIENT_URL}`);
  console.log(`Current Time: ${new Date().toLocaleTimeString()}`);
});