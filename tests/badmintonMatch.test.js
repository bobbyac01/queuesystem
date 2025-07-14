const { v4: uuidv4 } = require('uuid');

// Mock uuid
jest.mock('uuid');

// Recreate the classes for testing
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

describe('BadmintonMatch Class', () => {
  let players;

  beforeEach(() => {
    jest.clearAllMocks();
    uuidv4.mockReturnValueOnce('player-1')
           .mockReturnValueOnce('player-2')
           .mockReturnValueOnce('player-3')
           .mockReturnValueOnce('player-4')
           .mockReturnValueOnce('match-uuid-123');

    players = [
      new Player('Player 1'),
      new Player('Player 2'),
      new Player('Player 3'),
      new Player('Player 4')
    ];
    
    // Set different rankings for testing
    players[0].ranking = 1300;
    players[1].ranking = 1250;
    players[2].ranking = 1150;
    players[3].ranking = 1100;
  });

  describe('Constructor', () => {
    test('should create a new match with correct initial values', () => {
      const match = new BadmintonMatch(players);
      
      expect(match.id).toBe('match-uuid-123');
      expect(match.players).toEqual(players);
      expect(match.startTime).toBeInstanceOf(Date);
      expect(match.endTime).toBe(null);
      expect(match.result).toBe(null);
      expect(match.courtNumber).toBe(null);
      expect(match.status).toBe('active');
    });

    test('should accept players array', () => {
      const match = new BadmintonMatch(players);
      
      expect(match.players).toHaveLength(4);
      expect(match.players[0].name).toBe('Player 1');
    });
  });

  describe('completeMatch', () => {
    test('should complete match and update player stats', () => {
      const match = new BadmintonMatch(players);
      const winners = [players[0], players[1]];
      const losers = [players[2], players[3]];
      
      match.completeMatch(winners, losers);
      
      expect(match.status).toBe('completed');
      expect(match.endTime).toBeInstanceOf(Date);
      expect(match.result).toEqual({ winners, losers });
    });

    test('should update winner statistics', () => {
      const match = new BadmintonMatch(players);
      const winners = [players[0], players[1]];
      const losers = [players[2], players[3]];
      
      match.completeMatch(winners, losers);
      
      winners.forEach(player => {
        expect(player.wins).toBe(1);
        expect(player.losses).toBe(0);
        expect(player.totalMatches).toBe(1);
        expect(player.lastMatchTime).toBeInstanceOf(Date);
        expect(player.isInMatch).toBe(false);
      });
    });

    test('should update loser statistics', () => {
      const match = new BadmintonMatch(players);
      const winners = [players[0], players[1]];
      const losers = [players[2], players[3]];
      
      match.completeMatch(winners, losers);
      
      losers.forEach(player => {
        expect(player.wins).toBe(0);
        expect(player.losses).toBe(1);
        expect(player.totalMatches).toBe(1);
        expect(player.lastMatchTime).toBeInstanceOf(Date);
        expect(player.isInMatch).toBe(false);
      });
    });

    test('should update rankings based on team averages', () => {
      const match = new BadmintonMatch(players);
      const winners = [players[0], players[1]]; // Higher ranked team
      const losers = [players[2], players[3]];  // Lower ranked team
      
      const initialWinnerRankings = winners.map(p => p.ranking);
      const initialLoserRankings = losers.map(p => p.ranking);
      
      match.completeMatch(winners, losers);
      
      // Higher ranked team beating lower ranked team should gain fewer points
      winners.forEach((player, index) => {
        expect(player.ranking).toBeGreaterThan(initialWinnerRankings[index]);
      });
      
      // Lower ranked team losing to higher ranked team should lose fewer points
      losers.forEach((player, index) => {
        expect(player.ranking).toBeLessThan(initialLoserRankings[index]);
      });
    });

    test('should handle upset victory correctly', () => {
      const match = new BadmintonMatch(players);
      const winners = [players[2], players[3]]; // Lower ranked team wins
      const losers = [players[0], players[1]];  // Higher ranked team loses
      
      const initialWinnerRankings = winners.map(p => p.ranking);
      const initialLoserRankings = losers.map(p => p.ranking);
      
      match.completeMatch(winners, losers);
      
      // Lower ranked team beating higher ranked team should gain more points
      winners.forEach((player, index) => {
        const rankingGain = player.ranking - initialWinnerRankings[index];
        expect(rankingGain).toBeGreaterThan(16); // Should gain significant points
      });
      
      // Higher ranked team losing to lower ranked team should lose more points
      losers.forEach((player, index) => {
        const rankingLoss = initialLoserRankings[index] - player.ranking;
        expect(rankingLoss).toBeGreaterThan(16); // Should lose significant points
      });
    });

    test('should set match endTime when completed', () => {
      const match = new BadmintonMatch(players);
      const beforeCompletion = new Date();
      
      match.completeMatch([players[0], players[1]], [players[2], players[3]]);
      
      expect(match.endTime).toBeInstanceOf(Date);
      expect(match.endTime.getTime()).toBeGreaterThanOrEqual(beforeCompletion.getTime());
    });
  });
});