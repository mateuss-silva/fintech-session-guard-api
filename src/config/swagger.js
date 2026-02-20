const swaggerJsDoc = require('swagger-jsdoc');

const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Fintech Session Guard API',
      version: '1.0.0',
      description: 'API documentation for the Flutter Fintech Investment app with focus on Security and Session Hijacking Protection.',
      contact: {
        name: 'Support Team',
      },
    },
    servers: [
      {
        url: 'https://localhost:3000',
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
          },
        },
        Asset: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            asset_name: { type: 'string' },
            asset_type: { type: 'string', enum: ['renda_fixa', 'acao', 'fii', 'crypto', 'currency'] },
            ticker: { type: 'string' },
            quantity: { type: 'number' },
            avg_price: { type: 'number' },
            current_price: { type: 'number' },
            current_value: { type: 'number' },
            invested_value: { type: 'number' },
            variation_pct: { type: 'number' },
            instrumentId: { type: 'string', description: 'ID to connect to /api/market/instruments/:id/stream', example: 'instr_001' },
            change: { type: 'number' },
            changePercent: { type: 'number' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        Instrument: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'instr_001' },
            ticker: { type: 'string', example: 'PETR4' },
            name: { type: 'string', example: 'Petrobras PN' },
            type: { type: 'string', enum: ['acao', 'fii', 'crypto', 'renda_fixa'], example: 'acao' },
            sector: { type: 'string', example: 'Petróleo & Gás' },
            currentPrice: { type: 'number', example: 38.70 },
            open: { type: 'number', example: 38.00 },
            high: { type: 'number', example: 39.50 },
            low: { type: 'number', example: 37.20 },
            change: { type: 'number', example: 0.70 },
            changePercent: { type: 'number', example: 1.84 },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        TradeRequest: {
          type: 'object',
          required: ['ticker', 'quantity'],
          properties: {
            ticker: { type: 'string', description: 'Ticker of the instrument (e.g., PETR4, BTC)' },
            quantity: { type: 'number', minimum: 0.000001, description: 'Amount to buy/sell' },
            pin: { type: 'string', pattern: '^[0-9]{4}$', description: '4-digit transaction PIN (required for security)' },
            biometricToken: { type: 'string', description: 'Alternative to PIN if biometric challenge was solved' },
          },
        },
      },
    },
  },
  apis: ['./src/server.js', './src/controllers/*.js'], // Where to find documentation comments
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
module.exports = swaggerDocs;
