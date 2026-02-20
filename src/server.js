require('dotenv').config();

const path = require('path');
const fs = require('fs');

// Create Fastify with HTTP/2 enabled
let httpsOptions = null;
try {
  httpsOptions = {
    allowHTTP1: true,
    key: fs.readFileSync(path.join(__dirname, '../localhost.key')),
    cert: fs.readFileSync(path.join(__dirname, '../localhost.crt'))
  };
} catch (error) {
  console.warn('⚠️ HTTP/2 certificates not found! Run "node scripts/generate-certs.js" first.');
  process.exit(1);
}

const fastify = require('fastify')({
  logger: false, // Use our custom logger plugin
  http2: true,
  https: httpsOptions
});

const database = require('./config/database');
const { initializeDatabase, seedDemoData, queryAll } = require('./config/database');
const { globalLimiterOptions } = require('./middleware/rateLimiter');
const marketService = require('./services/marketService');

const PORT = process.env.PORT || 3000;

// ─── Security Middleware ─────────────────────────────────────────────
fastify.register(require('@fastify/helmet'));
fastify.register(require('@fastify/cors'), {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow any localhost origin for development
    if (origin.match(/^https?:\/\/localhost:\d+$/) || origin.match(/^https?:\/\/127\.0\.0\.1:\d+$/)) {
      return callback(null, true);
    }

    // Check against configured CORS_ORIGIN
    if (process.env.CORS_ORIGIN && (process.env.CORS_ORIGIN === '*' || origin === process.env.CORS_ORIGIN)) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Biometric-Token', 'X-Device-Id', 'Accept', 'Cache-Control', 'Connection'],
  credentials: true,
});

// Rate limiting plugin
fastify.register(require('@fastify/rate-limit'), {
  global: true,
  ...globalLimiterOptions
});

// ─── Custom Logger Hook ──────────────────────────────────────────────
const setupLogger = require('./middleware/logger');
setupLogger(fastify);

// ─── Swagger Documentation ───────────────────────────────────────────
fastify.register(require('@fastify/swagger'), {
  mode: 'static',
  specification: {
    document: require('./config/swagger')
  }
});

fastify.register(require('@fastify/swagger-ui'), {
  routePrefix: '/api-docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false
  }
});

// ─── Health Check ────────────────────────────────────────────────────
fastify.get('/api/health', async (request, reply) => {
  return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ──────────────────────────────────────────────────────
fastify.register(require('./routes/auth'), { prefix: '/api/auth' });
fastify.register(require('./routes/portfolio'), { prefix: '/api/portfolio' });
fastify.register(require('./routes/transactions'), { prefix: '/api/transactions' });
fastify.register(require('./routes/device'), { prefix: '/api/device' });
fastify.register(require('./routes/metaRoutes'), { prefix: '/api/meta' });

// Trading & Market Routes (Fastify format)
const tradeController = require('./controllers/tradeController');
const { authenticate } = require('./middleware/auth');

fastify.post('/api/trade/buy', { preHandler: [authenticate] }, tradeController.buy);
fastify.post('/api/trade/sell', { preHandler: [authenticate] }, tradeController.sell);
fastify.get('/api/market/instruments', tradeController.searchInstruments);

fastify.get('/api/market/instruments/:id', (request, reply) => {
  const { id } = request.params;
  const instrument = marketService.catalog.find(c => c.id === id);
  if (!instrument) {
    return reply.code(404).send({ error: 'NOT_FOUND' });
  }
  return reply.send(instrument);
});

fastify.get('/api/market/instruments/:ticker/stream', (request, reply) => {
  const { ticker } = request.params;
  
  // Set headers for SSE in HTTP/2 (Fastify)
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  // reply.raw.setHeader('Connection', 'keep-alive'); // Not strictly needed for HTTP/2, but ok
  reply.raw.setHeader('X-Accel-Buffering', 'no'); 

  console.log(`📡 New stream client for ${ticker}`);

  const added = marketService.addInstrumentClient(ticker, reply.raw);
  
  if (!added) {
    reply.code(404).send();
  } else {
    // Keep connection alive
    reply.hijack();
  }
});

// ─── Global Error Handler ────────────────────────────────────────────
const errorHandler = require('./middleware/errorHandler');
fastify.setErrorHandler(errorHandler);

fastify.setNotFoundHandler((request, reply) => {
  reply.code(404).send({ error: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` });
});

// ─── Start Server ────────────────────────────────────────────────────
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    await seedDemoData();

    // Initialize Market Service
    const assets = queryAll('SELECT DISTINCT ticker, current_price as current FROM portfolio');
    if (assets.length > 0) {
      marketService.initialize(assets);
      console.log(`📈 Market Service initialized with ${assets.length} assets`);
    } else {
      console.warn('⚠️ No assets found to initialize Market Service');
    }

    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  🔐 Fintech Session Guard API (HTTP/2 Fastify)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  🚀 Server running on https://localhost:${PORT}`);
    console.log(`  ❤️  Health check:      https://localhost:${PORT}/api/health`);
    console.log('');
    console.log('  Security Features:');
    console.log('  ├─ ♻️  Token rotation with reuse detection');
    console.log('  ├─ ⏰ Session timeout (inactivity)');
    console.log('  ├─ 📱 Device integrity check');
    console.log('  ├─ 🔒 Biometric verification');
    console.log('  ├─ 🛡️  Rate limiting');
    console.log('  └─ 🔗 Device-bound sessions');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = fastify;
