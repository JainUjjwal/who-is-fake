import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import TextInput from '../components/TextInput';
import socket from '../socket';
import './HomePage.css';

function HomePage() {
  // --- State for Forms ---
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');

  // State for create room settings (example defaults)
  const [turnTimer, setTurnTimer] = useState(30);
  const [guessTimer, setGuessTimer] = useState(300); // 5 minutes = 300 seconds
  const [totalQuestions, setTotalQuestions] = useState(10);

  const [error, setError] = useState(''); // For displaying errors

  const navigate = useNavigate(); // Hook for navigation

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!playerName.trim() || !roomCode.trim()) {
      setError('Please enter your name and a room code.');
      return;
    }
    setError('');
    console.log('Attempting to join room:', roomCode, 'as', playerName);

    if (!socket.connected) {
      socket.connect();
    }

    // Define handlers *before* emitting
    const onJoinSuccess = (data) => {
      console.log('Joined room successfully:', data);
      // *** Pass received data via navigation state ***
      navigate(`/lobby/${roomCode.trim()}`, {
        state: {
          initialPlayers: data.players,
          initialSettings: data.settings,
          // You might also want to pass playerName or isCreator status if needed immediately
          playerName: playerName.trim()
        }
      });
    };

    const onJoinError = (data) => {
      console.error('Failed to join room:', data.message);
      setError(data.message || 'Failed to join room. Check the code or try again.');
      cleanupListeners(); // Clean up listeners on error
      // Consider socket.disconnect() if appropriate
    };

    const onConnectError = (err) => {
      console.error("Connection failed:", err.message);
      setError("Failed to connect to server. Please try again later.");
      cleanupListeners(); // Clean up listeners on error
      socket.disconnect();
    };

    // Helper to remove listeners
    const cleanupListeners = () => {
        socket.off('joinSuccess', onJoinSuccess);
        socket.off('joinError', onJoinError);
        socket.off('connect_error', onConnectError);
    };


    // Attach temporary listeners
    socket.once('joinSuccess', onJoinSuccess);
    socket.once('joinError', onJoinError);
    socket.once('connect_error', onConnectError); // Handle connection failure itself


    // Emit event to server
    socket.emit('joinRoom', { roomCode: roomCode.trim(), playerName: playerName.trim() });
  };

  // --- Event Handlers ---
  const handleCreateRoom = (e) => {
    e.preventDefault(); // Prevent default form submission
    if (!playerName.trim()) {
      setError('Please enter your name.');
      return;
    }
    setError('');
    console.log('Attempting to create room with settings:', { turnTimer, guessTimer, totalQuestions, playerName });

    // Connect the socket before emitting
    if (!socket.connected) {
        socket.connect();
    }

    // Listen for the response *before* emitting
    socket.once('roomCreated', (data) => {
      console.log('Room created:', data);
      // Navigate to lobby on successful creation
      navigate(`/lobby/${data.roomCode}`);
      // Maybe pass player name and creator status via state? Or handle in Lobby
    });

    socket.once('connect_error', (err) => {
      console.error("Connection failed:", err.message);
      setError("Failed to connect to server. Please try again later.");
      socket.disconnect(); // Clean up failed connection attempt
    });

    // Emit event to server
    socket.emit('createRoom', {
      settings: { turnTimer, guessTimer, totalQuestions },
      playerName: playerName.trim(), // Send player name
    });
  };

  return (
    <div className="homepage-container">
      <h1>Welcome!</h1>
      {error && <p className="error-message">{error}</p>}

      {/* === Shared Player Name Input === */}
      <TextInput
        label="Your Name:"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
        placeholder="Enter your display name"
        className="player-name-input"
      />

      {/* === Create Room Section === */}
      <form onSubmit={handleCreateRoom} className="room-form create-room-form">
        <h2>Create a New Room</h2>
         <TextInput
          label="Turn Timer (seconds):"
          type="number"
          value={turnTimer}
          onChange={(e) => setTurnTimer(parseInt(e.target.value, 10) || 1)} // Ensure it's a positive number
          min="5" // Example min value
        />
         <TextInput
          label="Guess Timer (seconds):"
          type="number"
          value={guessTimer}
          onChange={(e) => setGuessTimer(parseInt(e.target.value, 10) || 1)}
          min="30" // Example min value
        />
         <TextInput
          label="Total Questions:"
          type="number"
          value={totalQuestions}
          onChange={(e) => setTotalQuestions(parseInt(e.target.value, 10) || 1)}
          min="1" // Example min value
        />
        <Button type="submit" disabled={!playerName.trim()}>Create Room</Button>
      </form>

      <hr className="divider" />

      {/* === Join Room Section === */}
      <form onSubmit={handleJoinRoom} className="room-form join-room-form">
            <h2>Join an Existing Room</h2>
            {/* Shared Player Name Input should be outside or above this form ideally */}
             <TextInput
                label="Your Name:"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your display name"
                className="player-name-input" /* Add this input if not already present */
             />
             <TextInput
                label="Room Code:"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="Enter room code"
             />
             <Button type="submit" disabled={!playerName.trim() || !roomCode.trim()}>Join Room</Button>
        </form>
    </div>
  );
}

export default HomePage;