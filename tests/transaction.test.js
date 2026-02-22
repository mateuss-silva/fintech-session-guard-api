const supertest = require('supertest');
const app = require('../src/server');
const { getDb, initializeDatabase, seedDemoData, runSql } = require('../src/config/database');

// Mock Auth Middleware for Fastify
jest.mock('../src/middleware/auth', () => ({
  authenticate: async (request, reply) => {
    request.user = { id: 'test-user-id', deviceId: 'test-device-id' };
  }
}));

// Mock Market Service
const marketService = require('../src/services/marketService');
jest.mock('../src/services/marketService', () => {
    const EventEmitter = require('events');
    const emitter = new EventEmitter();
    return {
        getPrice: jest.fn(),
        initialize: jest.fn(),
        isMarketOpen: jest.fn().mockReturnValue(true),
        isRunning: true,
        prices: { 'TEST-ASSET': { current: 100.00 }, 'TEST-ASSET2': { current: 50.00 } },
        on: (event, cb) => emitter.on(event, cb),
        off: (event, cb) => emitter.off(event, cb),
        emit: (event, data) => emitter.emit(event, data)
    };
});

describe('Transaction API', () => {
  beforeAll(async () => {
    await app.ready();
    await initializeDatabase();
    
    runSql('DELETE FROM users');
    runSql('DELETE FROM transactions');
    
    const pinHash = require('bcryptjs').hashSync('1234', 1); 

    runSql('INSERT INTO users (id, email, password_hash, pin_hash, name) VALUES (?, ?, ?, ?, ?)', 
      ['test-user-id', 'test@test.com', 'hash', pinHash, 'Test User']);
  });

  beforeEach(() => {
    runSql('DELETE FROM portfolio');
  });
  
  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/transactions/deposit', () => {
    it('should deposit money successfully', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions/deposit',
        payload: { amount: 500 }
      });
        
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).message).toBe('Deposit successful');
      
      const { queryOne } = require('../src/config/database');
      const brl = queryOne('SELECT * FROM portfolio WHERE user_id = ? AND ticker = ?', ['test-user-id', 'BRL']);
      expect(brl.quantity).toBe(500);
    });
  });

  describe('POST /api/transactions/withdraw', () => {
    it('should withdraw amount seamlessly when enough cash is available', async () => {
      runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['brl-id', 'test-user-id', 'Saldo em Conta (BRL)', 'currency', 'BRL', 1000.00, 1.0, 1.0]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions/withdraw',
        payload: { amount: 200 }
      });
        
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).message).toBe('Withdrawal successful');
      
      const { queryOne } = require('../src/config/database');
      const brl = queryOne('SELECT * FROM portfolio WHERE user_id = ? AND ticker = ?', ['test-user-id', 'BRL']);
      expect(brl.quantity).toBe(800);
    });

    it('should auto-sell assets when BRL balance is insufficient but total portfolio value is enough', async () => {
      runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['brl-id', 'test-user-id', 'Saldo em Conta (BRL)', 'currency', 'BRL', 10.00, 1.0, 1.0]);
      runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['asset-id-1', 'test-user-id', 'Test Asset', 'stock', 'TEST-ASSET', 2.0, 100.0, 100.0]); // total 200
        
      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions/withdraw',
        payload: { amount: 110 }
      });
        
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.message).toBe('Withdrawal successful with automatic asset selling');
      expect(data.assets_sold_to_cover.length).toBe(1);
      expect(data.assets_sold_to_cover[0].value_generated).toBe(100);
      
      const { queryOne } = require('../src/config/database');
      const brl = queryOne('SELECT * FROM portfolio WHERE user_id = ? AND ticker = ?', ['test-user-id', 'BRL']);
      expect(brl.quantity).toBe(0); // 10 original + 100 from asset - 110 withdrawal
      
      const asset = queryOne('SELECT * FROM portfolio WHERE user_id = ? AND ticker = ?', ['test-user-id', 'TEST-ASSET']);
      expect(asset.quantity).toBe(1); // 2 - 1 sold
    });

    it('should fail when withdrawal exceeds total portfolio value', async () => {
      runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['brl-id', 'test-user-id', 'Saldo em Conta (BRL)', 'currency', 'BRL', 50.00, 1.0, 1.0]);
      runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['asset-id-1', 'test-user-id', 'Test Asset', 'stock', 'TEST-ASSET', 1.0, 100.0, 100.0]); // total 100
        
      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions/withdraw',
        payload: { amount: 200 } // Total portfolio is 150
      });
        
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toMatch(/Insufficient portfolio value/);
    });
  });

  describe('POST /api/transactions/withdraw/preview', () => {
    it('should return requires_liquidation: false if sufficient BRL', async () => {
      runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['brl-id', 'test-user-id', 'Saldo em Conta (BRL)', 'currency', 'BRL', 1000.00, 1.0, 1.0]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions/withdraw/preview',
        payload: { amount: 200 }
      });
        
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      expect(data.requires_liquidation).toBe(false);
      expect(data.amount_requested).toBe(200);
      expect(data.assets_to_sell).toEqual([]);
    });

    it('should calculate required liquidation but NOT mutate the database', async () => {
      runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['brl-id', 'test-user-id', 'Saldo em Conta (BRL)', 'currency', 'BRL', 10.00, 1.0, 1.0]);
      runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['asset-id-1', 'test-user-id', 'Test Asset', 'stock', 'TEST-ASSET', 2.0, 100.0, 100.0]);
        
      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions/withdraw/preview',
        payload: { amount: 110 } // Shortfall is 100 (110 - 10)
      });
        
      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.payload);
      
      expect(data.requires_liquidation).toBe(true);
      expect(data.shortfall).toBe(100);
      expect(data.assets_to_sell.length).toBe(1);
      expect(data.assets_to_sell[0].ticker).toBe('TEST-ASSET');
      expect(data.assets_to_sell[0].quantity_sold).toBe(1.0); // 100 value / 100 price
      expect(data.assets_to_sell[0].value_generated).toBe(100);
      
      // Verify NO MUTATION
      const { queryOne } = require('../src/config/database');
      const brl = queryOne('SELECT * FROM portfolio WHERE user_id = ? AND ticker = ?', ['test-user-id', 'BRL']);
      expect(brl.quantity).toBe(10.00); // Unchanged
      
      const asset = queryOne('SELECT * FROM portfolio WHERE user_id = ? AND ticker = ?', ['test-user-id', 'TEST-ASSET']);
      expect(asset.quantity).toBe(2.0); // Unchanged
    });

    it('should fail preview when withdrawal exceeds total portfolio value', async () => {
      runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['brl-id', 'test-user-id', 'Saldo em Conta (BRL)', 'currency', 'BRL', 50.00, 1.0, 1.0]);
      runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['asset-id-1', 'test-user-id', 'Test Asset', 'stock', 'TEST-ASSET', 1.0, 100.0, 100.0]); // total 100
        
      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions/withdraw/preview',
        payload: { amount: 200 } // Total is 150
      });
        
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toMatch(/Insufficient portfolio value/);
    });
  });
});
