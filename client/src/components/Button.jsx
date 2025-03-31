import React from 'react';
// import './Button.css'; // Optional: Create a CSS file for button styles

/**
 * A reusable button component.
 * @param {object} props
 * @param {function} props.onClick - Function to call when clicked.
 * B@param {React.ReactNode} props.children - Content to display inside the button (e.g., text).
 * @param {boolean} [props.disabled=false] - Whether the button is non-interactive.
 * @param {string} [props.className] - Additional CSS classes.
 * @param {'button' | 'submit' | 'reset'} [props.type='button'] - The button type.
 */
function Button({ onClick, children, disabled = false, className = '', type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`button ${className}`} // Base class + optional additional classes
    >
      {children}
    </button>
  );
}

export default Button;