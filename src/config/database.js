const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '..', '..', 'fintech.db');

let db = null;

/**
 * Get the database instance (must call initializeDatabase first)
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Save database to disk
 */
function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

/**
 * Helper: run a query that returns rows (SELECT)
 */
function queryAll(sql, params = []) {
  const database = getDb();
  const stmt = database.prepare(sql);
  if (params.length) stmt.bind(params);
  
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Helper: run a query that returns a single row
 */
function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * Helper: run an INSERT/UPDATE/DELETE statement
 */
function runSql(sql, params = []) {
  const database = getDb();
  database.run(sql, params);
  const changes = database.getRowsModified();
  saveDb();
  return { changes };
}

/**
 * Initialize the database (async — must await)
 */
async function initializeDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      pin_hash TEXT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      device_id TEXT,
      family_id TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      revoked INTEGER DEFAULT 0,
      revoked_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_id TEXT,
      token_jti TEXT NOT NULL,
      last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
      ip_address TEXT,
      user_agent TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      device_fingerprint TEXT NOT NULL,
      platform TEXT,
      model TEXT,
      is_trusted INTEGER DEFAULT 0,
      integrity_status TEXT DEFAULT 'unknown',
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS biometric_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      challenge_token TEXT UNIQUE NOT NULL,
      operation_type TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      verified INTEGER DEFAULT 0,
      verified_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS portfolio (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      asset_name TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      ticker TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      avg_price REAL NOT NULL DEFAULT 0,
      current_price REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      asset_name TEXT,
      ticker TEXT,
      amount REAL NOT NULL,
      quantity REAL,
      price_at_execution REAL,
      status TEXT DEFAULT 'pending',
      biometric_verified INTEGER DEFAULT 0,
      device_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Create indexes (ignore if exists)
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_jti ON sessions(token_jti)',
    'CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_devices_fingerprint ON devices(device_fingerprint)',
    'CREATE INDEX IF NOT EXISTS idx_portfolio_user ON portfolio(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_biometric_token ON biometric_challenges(challenge_token)',
  ];

  for (const idx of indexes) {
    db.run(idx);
  }

  // Instrument history table
  db.run(`
    CREATE TABLE IF NOT EXISTS instrument_history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      instrument_id TEXT NOT NULL,
      date      TEXT NOT NULL,
      value     REAL NOT NULL
    );
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_hist_instrument ON instrument_history(instrument_id, date)');

  saveDb();
  console.log('✅ Database initialized successfully');
}

/**
 * Seed demo data
 */
async function seedDemoData() {
  const existing = queryOne('SELECT id FROM users WHERE email = ?', ['demo@fintech.com']);
  if (existing) {
    console.log('ℹ️  Demo data already exists');
    return;
  }

  // Use a deterministic UUID for the demo user to ensure persistence across restarts
  const userId = '00000000-0000-4000-8000-000000000000'; 
  const passwordHash = await bcrypt.hash('Demo@2024!', 12);
  const pinHash = await bcrypt.hash('1234', 12); // Default PIN: 1234

  runSql('INSERT INTO users (id, email, password_hash, pin_hash, name) VALUES (?, ?, ?, ?, ?)', 
    [userId, 'demo@fintech.com', passwordHash, pinHash, 'Investidor Demo']);

  const assets = [
    { name: 'Tesouro Selic 2029', type: 'renda_fixa', ticker: 'SELIC29', qty: 2.5, avg: 13950.00, current: 14580.00 },
    { name: 'Tesouro IPCA+ 2035', type: 'renda_fixa', ticker: 'IPCA35', qty: 15.2, avg: 2890.00, current: 2950.00 },
    { name: 'CDB Banco Inter 110% CDI', type: 'renda_fixa', ticker: 'CDB-INTR', qty: 1, avg: 15000.00, current: 15820.00 },
    { name: 'FII HGLG11', type: 'fii', ticker: 'HGLG11', qty: 250, avg: 161.50, current: 165.20 },
    { name: 'FII XPML11', type: 'fii', ticker: 'XPML11', qty: 125, avg: 95.30, current: 102.10 },
    { name: 'FII KNCR11', type: 'fii', ticker: 'KNCR11', qty: 300, avg: 98.50, current: 101.80 },
    { name: 'Petrobras PN', type: 'acao', ticker: 'PETR4', qty: 800, avg: 29.50, current: 38.70 },
    { name: 'Vale ON', type: 'acao', ticker: 'VALE3', qty: 450, avg: 72.20, current: 65.40 }, // Loss example
    { name: 'Itaú Unibanco PN', type: 'acao', ticker: 'ITUB4', qty: 1200, avg: 22.80, current: 27.90 },
    { name: 'WEG ON', type: 'acao', ticker: 'WEGE3', qty: 350, avg: 31.00, current: 38.50 },
    { name: 'Banco do Brasil ON', type: 'acao', ticker: 'BBAS3', qty: 600, avg: 48.00, current: 55.40 },
    { name: 'Bitcoin', type: 'crypto', ticker: 'BTC', qty: 0.25, avg: 280000.00, current: 380000.00 },
    { name: 'Ethereum', type: 'crypto', ticker: 'ETH', qty: 4.5, avg: 11500.00, current: 13800.00 },
    { name: 'Solana', type: 'crypto', ticker: 'SOL', qty: 85, avg: 450.00, current: 600.00 },
    { name: 'Saldo em Conta (BRL)', type: 'currency', ticker: 'BRL', qty: 6542.50, avg: 1.00, current: 1.00 },
  ];

  for (const asset of assets) {
    runSql(
      'INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), userId, asset.name, asset.type, asset.ticker, asset.qty, asset.avg, asset.current]
    );
  }

  // Seed Transactions History
  const transactions = [
    { type: 'buy', ticker: 'BTC', amount: 35000.00, qty: 0.125, status: 'completed' },
    { type: 'buy', ticker: 'PETR4', amount: 11800.00, qty: 400, status: 'completed' },
    { type: 'deposit', amount: 25000.00, status: 'completed' },
    { type: 'buy', ticker: 'HGLG11', amount: 16150.00, qty: 100, status: 'completed' },
    { type: 'redeem', ticker: 'CDB-INTR', amount: 5000.00, qty: 0, status: 'completed', bio: 1 },
    { type: 'transfer', amount: 1500.00, status: 'completed', bio: 1, asset_name: 'Transferência Pix' },
    { type: 'sell', ticker: 'VALE3', amount: 13080.00, qty: 200, status: 'completed' },
    { type: 'buy', ticker: 'ETH', amount: 23000.00, qty: 2.0, status: 'completed' },
    { type: 'deposit', amount: 18500.00, status: 'completed' },
    { type: 'buy', ticker: 'ITUB4', amount: 13680.00, qty: 600, status: 'completed' },
    { type: 'redeem', ticker: 'SELIC29', amount: 13950.00, qty: 1.0, status: 'completed', bio: 1 },
    { type: 'buy', ticker: 'BBAS3', amount: 14400.00, qty: 300, status: 'completed' },
    { type: 'transfer', amount: 250.00, status: 'completed', bio: 1, asset_name: 'Pagamento Boleto Luz' },
    { type: 'transfer', amount: 485.50, status: 'completed', bio: 1, asset_name: 'Cartão de Crédito' },
    { type: 'withdraw', amount: 2000.00, status: 'completed', bio: 1 },
    { type: 'buy', ticker: 'SOL', amount: 18000.00, qty: 40, status: 'completed' },
    { type: 'sell', ticker: 'WEGE3', amount: 7700.00, qty: 200, status: 'completed' },
    { type: 'deposit', amount: 100000.00, status: 'completed' },
  ];

  const now = new Date();
  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    const date = new Date(now);
    date.setDate(date.getDate() - (i * 2)); // Spread over days

    runSql(
      'INSERT INTO transactions (id, user_id, type, asset_name, ticker, amount, quantity, status, biometric_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), userId, t.type, t.asset_name || null, t.ticker || null, t.amount, t.qty || null, t.status, t.bio || 0, date.toISOString()]
    );
  }

  console.log('✅ Demo data seeded (email: demo@fintech.com, password: Demo@2024!, pin: 1234)');
}

/**
 * Seed 5 years of daily price history for each catalog instrument.
 * Uses a seeded random walk from the instrument's basePrice.
 * Only runs if the table is empty.
 */
function seedInstrumentHistory() {
  const existing = queryOne('SELECT id FROM instrument_history LIMIT 1');
  if (existing) {
    console.log('ℹ️  Instrument history already seeded');
    return;
  }

  const marketService = require('../services/marketService');
  const DAYS = 365 * 5; // 5 years
  const today = new Date();

  console.log('📈 Seeding 5 years of instrument history...');

  const database = getDb();
  // Use a raw transaction for performance
  database.run('BEGIN TRANSACTION');

  for (const item of marketService.catalog) {
    let price = item.basePrice;
    // Daily volatility by asset type
    const volatility = {
      acao: 0.018, fii: 0.008, crypto: 0.04,
      renda_fixa: 0.003, currency: 0.002
    }[item.type] || 0.015;

    for (let d = DAYS; d >= 0; d--) {
      const date = new Date(today);
      date.setDate(today.getDate() - d);
      const dateStr = date.toISOString().slice(0, 10);

      // Random walk: drift slightly upward with random noise
      const change = (Math.random() - 0.48) * volatility;
      price = Math.max(price * (1 + change), item.basePrice * 0.1);

      database.run(
        'INSERT INTO instrument_history (instrument_id, date, value) VALUES (?, ?, ?)',
        [item.id, dateStr, Math.round(price * 100) / 100]
      );
    }
  }

  database.run('COMMIT');
  saveDb();
  console.log(`✅ Instrument history seeded (${marketService.catalog.length} instruments × ~${DAYS} days)`);
}

module.exports = { getDb, initializeDatabase, seedDemoData, seedInstrumentHistory, queryAll, queryOne, runSql };
