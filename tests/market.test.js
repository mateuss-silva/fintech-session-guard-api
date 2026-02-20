const request = require('supertest');
const app = require('../src/server');
const { initializeDatabase } = require('../src/config/database');
const marketService = require('../src/services/marketService');

// Mock Auth Middleware
jest.mock('../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 'test-user-id' };
    next();
  }
}));

describe('Market API', () => {
  beforeAll(async () => {
    await initializeDatabase();
  });

  describe('GET /api/market/instruments', () => {
    it('should return popular instruments when no query is provided', async () => {
      const res = await request(app).get('/api/market/instruments');
      expect(res.statusCode).toBe(200);
      expect(res.body.instruments).toBeDefined();
      expect(res.body.instruments.length).toBeGreaterThan(0);
      // Verify popular flag
      const allPopular = res.body.instruments.every(i => {
          const cat = marketService.catalog.find(c => c.ticker === i.ticker);
          return cat && cat.popular;
      });
      expect(allPopular).toBe(true);
    });

    it('should filter instruments by name/query', async () => {
      const res = await request(app).get('/api/market/instruments?q=Petrobras');
      expect(res.statusCode).toBe(200);
      expect(res.body.instruments.some(i => i.ticker === 'PETR4')).toBe(true);
    });

    it('should filter instruments by type', async () => {
      const res = await request(app).get('/api/market/instruments?type=crypto');
      expect(res.statusCode).toBe(200);
      const onlyCrypto = res.body.instruments.every(i => i.type === 'crypto');
      expect(onlyCrypto).toBe(true);
      expect(res.body.instruments.some(i => i.ticker === 'BTC')).toBe(true);
    });

    it('should return empty list for non-existent query', async () => {
      const res = await request(app).get('/api/market/instruments?q=NON_EXISTENT_TICKER_123');
      expect(res.statusCode).toBe(200);
      expect(res.body.instruments.length).toBe(0);
    });
  });

  describe('GET /api/market/instruments/:id', () => {
    it('should return instrument details for valid ID', async () => {
      const instrId = 'instr_001'; // PETR4
      const res = await request(app).get(`/api/market/instruments/${instrId}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe(instrId);
      expect(res.body.ticker).toBe('PETR4');
    });

    it('should return 404 for invalid instrument ID', async () => {
      const res = await request(app).get('/api/market/instruments/instr_999');
      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/market/instruments/:id/stream', () => {
    it('should establish SSE connection for valid instrument ID', (done) => {
      const http = require('http');
      const server = app.listen(0, () => {
        const { port } = server.address();
        http.get(`http://localhost:${port}/api/market/instruments/instr_001/stream`, (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toContain('text/event-stream');
          res.destroy();
          server.close(done);
        }).on('error', (err) => {
          server.close(() => done(err));
        });
      });
    });

    it('should return 404 for streaming non-existent instrument', async () => {
      const res = await request(app).get('/api/market/instruments/instr_999/stream');
      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });
  });
});
