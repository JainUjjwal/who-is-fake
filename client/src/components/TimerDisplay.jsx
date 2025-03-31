import React, { useState, useEffect } from 'react';
import './TimerDisplay.css'; // Optional: Create a CSS file for timer styles

/**
 * Displays a countdown timer.
 * Note: Actual timer logic (when to start/stop/pause) should be controlled by parent state,
 * possibly driven by server events. This component just formats the display.
 *
 * @param {object} props
 * @param {number | null} props.secondsRemaining - The number of seconds left. Null hides the timer or shows default.
 * @param {string} [props.className] - Additional CSS classes.
 */
function TimerDisplay({ secondsRemaining, className = '' }) {
  const formatTime = (totalSeconds) => {
    if (totalSeconds === null || totalSeconds < 0) return '--:--';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  return (
    <div className={`timer-display ${className}`}>
      <span className="timer-icon">⏳</span> {/* Optional icon */}
      <span className="timer-time">{formatTime(secondsRemaining)}</span>
    </div>
  );
}

export default TimerDisplay;