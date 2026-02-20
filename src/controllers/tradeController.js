const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { queryOne, queryAll, runSql } = require('../config/database');
const marketService = require('../services/marketService');
const {
  ValidationError,
  AuthError,
  NotFoundError,
  AppError
} = require('../utils/errors');

/**
 * Helper: Get user's BRL balance
 */
function getBrlBalance(userId) {
  const brl = queryOne(
    'SELECT * FROM portfolio WHERE user_id = ? AND ticker = ?',
    [userId, 'BRL']
  );
  return brl ? { id: brl.id, quantity: brl.quantity } : { id: null, quantity: 0.0 };
}

/**
 * Helper: Verify transaction authentication (PIN or Biometric)
 */
async function verifyTransactionAuth(userId, pin, biometricToken) {
  if (biometricToken) {
    // Check if there's a recently verified biometric challenge for this user
    const challenge = queryOne(
      'SELECT * FROM biometric_challenges WHERE user_id = ? AND challenge_token = ? AND verified = 1 AND expires_at > CURRENT_TIMESTAMP',
      [userId, biometricToken]
    );
    return !!challenge;
  }

  if (pin) {
    const user = queryOne('SELECT pin_hash FROM users WHERE id = ?', [userId]);
    if (!user || !user.pin_hash) return false;
    return await bcrypt.compare(pin, user.pin_hash);
  }

  return false;
}

/**
 * Helper: Update or Insert Asset in Portfolio
 */
function updatePortfolioAsset(userId, ticker, quantityChange, priceAtExecution, assetName, type) {
  const asset = queryOne(
    'SELECT * FROM portfolio WHERE user_id = ? AND ticker = ?',
    [userId, ticker]
  );

  if (asset) {
    const newQuantity = asset.quantity + quantityChange;
    // Simple average price calculation for buys
    let newAvgPrice = asset.avg_price;
    if (quantityChange > 0) {
      const totalCost = (asset.quantity * asset.avg_price) + (quantityChange * priceAtExecution);
      newAvgPrice = totalCost / newQuantity;
    }

    if (newQuantity <= 0.000001) { // Floating point safety
       runSql('DELETE FROM portfolio WHERE id = ?', [asset.id]);
    } else {
       runSql(
        'UPDATE portfolio SET quantity = ?, avg_price = ?, current_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newQuantity, newAvgPrice, priceAtExecution, asset.id]
      );
    }
  } else if (quantityChange > 0) {
    runSql(
      'INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), userId, assetName, type, ticker, quantityChange, priceAtExecution, priceAtExecution]
    );
  }
}

/**
 * @swagger
 * /api/trade/buy:
 *   post:
 *     summary: Buy an asset using BRL balance
 *     description: Requires a transaction PIN or a valid biometric challenge token.
 *     tags: [Trading]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TradeRequest'
 *     responses:
 *       200:
 *         description: Buy successful
 *       401:
 *         description: Auth required or invalid PIN
 *       400:
 *         description: Insufficient funds or validation error
 */
