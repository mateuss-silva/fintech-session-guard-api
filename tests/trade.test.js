const supertest = require('supertest');
const app = require('../src/server');
const { getDb, initializeDatabase, seedDemoData, runSql } = require('../src/config/database');

// Mock Auth Middleware for Fastify
jest.mock('../src/middleware/auth', () => ({
  authenticate: async (request, reply) => {
    // Fastify hook mock
    request.user = { id: 'test-user-id', deviceId: 'test-device-id' };
  }
}));

// Mock Market Service to avoid random price changes during tests
const marketService = require('../src/services/marketService');
jest.mock('../src/services/marketService', () => {
    const EventEmitter = require('events');
    const emitter = new EventEmitter();
    return {
        getPrice: jest.fn(),
        initialize: jest.fn(),
        isMarketOpen: jest.fn().mockReturnValue(true),
        isRunning: true,
        prices: { 'TEST-ASSET': { current: 100.00 } },
        on: (event, cb) => emitter.on(event, cb),
        off: (event, cb) => emitter.off(event, cb),
        emit: (event, data) => emitter.emit(event, data)
    };
});

describe('Trading API', () => {
  beforeAll(async () => {
    await app.ready();
    await initializeDatabase();
    
    // Setup test user and assets
    runSql('DELETE FROM users');
    runSql('DELETE FROM portfolio');
    runSql('DELETE FROM transactions');
    
    // Default PIN: 1234 (hashed)
    const pinHash = require('bcryptjs').hashSync('1234', 1); 

    runSql('INSERT INTO users (id, email, password_hash, pin_hash, name) VALUES (?, ?, ?, ?, ?)', 
      ['test-user-id', 'test@test.com', 'hash', pinHash, 'Test User']);
      
    // Give user 1000 BRL
    runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['brl-id', 'test-user-id', 'Saldo em Conta (BRL)', 'currency', 'BRL', 1000.00, 1.0, 1.0]);
      
    // Give user 10 TEST-ASSET
    runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['asset-id', 'test-user-id', 'Test Asset', 'stock', 'TEST-ASSET', 10.0, 50.0, 100.0]);
  });

  beforeEach(() => {
    // Reset market price mock
    marketService.getPrice.mockReset();
    marketService.getPrice.mockReturnValue(100.00); // Default price 100
  });
  
  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/trade/buy', () => {
    it('should buy asset successfully with sufficient funds and valid PIN', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/trade/buy',
        payload: { ticker: 'TEST-ASSET', quantity: 2, pin: '1234' }
      });
        
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).message).toBe('Buy successful');
    });

    it('should fail buy request with invalid PIN', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/trade/buy',
        payload: { ticker: 'TEST-ASSET', quantity: 1, pin: '0000' }
      });
        
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.payload).error).toBe('AUTH_REQUIRED');
    });

    it('should fail buy request with no PIN or biometric token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/trade/buy',
        payload: { ticker: 'TEST-ASSET', quantity: 1 }
      });
        
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.payload).error).toBe('AUTH_REQUIRED');
    });

    it('should fail buy request with insufficient funds', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/trade/buy',
        payload: { ticker: 'TEST-ASSET', quantity: 100, pin: '1234' }
      });
        
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).error).toBe('INSUFFICIENT_FUNDS');
    });
  });

  describe('POST /api/trade/sell', () => {
    it('should sell asset successfully with valid PIN', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/trade/sell',
        payload: { ticker: 'TEST-ASSET', quantity: 5, pin: '1234' }
      });
        
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).message).toBe('Sell successful');
    });

    it('should fail sell request with invalid PIN', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/trade/sell',
        payload: { ticker: 'TEST-ASSET', quantity: 1, pin: '0000' }
      });
        
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.payload).error).toBe('AUTH_REQUIRED');
    });

    it('should fail sell request with insufficient assets', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/trade/sell',
        payload: { ticker: 'TEST-ASSET', quantity: 100, pin: '1234' }
      });
        
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).error).toBe('INSUFFICIENT_ASSETS');
    });

    it('should fail sell request with no PIN or biometric token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/trade/sell',
        payload: { ticker: 'TEST-ASSET', quantity: 1 }
      });
        
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.payload).error).toBe('AUTH_REQUIRED');
    });
  });
});
