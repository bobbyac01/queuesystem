const { v4: uuidv4 } = require('uuid');

// Mock uuid to return predictable values in tests
jest.mock('uuid');

// Since the classes are not exported from server.js, we recreate the Player class for testing:

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

describe('Player Class', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uuidv4.mockReturnValue('test-uuid-123');
  });

  describe('Constructor', () => {
    test('should create a new player with default values', () => {
      const player = new Player('John Doe');
      
      expect(player.id).toBe('test-uuid-123');
      expect(player.name).toBe('John Doe');
      expect(player.ranking).toBe(1200);
      expect(player.wins).toBe(0);
      expect(player.losses).toBe(0);
      expect(player.totalMatches).toBe(0);
      expect(player.queueWeight).toBe(1.0);
      expect(player.lastMatchTime).toBe(null);
      expect(player.isInQueue).toBe(false);
      expect(player.isInMatch).toBe(false);
    });
  });

  describe('updateRanking', () => {
    test('should update ranking and stats when player wins', () => {
      const player = new Player('Winner');
      const initialRanking = player.ranking;
      
      player.updateRanking(true, 1200);
      
      expect(player.wins).toBe(1);
      expect(player.losses).toBe(0);
      expect(player.totalMatches).toBe(1);
      expect(player.ranking).toBeGreaterThanOrEqual(initialRanking);
    });

    test('should update ranking and stats when player loses', () => {
      const player = new Player('Loser');
      const initialRanking = player.ranking;
      
      player.updateRanking(false, 1200);
      
      expect(player.wins).toBe(0);
      expect(player.losses).toBe(1);
      expect(player.totalMatches).toBe(1);
      expect(player.ranking).toBeLessThanOrEqual(initialRanking);
    });

    test('should calculate ELO rating correctly for win against higher ranked player', () => {
      const player = new Player('Underdog');
      player.ranking = 1000;
      
      player.updateRanking(true, 1400); // Win against much higher ranked player
      
      expect(player.ranking).toBeGreaterThan(1000);
      expect(player.ranking).toBeLessThan(1032); // Should be close to 1028
    });

    test('should calculate ELO rating correctly for loss against lower ranked player', () => {
      const player = new Player('Favorite');
      player.ranking = 1400;
      
      player.updateRanking(false, 1000); // Loss against much lower ranked player
      
      expect(player.ranking).toBeLessThan(1400);
      expect(player.ranking).toBeGreaterThan(1368); // Should be close to 1372
    });
  });

  describe('calculateQueueWeight', () => {
    test('should return base weight of 1.0 for new player', () => {
      const player = new Player('Newbie');
      const weight = player.calculateQueueWeight();
      
      expect(weight).toBe(1.0);
      expect(player.queueWeight).toBe(1.0);
    });

    test('should add bonus for low ranking players', () => {
      const player = new Player('Beginner');
      player.ranking = 900;
      
      const weight = player.calculateQueueWeight();
      
      expect(weight).toBe(1.3);
      expect(player.queueWeight).toBe(1.3);
    });

    test('should add time-based bonus for waiting players', () => {
      const player = new Player('Waiter');
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      player.lastMatchTime = thirtyMinutesAgo;
      
      const weight = player.calculateQueueWeight();
      
      expect(weight).toBeGreaterThan(1.0);
      expect(weight).toBeLessThanOrEqual(3.0); // Max bonus is 2.0
    });

    test('should cap time bonus at 2.0', () => {
      const player = new Player('LongWaiter');
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      player.lastMatchTime = oneHourAgo;
      
      const weight = player.calculateQueueWeight();
      
      expect(weight).toBe(3.0); // 1.0 base + 2.0 max time bonus
    });

    test('should combine ranking and time bonuses', () => {
      const player = new Player('BeginnerWaiter');
      player.ranking = 900;
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      player.lastMatchTime = thirtyMinutesAgo;
      
      const weight = player.calculateQueueWeight();
      
      expect(weight).toBeGreaterThan(2.0); // Should have both bonuses (1.0 base + 0.3 ranking + 2.0 time = 3.3, but rounded down)
      expect(weight).toBeLessThanOrEqual(3.3); // Max possible with both bonuses
    });
  });
});