async function buy(req, reply) {
  try {
    const { ticker, quantity, pin, biometricToken } = req.body;
    
    if (!ticker || !quantity || quantity <= 0) {
      throw new ValidationError('Invalid ticker or quantity');
    }

    // Validation PIN/Bio
    const isAuth = await verifyTransactionAuth(req.user.id, pin, biometricToken);
    if (!isAuth) {
      throw new AuthError('Valid PIN or biometric verification required');
    }

    // 1. Get real-time price
    const currentPrice = marketService.getPrice(ticker);
    if (!currentPrice) {
      throw new NotFoundError('Asset not found in market', 'MARKET_ERROR');
    }

    const totalCost = currentPrice * quantity;

    // 2. Check BRL Balance
    const brl = getBrlBalance(req.user.id);
    if (brl.quantity < totalCost) {
      throw new ValidationError(`Insufficient funds. Cost: R$ ${totalCost.toFixed(2)}, Available: R$ ${brl.quantity.toFixed(2)}`, 'INSUFFICIENT_FUNDS');
    }

    // 3. Execute Transaction
    // Deduct BRL
    runSql('UPDATE portfolio SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [totalCost, brl.id]);

    // Add Asset
    // We need asset name/type. For demo, we can infer or mock if not in DB yet.
    // If it's a new asset, we might need a lookup table. 
    // integrating with MarketService's init list would be best, but for now we try to find existing or use generic.
    // Let's assume the user can only buy what's in the market, seeded in DB.
    // If not in DB, we'll need to fetch metadata.
    // For simplicity, let's query the 'assets' list from somewhere or use generic if buying completely new.
    // Since we only seeded common assets, let's try to find metadata from existing portfolio entries or hardcode a lookup?
    // Better: let's query the DB for *any* user's portfolio entry for this ticker to get metadata, or default.
    const assetMeta = queryOne('SELECT asset_name, asset_type FROM portfolio WHERE ticker = ? LIMIT 1', [ticker]) || { asset_name: ticker, asset_type: 'stock' };

    updatePortfolioAsset(req.user.id, ticker, quantity, currentPrice, assetMeta.asset_name, assetMeta.asset_type);

    // Record Transaction
    const transactionId = uuidv4();
    runSql(
      `INSERT INTO transactions (id, user_id, type, asset_name, ticker, amount, quantity, price_at_execution, status, created_at)
       VALUES (?, ?, 'buy', ?, ?, ?, ?, ?, 'completed', CURRENT_TIMESTAMP)`,
      [transactionId, req.user.id, assetMeta.asset_name, ticker, totalCost, quantity, currentPrice]
    );

    return reply.send({
      message: 'Buy successful',
      transaction: {
        id: transactionId,
        ticker,
        quantity,
        price: currentPrice,
        total: totalCost,
        remainingBalance: brl.quantity - totalCost
      }
    });

  } catch (error) {
    throw error;
  }
}

/**
 * @swagger
 * /api/trade/sell:
 *   post:
 *     summary: Sell an asset and receive BRL
 *     description: Requires a transaction PIN or a valid biometric challenge token.
 *     tags: [Trading]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TradeRequest'
 *     responses:
 *       200:
 *         description: Sell successful
 *       401:
 *         description: Auth required or invalid PIN
 *       400:
 *         description: Insufficient assets or validation error
 */
async function sell(req, reply) {
  try {
    const { ticker, quantity, pin, biometricToken } = req.body;

    if (!ticker || !quantity || quantity <= 0) {
      throw new ValidationError('Invalid ticker or quantity');
    }

    // Validation PIN/Bio
    const isAuth = await verifyTransactionAuth(req.user.id, pin, biometricToken);
    if (!isAuth) {
      throw new AuthError('Valid PIN or biometric verification required');
    }

    // 1. Get real-time price
    const currentPrice = marketService.getPrice(ticker);
    if (!currentPrice) {
      throw new NotFoundError('Asset not found in market', 'MARKET_ERROR');
    }

    // 2. Check Asset Balance
    const asset = queryOne(
      'SELECT * FROM portfolio WHERE user_id = ? AND ticker = ?',
      [req.user.id, ticker]
    );

    if (!asset || asset.quantity < quantity) {
      throw new ValidationError(`Insufficient asset quantity. You have: ${asset ? asset.quantity : 0}`, 'INSUFFICIENT_ASSETS');
    }

    const totalValue = currentPrice * quantity;

    // 3. Execute Transaction
    // Deduct Asset
    updatePortfolioAsset(req.user.id, ticker, -quantity, currentPrice, asset.asset_name, asset.asset_type);

    // Add BRL
    const brl = getBrlBalance(req.user.id);
    if (brl.id) {
       runSql('UPDATE portfolio SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [totalValue, brl.id]);
    } else {
       // Should exist if we seeded it, but just in case
       runSql(
         'INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
         [uuidv4(), req.user.id, 'Saldo em Conta (BRL)', 'currency', 'BRL', totalValue, 1.0, 1.0]
       );
    }

    // Record Transaction
    const transactionId = uuidv4();
    runSql(
      `INSERT INTO transactions (id, user_id, type, asset_name, ticker, amount, quantity, price_at_execution, status, created_at)
       VALUES (?, ?, 'sell', ?, ?, ?, ?, ?, 'completed', CURRENT_TIMESTAMP)`,
      [transactionId, req.user.id, asset.asset_name, ticker, totalValue, quantity, currentPrice]
    );

    return reply.send({
      message: 'Sell successful',
      transaction: {
        id: transactionId,
        ticker,
        quantity,
        price: currentPrice,
        total: totalValue,
        newBalance: (brl.quantity || 0) + totalValue
      }
    });

  } catch (error) {
    throw error;
  }
}


/**
 * @swagger
 * /api/market/instruments:
 *   get:
 *     summary: Search for available instruments
 *     tags: [Market]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Search query (ticker, name, sector)
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *         description: Filter by type (acao, fii, crypto, renda_fixa)
 *     responses:
 *       200:
 *         description: List of instruments matching criteria
 */
function searchInstruments(req, reply) {
  const { q, type } = req.query;
  const results = marketService.searchInstruments(q, type);
  return reply.send({ instruments: results });
}


module.exports = { buy, sell, searchInstruments };
