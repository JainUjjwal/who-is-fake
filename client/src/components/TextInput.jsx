import React from 'react';
import './TextInput.css'; // Optional: Create a CSS file for input styles

/**
 * A reusable controlled text input component.
 * @param {object} props
 * @param {string} props.label - Text label for the input.
 * @param {string} props.value - The current value of the input.
 * @param {function} props.onChange - Function to call when the input value changes.
 * @param {string} [props.placeholder] - Placeholder text.
 * @param {string} [props.type='text'] - Input type (e.g., 'text', 'number', 'password').
 * @param {boolean} [props.disabled=false] - Whether the input is non-interactive.
 * @param {string} [props.id] - HTML id attribute, useful for associating label.
 * @param {string} [props.className] - Additional CSS classes for the wrapper or input.
 */
function TextInput({ label, value, onChange, placeholder = '', type = 'text', disabled = false, id, className = '' }) {
  const inputId = id || `text-input-${label.replace(/\s+/g, '-').toLowerCase()}`; // Generate id if not provided

  return (
    <div className={`text-input-wrapper ${className}`}>
      {label && <label htmlFor={inputId}>{label}</label>}
      <input
        type={type}
        id={inputId}
        value={value}
        onChange={onChange} // Expects parent to pass the event handler e => setValue(e.target.value)
        placeholder={placeholder}
        disabled={disabled}
        className="text-input-field"
      />
    </div>
  );
}

export default TextInput;