/**
 * Instrument Detail Controller
 * GET /api/instruments/:id/history?range=1M|6M|1Y|3Y|5Y
 */

const { queryAll, queryOne } = require('../config/database');
const marketService = require('../services/marketService');

// Metadata map for each instrument
const instrumentMeta = {
  instr_001: { description: 'Petrobras is Brazil\'s state-controlled petroleum company, one of the largest production companies in the oil and energy sector in the Americas.', investorProfile: 'Aggressive' },
  instr_002: { description: 'Vale is a Brazilian multinational and one of the largest mining companies in the world, focused on iron ore, nickel, and copper.', investorProfile: 'Moderate' },
  instr_003: { description: 'Itaú Unibanco is the largest private bank in Brazil and one of the largest financial institutions in Latin America.', investorProfile: 'Moderate' },
  instr_004: { description: 'Banco do Brasil is the largest Brazilian bank by total assets, with a strong presence in agribusiness and government services.', investorProfile: 'Conservative' },
  instr_005: { description: 'WEG is a Brazilian multinational that manufactures electric motors, transformers, and industrial automation equipment.', investorProfile: 'Moderate' },
  instr_006: { description: 'Ambev is a leading beverage company in Latin America, producing beers, soft drinks, and other beverages under dozens of brands.', investorProfile: 'Conservative' },
  instr_007: { description: 'Magazine Luiza is one of Brazil\'s largest retail chains, with a strong e-commerce presence and innovative fintech services.', investorProfile: 'Aggressive' },
  instr_008: { description: 'Localiza is Brazil\'s largest car rental company, operating rental, fleet, and franchising segments across Latin America.', investorProfile: 'Moderate' },
  instr_009: { description: 'Suzano is the world\'s largest producer of eucalyptus pulp, operating in the paper and packaging industry globally.', investorProfile: 'Moderate' },
  instr_010: { description: 'Eletrobras is Brazil\'s largest power generator and transmitter, recently privatized and undergoing major operational restructuring.', investorProfile: 'Aggressive' },
  instr_011: { description: 'Bradesco is one of Brazil\'s largest private banks and insurance groups, offering a full range of financial services.', investorProfile: 'Conservative' },
  instr_012: { description: 'B3 is the operator of the Brazilian stock exchange and a key player in the country\'s capital market infrastructure.', investorProfile: 'Conservative' },
  instr_013: { description: 'CSHG Logística is a Real Estate Investment Trust (FII) focused on industrial and logistics properties across Brazil.', investorProfile: 'Moderate' },
  instr_014: { description: 'XP Malls is a FII investing in shopping centers in Brazil. Yields monthly dividends backed by rental income from prime malls.', investorProfile: 'Moderate' },
  instr_015: { description: 'Kinea Rendimentos is a credit-driven FII focused on real estate receivables (CRI), offering stable monthly income.', investorProfile: 'Conservative' },
  instr_016: { description: 'Maxi Renda is one of the largest FIIs in Brazil by number of shareholders, investing in CRIs and real estate assets.', investorProfile: 'Conservative' },
  instr_017: { description: 'Vinci Shopping Centers is a FII specialized in acquiring and managing high-end shopping malls in Brazil.', investorProfile: 'Moderate' },
  instr_018: { description: 'BTG Logística is a FII managed by BTG Pactual focused on high-standard logistics warehouses across Brazil.', investorProfile: 'Moderate' },
  instr_019: { description: 'Bitcoin is the world\'s first and largest cryptocurrency by market cap, operating as a decentralized digital currency on the Bitcoin network.', investorProfile: 'Aggressive' },
  instr_020: { description: 'Ethereum is a decentralized platform for smart contracts and decentralized applications (dApps), with ETH as its native currency.', investorProfile: 'Aggressive' },
  instr_021: { description: 'Solana is a high-performance blockchain supporting fast, low-cost smart contracts. Known for sub-second transaction finality.', investorProfile: 'Aggressive' },
  instr_022: { description: 'Cardano is a proof-of-stake blockchain platform focused on peer-reviewed research and formal verification of smart contracts.', investorProfile: 'Aggressive' },
  instr_023: { description: 'Polkadot is a multi-chain protocol that enables interoperability between different blockchains via a relay chain architecture.', investorProfile: 'Aggressive' },
  instr_024: { description: 'Avalanche is a high-throughput blockchain platform offering fast finality, low fees, and a modular subnet architecture.', investorProfile: 'Aggressive' },
  instr_025: { description: 'Tesouro Selic 2029 is a Brazilian government bond indexed to the Selic base interest rate. Considered the safest Brazilian investment.', investorProfile: 'Conservative' },
  instr_026: { description: 'Tesouro IPCA+ 2035 is a Brazilian government bond that pays a fixed rate above the IPCA inflation index, protecting real returns.', investorProfile: 'Conservative' },
  instr_027: { description: 'CDB issued by Banco XYZ offering 120% of the CDI rate. Covered by the FGC up to R$ 250,000 per institution.', investorProfile: 'Conservative' },
  instr_028: { description: 'Tesouro Prefixado 2026 is a Brazilian government bond with a fixed interest rate, ideal for investors with short-term goals.', investorProfile: 'Conservative' },
  instr_029: { description: 'LCI (Letra de Crédito Imobiliário) issued by Banco ABC offering 95% of CDI. Tax-exempt for individuals and covered by FGC.', investorProfile: 'Conservative' },
};

// Range → { days, weekly }
function parseRange(range) {
  switch (range) {
    case '1M': return { days: 30,   weekly: false };
    case '6M': return { days: 180,  weekly: false };
    case '1Y': return { days: 365,  weekly: false };
    case '3Y': return { days: 1095, weekly: true  };
    case '5Y': return { days: 1825, weekly: true  };
    default:   return { days: 365,  weekly: false };
  }
}

async function getInstrumentHistory(req, reply) {
  const { id } = req.params;
  const range = req.query.range || '1Y';
  const { days, weekly } = parseRange(range);

  // Verify instrument exists
  const instrument = marketService.catalog.find(i => i.id === id);
  if (!instrument) {
    return reply.code(404).send({ error: 'Instrument not found' });
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffISO = cutoffDate.toISOString().slice(0, 10);

  let rows = queryAll(
    'SELECT date, value FROM instrument_history WHERE instrument_id = ? AND date >= ? ORDER BY date ASC',
    [id, cutoffISO]
  );

  // Aggregate to weekly if needed (keep last value per ISO week)
  if (weekly && rows.length > 0) {
    const weekMap = new Map();
    for (const row of rows) {
      const d = new Date(row.date);
      const year = d.getUTCFullYear();
      // ISO week: Monday-based
      const startOfYear = new Date(Date.UTC(year, 0, 1));
      const weekNum = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getUTCDay() + 1) / 7);
      const key = `${year}-W${String(weekNum).padStart(2, '0')}`;
      weekMap.set(key, row); // last date in week wins
    }
    rows = Array.from(weekMap.values());
  }

  const meta = instrumentMeta[id] || {
    description: `${instrument.name} — ${instrument.sector}`,
    investorProfile: 'Moderate'
  };

  return reply.send({
    instrumentId: id,
    ticker: instrument.ticker,
    name: instrument.name,
    type: instrument.type,
    sector: instrument.sector,
    description: meta.description,
    investorProfile: meta.investorProfile,
    history: rows.map(r => ({ date: r.date, value: r.value }))
  });
}

module.exports = { getInstrumentHistory };
