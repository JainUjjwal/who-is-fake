import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import './App.css';

function App() {
  return (
    <div className="App">
      <h1>Who is fake</h1> {/* Or move layout elsewhere */}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/lobby/:roomCode" element={<LobbyPage />} />
        <Route path="/game/:roomCode" element={<GamePage />} />
        {/* Add other routes like /create or handle 404 */}
      </Routes>
    </div>
  );
}

export default App;