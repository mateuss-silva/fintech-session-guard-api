const EventEmitter = require('events');

class MarketService extends EventEmitter {
  constructor() {
    super();
    this.prices = {};
    this.instrumentClients = {};  // Per-instrument stream clients: { ticker: [{ id, res }] }
    this.isRunning = false;
    this.updateInterval = 2000;   // 2 seconds
    this.maxSwing = 0.15;         // ±15% max from open

    // Full catalog of instruments available for trading
    this.catalog = [
      // Ações
      { id: 'instr_001', ticker: 'PETR4', name: 'Petrobras PN', type: 'acao', sector: 'Petróleo & Gás', basePrice: 38.70, popular: true },
      { id: 'instr_002', ticker: 'VALE3', name: 'Vale ON', type: 'acao', sector: 'Mineração', basePrice: 72.40, popular: true },
      { id: 'instr_003', ticker: 'ITUB4', name: 'Itaú Unibanco PN', type: 'acao', sector: 'Bancos', basePrice: 27.90, popular: true },
      { id: 'instr_004', ticker: 'BBAS3', name: 'Banco do Brasil ON', type: 'acao', sector: 'Bancos', basePrice: 55.40, popular: true },
      { id: 'instr_005', ticker: 'WEGE3', name: 'WEG ON', type: 'acao', sector: 'Bens Industriais', basePrice: 38.50, popular: false },
      { id: 'instr_006', ticker: 'ABEV3', name: 'Ambev ON', type: 'acao', sector: 'Bebidas', basePrice: 13.20, popular: true },
      { id: 'instr_007', ticker: 'MGLU3', name: 'Magazine Luiza ON', type: 'acao', sector: 'Varejo', basePrice: 2.15, popular: false },
      { id: 'instr_008', ticker: 'RENT3', name: 'Localiza ON', type: 'acao', sector: 'Locação de Veículos', basePrice: 48.90, popular: false },
      { id: 'instr_009', ticker: 'SUZB3', name: 'Suzano ON', type: 'acao', sector: 'Papel & Celulose', basePrice: 54.30, popular: false },
      { id: 'instr_010', ticker: 'ELET3', name: 'Eletrobras ON', type: 'acao', sector: 'Energia Elétrica', basePrice: 41.60, popular: false },
      { id: 'instr_011', ticker: 'BBDC4', name: 'Bradesco PN', type: 'acao', sector: 'Bancos', basePrice: 14.50, popular: true },
      { id: 'instr_012', ticker: 'B3SA3', name: 'B3 ON', type: 'acao', sector: 'Serviços Financeiros', basePrice: 12.80, popular: false },
      // FIIs
      { id: 'instr_013', ticker: 'HGLG11', name: 'CSHG Logística FII', type: 'fii', sector: 'Logística', basePrice: 165.20, popular: true },
      { id: 'instr_014', ticker: 'XPML11', name: 'XP Malls FII', type: 'fii', sector: 'Shopping', basePrice: 102.10, popular: false },
      { id: 'instr_015', ticker: 'KNCR11', name: 'Kinea Rendimentos FII', type: 'fii', sector: 'Recebíveis', basePrice: 101.80, popular: false },
      { id: 'instr_016', ticker: 'MXRF11', name: 'Maxi Renda FII', type: 'fii', sector: 'Recebíveis', basePrice: 10.50, popular: true },
      { id: 'instr_017', ticker: 'VISC11', name: 'Vinci Shopping FII', type: 'fii', sector: 'Shopping', basePrice: 120.30, popular: false },
      { id: 'instr_018', ticker: 'BTLG11', name: 'BTG Logística FII', type: 'fii', sector: 'Logística', basePrice: 98.40, popular: false },
      // Crypto
      { id: 'instr_019', ticker: 'BTC', name: 'Bitcoin', type: 'crypto', sector: 'Criptomoedas', basePrice: 380000.00, popular: true },
      { id: 'instr_020', ticker: 'ETH', name: 'Ethereum', type: 'crypto', sector: 'Criptomoedas', basePrice: 13800.00, popular: true },
      { id: 'instr_021', ticker: 'SOL', name: 'Solana', type: 'crypto', sector: 'Criptomoedas', basePrice: 600.00, popular: true },
      { id: 'instr_022', ticker: 'ADA', name: 'Cardano', type: 'crypto', sector: 'Criptomoedas', basePrice: 2.50, popular: false },
      { id: 'instr_023', ticker: 'DOT', name: 'Polkadot', type: 'crypto', sector: 'Criptomoedas', basePrice: 35.00, popular: false },
      { id: 'instr_024', ticker: 'AVAX', name: 'Avalanche', type: 'crypto', sector: 'Criptomoedas', basePrice: 155.00, popular: false },
      // Renda Fixa
      { id: 'instr_025', ticker: 'SELIC29', name: 'Tesouro Selic 2029', type: 'renda_fixa', sector: 'Títulos Públicos', basePrice: 14580.00, popular: true },
      { id: 'instr_026', ticker: 'IPCA35', name: 'Tesouro IPCA+ 2035', type: 'renda_fixa', sector: 'Títulos Públicos', basePrice: 2950.00, popular: false },
      { id: 'instr_027', ticker: 'CDB-XYZ', name: 'CDB Banco XYZ 120% CDI', type: 'renda_fixa', sector: 'CDB', basePrice: 53200.00, popular: false },
      { id: 'instr_028', ticker: 'PRE26', name: 'Tesouro Prefixado 2026', type: 'renda_fixa', sector: 'Títulos Públicos', basePrice: 850.00, popular: false },
      { id: 'instr_029', ticker: 'LCI-ABC', name: 'LCI Banco ABC 95% CDI', type: 'renda_fixa', sector: 'LCI', basePrice: 10000.00, popular: false },
    ];

    // Cache catalog by ticker for O(1) lookups
    this.catalogMap = {};
    this.catalog.forEach(item => {
      this.catalogMap[item.ticker] = item;
    });

    // Broadcast cache
    this.cachedInstrumentData = {}; // { ticker: string }
  }

