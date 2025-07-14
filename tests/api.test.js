const request = require('supertest');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Mock dependencies
jest.mock('uuid');
jest.mock('socket.io');

// Create test app with just the API routes
const createTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Mock socket.io
  const mockIo = {
    emit: jest.fn()
  };

  // Recreate the server logic for testing
  let players = {};
  let matches = {};
  let activeMatches = [];
  let completedMatches = [];
  let badmintonQueue = [];

  class Player {
    constructor(name) {
      this.id = uuidv4();
      this.name = name;
      this.ranking = 1200;
      this.wins = 0;
      this.losses = 0;
      this.totalMatches = 0;
      this.queueWeight = 1.0;
      this.lastMatchTime = null;
      this.isInQueue = false;
      this.isInMatch = false;
    }

    updateRanking(won, opponentRanking) {
      const K = 32;
      const expectedScore = 1 / (1 + Math.pow(10, (opponentRanking - this.ranking) / 400));
      const actualScore = won ? 1 : 0;
      this.ranking = Math.round(this.ranking + K * (actualScore - expectedScore));
      
      if (won) this.wins++;
      else this.losses++;
      this.totalMatches++;
    }

    calculateQueueWeight() {
      let weight = 1.0;
      
      if (this.lastMatchTime) {
        const timeSinceLastMatch = (new Date() - this.lastMatchTime) / (1000 * 60);
        weight += Math.min(timeSinceLastMatch / 30, 2.0);
      }
      
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
      this.result = null;
      this.courtNumber = null;
      this.status = 'active';
    }

    completeMatch(winners, losers) {
      this.endTime = new Date();
      this.result = { winners, losers };
      this.status = 'completed';
      
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
      
      badmintonQueue.sort((a, b) => {
        if (Math.abs(a.weight - b.weight) < 0.01) {
          return a.joinTime - b.joinTime;
        }
        return b.weight - a.weight;
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
    
    let player = Object.values(players).find(p => p.name === playerName.trim());
    if (!player) {
      player = new Player(playerName.trim());
      players[player.id] = player;
    }
    
    const result = BadmintonQueue.addPlayer(player);
    
    if (result.success) {
      mockIo.emit('badmintonUpdate', {
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
      mockIo.emit('badmintonUpdate', {
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
      mockIo.emit('matchCreated', {
        match: {
          id: result.match.id,
          players: result.match.players.map(p => ({ id: p.id, name: p.name, ranking: p.ranking })),
          startTime: result.match.startTime,
          status: result.match.status
        }
      });
      
      mockIo.emit('badmintonUpdate', {
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
    
    const activeIndex = activeMatches.findIndex(m => m.id === matchId);
    if (activeIndex !== -1) {
      activeMatches.splice(activeIndex, 1);
      completedMatches.push(match);
    }
    
    mockIo.emit('matchCompleted', {
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
      mockIo.emit('badmintonUpdate', {
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

  // Reset function for tests
  app._reset = () => {
    players = {};
    matches = {};
    activeMatches = [];
    completedMatches = [];
    badmintonQueue = [];
  };

  app._mockIo = mockIo;

  return app;
};

describe('Badminton API Endpoints', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    uuidv4.mockReturnValue('test-uuid');
    app = createTestApp();
    app._reset();
  });

  describe('GET /api/badminton/status', () => {
    test('should return initial empty status', async () => {
      const response = await request(app)
        .get('/api/badminton/status')
        .expect(200);

      expect(response.body).toEqual({
        queue: {
          queue: [],
          length: 0,
          canCreateMatch: false
        },
        activeMatches: [],
        players: []
      });
    });
  });

  describe('POST /api/badminton/join', () => {
    test('should successfully join a new player', async () => {
      const response = await request(app)
        .post('/api/badminton/join')
        .send({ playerName: 'Alice' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.queuePosition).toBe(1);
      expect(response.body.player.name).toBe('Alice');
      expect(response.body.player.ranking).toBe(1200);
    });

    test('should fail with empty player name', async () => {
      const response = await request(app)
        .post('/api/badminton/join')
        .send({ playerName: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Player name is required');
    });

    test('should fail with missing player name', async () => {
      const response = await request(app)
        .post('/api/badminton/join')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Player name is required');
    });

    test('should reuse existing player', async () => {
      // First join
      await request(app)
        .post('/api/badminton/join')
        .send({ playerName: 'Bob' });

      // Leave queue
      const statusResponse = await request(app).get('/api/badminton/status');
      const playerId = statusResponse.body.players[0].id;
      
      await request(app)
        .delete(`/api/badminton/leave/${playerId}`);

      // Rejoin with same name
      const response = await request(app)
        .post('/api/badminton/join')
        .send({ playerName: 'Bob' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.player.name).toBe('Bob');
    });
  });

  describe('DELETE /api/badminton/leave/:playerId', () => {
    test('should successfully remove player from queue', async () => {
      // Join first
      await request(app)
        .post('/api/badminton/join')
        .send({ playerName: 'Charlie' });

      const statusResponse = await request(app).get('/api/badminton/status');
      const playerId = statusResponse.body.players[0].id;

      const response = await request(app)
        .delete(`/api/badminton/leave/${playerId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.player.name).toBe('Charlie');
    });

    test('should fail to remove non-existent player', async () => {
      const response = await request(app)
        .delete('/api/badminton/leave/non-existent-id')
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Player not in queue');
    });
  });

  describe('POST /api/badminton/create-match', () => {
    test('should fail with insufficient players', async () => {
      // Add only 2 players
      await request(app).post('/api/badminton/join').send({ playerName: 'Player1' });
      await request(app).post('/api/badminton/join').send({ playerName: 'Player2' });

      const response = await request(app)
        .post('/api/badminton/create-match')
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Need at least 4 players to create a match');
    });

    test('should successfully create match with 4 players', async () => {
      // Add 4 players
      const playerNames = ['Player1', 'Player2', 'Player3', 'Player4'];
      for (const name of playerNames) {
        await request(app).post('/api/badminton/join').send({ playerName: name });
      }

      const response = await request(app)
        .post('/api/badminton/create-match')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.match).toBeDefined();
      expect(response.body.match.players).toHaveLength(4);
      expect(response.body.match.status).toBe('active');
    });
  });

  describe('POST /api/badminton/complete-match', () => {
    test('should successfully complete a match', async () => {
      // Mock uuid to ensure consistent IDs
      uuidv4.mockReturnValueOnce('player-1')
             .mockReturnValueOnce('player-2')
             .mockReturnValueOnce('player-3')
             .mockReturnValueOnce('player-4')
             .mockReturnValueOnce('match-1');

      // Create a match first
      const playerNames = ['Winner1', 'Winner2', 'Loser1', 'Loser2'];
      for (const name of playerNames) {
        await request(app).post('/api/badminton/join').send({ playerName: name });
      }

      const matchResponse = await request(app).post('/api/badminton/create-match');
      const match = matchResponse.body.match;
      const winnerIds = [match.players[0].id, match.players[1].id];

      const response = await request(app)
        .post('/api/badminton/complete-match')
        .send({ matchId: match.id, winnerIds });

      if (!response.body.success) {
        console.log('Error response:', response.body);
        console.log('Match:', match);
        console.log('WinnerIds:', winnerIds);
      }

      expect(response.body.success).toBe(true);
      expect(response.body.match.status).toBe('completed');
      expect(response.body.match.result).toBeDefined();
    });

    test('should fail with invalid match ID', async () => {
      const response = await request(app)
        .post('/api/badminton/complete-match')
        .send({ matchId: 'invalid-id', winnerIds: ['id1', 'id2'] })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Active match not found');
    });

    test('should fail with wrong number of winners', async () => {
      const response = await request(app)
        .post('/api/badminton/complete-match')
        .send({ matchId: 'any-id', winnerIds: ['only-one'] })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Match ID and 2 winner IDs required');
    });
  });

  describe('POST /api/badminton/rejoin/:playerId', () => {
    test('should successfully rejoin existing player', async () => {
      // Join and leave first
      await request(app).post('/api/badminton/join').send({ playerName: 'Returner' });
      
      const statusResponse = await request(app).get('/api/badminton/status');
      const playerId = statusResponse.body.players[0].id;
      
      await request(app).delete(`/api/badminton/leave/${playerId}`);

      const response = await request(app)
        .post(`/api/badminton/rejoin/${playerId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.queuePosition).toBe(1);
    });

    test('should fail with non-existent player', async () => {
      const response = await request(app)
        .post('/api/badminton/rejoin/non-existent-id')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Player not found');
    });
  });
});