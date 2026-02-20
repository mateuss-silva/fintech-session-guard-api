require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerDocs = require('./config/swagger');
const database = require('./config/database');
const { initializeDatabase, seedDemoData, queryAll } = require('./config/database');
const { globalLimiter } = require('./middleware/rateLimiter');
const logger = require('./middleware/logger');
const marketService = require('./services/marketService');

// Routes
const authRoutes = require('./routes/auth');
const portfolioRoutes = require('./routes/portfolio');
const transactionRoutes = require('./routes/transactions');
const deviceRoutes = require('./routes/device');

const metaRoutes = require('./routes/metaRoutes');
const tradeController = require('./controllers/tradeController');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security Middleware ─────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow any localhost origin for development
    if (origin.match(/^http:\/\/localhost:\d+$/) || origin.match(/^http:\/\/127\.0\.0\.1:\d+$/)) {
      return callback(null, true);
    }

    // Check against configured CORS_ORIGIN
    if (process.env.CORS_ORIGIN && (process.env.CORS_ORIGIN === '*' || origin === process.env.CORS_ORIGIN)) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Biometric-Token', 'X-Device-Id'],
  credentials: true,
}));
app.use(globalLimiter);

// ─── Body Parsing ────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ─── Request Logging ─────────────────────────────────────────────────
app.use(logger);

// ─── Health Check ────────────────────────────────────────────────────
/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Checks if the API is running and healthy.
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: API is healthy.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2023-10-27T10:00:00.000Z"
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// ─── API Routes ──────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/device', deviceRoutes);

app.use('/api/meta', metaRoutes);

// Trading & Market Routes
const { authenticate } = require('./middleware/auth');

app.post('/api/trade/buy', authenticate, tradeController.buy);
app.post('/api/trade/sell', authenticate, tradeController.sell);
app.get('/api/market/instruments', tradeController.searchInstruments);



app.get('/api/market/instruments/:ticker/stream', (req, res) => {
  const { ticker } = req.params;
  
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering if any

  console.log(`📡 New stream client for ${ticker}`);

  const added = marketService.addInstrumentClient(ticker, res);
  
  if (!added) {
    // If ticker not found/monitored, close connection
    res.status(404).end();
  }
});


// ─── API Documentation ──────────────────────────────────────────────
app.get('/api', (req, res) => {
  res.json({
    name: 'Fintech Session Guard API',
    version: '1.0.0',
    description: 'Backend for Flutter Fintech Investment app with session hijacking protection',
    documentation: '/api-docs',
    security: [
      'JWT token rotation with reuse detection',
      'Session timeout by inactivity',
      'Device integrity validation (root/jailbreak)',
      'Biometric verification for sensitive operations',
      'Rate limiting (global + auth-specific)',
      'Helmet security headers',
      'Device-bound sessions',
    ],
    endpoints: {
      health: 'GET /api/health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        refresh: 'POST /api/auth/refresh',
        logout: 'POST /api/auth/logout',
        sessions: 'GET /api/auth/sessions',
        revokeSession: 'DELETE /api/auth/sessions/:sessionId',
      },
      portfolio: {
        list: 'GET /api/portfolio',
      },
      transactions: {
        history: 'GET /api/transactions/history',
      },
      trade: {
        buy: 'POST /api/trade/buy',
        sell: 'POST /api/trade/sell',
      },
      market: {
        instruments: 'GET /api/market/instruments?q=&type=',
      },
      device: {
        register: 'POST /api/device/register',
        verify: 'POST /api/device/verify',
        list: 'GET /api/device/list',
        bioChallenge: 'POST /api/device/bio/challenge',
        bioVerify: 'POST /api/device/bio/verify',
      },
    },
    demo: {
      email: 'demo@fintech.com',
      password: 'Demo@2024!',
    },
  });
});

const errorHandler = require('./middleware/errorHandler');

// ─── 404 Handler ─────────────────────────────────────────────────────
app.use((req, res, next) => {
  const { NotFoundError } = require('./utils/errors');
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
});

// ─── Global Error Handler ────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ────────────────────────────────────────────────────
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();

    // Seed demo data
    await seedDemoData();

    // Initialize Market Service
    const assets = queryAll('SELECT DISTINCT ticker, current_price as current FROM portfolio');
    if (assets.length > 0) {
      marketService.initialize(assets);
      console.log(`📈 Market Service initialized with ${assets.length} assets`);
    } else {
      console.warn('⚠️ No assets found to initialize Market Service');
    }

    app.listen(PORT, () => {
      console.log('');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('  🔐 Fintech Session Guard API');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`  🚀 Server running on http://localhost:${PORT}`);
      console.log(`  📋 API docs:          http://localhost:${PORT}/api-docs`);
      console.log(`  ❤️  Health check:      http://localhost:${PORT}/api/health`);
      console.log('');
      console.log('  Security Features:');
      console.log('  ├─ ♻️  Token rotation with reuse detection');
      console.log('  ├─ ⏰ Session timeout (inactivity)');
      console.log('  ├─ 📱 Device integrity check');
      console.log('  ├─ 🔒 Biometric verification');
      console.log('  ├─ 🛡️  Rate limiting');
      console.log('  └─ 🔗 Device-bound sessions');
      console.log('');
      console.log('  Demo credentials:');
      console.log('  ├─ Email:    demo@fintech.com');
      console.log('  └─ Password: Demo@2024!');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
