const app = require('../src/server');
const { initializeDatabase } = require('../src/config/database');
const marketService = require('../src/services/marketService');

// Mock Auth Middleware
jest.mock('../src/middleware/auth', () => ({
  authenticate: async (request, reply) => {
    request.user = { id: 'test-user-id' };
  }
}));

describe('Market API', () => {
  beforeAll(async () => {
    await app.ready();
    await initializeDatabase();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/market/instruments', () => {
    it('should return popular instruments when no query is provided', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/market/instruments' });
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload.instruments).toBeDefined();
      expect(payload.instruments.length).toBeGreaterThan(0);
      // Verify popular flag
      const allPopular = payload.instruments.every(i => {
          const cat = marketService.catalog.find(c => c.ticker === i.ticker);
          return cat && cat.popular;
      });
      expect(allPopular).toBe(true);
    });

    it('should filter instruments by name/query', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/market/instruments?q=Petrobras' });
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload.instruments.some(i => i.ticker === 'PETR4')).toBe(true);
    });

    it('should filter instruments by type', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/market/instruments?type=crypto' });
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      const onlyCrypto = payload.instruments.every(i => i.type === 'crypto');
      expect(onlyCrypto).toBe(true);
      expect(payload.instruments.some(i => i.ticker === 'BTC')).toBe(true);
    });

    it('should return empty list for non-existent query', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/market/instruments?q=NON_EXISTENT_TICKER_123' });
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload.instruments.length).toBe(0);
    });
  });

  describe('GET /api/market/instruments/:id', () => {
    it('should return instrument details for valid ID', async () => {
      const instrId = 'instr_001'; // PETR4
      const res = await app.inject({ method: 'GET', url: `/api/market/instruments/${instrId}` });
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload.id).toBe(instrId);
      expect(payload.ticker).toBe('PETR4');
    });

    it('should return 404 for invalid instrument ID', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/market/instruments/instr_999' });
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.payload).error).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/market/instruments/:id/stream', () => {
    it('should establish SSE connection for valid instrument ID', async () => {
      marketService.addInstrumentClient = jest.fn((ticker, res) => {
        res.write('data: {"current":10}\n\n');
        res.end();
        return true;
      });

      const res = await app.inject({ method: 'GET', url: '/api/market/instruments/instr_001/stream' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.payload).toContain('data: {"current":10}');
    });

    it('should return 404 for streaming non-existent instrument', async () => {
      marketService.addInstrumentClient = jest.fn().mockReturnValue(false);
      const res = await app.inject({ method: 'GET', url: '/api/market/instruments/instr_999/stream' });
      expect(res.statusCode).toBe(404);
    });
  });
});