  /**
   * Initialize with starting assets from the database,
   * then also register all catalog instruments not yet tracked.
   */
  initialize(assets) {
    assets.forEach(asset => {
      if (asset.ticker === 'BRL') return;
      this.prices[asset.ticker] = {
        ticker: asset.ticker,
        current: asset.current,
        open: asset.current,
        high: asset.current,
        low: asset.current,
        change: 0.00,
        changePercent: 0.00,
        timestamp: new Date().toISOString()
      };
    });

    this.catalog.forEach(item => {
      if (!this.prices[item.ticker]) {
        this.prices[item.ticker] = {
          ticker: item.ticker,
          current: item.basePrice,
          open: item.basePrice,
          high: item.basePrice,
          low: item.basePrice,
          change: 0.00,
          changePercent: 0.00,
          timestamp: new Date().toISOString()
        };
      }
    });

    if (!this.isRunning) {
      this.startSimulation();
    }
  }

  getInstrumentById(id) {
    return this.catalog.find(item => item.id === id) || null;
  }

  searchInstruments(query, type) {
    let results = this.catalog;
    if (type) {
      results = results.filter(item => item.type === type);
    }
    if (!query || query.trim() === '') {
      results = results.filter(item => item.popular);
    } else {
      const q = query.toLowerCase();
      results = results.filter(item =>
        item.ticker.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.sector.toLowerCase().includes(q)
      );
    }

    return results.map(item => {
      const priceData = this.prices[item.ticker] || {};
      return {
        id: item.id,
        ticker: item.ticker,
        name: item.name,
        type: item.type,
        sector: item.sector,
        currentPrice: priceData.current || item.basePrice,
        open: priceData.open || item.basePrice,
        high: priceData.high || item.basePrice,
        low: priceData.low || item.basePrice,
        change: priceData.change || 0,
        changePercent: priceData.changePercent || 0,
        timestamp: priceData.timestamp || new Date().toISOString(),
      };
    });
  }

