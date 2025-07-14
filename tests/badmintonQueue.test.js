const { v4: uuidv4 } = require('uuid');

// Mock uuid
jest.mock('uuid');

// Recreate the classes and queue logic for testing
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
}

// Global queue for testing
let badmintonQueue = [];
let activeMatches = [];
let matches = {};

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

describe('BadmintonQueue Class', () => {
  let players;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset global state
    badmintonQueue = [];
    activeMatches = [];
    matches = {};
    
    uuidv4.mockReturnValueOnce('player-1')
           .mockReturnValueOnce('player-2')
           .mockReturnValueOnce('player-3')
           .mockReturnValueOnce('player-4')
           .mockReturnValueOnce('player-5')
           .mockReturnValueOnce('match-1');

    players = [
      new Player('Alice'),
      new Player('Bob'),
      new Player('Charlie'),
      new Player('Diana'),
      new Player('Eve')
    ];
  });

  describe('addPlayer', () => {
    test('should successfully add player to empty queue', () => {
      const result = BadmintonQueue.addPlayer(players[0]);
      
      expect(result.success).toBe(true);
      expect(result.queuePosition).toBe(1);
      expect(players[0].isInQueue).toBe(true);
      expect(badmintonQueue).toHaveLength(1);
    });

    test('should not add player already in queue', () => {
      BadmintonQueue.addPlayer(players[0]);
      const result = BadmintonQueue.addPlayer(players[0]);
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Player already in queue or match');
      expect(badmintonQueue).toHaveLength(1);
    });

    test('should not add player already in match', () => {
      players[0].isInMatch = true;
      const result = BadmintonQueue.addPlayer(players[0]);
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Player already in queue or match');
      expect(badmintonQueue).toHaveLength(0);
    });

    test('should sort queue by weight (priority)', () => {
      // Mock calculateQueueWeight to return specific values and set queueWeight
      players[0].calculateQueueWeight = jest.fn(() => {
        players[0].queueWeight = 1.0;
        return 1.0;
      });
      players[1].calculateQueueWeight = jest.fn(() => {
        players[1].queueWeight = 2.0;
        return 2.0;
      });
      players[2].calculateQueueWeight = jest.fn(() => {
        players[2].queueWeight = 1.5;
        return 1.5;
      });
      
      BadmintonQueue.addPlayer(players[0]);
      BadmintonQueue.addPlayer(players[1]);
      BadmintonQueue.addPlayer(players[2]);
      
      expect(badmintonQueue[0].player.name).toBe('Bob');    // Highest weight (2.0)
      expect(badmintonQueue[1].player.name).toBe('Charlie'); // Middle weight (1.5)
      expect(badmintonQueue[2].player.name).toBe('Alice');   // Lowest weight (1.0)
    });

    test('should sort by join time when weights are equal', () => {
      const time1 = new Date();
      const time2 = new Date(time1.getTime() + 1000);
      
      jest.spyOn(global, 'Date').mockImplementationOnce(() => time1);
      BadmintonQueue.addPlayer(players[0]);
      
      jest.spyOn(global, 'Date').mockImplementationOnce(() => time2);
      BadmintonQueue.addPlayer(players[1]);
      
      expect(badmintonQueue[0].player.name).toBe('Alice'); // Earlier join time
      expect(badmintonQueue[1].player.name).toBe('Bob');   // Later join time
      
      jest.restoreAllMocks();
    });
  });

  describe('removePlayer', () => {
    test('should successfully remove player from queue', () => {
      BadmintonQueue.addPlayer(players[0]);
      const result = BadmintonQueue.removePlayer(players[0].id);
      
      expect(result.success).toBe(true);
      expect(result.player).toBe(players[0]);
      expect(players[0].isInQueue).toBe(false);
      expect(badmintonQueue).toHaveLength(0);
    });

    test('should fail to remove player not in queue', () => {
      const result = BadmintonQueue.removePlayer('non-existent-id');
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Player not in queue');
    });

    test('should maintain queue order after removal', () => {
      BadmintonQueue.addPlayer(players[0]);
      BadmintonQueue.addPlayer(players[1]);
      BadmintonQueue.addPlayer(players[2]);
      
      BadmintonQueue.removePlayer(players[1].id);
      
      expect(badmintonQueue).toHaveLength(2);
      expect(badmintonQueue[0].player.name).toBe('Alice');
      expect(badmintonQueue[1].player.name).toBe('Charlie');
    });
  });

  describe('createMatch', () => {
    test('should fail to create match with less than 4 players', () => {
      BadmintonQueue.addPlayer(players[0]);
      BadmintonQueue.addPlayer(players[1]);
      BadmintonQueue.addPlayer(players[2]);
      
      const result = BadmintonQueue.createMatch();
      
      expect(result.success).toBe(false);
      expect(result.message).toBe('Need at least 4 players to create a match');
      expect(activeMatches).toHaveLength(0);
    });

    test('should successfully create match with 4 players', () => {
      players.slice(0, 4).forEach(player => BadmintonQueue.addPlayer(player));
      
      const result = BadmintonQueue.createMatch();
      
      expect(result.success).toBe(true);
      expect(result.match).toBeInstanceOf(BadmintonMatch);
      expect(result.match.players).toHaveLength(4);
      expect(activeMatches).toHaveLength(1);
      expect(badmintonQueue).toHaveLength(0);
    });

    test('should update player status when creating match', () => {
      players.slice(0, 4).forEach(player => BadmintonQueue.addPlayer(player));
      
      BadmintonQueue.createMatch();
      
      players.slice(0, 4).forEach(player => {
        expect(player.isInQueue).toBe(false);
        expect(player.isInMatch).toBe(true);
      });
    });

    test('should leave remaining players in queue', () => {
      players.forEach(player => BadmintonQueue.addPlayer(player));
      
      BadmintonQueue.createMatch();
      
      expect(badmintonQueue).toHaveLength(1);
      expect(badmintonQueue[0].player.name).toBe('Eve');
      expect(players[4].isInQueue).toBe(true);
      expect(players[4].isInMatch).toBe(false);
    });

    test('should add match to matches object', () => {
      players.slice(0, 4).forEach(player => BadmintonQueue.addPlayer(player));
      
      const result = BadmintonQueue.createMatch();
      
      expect(matches[result.match.id]).toBe(result.match);
    });
  });

  describe('getQueueStatus', () => {
    test('should return empty queue status', () => {
      const status = BadmintonQueue.getQueueStatus();
      
      expect(status.queue).toEqual([]);
      expect(status.length).toBe(0);
      expect(status.canCreateMatch).toBe(false);
    });

    test('should return correct queue status with players', () => {
      BadmintonQueue.addPlayer(players[0]);
      BadmintonQueue.addPlayer(players[1]);
      
      const status = BadmintonQueue.getQueueStatus();
      
      expect(status.queue).toHaveLength(2);
      expect(status.length).toBe(2);
      expect(status.canCreateMatch).toBe(false);
      expect(status.queue[0].position).toBe(1);
      expect(status.queue[0].player.name).toBe('Alice');
    });

    test('should indicate when match can be created', () => {
      players.slice(0, 4).forEach(player => BadmintonQueue.addPlayer(player));
      
      const status = BadmintonQueue.getQueueStatus();
      
      expect(status.canCreateMatch).toBe(true);
      expect(status.length).toBe(4);
    });

    test('should include player details and weights', () => {
      players[0].ranking = 1500;
      players[0].calculateQueueWeight = jest.fn(() => {
        players[0].queueWeight = 1.5;
        return 1.5;
      });
      BadmintonQueue.addPlayer(players[0]);
      
      const status = BadmintonQueue.getQueueStatus();
      
      expect(status.queue[0].player.ranking).toBe(1500);
      expect(status.queue[0].player.weight).toBe(1.5);
      expect(status.queue[0].joinTime).toBeInstanceOf(Date);
    });
  });
});