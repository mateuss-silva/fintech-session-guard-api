const { queryOne, queryAll } = require('../config/database');
const marketService = require('../services/marketService');

/**
 * @swagger
 * /api/portfolio:
 *   get:
 *     summary: Get user's portfolio assets and summary
 *     tags: [Portfolio]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Portfolio summary and list of assets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalBalance: { type: number }
 *                     totalInvested: { type: number }
 *                     totalCurrent: { type: number }
 *                     totalProfit: { type: number }
 * 
 *                     availableBalance: { type: number }
 *                     availableForInvestment: { type: number }
 *                     availableForWithdrawal: { type: number }
 *                     totalAssets: { type: integer }
 *                 assets:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Asset'
 */
const { PassThrough } = require('stream');

function _calculatePortfolio(userId) {
  const portfolioItems = queryAll(
    'SELECT id, asset_name, asset_type, ticker, quantity, avg_price, updated_at FROM portfolio WHERE user_id = ? ORDER BY asset_type, asset_name', 
    [userId]
  );
  
  let totalInvested = 0;
  let totalCurrent = 0;
  let availableBalance = 0;
  let totalAssets = 0;

  const assets = [];

  portfolioItems.forEach(item => {
    if (item.ticker === 'BRL') {
      availableBalance = item.quantity;
    } else {
      const catalogItem = marketService.catalog.find(c => c.ticker === item.ticker);
      const priceData = marketService.prices[item.ticker] || {};
      const currentPrice = priceData.current || item.avg_price;
      const investedVal = item.quantity * item.avg_price;
      const currentVal = item.quantity * currentPrice;

      totalInvested += investedVal;
      totalCurrent += currentVal;
      totalAssets += 1;

      assets.push({
        id: item.id,
        instrumentId: catalogItem ? catalogItem.id : null,
        ticker: item.ticker,
        name: item.asset_name,
        type: item.asset_type,
        quantity: item.quantity,
        avgPrice: item.avg_price,
        currentPrice: currentPrice,
        currentValue: Math.round(currentVal * 100) / 100,
        profit: Math.round((currentVal - investedVal) * 100) / 100,
        variationPct: item.avg_price > 0 ? Math.round(((currentPrice - item.avg_price) / item.avg_price * 100) * 100) / 100 : 0,
        change: priceData.change || 0,
        changePercent: priceData.changePercent || 0,
        timestamp: priceData.timestamp || item.updated_at
      });
    }
  });

  const totalBalance = totalCurrent + availableBalance;
  const byTypeMap = {};
  assets.forEach(a => {
    if (!byTypeMap[a.type]) byTypeMap[a.type] = { type: a.type, invested: 0, current: 0, assetCount: 0 };
    byTypeMap[a.type].invested += (a.quantity * a.avgPrice);
    byTypeMap[a.type].current += a.currentValue;
    byTypeMap[a.type].assetCount += 1;
  });

  return {
    summary: {
      totalBalance: Math.round(totalBalance * 100) / 100,
      totalInvested: Math.round(totalInvested * 100) / 100,
      totalCurrent: Math.round(totalCurrent * 100) / 100,
      totalProfit: Math.round((totalCurrent - totalInvested) * 100) / 100,
      availableBalance: Math.round(availableBalance * 100) / 100,
      availableForInvestment: Math.round(availableBalance * 100) / 100,
      availableForWithdrawal: Math.round(totalBalance * 100) / 100,
      totalAssets: totalAssets,
      isMarketOpen: marketService.isMarketOpen(),
    },
    byType: Object.values(byTypeMap),
    assets: assets
  };
}

function getPortfolio(req, reply) {
  try {
    const portfolioData = _calculatePortfolio(req.user.id);
    return reply.send(portfolioData);
  } catch (error) {
    console.error('Portfolio error:', error);
    throw error;
  }
}

function streamPortfolio(req, reply) {
  const userId = req.user.id;
  
  reply.header('Content-Type', 'text/event-stream');
  reply.header('Cache-Control', 'no-cache');
  reply.header('X-Accel-Buffering', 'no'); 

  console.log(`📡 New portfolio stream client for user ${userId}`);

  const stream = new PassThrough();
  
  // Send initial data
  try {
    const initialData = _calculatePortfolio(userId);
    stream.write(`data: ${JSON.stringify(initialData)}\n\n`);
  } catch (err) {
    console.error('Error on initial portfolio stream send:', err);
  }

  // Listen to market updates
  const updateListener = () => {
    try {
      const currentData = _calculatePortfolio(userId);
      stream.write(`data: ${JSON.stringify(currentData)}\n\n`);
    } catch (err) {
      console.error('Error on portfolio stream update:', err);
    }
  };

  marketService.on('prices_updated', updateListener);

  req.raw.on('close', () => {
    console.log(`📡 Portfolio stream client disconnected for user ${userId}`);
    marketService.removeListener('prices_updated', updateListener);
    stream.end();
  });

  return reply.send(stream);
}

module.exports = { getPortfolio, streamPortfolio };
