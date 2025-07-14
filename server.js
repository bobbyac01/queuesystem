const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

let players = {};
let matches = {};
let activeMatches = [];
let completedMatches = [];
let badmintonQueue = [];

class Player {
  constructor(name) {
    this.id = uuidv4();
    this.name = name;
    this.ranking = 1200; // ELO-style ranking
    this.wins = 0;
    this.losses = 0;
    this.totalMatches = 0;
    this.queueWeight = 1.0; // Higher weight = higher priority
    this.lastMatchTime = null;
    this.isInQueue = false;
    this.isInMatch = false;
  }

  updateRanking(won, opponentRanking) {
    const K = 32; // K-factor for ELO calculation
    const expectedScore = 1 / (1 + Math.pow(10, (opponentRanking - this.ranking) / 400));
    const actualScore = won ? 1 : 0;
    this.ranking = Math.round(this.ranking + K * (actualScore - expectedScore));
    
    if (won) this.wins++;
    else this.losses++;
    this.totalMatches++;
  }

  calculateQueueWeight() {
    // Base weight starts at 1.0
    let weight = 1.0;
    
    // Increase weight based on time since last match (decay function)
    if (this.lastMatchTime) {
      const timeSinceLastMatch = (new Date() - this.lastMatchTime) / (1000 * 60); // minutes
      weight += Math.min(timeSinceLastMatch / 30, 2.0); // Max 2.0 bonus for 30+ minutes wait
    }
    
    // Slight bonus for lower rankings (helping newer players)
    if (this.ranking < 1000) weight += 0.3;
    
    this.queueWeight = Math.round(weight * 100) / 100;
    return this.queueWeight;
  }
}

class BadmintonMatch {
  constructor(players) {
    this.id = uuidv4();
    this.players = players;
    this.startTime = new Date();
    this.endTime = null;
    this.result = null; // { winners: [player1, player2], losers: [player3, player4] }
    this.courtNumber = null;
    this.status = 'active'; // active, completed
  }

  completeMatch(winners, losers) {
    this.endTime = new Date();
    this.result = { winners, losers };
    this.status = 'completed';
    
    // Update player rankings
    const winnerAvgRanking = winners.reduce((sum, p) => sum + p.ranking, 0) / 2;
    const loserAvgRanking = losers.reduce((sum, p) => sum + p.ranking, 0) / 2;
    
    winners.forEach(player => {
      player.updateRanking(true, loserAvgRanking);
      player.lastMatchTime = new Date();
      player.isInMatch = false;
    });
    
    losers.forEach(player => {
      player.updateRanking(false, winnerAvgRanking);
      player.lastMatchTime = new Date();
      player.isInMatch = false;
    });
  }
}

class BadmintonQueue {
  static addPlayer(player) {
    if (player.isInQueue || player.isInMatch) {
      return { success: false, message: 'Player already in queue or match' };
    }
    
    player.isInQueue = true;
    player.calculateQueueWeight();
    
    badmintonQueue.push({
      player: player,
      joinTime: new Date(),
      weight: player.queueWeight
    });
    
    // Sort queue by weight (higher weight first), then by join time
    badmintonQueue.sort((a, b) => {
      if (Math.abs(a.weight - b.weight) < 0.01) {
        return a.joinTime - b.joinTime; // Earlier join time first
      }
      return b.weight - a.weight; // Higher weight first
    });
    
    return { success: true, queuePosition: badmintonQueue.findIndex(q => q.player.id === player.id) + 1 };
  }

  static removePlayer(playerId) {
    const index = badmintonQueue.findIndex(q => q.player.id === playerId);
    if (index === -1) return { success: false, message: 'Player not in queue' };
    
    const queueItem = badmintonQueue.splice(index, 1)[0];
    queueItem.player.isInQueue = false;
    return { success: true, player: queueItem.player };
  }

  static createMatch() {
    if (badmintonQueue.length < 4) {
      return { success: false, message: 'Need at least 4 players to create a match' };
    }
    
    // Take the first 4 players from queue
    const matchPlayers = badmintonQueue.splice(0, 4).map(q => {
      q.player.isInQueue = false;
      q.player.isInMatch = true;
      return q.player;
    });
    
    const match = new BadmintonMatch(matchPlayers);
    activeMatches.push(match);
    matches[match.id] = match;
    
    return { success: true, match: match };
  }

  static getQueueStatus() {
    return {
      queue: badmintonQueue.map((q, index) => ({
        position: index + 1,
        player: {
          id: q.player.id,
          name: q.player.name,
          ranking: q.player.ranking,
          weight: q.weight
        },
        joinTime: q.joinTime
      })),
      length: badmintonQueue.length,
      canCreateMatch: badmintonQueue.length >= 4
    };
  }
}

// API Routes
app.get('/api/badminton/status', (req, res) => {
  res.json({
    queue: BadmintonQueue.getQueueStatus(),
    activeMatches: activeMatches.map(match => ({
      id: match.id,
      players: match.players.map(p => ({ id: p.id, name: p.name, ranking: p.ranking })),
      startTime: match.startTime,
      status: match.status
    })),
    players: Object.values(players).map(p => ({
      id: p.id,
      name: p.name,
      ranking: p.ranking,
      wins: p.wins,
      losses: p.losses,
      totalMatches: p.totalMatches,
      isInQueue: p.isInQueue,
      isInMatch: p.isInMatch
    }))
  });
});

