const request = require('supertest');
const app = require('../src/server');
const { initializeDatabase, runSql } = require('../src/config/database');
const marketService = require('../src/services/marketService');

// Mock Auth Middleware
jest.mock('../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 'test-user-id' };
    next();
  }
}));

describe('Portfolio API', () => {
  beforeAll(async () => {
    await initializeDatabase();
    
    // Seed test data
    runSql('DELETE FROM portfolio');
    
    const petrPrice = 38.70;
    
    // Initialize Market Service with test prices
    marketService.initialize([
      { ticker: 'PETR4', current: petrPrice }
    ]);
    
    // 100k BRL
    runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['brl-id', 'test-user-id', 'Saldo em Conta (BRL)', 'currency', 'BRL', 100000.00, 1.0, 1.0]);
      
    // 10 PETR4 at avg 30
    runSql('INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['petr-id', 'test-user-id', 'Petrobras PN', 'acao', 'PETR4', 10.0, 30.0, petrPrice]);
  });

  describe('GET /api/portfolio/summary', () => {
    it('should return complete summary including 100k cash', async () => {
      const res = await request(app).get('/api/portfolio/summary');
      expect(res.statusCode).toBe(200);
      
      const { summary } = res.body;
      // Current value = (10 * 38.70) = 387
      // Invested value = (10 * 30) = 300
      // Available = 100,000
      // Total Balance = 387 + 100,000 = 100,387
      
      expect(summary.totalInvested).toBe(300);
      expect(summary.totalCurrent).toBe(387);
      expect(summary.availableBalance).toBe(100000);
      expect(summary.totalBalance).toBe(100387);
      expect(summary.totalProfit).toBe(87);
      expect(summary.totalAssets).toBe(1);
    });

    it('should include categorized stats (byType)', async () => {
      const res = await request(app).get('/api/portfolio/summary');
      expect(res.statusCode).toBe(200);
      
      const acaoCat = res.body.byType.find(t => t.type === 'acao');
      expect(acaoCat).toBeDefined();
      expect(acaoCat.invested).toBe(300);
      expect(acaoCat.current).toBe(387);
      expect(acaoCat.assetCount).toBe(1);
    });

    it('should include enriched assets list with instrumentId', async () => {
      const res = await request(app).get('/api/portfolio/summary');
      expect(res.statusCode).toBe(200);
      
      const { assets } = res.body;
      expect(assets).toBeDefined();
      expect(assets.length).toBe(1);
      expect(assets[0].ticker).toBe('PETR4');
      expect(assets[0].instrumentId).toBe('instr_001'); // Correct ID from catalog
      expect(assets[0].currentPrice).toBe(38.70);
    });
  });

  describe('GET /api/portfolio', () => {
    it('should return list of assets enriched with real-time data', async () => {
      const res = await request(app).get('/api/portfolio');
      expect(res.statusCode).toBe(200);
      
      expect(res.body.assets).toBeDefined();
      expect(res.body.assets.length).toBe(1);
      const petr = res.body.assets[0];
      expect(petr.ticker).toBe('PETR4');
      expect(petr.instrumentId).toBe('instr_001');
      expect(petr.change).toBeDefined();
      expect(petr.change_percent).toBeDefined();
    });
  });
});
