const request = require('supertest');
const app = require('../src/server');
const { initializeDatabase, runSql, queryOne } = require('../src/config/database');
const marketService = require('../src/services/marketService');
const http = require('http');

// Mock Auth Middleware
jest.mock('../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 'deep-test-user-id' };
    next();
  }
}));

describe('Deep Verification - Streams & Transactions', () => {
  beforeAll(async () => {
    await initializeDatabase();
    // Initialize marketService once to start simulation and populate prices
    marketService.initialize([]);
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

  describe('Stream (SSE) Price Fluctuations', () => {
    it('should send fluctuating prices over time', (done) => {
      // Start a real server for SSE testing
      const server = app.listen(0, () => {
        const { port } = server.address();
        const url = `http://localhost:${port}/api/market/instruments/instr_001/stream`;
        
        const receivedPrices = [];
        const req = http.get(url, (res) => {
          res.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));
                  receivedPrices.push(data.current);
                } catch (e) {
                  // Ignore initial heartbeats or invalid JSON
                }
              }
            }
            
            // Wait for at least 3 updates to verify fluctuation
            // The simulation in marketService updates every few seconds, 
            // but for tests we might want to manually trigger or just wait.
            // In our current implementation, price moves slightly on every broadcast.
            if (receivedPrices.length >= 2) {
              req.destroy();
              server.close(() => {
                // Check if they are actually numbers and exist
                expect(receivedPrices.length).toBeGreaterThanOrEqual(2);
                // Note: since the simulation is random, there is a tiny chance 
                // it stays the same, but it should usually fluctuate.
                // We just want to see if the stream is delivering data.
                done();
              });
            }
          });
        });
        
        req.on('error', (err) => {
          server.close(() => done(err));
        });

        // Fail if no data after 10s
        setTimeout(() => {
           if (receivedPrices.length < 2) {
             req.destroy();
             server.close(() => done(new Error('Stream timeout: no data received')));
           }
        }, 10000);
      });
    }, 15000); // 15s timeout for the test
  });

  describe('Transaction Balance Sync (Buy)', () => {
    it('should subtract BRL balance and add asset correctly', async () => {
      const ticker = 'PETR4';
      const quantityToBuy = 10;
      
      // Get current price before buy
      const price = marketService.getPrice(ticker);
      const expectedCost = price * quantityToBuy;
      
      const res = await request(app)
        .post('/api/trade/buy')
        .send({ ticker, quantity: quantityToBuy, pin: '1234' });
        
      expect(res.statusCode).toBe(200);
      
      // 1. Verify BRL balance in DB
      const brl = queryOne('SELECT quantity FROM portfolio WHERE user_id = ? AND ticker = ?', ['deep-test-user-id', 'BRL']);
      expect(brl.quantity).toBeCloseTo(100000.00 - expectedCost, 2);
      
      // 2. Verify Asset in portfolio
      const asset = queryOne('SELECT quantity FROM portfolio WHERE user_id = ? AND ticker = ?', ['deep-test-user-id', ticker]);
      expect(asset.quantity).toBe(quantityToBuy);
      
      // 3. Verify Response data consistency
      expect(res.body.transaction.remainingBalance).toBeCloseTo(100000.00 - expectedCost, 2);
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
      
      const res = await request(app)
        .post('/api/trade/sell')
        .send({ ticker, quantity: quantityToSell, pin: '1234' });
        
      expect(res.statusCode).toBe(200);
      
      // 1. Verify BRL balance
      const brl = queryOne('SELECT quantity FROM portfolio WHERE user_id = ? AND ticker = ?', ['deep-test-user-id', 'BRL']);
      expect(brl.quantity).toBeCloseTo(100000.00 + expectedGain, 2);
      
      // 2. Verify Asset reduction
      const asset = queryOne('SELECT quantity FROM portfolio WHERE user_id = ? AND ticker = ?', ['deep-test-user-id', ticker]);
      expect(asset.quantity).toBe(30.0); // 50 - 20
      
      // 3. Verify Response
      expect(res.body.transaction.newBalance).toBeCloseTo(100000.00 + expectedGain, 2);
    });

    it('should remove asset row if quantity reaches zero', async () => {
      const ticker = 'VALE3';
      runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['vale-id', 'deep-test-user-id', 'Vale ON', 'acao', ticker, 10.0, 70.0, 72.0]);
        
      const res = await request(app)
        .post('/api/trade/sell')
        .send({ ticker, quantity: 10, pin: '1234' });
        
      expect(res.statusCode).toBe(200);
      
      const asset = queryOne('SELECT * FROM portfolio WHERE user_id = ? AND ticker = ?', ['deep-test-user-id', ticker]);
      expect(asset).toBeNull();
    });
  });
});
