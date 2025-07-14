import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import axios from 'axios';

const socket = io('http://localhost:5000');

function App() {
  const [badmintonData, setBadmintonData] = useState({
    queue: { queue: [], length: 0, canCreateMatch: false },
    activeMatches: [],
    players: []
  });
  const [playerName, setPlayerName] = useState('');
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [notification, setNotification] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [selectedWinners, setSelectedWinners] = useState([]);

  useEffect(() => {
    // Request initial data when component mounts
    const fetchInitialData = async () => {
      try {
        const response = await axios.get('/api/badminton/status');
        setBadmintonData(response.data);
      } catch (error) {
        console.error('Error fetching initial data:', error);
      }
    };

    fetchInitialData();

    socket.on('badmintonInitialData', (data) => {
      console.log('Received initial data:', data);
      setBadmintonData(data);
    });

    socket.on('badmintonUpdate', (data) => {
      console.log('Received update:', data);
      setBadmintonData(prev => ({
        ...prev,
        queue: data.queue,
        activeMatches: data.activeMatches
      }));
    });

    socket.on('matchCreated', ({ match }) => {
      showNotification(`New match created! Players: ${match.players.map(p => p.name).join(', ')}`);
      if (currentPlayer && match.players.some(p => p.id === currentPlayer.id)) {
        showNotification('You have been selected for a match!', 'success');
      }
    });

    socket.on('matchCompleted', ({ match }) => {
      showNotification(`Match completed! Winners: ${match.result.winners.map(p => p.name).join(', ')}`);
      setSelectedMatch(null);
      setSelectedWinners([]);
    });

    return () => {
      socket.off('badmintonInitialData');
      socket.off('badmintonUpdate');
      socket.off('matchCreated');
      socket.off('matchCompleted');
    };
  }, [currentPlayer]);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const joinQueue = async () => {
    if (!playerName.trim()) {
      showNotification('Please enter your name', 'error');
      return;
    }

    try {
      const response = await axios.post('/api/badminton/join', {
        playerName: playerName.trim()
      });

      console.log('Join response:', response.data);
      if (response.data.success) {
        setCurrentPlayer(response.data.player);
        showNotification(`Successfully joined the badminton queue! Position: #${response.data.queuePosition}`);
        setPlayerName('');
      } else {
        showNotification(response.data.message, 'error');
      }
    } catch (error) {
      showNotification('Failed to join queue. Please try again.', 'error');
      console.error('Error joining queue:', error);
    }
  };

  const leaveQueue = async () => {
    if (!currentPlayer) return;

    try {
      const response = await axios.delete(`/api/badminton/leave/${currentPlayer.id}`);
      
      if (response.data.success) {
        setCurrentPlayer(null);
        showNotification('Successfully left the queue');
      } else {
        showNotification(response.data.message, 'error');
      }
    } catch (error) {
      showNotification('Failed to leave queue. Please try again.', 'error');
      console.error('Error leaving queue:', error);
    }
  };

  const createMatch = async () => {
    try {
      const response = await axios.post('/api/badminton/create-match');
      
      if (response.data.success) {
        showNotification('Match created successfully!');
      } else {
        showNotification(response.data.message, 'error');
      }
    } catch (error) {
      showNotification('Failed to create match. Please try again.', 'error');
      console.error('Error creating match:', error);
    }
  };

  const completeMatch = async (matchId) => {
    if (selectedWinners.length !== 2) {
      showNotification('Please select exactly 2 winners', 'error');
      return;
    }

    try {
      const response = await axios.post('/api/badminton/complete-match', {
        matchId: matchId,
        winnerIds: selectedWinners
      });
      
      if (response.data.success) {
        showNotification('Match completed successfully!');
        setSelectedMatch(null);
        setSelectedWinners([]);
      } else {
        showNotification(response.data.message, 'error');
      }
    } catch (error) {
      showNotification('Failed to complete match. Please try again.', 'error');
      console.error('Error completing match:', error);
    }
  };

  const rejoinQueue = async (playerId) => {
    try {
      const response = await axios.post(`/api/badminton/rejoin/${playerId}`);
      
      if (response.data.success) {
        showNotification('Successfully rejoined the queue!');
      } else {
        showNotification(response.data.message, 'error');
      }
    } catch (error) {
      showNotification('Failed to rejoin queue. Please try again.', 'error');
      console.error('Error rejoining queue:', error);
    }
  };

  const formatTime = (timeString) => {
    const date = new Date(timeString);
    return date.toLocaleTimeString();
  };

  const toggleWinnerSelection = (playerId) => {
    if (selectedWinners.includes(playerId)) {
      setSelectedWinners(selectedWinners.filter(id => id !== playerId));
    } else if (selectedWinners.length < 2) {
      setSelectedWinners([...selectedWinners, playerId]);
    }
  };

  return (
    <div className="container">
      {notification && (
        <div className={`notification ${notification.type === 'error' ? 'error' : ''}`}>
          {notification.message}
        </div>
      )}

      <div className="queue-header">
        <h1>🏸 Badminton Queue System</h1>
        <div className="join-form">
          <input
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && joinQueue()}
            disabled={!!currentPlayer}
          />
          <button 
            onClick={joinQueue}
            disabled={!!currentPlayer || !playerName.trim()}
          >
            {currentPlayer ? 'In Queue' : 'Join Queue'}
          </button>
        </div>
        {currentPlayer && (
          <div style={{ marginTop: '10px', padding: '10px', background: '#e3f2fd', borderRadius: '4px' }}>
            You are queued as {currentPlayer.name} (Ranking: {currentPlayer.ranking})
            <button 
              onClick={leaveQueue}
              style={{ marginLeft: '10px', padding: '5px 10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Leave Queue
            </button>
          </div>
        )}
      </div>

      <div className="queue-display">
        <h2>Badminton Queue ({badmintonData.queue.length} players)</h2>
        
        <div className="queue-stats">
          <div className="stat">
            <div className="stat-value">{badmintonData.queue.length}</div>
            <div className="stat-label">Players in Queue</div>
          </div>
          <div className="stat">
            <div className="stat-value">{Math.floor(badmintonData.queue.length / 4)}</div>
            <div className="stat-label">Possible Matches</div>
          </div>
          <div className="stat">
            <div className="stat-value">{badmintonData.activeMatches.length}</div>
            <div className="stat-label">Active Matches</div>
          </div>
        </div>

        {badmintonData.queue.queue.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            Queue is empty
          </div>
        ) : (
          <ul className="queue-list">
            {badmintonData.queue.queue.map((item) => (
              <li 
                key={item.player.id} 
                className={`queue-item ${currentPlayer && currentPlayer.id === item.player.id ? 'current-user' : ''}`}
              >
                <div className="user-info">
                  <span className="position">#{item.position}</span>
                  <span className="user-name">{item.player.name}</span>
                  <span className="ranking">Rank: {item.player.ranking}</span>
                  <span className="weight">Weight: {item.player.weight}</span>
                  <span className="join-time">Joined: {formatTime(item.joinTime)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="admin-controls">
        <h3>Match Management</h3>
        <button 
          className="next-btn"
          onClick={createMatch}
          disabled={!badmintonData.queue.canCreateMatch}
        >
          Create Match (Need 4 Players)
        </button>
      </div>

      {badmintonData.activeMatches.length > 0 && (
        <div className="active-matches">
          <h3>Active Matches</h3>
          {badmintonData.activeMatches.map((match) => (
            <div key={match.id} className="match-card">
              <div className="match-header">
                <h4>Match {match.id.slice(0, 8)}</h4>
                <span className="match-time">Started: {formatTime(match.startTime)}</span>
              </div>
              <div className="match-players">
                {match.players.map((player) => (
                  <div 
                    key={player.id} 
                    className={`player-card ${selectedMatch === match.id && selectedWinners.includes(player.id) ? 'winner-selected' : ''}`}
                    onClick={() => {
                      if (selectedMatch === match.id) {
                        toggleWinnerSelection(player.id);
                      }
                    }}
                  >
                    <span className="player-name">{player.name}</span>
                    <span className="player-ranking">({player.ranking})</span>
                  </div>
                ))}
              </div>
              <div className="match-controls">
                {selectedMatch === match.id ? (
                  <div>
                    <p>Select 2 winners by clicking on players above</p>
                    <button 
                      onClick={() => completeMatch(match.id)}
                      disabled={selectedWinners.length !== 2}
                      className="complete-btn"
                    >
                      Complete Match
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedMatch(null);
                        setSelectedWinners([]);
                      }}
                      className="cancel-btn"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setSelectedMatch(match.id)}
                    className="select-winners-btn"
                  >
                    Record Result
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {badmintonData.players.length > 0 && (
        <div className="players-leaderboard">
          <h3>Player Rankings</h3>
          <div className="leaderboard">
            {badmintonData.players
              .sort((a, b) => b.ranking - a.ranking)
              .slice(0, 10)
              .map((player, index) => (
                <div key={player.id} className="leaderboard-item">
                  <span className="rank">#{index + 1}</span>
                  <span className="name">{player.name}</span>
                  <span className="rating">{player.ranking}</span>
                  <span className="record">{player.wins}W-{player.losses}L</span>
                  <span className="status">
                    {player.isInMatch ? '🏸 Playing' : player.isInQueue ? '⏳ Queued' : ''}
                  </span>
                  {!player.isInQueue && !player.isInMatch && (
                    <button 
                      onClick={() => rejoinQueue(player.id)}
                      className="rejoin-btn"
                    >
                      Rejoin Queue
                    </button>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;