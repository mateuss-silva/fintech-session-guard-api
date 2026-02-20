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
 *         description: Filter by type (buy, sell, redeem, transfer, deposit)
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
function getHistory(req, res) {
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

    res.json({
      transactions,
      pagination: {
        total: total ? total.count : 0,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch history' });
  }
}

module.exports = { getHistory };
