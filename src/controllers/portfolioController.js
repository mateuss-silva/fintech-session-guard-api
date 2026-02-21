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
function getPortfolio(req, reply) {
  try {
    const portfolioItems = queryAll(
      'SELECT id, asset_name, asset_type, ticker, quantity, avg_price, updated_at FROM portfolio WHERE user_id = ? ORDER BY asset_type, asset_name', 
      [req.user.id]
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

    return reply.send({
      summary: {
        totalBalance: Math.round(totalBalance * 100) / 100,
        totalInvested: Math.round(totalInvested * 100) / 100,
        totalCurrent: Math.round(totalCurrent * 100) / 100,
        totalProfit: Math.round((totalCurrent - totalInvested) * 100) / 100,
        availableBalance: Math.round(availableBalance * 100) / 100,
        availableForInvestment: Math.round(availableBalance * 100) / 100,
        availableForWithdrawal: Math.round(totalBalance * 100) / 100,
        totalAssets: totalAssets,
      },
      byType: Object.values(byTypeMap),
      assets: assets
    });

  } catch (error) {
    console.error('Portfolio error:', error);
    throw error;
  }
}

module.exports = { getPortfolio };