app.post('/api/badminton/join', (req, res) => {
  const { playerName } = req.body;
  
  if (!playerName || !playerName.trim()) {
    return res.status(400).json({ success: false, message: 'Player name is required' });
  }
  
  // Find existing player or create new one
  let player = Object.values(players).find(p => p.name === playerName.trim());
  if (!player) {
    player = new Player(playerName.trim());
    players[player.id] = player;
  }
  
  const result = BadmintonQueue.addPlayer(player);
  
  if (result.success) {
    io.emit('badmintonUpdate', {
      queue: BadmintonQueue.getQueueStatus(),
      activeMatches: activeMatches.map(match => ({
        id: match.id,
        players: match.players.map(p => ({ id: p.id, name: p.name, ranking: p.ranking })),
        startTime: match.startTime,
        status: match.status
      }))
    });
  }
  
  res.json({ ...result, player: { id: player.id, name: player.name, ranking: player.ranking } });
});

app.delete('/api/badminton/leave/:playerId', (req, res) => {
  const { playerId } = req.params;
  
  const result = BadmintonQueue.removePlayer(playerId);
  
  if (result.success) {
    io.emit('badmintonUpdate', {
      queue: BadmintonQueue.getQueueStatus(),
      activeMatches: activeMatches.map(match => ({
        id: match.id,
        players: match.players.map(p => ({ id: p.id, name: p.name, ranking: p.ranking })),
        startTime: match.startTime,
        status: match.status
      }))
    });
  }
  
  res.json(result);
});

app.post('/api/badminton/create-match', (req, res) => {
  const result = BadmintonQueue.createMatch();
  
  if (result.success) {
    io.emit('matchCreated', {
      match: {
        id: result.match.id,
        players: result.match.players.map(p => ({ id: p.id, name: p.name, ranking: p.ranking })),
        startTime: result.match.startTime,
        status: result.match.status
      }
    });
    
    io.emit('badmintonUpdate', {
      queue: BadmintonQueue.getQueueStatus(),
      activeMatches: activeMatches.map(match => ({
        id: match.id,
        players: match.players.map(p => ({ id: p.id, name: p.name, ranking: p.ranking })),
        startTime: match.startTime,
        status: match.status
      }))
    });
  }
  
  res.json(result);
});

app.post('/api/badminton/complete-match', (req, res) => {
  const { matchId, winnerIds } = req.body;
  
  if (!matchId || !winnerIds || winnerIds.length !== 2) {
    return res.status(400).json({ success: false, message: 'Match ID and 2 winner IDs required' });
  }
  
  const match = matches[matchId];
  if (!match || match.status !== 'active') {
    return res.status(404).json({ success: false, message: 'Active match not found' });
  }
  
  const winners = match.players.filter(p => winnerIds.includes(p.id));
  const losers = match.players.filter(p => !winnerIds.includes(p.id));
  
  if (winners.length !== 2 || losers.length !== 2) {
    return res.status(400).json({ success: false, message: 'Invalid winner selection' });
  }
  
  match.completeMatch(winners, losers);
  
  // Move match from active to completed
  const activeIndex = activeMatches.findIndex(m => m.id === matchId);
  if (activeIndex !== -1) {
    activeMatches.splice(activeIndex, 1);
    completedMatches.push(match);
  }
  
  io.emit('matchCompleted', {
    match: {
      id: match.id,
      players: match.players.map(p => ({ id: p.id, name: p.name, ranking: p.ranking })),
      result: {
        winners: winners.map(p => ({ id: p.id, name: p.name, ranking: p.ranking })),
        losers: losers.map(p => ({ id: p.id, name: p.name, ranking: p.ranking }))
      },
      endTime: match.endTime
    }
  });
  
  io.emit('badmintonUpdate', {
    queue: BadmintonQueue.getQueueStatus(),
    activeMatches: activeMatches.map(match => ({
      id: match.id,
      players: match.players.map(p => ({ id: p.id, name: p.name, ranking: p.ranking })),
      startTime: match.startTime,
      status: match.status
    }))
  });
  
  res.json({ success: true, match: match });
});

app.post('/api/badminton/rejoin/:playerId', (req, res) => {
  const { playerId } = req.params;
  
  const player = players[playerId];
  if (!player) {
    return res.status(404).json({ success: false, message: 'Player not found' });
  }
  
  if (player.isInMatch) {
    return res.status(400).json({ success: false, message: 'Player is currently in a match' });
  }
  
  const result = BadmintonQueue.addPlayer(player);
  
  if (result.success) {
    io.emit('badmintonUpdate', {
      queue: BadmintonQueue.getQueueStatus(),
      activeMatches: activeMatches.map(match => ({
        id: match.id,
        players: match.players.map(p => ({ id: p.id, name: p.name, ranking: p.ranking })),
        startTime: match.startTime,
        status: match.status
      }))
    });
  }
  
  res.json(result);
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Send current badminton system status to new client
  socket.emit('badmintonInitialData', {
    queue: BadmintonQueue.getQueueStatus(),
    activeMatches: activeMatches.map(match => ({
      id: match.id,
      players: match.players.map(p => ({ id: p.id, name: p.name, ranking: p.ranking })),
      startTime: match.startTime,
      status: match.status
    })),
    players: Object.values(players).map(p => ({
      id: p.id,
      name: p.name,
      ranking: p.ranking,
      wins: p.wins,
      losses: p.losses,
      totalMatches: p.totalMatches,
      isInQueue: p.isInQueue,
      isInMatch: p.isInMatch
    }))
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});