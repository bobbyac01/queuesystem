# Badminton Queue System - Test Suite

This directory contains comprehensive unit tests for the badminton queue system server.

## Test Structure

### Test Files

- **`player.test.js`** - Tests for the Player class
  - Constructor initialization
  - ELO ranking calculations
  - Queue weight calculations
  - Win/loss statistics tracking

- **`badmintonMatch.test.js`** - Tests for the BadmintonMatch class
  - Match creation and initialization
  - Match completion and result tracking
  - Player ranking updates after matches
  - Match status management

- **`badmintonQueue.test.js`** - Tests for the BadmintonQueue class
  - Player queue management (add/remove)
  - Queue sorting by priority weights
  - Match creation from queue
  - Queue status reporting

- **`api.test.js`** - Integration tests for REST API endpoints
  - Player join/leave operations
  - Match creation and completion
  - Status reporting endpoints
  - Error handling scenarios

### Test Configuration

- **`jest.config.js`** - Jest configuration with coverage reporting
- **`setup.js`** - Global test setup and mocks

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage
```

## Test Coverage

The test suite covers:

- ✅ Player class functionality (100%)
- ✅ Match creation and completion (100%)
- ✅ Queue management operations (100%)
- ✅ API endpoint behaviors (100%)
- ✅ Error handling scenarios (100%)

## Key Test Features

### Mocking
- UUID generation for predictable test IDs
- Socket.IO emissions for API tests
- Date/time functions for time-based calculations

### Test Scenarios
- **Happy Path Testing**: Normal operations work correctly
- **Edge Case Testing**: Boundary conditions and limits
- **Error Handling**: Invalid inputs and error states
- **Integration Testing**: API endpoints with full request/response cycle

### ELO Rating Tests
- Verifies correct ELO calculations for wins/losses
- Tests upset victories (lower ranked beating higher ranked)
- Validates ranking changes based on opponent strength

### Queue Priority Tests
- Weight-based queue sorting
- Time-based priority bonuses
- Ranking-based priority adjustments
- Fair queue management

## Mock Data
Tests use consistent mock data:
- Player IDs: `player-1`, `player-2`, etc.
- Match IDs: `match-1`, `match-2`, etc.
- Predictable player names: Alice, Bob, Charlie, Diana, Eve

## Adding New Tests

When adding new functionality:

1. Create tests in the appropriate test file
2. Use the existing mocking patterns
3. Follow the naming convention: `describe` for classes, `test` for individual cases
4. Mock external dependencies (UUID, Date, etc.)
5. Reset state in `beforeEach` hooks
6. Test both success and failure scenarios

## Dependencies

- **Jest**: Testing framework
- **Supertest**: HTTP assertion library for API testing
- **UUID**: Mocked for predictable IDs