  getPrice(ticker) {
    if (ticker === 'BRL') return 1.0;
    return this.prices[ticker] ? this.prices[ticker].current : null;
  }

  startSimulation() {
    this.isRunning = true;
    console.log('📈 Market simulation started');
    setInterval(() => {
      this.updatePrices();
    }, this.updateInterval);
  }

  updatePrices() {
    const tickVolatility = 0.02; // ±2% per tick

    for (const ticker in this.prices) {
      const data = this.prices[ticker];
      const changePct = (Math.random() * tickVolatility * 2) - tickVolatility;
      let newPrice = data.current * (1 + changePct);

      const maxPrice = data.open * (1 + this.maxSwing);
      const minPrice = data.open * (1 - this.maxSwing);
      newPrice = Math.max(minPrice, Math.min(maxPrice, newPrice));

      data.current = parseFloat(newPrice.toFixed(2));
      if (data.current > data.high) data.high = data.current;
      if (data.current < data.low) data.low = data.current;

      data.change = parseFloat((data.current - data.open).toFixed(2));
      data.changePercent = parseFloat(((data.change / data.open) * 100).toFixed(2));
      data.timestamp = new Date().toISOString();

      this.prices[ticker] = data;
    }

    this.cachedInstrumentData = {};
    for (const ticker in this.instrumentClients) {
      const priceData = this.prices[ticker];
      if (!priceData) continue;

      const catalogItem = this.catalogMap[ticker];
      const enriched = {
        id: catalogItem ? catalogItem.id : null,
        ticker: priceData.ticker,
        name: catalogItem ? catalogItem.name : ticker,
        type: catalogItem ? catalogItem.type : 'unknown',
        currentPrice: priceData.current,
        open: priceData.open,
        high: priceData.high,
        low: priceData.low,
        change: priceData.change,
        changePercent: priceData.changePercent,
        timestamp: priceData.timestamp,
      };
      this.cachedInstrumentData[ticker] = `data: ${JSON.stringify(enriched)}\n\n`;
    }

    this.emit('prices_updated', this.prices);
    this.broadcastInstrumentPrices();
  }

  isValidTicker(ticker) {
    if (ticker === 'BRL') return true;
    return !!this.prices[ticker];
  }

  addInstrumentClient(ticker, res) {
    const priceData = this.prices[ticker];
    if (!priceData) return false;

    const catalogItem = this.catalogMap[ticker];
    const enriched = {
      id: catalogItem ? catalogItem.id : null,
      ticker: priceData.ticker,
      name: catalogItem ? catalogItem.name : ticker,
      type: catalogItem ? catalogItem.type : 'unknown',
      currentPrice: priceData.current,
      open: priceData.open,
      high: priceData.high,
      low: priceData.low,
      change: priceData.change,
      changePercent: priceData.changePercent,
      timestamp: priceData.timestamp,
    };

    res.write(`data: ${JSON.stringify(enriched)}\n\n`);

    if (!this.instrumentClients[ticker]) {
      this.instrumentClients[ticker] = [];
    }

    const clientId = Date.now() + Math.random();
    this.instrumentClients[ticker].push({ id: clientId, res });

    res.on('close', () => {
      this.instrumentClients[ticker] = this.instrumentClients[ticker].filter(c => c.id !== clientId);
      if (this.instrumentClients[ticker].length === 0) {
        delete this.instrumentClients[ticker];
      }
    });

    return true;
  }



  broadcastInstrumentPrices() {
    // Send to per-instrument clients
    for (const ticker in this.instrumentClients) {
      const clients = this.instrumentClients[ticker];
      const data = this.cachedInstrumentData[ticker];
      if (clients && data) {
        clients.forEach(client => client.res.write(data));
      }
    }
  }

  isMarketOpen() {
    // 9 AM to 12 PM local server time
    const now = new Date();
    const hours = now.getHours();
    return hours >= 9 && hours < 12; // 09:00:00 to 11:59:59
  }

  getMarketStatus() {
    return {
      isOpen: this.isMarketOpen()
    };
  }
}

const marketService = new MarketService();
module.exports = marketService;
