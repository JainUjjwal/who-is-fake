// src/pages/LobbyPage.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import PlayerList from '../components/PlayerList';
import Button from '../components/Button';
import socket from '../socket';
import './LobbyPage.css';

function LobbyPage() {
    const { roomCode } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    // --- State ---
    // Initialize state using data passed from navigation, or defaults
    const [players, setPlayers] = useState(location.state?.initialPlayers || []);
    const [settings, setSettings] = useState(location.state?.initialSettings || { turnTimer: 0, guessTimer: 0, totalQuestions: 0 });
    // We'll set isCreator inside useEffect based on socket.id comparison
    const [isCreator, setIsCreator] = useState(false);
    const [error, setError] = useState('');

    // --- Effects for Socket Listeners ---
    useEffect(() => {
        // --- Set initial creator status based *only* on passed state ---
        // This runs once when the component mounts or location.state changes
        const initialPlayersList = location.state?.initialPlayers || [];
        const meInitially = initialPlayersList.find(p => p.id === socket.id);
        setIsCreator(meInitially?.isCreator || false);
        // --- End initial creator status check ---

        if (!socket.connected) {
            console.warn('LobbyPage: Socket not connected on mount.');
            setError('Not connected to server. Please return home.');
            // navigate('/'); // Consider redirecting
            return; // Stop the effect if socket isn't connected
        }

        // --- Define Handlers ---
        const handleUpdateRoomState = (data) => {
            console.log('Received room state update:', data);
            if (data.roomCode === roomCode) {
                setPlayers(data.players || []);
                setSettings(data.settings || { turnTimer: 0, guessTimer: 0, totalQuestions: 0 });
                // Re-determine creator status based on the definitive updated list
                const updatedMe = data.players?.find(p => p.id === socket.id);
                setIsCreator(updatedMe?.isCreator || false);
                setError('');
            }
        };

        const handleGameStarted = (data) => {
             if (data.roomCode === roomCode) {
                 console.log('Game started! Navigating...');
                 navigate(`/game/${roomCode}`);
             }
        };

        const handleLobbyError = (data) => {
            console.log('Lobby Error received:', data);
            setError(data.message || 'An error occurred in the lobby.');
        };

        // --- Register Listeners ---
        socket.on('updateRoomState', handleUpdateRoomState);
        socket.on('gameStarted', handleGameStarted);
        socket.on('lobbyError', handleLobbyError);

        // --- Explicitly request state on mount ---
        console.log(`LobbyPage mounted for ${roomCode}. Requesting initial state.`);
        socket.emit('getLobbyState', { roomCode });
        // --- End explicit request ---

        // --- Cleanup ---
        return () => {
            console.log(`LobbyPage unmounting or roomCode changed. Cleaning up listeners for ${roomCode}`);
            socket.off('updateRoomState', handleUpdateRoomState);
            socket.off('gameStarted', handleGameStarted);
            socket.off('lobbyError', handleLobbyError);
        };

        // Rerun effect if roomCode changes. Avoid adding location.state here now.
        // Adding navigate might cause loops if errors redirect frequently. Only include if essential.
    }, [roomCode, navigate]); // Dependency array simplified


    // --- Event Handlers --- (Keep handleStartGame, handleLeaveLobby)
      const handleStartGame = () => {
        console.log('Requesting to start game for room:', roomCode);
        socket.emit('startGame', { roomCode });
      };

      const handleLeaveLobby = () => {
         socket.disconnect();
         navigate('/');
      };


    return (
        <div className="lobby-container">
            <h2>Lobby</h2>
            {error && <p className="error-message">{error}</p>}
            <p>Room Code: <strong className="room-code">{roomCode}</strong> (Share this with friends!)</p>

            <div className="lobby-details">
                <div className="lobby-settings">
                    <h3>Game Settings</h3>
                    <p>Turn Timer: {settings.turnTimer} seconds</p>
                    <p>Guess Timer: {Math.floor(settings.guessTimer / 60)}m {settings.guessTimer % 60}s</p>
                    <p>Total Questions: {settings.totalQuestions}</p>
                </div>

                {/* Pass the current players state to the list */}
                <PlayerList players={players} title="Players in Lobby" />
            </div>

            {/* Only show Start Game button to the creator */}
            {isCreator && (
                <Button onClick={handleStartGame} disabled={players.length < 2}>
                    Start Game
                </Button>
            )}
            {!isCreator && players.length > 0 && <p>Waiting for the host ({players.find(p=>p.isCreator)?.name || 'host'}) to start the game...</p>}
            {players.length === 0 && !error && <p>Loading players...</p>}


            <Button onClick={handleLeaveLobby} className="leave-button">
                Leave Lobby
            </Button>
        </div>
    );
}

export default LobbyPage;