const { v4: uuidv4 } = require('uuid');
const { queryOne, queryAll, runSql } = require('../config/database');

/**
 * @swagger
 * /api/transactions/history:
 *   get:
 *     summary: Get user's transaction history
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *         description: Filter by type (buy, sell, transfer, deposit)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: List of transactions with pagination
 */
function getHistory(req, reply) {
  try {
    const { type, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT id, type, asset_name, ticker, amount, quantity, price_at_execution,
             status, biometric_verified, created_at
      FROM transactions
      WHERE user_id = ?
    `;
    const params = [req.user.id];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const transactions = queryAll(query, params);

    const total = queryOne(
      'SELECT COUNT(*) as count FROM transactions WHERE user_id = ?',
      [req.user.id]
    );

    return reply.send({
      transactions,
      pagination: {
        total: total ? total.count : 0,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    console.error('History error:', error);
    throw error;
  }
}

/**
 * @swagger
 * /api/transactions/deposit:
 *   post:
 *     summary: Deposit BRL funds into the local wallet portfolio
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Deposit amount
 *     responses:
 *       200:
 *         description: Deposit successful
 */
function depositMoney(req, reply) {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return reply.code(400).send({ message: 'Invalid deposit amount' });
    }

    // Check if BRL portfolio item exists
    const brlAsset = queryOne('SELECT * FROM portfolio WHERE user_id = ? AND ticker = ?', [req.user.id, 'BRL']);
    
    if (brlAsset) {
      runSql('UPDATE portfolio SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [amount, brlAsset.id]);
    } else {
      runSql(
        'INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuidv4(), req.user.id, 'Saldo em Conta (BRL)', 'currency', 'BRL', amount, 1.00, 1.00]
      );
    }

    // Log the transaction
    runSql(
      'INSERT INTO transactions (id, user_id, type, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), req.user.id, 'deposit', amount, 'completed', new Date().toISOString()]
    );

    return reply.send({ message: 'Deposit successful', amount_deposited: amount });
  } catch (error) {
    console.error('Deposit error:', error);
    throw error;
  }
}

/**
 * @swagger
 * /api/transactions/withdraw:
 *   post:
 *     summary: Withdraw BRL funds from the local wallet portfolio
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount:
 *                 type: number
 *                 description: Withdrawal amount
 *     responses:
 *       200:
 *         description: Withdrawal successful
 */
function withdrawMoney(req, reply) {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return reply.code(400).send({ message: 'Invalid withdrawal amount' });
    }

    const brlAsset = queryOne('SELECT * FROM portfolio WHERE user_id = ? AND ticker = ?', [req.user.id, 'BRL']);
    
    if (!brlAsset || brlAsset.quantity < amount) {
      return reply.code(400).send({ message: 'Insufficient funds for this withdrawal' });
    }

    runSql('UPDATE portfolio SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [amount, brlAsset.id]);

    runSql(
      'INSERT INTO transactions (id, user_id, type, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), req.user.id, 'withdraw', amount, 'completed', new Date().toISOString()]
    );

    return reply.send({ message: 'Withdrawal successful', amount_withdrawn: amount });
  } catch (error) {
    console.error('Withdrawal error:', error);
    throw error;
  }
}

module.exports = { getHistory, depositMoney, withdrawMoney };
