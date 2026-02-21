const marketService = {
  prices: {
    'SELIC29': { current: 13500.00 },
    'ITUB4': { current: 35.00 }
  }
};

const portfolioItems = [
  { id: 1, asset_name: 'Tesouro Selic 2029', ticker: 'SELIC29', quantity: 2, avg_price: 13500.00 },
  { id: 2, asset_name: 'ITAU', ticker: 'ITUB4', quantity: 15, avg_price: 32.00 }
];

function _calculateLiquidation(shortfall) {
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
    return { canCover: false, totalAssetValue, assetsToSell: [] };
  }

  let remainingShortfall = shortfall;
  const assetsToSell = [];

  for (const asset of assetMarketValues) {
    if (remainingShortfall <= 0) break;

    // Use current price to figure out how many shares to sell to cover the remaining shortfall
    const currentAssetPrice = asset.currentPrice > 0 ? asset.currentPrice : 1; 
    
    // We can only sell up to what we actually own
    const maxSharesWeCanSell = asset.quantity;
    const maxMoneyWeCanGet = maxSharesWeCanSell * currentAssetPrice;
    
    // How much money do we ACTUALLY need from this asset?
    const moneyNeededFromThisAsset = Math.min(maxMoneyWeCanGet, remainingShortfall);
    
    // Calculate shares needed (keep decimal precision if allowed, or round up to nearest whole share if broker requires)
    const exactSharesToSell = moneyNeededFromThisAsset / currentAssetPrice;
    
    const newQuantity = Math.max(0, asset.quantity - exactSharesToSell);

    assetsToSell.push({
      ticker: asset.ticker,
      quantitySold: exactSharesToSell,
      valueGenerated: moneyNeededFromThisAsset,
      priceAtExecution: currentAssetPrice,
    });

    remainingShortfall -= moneyNeededFromThisAsset;
  }

  return { canCover: true, totalAssetValue, assetsToSell };
}

console.log(JSON.stringify(_calculateLiquidation(5000), null, 2));
