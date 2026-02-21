const app = require('../src/server');
const { initializeDatabase, runSql } = require('../src/config/database');
const marketService = require('../src/services/marketService');

// Mock Auth Middleware
jest.mock('../src/middleware/auth', () => ({
  authenticate: async (request, reply) => {
    request.user = { id: 'test-user-id' };
  }
}));

describe('Portfolio API', () => {
  beforeAll(async () => {
    await app.ready();
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

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/portfolio/summary', () => {
    it('should return complete summary including 100k cash', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/portfolio/summary' });
      expect(res.statusCode).toBe(200);
      
      const payload = JSON.parse(res.payload);
      const { summary } = payload;
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

    it('should explicitly verify that totalBalance matches availableBalance + totalCurrent', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/portfolio/summary' });
      expect(res.statusCode).toBe(200);
      
      const payload = JSON.parse(res.payload);
      const { summary, assets } = payload;
      
      // Calculate the sum of all assets
      const sumOfAssets = assets.reduce((acc, asset) => acc + asset.currentValue, 0);
      
      // The math rule: totalBalance must exactly equal availableBalance + sum of all assets
      const calculatedTotal = summary.availableBalance + sumOfAssets;
      
      // Floating point precision match
      const expectedTotal = Math.round(calculatedTotal * 100) / 100;
      
      expect(summary.totalCurrent).toBe(Math.round(sumOfAssets * 100) / 100);
      expect(summary.totalBalance).toBe(expectedTotal);
    });

    it('should include categorized stats (byType)', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/portfolio/summary' });
      expect(res.statusCode).toBe(200);
      
      const payload = JSON.parse(res.payload);
      const acaoCat = payload.byType.find(t => t.type === 'acao');
      expect(acaoCat).toBeDefined();
      expect(acaoCat.invested).toBe(300);
      expect(acaoCat.current).toBe(387);
      expect(acaoCat.assetCount).toBe(1);
    });

    it('should include enriched assets list with instrumentId', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/portfolio/summary' });
      expect(res.statusCode).toBe(200);
      
      const payload = JSON.parse(res.payload);
      const { assets } = payload;
      expect(assets).toBeDefined();
      expect(assets.length).toBe(1);
      expect(assets[0].ticker).toBe('PETR4');
      expect(assets[0].instrumentId).toBe('instr_001'); // Correct ID from catalog
      expect(assets[0].currentPrice).toBe(38.70);
    });
  });

  describe('GET /api/portfolio', () => {
    it('should return list of assets enriched with real-time data', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/portfolio' });
      expect(res.statusCode).toBe(200);
      
      const payload = JSON.parse(res.payload);
      expect(payload.assets).toBeDefined();
      expect(payload.assets.length).toBe(1);
      const petr = payload.assets[0];
      expect(petr.ticker).toBe('PETR4');
      expect(petr.instrumentId).toBe('instr_001');
      expect(petr.change).toBeDefined();
      expect(petr.changePercent).toBeDefined();
    });
  });
});
