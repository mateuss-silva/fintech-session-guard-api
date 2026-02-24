const marketService = require('../services/marketService');
const { logger } = require('../middleware/logger');

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

    logger.info(`📜 Transaction history fetched for user ${req.user.id}`, { type, limit, offset });

    return reply.send({
      transactions,
      pagination: {
        total: total ? total.count : 0,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    logger.error(`❌ History error for user ${req.user?.id}: ${error.message}`);
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

    logger.success(`💵 Deposit successful: R$ ${amount} for user ${req.user.id}`);

    return reply.send({ message: 'Deposit successful', amount_deposited: amount });
  } catch (error) {
    logger.error(`❌ Deposit error for user ${req.user?.id}: ${error.message}`);
    throw error;
  }
}

function _calculateLiquidation(userId, shortfall) {
  const portfolioItems = queryAll(
    'SELECT id, asset_name, asset_type, ticker, quantity, avg_price FROM portfolio WHERE user_id = ? AND ticker != ? ORDER BY id', 
    [userId, 'BRL']
  );

  let totalAssetValue = 0;
  const assetMarketValues = [];

  for (const item of portfolioItems) {
    const priceData = marketService.prices[item.ticker];
    const currentPrice = (priceData && priceData.current != null) ? priceData.current : (item.avg_price || 0);
    const totalValue = item.quantity * currentPrice;
    
    if (!isNaN(totalValue)) {
      totalAssetValue += totalValue;
    }
    
    assetMarketValues.push({
      ...item,
      currentPrice,
      totalValue: isNaN(totalValue) ? 0 : totalValue
    });
  }

  if (totalAssetValue < shortfall) {
    return {
      canCover: false,
      totalAssetValue,
      assetsToSell: []
    };
  }

  let remainingShortfall = shortfall;
  const assetsToSell = [];

  for (const asset of assetMarketValues) {
    // If the shortfall is practically zero (less than a cent), stop liquidating
    if (remainingShortfall < 0.01) break;

    const currentAssetPrice = asset.currentPrice > 0 ? asset.currentPrice : 1; 
    
    const maxSharesWeCanSell = asset.quantity;
    const maxMoneyWeCanGet = maxSharesWeCanSell * currentAssetPrice;
    
    // Skip assets that generate less than 1 cent (dust)
    if (maxMoneyWeCanGet < 0.01) continue;

    const moneyNeededFromThisAsset = Math.min(maxMoneyWeCanGet, remainingShortfall);

    // We must sell whole shares, so we round UP to ensure we cover the shortfall
    const exactSharesToSell = moneyNeededFromThisAsset / currentAssetPrice;
    const sharesToSell = Math.min(Math.ceil(exactSharesToSell), maxSharesWeCanSell);
    
    // The actual money we get by selling these whole shares
    const actualMoneyGenerated = sharesToSell * currentAssetPrice;
    
    const newQuantity =
     Math.max(0, asset.quantity - sharesToSell);

    assetsToSell.push({
      id: asset.id,
      assetName: asset.asset_name,
      ticker: asset.ticker,
      quantitySold: sharesToSell,
      valueGenerated: actualMoneyGenerated,
      priceAtExecution: currentAssetPrice,
      newQuantity: newQuantity
    });

    remainingShortfall -= actualMoneyGenerated;
  }

  return {
    canCover: true,
    totalAssetValue,
    assetsToSell
  };
}

/**
 * @swagger
 * /api/transactions/withdraw/preview:
 *   post:
 *     summary: Preview a withdrawal to see if assets must be liquidated
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
 *         description: Preview details
 */
function previewWithdrawMoney(req, reply) {
  try {
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return reply.code(400).send({ message: 'Invalid withdrawal amount' });
    }

    const brlAsset = queryOne('SELECT * FROM portfolio WHERE user_id = ? AND ticker = ?', [req.user.id, 'BRL']);
    const currentBrlBalance = brlAsset ? brlAsset.quantity : 0;
    
    if (currentBrlBalance >= amount) {
      return reply.send({
        requires_liquidation: false,
        amount_requested: amount,
        brl_available: currentBrlBalance,
        assets_to_sell: []
      });
    }

    const shortfall = amount - currentBrlBalance;
    if (shortfall > 0 && !marketService.isMarketOpen()) {
      return reply.code(400).send({
        message: 'Market is closed. Cannot liquidate assets to cover the withdrawal shortfall.',
        status: 'MARKET_CLOSED'
      });
    }

    const liquidationPlan = _calculateLiquidation(req.user.id, shortfall);

    if (!liquidationPlan.canCover) {
      return reply.code(400).send({ 
        message: 'Insufficient portfolio value to cover this withdrawal. ' + 
                 `Requested: ${amount.toFixed(2)}, ` +
                 `Available BRL: ${currentBrlBalance.toFixed(2)}, ` +
                 `Total Assets Value: ${liquidationPlan.totalAssetValue.toFixed(2)}` 
      });
    }

    // Format for client
    const assetsToSellFormatted = liquidationPlan.assetsToSell.map(a => ({
      ticker: a.ticker,
      quantity_sold: Math.round(a.quantitySold * 100000) / 100000,
      value_generated: Math.round(a.valueGenerated * 100) / 100,
      price_at_execution: a.priceAtExecution
    }));

    logger.info(`🔍 Withdrawal preview for user ${req.user.id}: R$ ${amount}`, { requiresLiquidation: liquidationPlan.canCover && shortfall > 0 });

    return reply.send({
      requires_liquidation: true,
      amount_requested: amount,
      brl_available: currentBrlBalance,
      shortfall: shortfall,
      assets_to_sell: assetsToSellFormatted
    });

  } catch (error) {
    logger.error(`❌ Preview withdrawal error for user ${req.user?.id}: ${error.message}`);
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
    const currentBrlBalance = brlAsset ? brlAsset.quantity : 0;
    
    const soldAssetsDetails = [];

    if (currentBrlBalance < amount) {
      const shortfall = amount - currentBrlBalance;
      if (shortfall > 0 && !marketService.isMarketOpen()) {
        return reply.code(400).send({
          message: 'Market is closed. Cannot liquidate assets to cover the withdrawal shortfall.',
          status: 'MARKET_CLOSED'
        });
      }

      const liquidationPlan = _calculateLiquidation(req.user.id, shortfall);

      if (!liquidationPlan.canCover) {
        return reply.code(400).send({ 
          message: 'Insufficient portfolio value to cover this withdrawal. ' + 
                   `Requested: ${amount.toFixed(2)}, ` +
                   `Available BRL: ${currentBrlBalance.toFixed(2)}, ` +
                   `Total Assets Value: ${liquidationPlan.totalAssetValue.toFixed(2)}` 
        });
      }

      let totalValueGenerated = 0;
      for (const asset of liquidationPlan.assetsToSell) {
        if (asset.newQuantity <= 0.000001) {
          runSql('DELETE FROM portfolio WHERE id = ?', [asset.id]);
        } else {
          runSql('UPDATE portfolio SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [asset.newQuantity, asset.id]);
        }

        runSql(
          'INSERT INTO transactions (id, user_id, type, asset_name, ticker, amount, quantity, price_at_execution, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [uuidv4(), req.user.id, 'sell', asset.assetName, asset.ticker, asset.valueGenerated, asset.quantitySold, asset.priceAtExecution, 'completed', new Date().toISOString()]
        );

        soldAssetsDetails.push({
          ticker: asset.ticker,
          quantity_sold: asset.quantitySold,
          value_generated: asset.valueGenerated,
          price_at_execution: asset.priceAtExecution
        });
        
        totalValueGenerated += asset.valueGenerated;
      }
      
      // Calculate leftover change
      const newBrlBalance = (currentBrlBalance + totalValueGenerated) - amount;

      if (brlAsset) {
        runSql('UPDATE portfolio SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newBrlBalance, brlAsset.id]);
      } else {
        runSql(
          'INSERT INTO portfolio (id, user_id, asset_name, asset_type, ticker, quantity, avg_price, current_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [uuidv4(), req.user.id, 'Saldo em Conta (BRL)', 'currency', 'BRL', newBrlBalance, 1.00, 1.00]
        );
      }
    } else {
      // Sufficient BRL balance, just deduct
      runSql('UPDATE portfolio SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [amount, brlAsset.id]);
    }

    logger.success(`💸 Withdrawal successful: R$ ${amount} for user ${req.user.id}`, { assetsSold: soldAssetsDetails.length });

    return reply.send({ 
      message: soldAssetsDetails.length > 0 ? 'Withdrawal successful with automatic asset selling' : 'Withdrawal successful', 
      amount_withdrawn: amount,
      assets_sold_to_cover: soldAssetsDetails
    });
  } catch (error) {
    logger.error(`❌ Withdrawal error for user ${req.user?.id}: ${error.message}`);
    throw error;
  }
}

module.exports = { getHistory, depositMoney, withdrawMoney, previewWithdrawMoney };
