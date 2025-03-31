import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; // Import BrowserRouter
import App from './App.jsx';
import './index.css';

const basename = import.meta.env.BASE_URL;
console.log(`Using basename for BrowserRouter: ${basename}`);

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
  <BrowserRouter basename="/who-is-fake/">
    <App />
  </BrowserRouter>
  /* </React.StrictMode>, */
);