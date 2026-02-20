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
    { name: 'Tesouro Selic 2029', type: 'renda_fixa', ticker: 'SELIC29', qty: 10, avg: 14250.00, current: 14580.00 },
    { name: 'Tesouro IPCA+ 2035', type: 'renda_fixa', ticker: 'IPCA35', qty: 5, avg: 2890.00, current: 2950.00 },
    { name: 'CDB Banco XYZ 120% CDI', type: 'renda_fixa', ticker: 'CDB-XYZ', qty: 1, avg: 50000.00, current: 53200.00 },
    { name: 'FII HGLG11', type: 'fii', ticker: 'HGLG11', qty: 100, avg: 158.50, current: 165.20 },
    { name: 'FII XPML11', type: 'fii', ticker: 'XPML11', qty: 50, avg: 98.30, current: 102.10 },
    { name: 'FII KNCR11', type: 'fii', ticker: 'KNCR11', qty: 80, avg: 100.50, current: 101.80 },
    { name: 'PETR4', type: 'acao', ticker: 'PETR4', qty: 200, avg: 32.50, current: 38.70 },
    { name: 'VALE3', type: 'acao', ticker: 'VALE3', qty: 150, avg: 68.20, current: 72.40 },
    { name: 'ITUB4', type: 'acao', ticker: 'ITUB4', qty: 300, avg: 25.80, current: 27.90 },
    { name: 'WEGE3', type: 'acao', ticker: 'WEGE3', qty: 100, avg: 35.00, current: 38.50 },
    { name: 'BBAS3', type: 'acao', ticker: 'BBAS3', qty: 200, avg: 50.00, current: 55.40 },
    { name: 'Bitcoin', type: 'crypto', ticker: 'BTC', qty: 0.05, avg: 350000.00, current: 380000.00 },
    { name: 'Ethereum', type: 'crypto', ticker: 'ETH', qty: 1.5, avg: 12500.00, current: 13800.00 },
    { name: 'Solana', type: 'crypto', ticker: 'SOL', qty: 20, avg: 450.00, current: 600.00 },
    { name: 'Saldo em Conta (BRL)', type: 'currency', ticker: 'BRL', qty: Math.floor(Math.random() * 50001) + 50000, avg: 1.00, current: 1.00 },
  ];

  for (const asset of assets) {
    runSql(
      'INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), userId, asset.name, asset.type, asset.ticker, asset.qty, asset.avg, asset.current]
    );
  }

  // Seed Transactions History
  const transactions = [
    { type: 'buy', ticker: 'BTC', amount: 5000.00, qty: 0.014, status: 'completed' },
    { type: 'buy', ticker: 'PETR4', amount: 3250.00, qty: 100, status: 'completed' },
    { type: 'deposit', amount: 10000.00, status: 'completed' },
    { type: 'buy', ticker: 'HGLG11', amount: 15850.00, qty: 100, status: 'completed' },
    { type: 'redeem', ticker: 'CDB-XYZ', amount: 2000.00, qty: 0, status: 'completed', bio: 1 },
    { type: 'transfer', amount: 1500.00, status: 'completed', bio: 1, asset_name: 'Transfer to John Doe' },
    { type: 'buy', ticker: 'ETH', amount: 6250.00, qty: 0.5, status: 'completed' },
    { type: 'redeem', ticker: 'SELIC29', amount: 1000.00, qty: 0, status: 'completed', bio: 1 },
    { type: 'buy', ticker: 'VALE3', amount: 6820.00, qty: 100, status: 'completed' },
    { type: 'deposit', amount: 50000.00, status: 'completed' },
    { type: 'transfer', amount: 250.00, status: 'completed', bio: 1, asset_name: 'Coffee Shop' },
    { type: 'transfer', amount: 120.50, status: 'completed', bio: 1, asset_name: 'Uber Ride' },
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

module.exports = { getDb, initializeDatabase, seedDemoData, queryAll, queryOne, runSql };
