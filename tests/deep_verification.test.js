const app = require('../src/server');
const { initializeDatabase, runSql, queryOne } = require('../src/config/database');
const marketService = require('../src/services/marketService');

// Mock Auth Middleware for Fastify
jest.mock('../src/middleware/auth', () => ({
  authenticate: async (request, reply) => {
    request.user = { id: 'deep-test-user-id' };
  }
}));

describe('Deep Verification - Streams & Transactions', () => {
  beforeAll(async () => {
    await app.ready();
    await initializeDatabase();
    // Initialize marketService once to start simulation and populate prices
    marketService.initialize([]);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Clear and seed for each test
    runSql('DELETE FROM users');
    runSql('DELETE FROM portfolio');
    runSql('DELETE FROM transactions');
    
    // Create test user
    const pinHash = require('bcryptjs').hashSync('1234', 1);
    runSql('INSERT INTO users (id, email, password_hash, pin_hash, name) VALUES (?, ?, ?, ?, ?)',
      ['deep-test-user-id', 'deep@test.com', 'hash', pinHash, 'Deep Test User']);
    
    // Initial 100k BRL
    runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['brl-id', 'deep-test-user-id', 'Saldo em Conta (BRL)', 'currency', 'BRL', 100000.00, 1.0, 1.0]);
  });

  describe('Stream (SSE) Endpoint Exists', () => {
    it('should return 200 and connect to market stream', async () => {
      // marketService mock for test asset
      marketService.initialize([{ticker: 'instr_001', current: 10}]);
      marketService.addInstrumentClient = jest.fn((ticker, res) => {
        res.write('data: {"current":10}\n\n');
        res.end();
        return true;
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/market/instruments/instr_001/stream'
      });
      
      expect(res.statusCode).toBe(200);
      expect(res.payload).toContain('data: {"current":10}');
    });
  });

  describe('Transaction Balance Sync (Buy)', () => {
    it('should subtract BRL balance and add asset correctly', async () => {
      const ticker = 'PETR4';
      const quantityToBuy = 10;
      
      // Get current price before buy
      const price = marketService.getPrice(ticker);
      const expectedCost = price * quantityToBuy;
      
      const res = await app.inject({
        method: 'POST',
        url: '/api/trade/buy',
        payload: { ticker, quantity: quantityToBuy, pin: '1234' }
      });
        
      expect(res.statusCode).toBe(200);
      const resData = JSON.parse(res.payload);
      
      // 1. Verify BRL balance in DB
      const brl = queryOne('SELECT quantity FROM portfolio WHERE user_id = ? AND ticker = ?', ['deep-test-user-id', 'BRL']);
      expect(brl.quantity).toBeCloseTo(100000.00 - expectedCost, 2);
      
      // 2. Verify Asset in portfolio
      const asset = queryOne('SELECT quantity FROM portfolio WHERE user_id = ? AND ticker = ?', ['deep-test-user-id', ticker]);
      expect(asset.quantity).toBe(quantityToBuy);
      
      // 3. Verify Response data consistency
      expect(resData.transaction.remainingBalance).toBeCloseTo(100000.00 - expectedCost, 2);
    });
  });

  describe('Transaction Balance Sync (Sell)', () => {
    it('should add BRL balance and subtract asset correctly', async () => {
      const ticker = 'PETR4';
      // Seed initial asset
      runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['petr-id', 'deep-test-user-id', 'Petrobras PN', 'acao', ticker, 50.0, 30.0, 38.0]);
      
      const quantityToSell = 20;
      const price = marketService.getPrice(ticker);
      const expectedGain = price * quantityToSell;
      
      const res = await app.inject({
        method: 'POST',
        url: '/api/trade/sell',
        payload: { ticker, quantity: quantityToSell, pin: '1234' }
      });
        
      expect(res.statusCode).toBe(200);
      const resData = JSON.parse(res.payload);
      
      // 1. Verify BRL balance
      const brl = queryOne('SELECT quantity FROM portfolio WHERE user_id = ? AND ticker = ?', ['deep-test-user-id', 'BRL']);
      expect(brl.quantity).toBeCloseTo(100000.00 + expectedGain, 2);
      
      // 2. Verify Asset reduction
      const asset = queryOne('SELECT quantity FROM portfolio WHERE user_id = ? AND ticker = ?', ['deep-test-user-id', ticker]);
      expect(asset.quantity).toBe(30.0); // 50 - 20
      
      // 3. Verify Response
      expect(resData.transaction.newBalance).toBeCloseTo(100000.00 + expectedGain, 2);
    });

    it('should remove asset row if quantity reaches zero', async () => {
      const ticker = 'VALE3';
      runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['vale-id', 'deep-test-user-id', 'Vale ON', 'acao', ticker, 10.0, 70.0, 72.0]);
        
      const res = await app.inject({
        method: 'POST',
        url: '/api/trade/sell',
        payload: { ticker, quantity: 10, pin: '1234' }
      });
        
      expect(res.statusCode).toBe(200);
      
      const asset = queryOne('SELECT * FROM portfolio WHERE user_id = ? AND ticker = ?', ['deep-test-user-id', ticker]);
      expect(asset).toBeNull();
    });
  });
});
