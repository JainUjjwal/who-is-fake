// src/components/PlayerList.jsx
import React from 'react';
import './PlayerList.css'; // Make sure CSS is imported [cite: uploaded:src/components/PlayerList.jsx]

/**
 * Displays a list of players.
 * @param {object} props
 * @param {Array<{id: string, name: string, isCreator?: boolean, hasAnswered?: boolean, status?: string}>} props.players - Array of player objects. // Added hasAnswered
 * @param {string} [props.title='Players'] - Title for the list.
 * @param {string} [props.className] - Additional CSS classes.
 */
function PlayerList({ players = [], title = 'Players', className = '' }) {
  return (
    <div className={`player-list-container ${className}`}>
      <h3>{title} ({players.length})</h3>
      {players.length === 0 ? (
        <p>No players yet.</p>
      ) : (
        <ul className="player-list">
          {players.map((player) => (
            <li key={player.id} className={`player-list-item ${player.hasAnswered ? 'answered' : ''}`}> {/* Optional class */}
              <span className="player-name">
                {player.name}
                {player.isCreator && ' (👑 Creator)'}
              </span>
              <span className="player-status">
                {/* Display Answered Checkmark */}
                {player.hasAnswered && '✅'}
                {/* Display other statuses if needed */}
                {player.status && ` (${player.status})`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PlayerList;