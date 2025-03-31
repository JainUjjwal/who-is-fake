import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import TextInput from '../components/TextInput';
import TimerDisplay from '../components/TimerDisplay';
import PlayerList from '../components/PlayerList'; // Might display player status (answered, imposter?)
import socket from '../socket';
import './GamePage.css';

// Define potential game states/phases
const GAME_STATES = {
    LOADING: 'loading',
    WAITING_FOR_QUESTION: 'waiting_for_question',
    ANSWERING: 'answering', // Players are answering
    WAITING_FOR_ANSWERS: 'waiting_for_answers', // Current player submitted, waiting for others
    GUESSING: 'guessing', // All answers are in, guess timer running
    REVEALING: 'revealing', // Imposter revealed
    GAME_OVER: 'game_over',
};

function GamePage() {
    const { roomCode } = useParams();
    const navigate = useNavigate();

    // --- State ---
    const [gameState, setGameState] = useState(GAME_STATES.LOADING);
    const [players, setPlayers] = useState([]); // Keep track of players and their status
    const [currentRound, setCurrentRound] = useState(0);
    const [totalQuestions, setTotalQuestions] = useState(0); // Get from initial settings
    const [question, setQuestion] = useState(''); // The question text (real or fake)
    const [isImposter, setIsImposter] = useState(false);
    const [myAnswer, setMyAnswer] = useState('');
    const [submittedAnswers, setSubmittedAnswers] = useState({}); // { playerId: 'answer text' }
    const [turnTimerRemaining, setTurnTimerRemaining] = useState(null);
    const [timeSinceTurnEnded, setTimeSinceTurnEnded] = useState(null); // null = timer not active, number = seconds elapsed
    const [guessTimerRemaining, setGuessTimerRemaining] = useState(null);
    const [isGuessTimerPaused, setIsGuessTimerPaused] = useState(false);
    const [revealedData, setRevealedData] = useState(null); // { imposterId: 'xyz', fakeQuestion: '...', imposterName: '...' }
    const [isCreator, setIsCreator] = useState(false); // To show creator controls
    const [realQuestionText, setRealQuestionText] = useState(''); // To display during guessing
    const [error, setError] = useState('');

    // --- Effects for Socket Listeners ---
    useEffect(() => {
        console.log(`GamePage EFFECT RUNNING for roomCode: ${roomCode} - Attaching listeners...`);
        
        if (!socket.connected) {
            setError('Connection lost. Please return home.');
            // navigate('/'); // Consider redirecting
            return;
        }

        // --- Socket Handlers ---
        const handleNewRound = (data) => {
            console.log('--- handleNewRound received ---'); // THIS is the log that wasn't appearing
            console.log('Type of data argument:', typeof data);
            console.log('Data argument content:', JSON.stringify(data, null, 2));

            // Start client-side visual timer (optional, server is source of truth)
            // Consider using server-sent end times for better sync
            if (Array.isArray(data)) { data = data[0]; } // Handle potential array wrap
            if (!data || typeof data !== 'object') { return; } // Validate

            console.log('Attempting state updates with:', data.roundNumber, data.totalQuestions, data.question);
            setGameState(GAME_STATES.ANSWERING); // Crucial: Set state to answering
            setCurrentRound(data.roundNumber || 0); // Use || 0 as fallback
            setTotalQuestions(data.totalQuestions || 0); // Use || 0 as fallback
            setQuestion(data.question || ''); // Use || '' as fallback
            setIsImposter(data.isImposter || false);
            setMyAnswer('');
            setSubmittedAnswers({});
            setTurnTimerRemaining(data.turnTimerDuration || null);
            setTimeSinceTurnEnded(null);
            setRevealedData(null);
            setRealQuestionText('');
            setError('');
            if(data.players) setPlayers(data.players);
            const me = data.players?.find(p => p.id === socket.id);
            setIsCreator(me?.isCreator || false);
            console.log('State update functions called.');
        };

        const handleTurnTimerTick = (data) => { // Optional: if server sends ticks
            setTurnTimerRemaining(data.remaining);
        };

        const handleGuessTimerTick = (data) => { // Optional: if server sends ticks
            setGuessTimerRemaining(data.remaining);
            setIsGuessTimerPaused(data.isPaused || false);
        };


        const handleAllAnswersIn = (data) => {
            console.log('All answers in:', data);
            setGameState(GAME_STATES.GUESSING);
            setTurnTimerRemaining(0); // Stop turn timer display
            setSubmittedAnswers(data.answers); // Show submitted answers
            setGuessTimerRemaining(data.guessTimerDuration); // Start guess timer
            setTimeSinceTurnEnded(null); 
            setIsGuessTimerPaused(false);
            setRealQuestionText(data.realQuestion || 'Question could not be loaded.');
            if (data.players) setPlayers(data.players);
        };


        const handleReveal = (data) => {
            // --- Add/Modify Logging ---
            console.log('[handleReveal] Data received:', JSON.stringify(data, null, 2)); // Log full data

            // Explicitly extract the name and check its value/type
            const nameFromPayload = data.imposterName;

            // Construct the object we intend to set into state
            const dataToSet = {
                imposterId: data.imposterId,
                // Use the extracted name. Make the fallback very obvious for debugging.
                imposterName: nameFromPayload || '!!! FALLBACK TO UNKNOWN !!!',
                fakeQuestion: data.fakeQuestion
            };

            // Set the state
            setGameState(GAME_STATES.REVEALING);
            setGuessTimerRemaining(null); // Or handle timer state as needed
            setRevealedData(dataToSet); // Update the state with the object containing the name

            // Optional: Update players list to mark imposter visually
            setPlayers(prevPlayers => prevPlayers.map(p => ({
                ...p,
                isRevealedImposter: p.id === data.imposterId
            })));
        };

        const handleGameOver = (data) => {
            console.log('Game Over:', data);
            setGameState(GAME_STATES.GAME_OVER);
            setRevealedData(data.summary || { message: "Game Over!" });
            setError(''); // Clear any previous errors
        };

        const handleGameError = (data) => {
            console.error('Received Game Error:', data);
            setError(data.message || 'An unknown game error occurred.');
        };

        const handleUpdateRoomState = (data) => {
            console.log('GamePage received room state update:', data);
            if (data.roomCode === roomCode) {
                // Update players list (which now contains 'hasAnswered')
                setPlayers(data.players || []);
                // Optionally update settings if they can change mid-game
                // setSettings(data.settings || { turnTimer: 0, guessTimer: 0, totalQuestions: 0 });

                // Update creator status based on potentially updated list
                const updatedMe = data.players?.find(p => p.id === socket.id);
                setIsCreator(updatedMe?.isCreator || false);
                setError('');
            }
        };

        // --- Register Listeners ---
        console.log(`GamePage: Attaching 'newRound' listener for ${roomCode}`); // Log *before* attaching
        
        socket.on('newRound', handleNewRound);
        socket.on('turnTimerTick', handleTurnTimerTick); // Optional
        socket.on('allAnswersIn', handleAllAnswersIn);
        socket.on('guessTimerTick', handleGuessTimerTick); // Optional
        socket.on('reveal', handleReveal);
        socket.on('gameOver', handleGameOver);
        socket.on('gameError', handleGameError);
        socket.on('updateRoomState', handleUpdateRoomState);
        
        console.log(`GamePage: Emitting 'getGameRoundState' for ${roomCode}`);
        socket.emit('getGameRoundState', { roomCode });

        // --- Cleanup ---
        return () => {
            socket.off('newRound', handleNewRound);
            socket.off('turnTimerTick', handleTurnTimerTick);
            socket.off('allAnswersIn', handleAllAnswersIn);
            socket.off('guessTimerTick', handleGuessTimerTick);
            socket.off('reveal', handleReveal);
            socket.off('gameOver', handleGameOver);
            socket.off('gameError', handleGameError);
            socket.off('updateRoomState', handleUpdateRoomState);
        };

    }, [roomCode]); // Add `players` to deps if needed for finding imposter name

    // --- Client-Side Timers (Visual Only) ---
    // Turn Timer
    useEffect(() => {
        if (gameState === GAME_STATES.ANSWERING && turnTimerRemaining !== null && turnTimerRemaining > 0) {
            const intervalId = setInterval(() => {
                setTurnTimerRemaining(prev => {
                    const nextValue = prev !== null && prev > 0 ? prev - 1 : 0;
                    // --- Add this check ---
                    // If timer just hit zero, start the count-up timer
                    if (nextValue === 0 && prev === 1) {
                         console.log("Turn timer ended. Starting count-up.");
                         setTimeSinceTurnEnded(0); // Start count-up at 0 seconds
                    }
                    // --- End added check ---
                    return nextValue;
                });
            }, 1000);
            // Cleanup interval on unmount or if state changes
            return () => clearInterval(intervalId);
        }
    }, [gameState, turnTimerRemaining]);

    // Guess Timer
    useEffect(() => {
        if (gameState === GAME_STATES.GUESSING && guessTimerRemaining !== null && guessTimerRemaining > 0 && !isGuessTimerPaused) {
            const intervalId = setInterval(() => {
                setGuessTimerRemaining(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
            }, 1000);
            return () => clearInterval(intervalId);
        }
    }, [gameState, guessTimerRemaining, isGuessTimerPaused]);

    // Count-Up Timer Effect (runs when turn timer has ended)
    useEffect(() => {
        // Only run if the count-up timer is active (not null) and game is still in answering/waiting phase
        if ((gameState === GAME_STATES.ANSWERING || gameState === GAME_STATES.WAITING_FOR_ANSWERS) && timeSinceTurnEnded !== null) {
            const intervalId = setInterval(() => {
                setTimeSinceTurnEnded(prev => (prev !== null ? prev + 1 : 0)); // Increment seconds
            }, 1000);

            // Cleanup interval on unmount or if the game state moves on (e.g., to guessing)
            return () => {
                console.log("Cleaning up count-up timer interval.");
                clearInterval(intervalId);
            };
        } else {
             // Ensure timer stops if we exit the relevant game states
             if (timeSinceTurnEnded !== null) {
                 console.log("Resetting count-up timer because game state changed or timer was nullified.");
                 setTimeSinceTurnEnded(null); // Reset if game state moves on
             }
        }
    // Rerun when gameState changes or when timeSinceTurnEnded is first set to 0
    }, [gameState, timeSinceTurnEnded]);
    
    // --- Event Handlers ---
    const handleSubmitAnswer = () => {
       // Prevent submitting empty answers or submitting multiple times
       if (!myAnswer.trim() || gameState !== GAME_STATES.ANSWERING) {
        console.log("Submit blocked: Empty answer or not in answering state.");
        return;
   }
   console.log('Submitting answer:', myAnswer);
   socket.emit('submitAnswer', { roomCode, answerText: myAnswer.trim() });

   // Update local state immediately to give feedback & disable input/button
   setGameState(GAME_STATES.WAITING_FOR_ANSWERS);
    };

    const handlePauseGuessTimer = () => {
        socket.emit('pauseGuessTimer', { roomCode });
    };
    const handleResumeGuessTimer = () => {
        socket.emit('resumeGuessTimer', { roomCode });
    };

    const handleSkipGuessTimer = () => {
        // Optional: Add check if already revealing/game over?
        if (gameState !== GAME_STATES.GUESSING) return;

        console.log(`Requesting to skip guess timer for room: ${roomCode}`);
        socket.emit('skipGuessTimer', { roomCode });
        // Note: No immediate state change needed here; wait for server's 'reveal' event
    };

    const handleNextQuestion = () => {
        // Optional: check if current state is REVEALING
        if (gameState !== GAME_STATES.REVEALING) return;

        console.log(`Requesting next question for room: ${roomCode}`);
        // Set state to indicate loading/waiting for the next round
        setGameState(GAME_STATES.WAITING_FOR_QUESTION);
        setError(''); // Clear previous errors
        setRevealedData(null); // Clear reveal data
        // Clear other round-specific data if necessary (like answers displayed)
        // setSubmittedAnswers({});

        socket.emit('nextQuestion', { roomCode });
    };

    const handleReturnHome = () => {
        socket.disconnect();
        navigate('/');
    };

    // --- Render Logic ---
    return (
        <div className="game-container">
            <h2>Game Room: {roomCode}</h2>
            {error && <p className="error-message">{error}</p>}

            {/* Display Loading state initially */}
            {gameState === GAME_STATES.LOADING && !error && <p>Loading game...</p>}

            {/* Updated Round Info display check */}
            {gameState !== GAME_STATES.LOADING && gameState !== GAME_STATES.GAME_OVER && (
                <p className="round-info">Round: {currentRound} / {totalQuestions}</p>
            )}

            {/* Answering Phase display */}
            {(gameState === GAME_STATES.ANSWERING || gameState === GAME_STATES.WAITING_FOR_ANSWERS) && (
                <div className="answering-phase">
                    <h3>Your Question:</h3>
                    <p className="question-text">{isImposter ? '(You are the Imposter! 🇸) ' : ''} {question || 'Waiting for question...'}</p>
                     {/* --- Conditional Timer Display --- */}
                     {timeSinceTurnEnded === null ? (
                        // Show countdown timer if count-up hasn't started
                        <TimerDisplay secondsRemaining={turnTimerRemaining} className="turn-timer" />
                    ) : (
                        // Show count-up timer if turn timer ended
                        <div className="timer-ended-display"> {/* Optional wrapper for styling */}
                            <span>Turn Time Ended! (You can still submit your answer 😄)</span>
                            {/* You can reuse TimerDisplay or create a specific one */}
                            <TimerDisplay secondsRemaining={timeSinceTurnEnded} className="turn-timer-ended" />
                            {/* <span> ago</span> */}
                        </div>
                    )}
                    {/* --- End Conditional Timer Display --- */}
                    <TextInput
                        label="Your Answer:"
                        value={myAnswer}
                        onChange={(e) => setMyAnswer(e.target.value)}
                        // Input is disabled if waiting OR if the original turn timer hit 0
                        disabled={gameState === GAME_STATES.WAITING_FOR_ANSWERS}
                        placeholder="Type your answer here..."
                    />
                    <Button
                        onClick={handleSubmitAnswer}
                        // Button is disabled if waiting OR answer empty OR original turn timer hit 0
                        disabled={gameState === GAME_STATES.WAITING_FOR_ANSWERS || !myAnswer.trim()}
                    >
                        Submit Answer
                    </Button>
                    {gameState === GAME_STATES.WAITING_FOR_ANSWERS && <p>Answer submitted! Waiting for others...</p>}
                    {/* Display message if time ran out */}
                    {turnTimerRemaining === 0 && gameState === GAME_STATES.ANSWERING && <p className="warning-message">Time's up! Waiting for remaining players...</p>}
                </div>
            )}

            {/* == Guessing Phase == */}
            {gameState === GAME_STATES.GUESSING && (
                <div className="guessing-phase">
                    <h4 className="real-question-display">The actual question was:</h4>
                    <p className="real-question-text">{realQuestionText || 'Loading question...'}</p>
                    
                    <h3>Answers Submitted:</h3>
                    {/* Display submitted answers - Check your PlayerList or add specific rendering */}
                     <ul className="submitted-answers-list">
                         {/* Render answers from submittedAnswers state. Need player names? */}
                         {Object.entries(submittedAnswers).map(([playerId, answer]) => {
                             // Find player name - requires 'players' state to be up-to-date
                             const playerName = players.find(p => p.id === playerId)?.name || 'Someone';
                             return <li key={playerId}><strong>{playerName}:</strong> {answer || 'No answer'}</li>;
                         })}
                    </ul>
                    <p>Discuss! Who do you think had a different question?</p>
                    <TimerDisplay secondsRemaining={guessTimerRemaining} className="guess-timer" />
                    {/* --- Creator Controls Section --- */}
                    {isCreator && ( // Only render controls if user is the creator
                        <div className="creator-controls">
                            <Button
                                onClick={handleSkipGuessTimer}
                                // Optional: disable if timer already 0, though skipping then is harmless
                                // disabled={guessTimerRemaining === 0}
                            >
                                Reveal
                            </Button>
                            {/* --- End Skip Button --- */}
                        </div>
                    )}
                    {/* --- End Creator Controls --- */}
                </div>
            )}

            {/* == Revealing Phase == */}
            {gameState === GAME_STATES.REVEALING && revealedData && (
                <div className="revealing-phase">
                    <h3>Reveal!</h3>
                    <p>The player with a different question was: <strong>{revealedData.imposterName || 'Unknown'}!</strong></p>
                    <p>Their question was: "{revealedData.fakeQuestion}"</p>
                    {/* Optionally redisplay answers with names */}
                    {isCreator && currentRound < totalQuestions && (
                        <Button onClick={handleNextQuestion}>Next Question ({currentRound + 1} / {totalQuestions})</Button>
                    )}
                    {/* Show different message/button if it was the last round */}
                    {isCreator && currentRound >= totalQuestions && (
                         // If game doesn't end automatically, creator might need to click something
                         // Or maybe this button shouldn't render if handleGameOver handles it
                         // For now, let's assume handleGameOver is triggered by server
                         <p>That was the last round!</p>
                     )}
                    {!isCreator && currentRound < totalQuestions && (
                        <p>Waiting for host ({players.find(p=>p.isCreator)?.name || 'host'}) to start the next round...</p>
                    )}
                     {!isCreator && currentRound >= totalQuestions && (
                         <p>Game Over!</p>
                     )}
                </div>
            )}

            {/* == Game Over Phase == */}
            {gameState === GAME_STATES.GAME_OVER && (
                <div className="game-over-phase">
                <h2>Game Over!</h2>
                {/* Display final scores or summary from revealedData */}
                {typeof revealedData === 'object' && revealedData !== null && revealedData.message ? (
                    <p>{revealedData.message}</p>
                ) : (
                    // Example: Display summary if it's more complex later
                     <pre>{JSON.stringify(revealedData, null, 2)}</pre>
                )}
                <p>Thanks for playing!</p>
                <Button onClick={handleReturnHome}>Return to Home</Button>
           </div>
            )}


            {/* == Player List (Always Visible or Toggleable?) == */}
            <PlayerList players={players} title="Game Players" className="game-player-list"/>
       
        </div>
    );
}

export default GamePage;