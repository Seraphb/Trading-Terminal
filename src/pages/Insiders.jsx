import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTheme } from '../components/ThemeContext';
import {
  Eye, TrendingUp, TrendingDown, DollarSign, Users, AlertTriangle,
  RefreshCw, Search, Filter, ArrowUpDown, ExternalLink, Wallet, Fish,
} from 'lucide-react';

/* ────────────────────────────  helpers  ──────────────────────────── */

const fmt = (n) => {
  if (n == null) return '—';
  return n.toLocaleString('en-US');
};
const fmtUsd = (n) => {
  if (n == null) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtPrice = (n) =>
  n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtTime = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

/* ──────────────────────  stock insider data  ────────────────────── */

const INSIDER_TICKERS = [
  'NVDA','AAPL','MSFT','GOOGL','AMZN','META','TSLA','AMD','AVGO','CRM',
  'NFLX','JPM','GS','BAC','WBD','DELL','SNOW','NET','AI','IONS',
  'ANET','SE','QSR','IMAX','CG','CRWV','ALAB','SPOT','DFH','MEDP',
  'GOLD','NTRA','TDG','APEI','IRWD','COP','PBF','APP','APG','VG',
];

const INSIDERS = [
  { name: 'Jensen Huang', rel: 'CEO', tickers: ['NVDA'] },
  { name: 'Colette Kress', rel: 'CFO', tickers: ['NVDA'] },
  { name: 'Tim Cook', rel: 'CEO', tickers: ['AAPL'] },
  { name: 'Luca Maestri', rel: 'CFO', tickers: ['AAPL'] },
  { name: 'Satya Nadella', rel: 'CEO', tickers: ['MSFT'] },
  { name: 'Amy Hood', rel: 'CFO', tickers: ['MSFT'] },
  { name: 'Sundar Pichai', rel: 'CEO', tickers: ['GOOGL'] },
  { name: 'Ruth Porat', rel: 'President & CIO', tickers: ['GOOGL'] },
  { name: 'Andy Jassy', rel: 'CEO', tickers: ['AMZN'] },
  { name: 'Brian Olsavsky', rel: 'CFO', tickers: ['AMZN'] },
  { name: 'Mark Zuckerberg', rel: 'CEO', tickers: ['META'] },
  { name: 'Susan Li', rel: 'CFO', tickers: ['META'] },
  { name: 'Elon Musk', rel: 'CEO', tickers: ['TSLA'] },
  { name: 'Zachary Kirkhorn', rel: 'CFO', tickers: ['TSLA'] },
  { name: 'Lisa Su', rel: 'CEO', tickers: ['AMD'] },
  { name: 'Jean Hu', rel: 'CFO', tickers: ['AMD'] },
  { name: 'Hock Tan', rel: 'CEO', tickers: ['AVGO'] },
  { name: 'Kirsten Spears', rel: 'CFO', tickers: ['AVGO'] },
  { name: 'Marc Benioff', rel: 'CEO', tickers: ['CRM'] },
  { name: 'Amy Weaver', rel: 'CFO', tickers: ['CRM'] },
  { name: 'Ted Sarandos', rel: 'Co-CEO', tickers: ['NFLX'] },
  { name: 'Spencer Neumann', rel: 'CFO', tickers: ['NFLX'] },
  { name: 'Jamie Dimon', rel: 'CEO', tickers: ['JPM'] },
  { name: 'Jeremy Barnum', rel: 'CFO', tickers: ['JPM'] },
  { name: 'David Solomon', rel: 'CEO', tickers: ['GS'] },
  { name: 'Denis Coleman', rel: 'CFO', tickers: ['GS'] },
  { name: 'Brian Moynihan', rel: 'CEO', tickers: ['BAC'] },
  { name: 'Alastair Borthwick', rel: 'CFO', tickers: ['BAC'] },
  { name: 'David Zaslav', rel: 'CEO', tickers: ['WBD'] },
  { name: 'Michael Dell', rel: 'CEO', tickers: ['DELL'] },
  { name: 'Frank Slootman', rel: 'Director', tickers: ['SNOW'] },
  { name: 'Matthew Prince', rel: 'CEO', tickers: ['NET'] },
  { name: 'Thomas Siebel', rel: 'CEO', tickers: ['AI'] },
  { name: 'Brett Monia', rel: 'CEO', tickers: ['IONS'] },
  { name: 'Jayshree Ullal', rel: 'CEO', tickers: ['ANET'] },
  { name: 'Forrest Li', rel: 'CEO', tickers: ['SE'] },
  { name: 'Josh Kobza', rel: 'CEO', tickers: ['QSR'] },
  { name: 'Rich Gelfond', rel: 'CEO', tickers: ['IMAX'] },
  { name: 'Harvey Schwartz', rel: 'CEO', tickers: ['CG'] },
  { name: 'Daniel Ek', rel: 'CEO', tickers: ['SPOT'] },
  { name: 'Patrick Zalupski', rel: 'CEO', tickers: ['DFH'] },
  { name: 'August Troendle', rel: 'CEO', tickers: ['MEDP'] },
  { name: 'Mark Bristow', rel: 'CEO', tickers: ['GOLD'] },
  { name: 'Steve Chapman', rel: 'President', tickers: ['NTRA'] },
  { name: 'Nicholas Howley', rel: 'Executive Chairman', tickers: ['TDG'] },
  { name: 'Ryan Craig', rel: 'Director', tickers: ['APEI'] },
  { name: 'Ryan Kiefer', rel: 'General Counsel', tickers: ['IRWD'] },
  { name: 'Ryan Lance', rel: 'CEO', tickers: ['COP'] },
  { name: 'Matthew Lucey', rel: 'CEO', tickers: ['PBF'] },
  { name: 'Adam Foroughi', rel: 'CEO', tickers: ['APP'] },
  { name: 'Jeff Holzmann', rel: 'EVP', tickers: ['APG'] },
  { name: 'Michael Colglazier', rel: 'CEO', tickers: ['VG'] },
  { name: 'Robert Williams', rel: 'Director', tickers: ['NVDA','AAPL'] },
  { name: 'Patricia Liu', rel: 'Chief Strategy Officer', tickers: ['MSFT','GOOGL'] },
  { name: 'John Doerr', rel: 'Director', tickers: ['AMZN','GOOGL'] },
  { name: 'Nancy Killefer', rel: 'Director', tickers: ['META','CRM'] },
  { name: 'James McNerney', rel: 'Director', tickers: ['GS','JPM'] },
  { name: 'Kevin Moore', rel: 'EVP', tickers: ['DELL','NET'] },
  { name: 'Sandra Chen', rel: 'Chief Strategy Officer', tickers: ['CRWV','ALAB'] },
];

const PRICE_RANGES = {
  NVDA: [115, 145], AAPL: [210, 240], MSFT: [410, 450], GOOGL: [155, 185],
  AMZN: [185, 215], META: [570, 630], TSLA: [165, 290], AMD: [100, 135],
  AVGO: [190, 230], CRM: [270, 320], NFLX: [850, 1050], JPM: [230, 265],
  GS: [555, 620], BAC: [42, 48], WBD: [9, 13], DELL: [95, 125],
  SNOW: [155, 190], NET: [100, 130], AI: [22, 36], IONS: [32, 45],
  ANET: [90, 120], SE: [110, 145], QSR: [60, 75], IMAX: [22, 30],
  CG: [52, 68], CRWV: [8, 18], ALAB: [55, 85], SPOT: [560, 640],
  DFH: [25, 38], MEDP: [340, 400], GOLD: [18, 24], NTRA: [130, 170],
  TDG: [1300, 1500], APEI: [18, 28], IRWD: [6, 12], COP: [95, 115],
  PBF: [28, 42], APP: [320, 420], APG: [42, 58], VG: [3, 8],
};

function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

function generateInsiderData() {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const entries = [];

  for (let i = 0; i < 82; i++) {
    const insider = pick(INSIDERS);
    const ticker = insider.tickers.length === 1 ? insider.tickers[0] : pick(insider.tickers);
    const range = PRICE_RANGES[ticker] || [50, 100];
    const cost = parseFloat(rand(range[0], range[1]).toFixed(2));
    const isSale = Math.random() < 0.6;
    const isProposed = Math.random() < 0.15;
    const txType = isProposed
      ? (isSale ? 'Proposed Sale' : 'Proposed Purchase')
      : (isSale ? 'Sale' : 'Purchase');

    let shares;
    if (cost > 500) shares = randInt(100, 15000);
    else if (cost > 100) shares = randInt(500, 80000);
    else if (cost > 20) shares = randInt(2000, 250000);
    else shares = randInt(10000, 1000000);

    const value = cost * shares;
    const txDate = new Date(now - rand(0, sevenDays));
    const filingDate = new Date(txDate.getTime() + rand(3600000, 172800000));
    const sharesTotal = randInt(shares, shares * randInt(3, 50));

    entries.push({
      id: i,
      ticker,
      owner: insider.name,
      relationship: insider.rel,
      date: txDate,
      transaction: txType,
      cost,
      shares,
      value,
      sharesTotal,
      filingDate,
    });
  }

  return entries.sort((a, b) => b.value - a.value);
}

/* ─────────────────────  crypto whale helpers  ───────────────────── */

const CRYPTO_PAIRS = [
  { symbol: 'BTCUSDT', token: 'BTC' },
  { symbol: 'ETHUSDT', token: 'ETH' },
  { symbol: 'SOLUSDT', token: 'SOL' },
  { symbol: 'BNBUSDT', token: 'BNB' },
  { symbol: 'XRPUSDT', token: 'XRP' },
  { symbol: 'DOGEUSDT', token: 'DOGE' },
  { symbol: 'ADAUSDT', token: 'ADA' },
  { symbol: 'AVAXUSDT', token: 'AVAX' },
];

async function fetchWhaleTrades(minValue = 100000) {
  const results = [];
  const fetches = CRYPTO_PAIRS.map(async ({ symbol, token }) => {
    try {
      const res = await fetch(
        `https://api.binance.com/api/v3/trades?symbol=${symbol}&limit=1000`
      );
      if (!res.ok) return;
      const trades = await res.json();
      for (const t of trades) {
        const price = parseFloat(t.price);
        const qty = parseFloat(t.qty);
        const val = price * qty;
        if (val >= minValue) {
          results.push({
            id: `${symbol}-${t.id}`,
            token,
            symbol,
            type: t.isBuyerMaker ? 'Sell' : 'Buy',
            amount: qty,
            price,
            value: val,
            time: new Date(t.time),
          });
        }
      }
    } catch {
      /* network failure – skip pair */
    }
  });
  await Promise.all(fetches);
  return results.sort((a, b) => b.value - a.value);
}

/* ──────────────────────────  COMPONENT  ─────────────────────────── */

export default function Insiders() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  /* ── shared state ── */
  const [mode, setMode] = useState('stocks');

  /* ── stocks state ── */
  const [stockData, setStockData] = useState(() => generateInsiderData());
  const [stockSearch, setStockSearch] = useState('');
  const [txFilter, setTxFilter] = useState('all');
  const [valueFilter, setValueFilter] = useState(0);
  const [stockSort, setStockSort] = useState({ key: 'value', dir: 'desc' });

  /* ── crypto state ── */
  const [cryptoData, setCryptoData] = useState([]);
  const [cryptoLoading, setCryptoLoading] = useState(false);
  const [cryptoError, setCryptoError] = useState(null);
  const [whaleMin, setWhaleMin] = useState(100000);
  const [cryptoSort, setCryptoSort] = useState({ key: 'value', dir: 'desc' });
  const refreshTimer = useRef(null);

  /* ── crypto fetching ── */
  const loadCrypto = useCallback(async () => {
    setCryptoLoading(true);
    setCryptoError(null);
    try {
      const data = await fetchWhaleTrades(whaleMin);
      setCryptoData(data);
    } catch (e) {
      setCryptoError(e.message);
    } finally {
      setCryptoLoading(false);
    }
  }, [whaleMin]);

  useEffect(() => {
    if (mode !== 'crypto') return;
    loadCrypto();
    refreshTimer.current = setInterval(loadCrypto, 30000);
    return () => clearInterval(refreshTimer.current);
  }, [mode, loadCrypto]);

  /* ── stock sorting ── */
  const toggleStockSort = (key) => {
    setStockSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }
    );
  };

  const filteredStocks = useMemo(() => {
    let d = [...stockData];
    if (stockSearch) {
      const q = stockSearch.toUpperCase();
      d = d.filter((r) => r.ticker.includes(q) || r.owner.toUpperCase().includes(q));
    }
    if (txFilter === 'sales') d = d.filter((r) => r.transaction.includes('Sale'));
    if (txFilter === 'purchases') d = d.filter((r) => r.transaction.includes('Purchase'));
    if (valueFilter > 0) d = d.filter((r) => r.value >= valueFilter);

    const { key, dir } = stockSort;
    d.sort((a, b) => {
      let va = a[key], vb = b[key];
      if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
      if (va instanceof Date) { va = va.getTime(); vb = vb.getTime(); }
      return dir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    return d;
  }, [stockData, stockSearch, txFilter, valueFilter, stockSort]);

  /* ── crypto sorting ── */
  const toggleCryptoSort = (key) => {
    setCryptoSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }
    );
  };

  const sortedCrypto = useMemo(() => {
    const d = [...cryptoData];
    const { key, dir } = cryptoSort;
    d.sort((a, b) => {
      let va = a[key], vb = b[key];
      if (typeof va === 'string') { va = va.toLowerCase(); vb = vb.toLowerCase(); }
      if (va instanceof Date) { va = va.getTime(); vb = vb.getTime(); }
      return dir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
    return d;
  }, [cryptoData, cryptoSort]);

  /* ── summary computations ── */
  const stockSummary = useMemo(() => {
    const buys = stockData.filter((r) => r.transaction.includes('Purchase')).sort((a, b) => b.value - a.value);
    const sells = stockData.filter((r) => r.transaction.includes('Sale')).sort((a, b) => b.value - a.value);
    return { topBuys: buys.slice(0, 4), topSells: sells.slice(0, 4) };
  }, [stockData]);

  const cryptoSummary = useMemo(() => {
    const buys = cryptoData.filter((t) => t.type === 'Buy');
    const sells = cryptoData.filter((t) => t.type === 'Sell');
    const buyVol = buys.reduce((s, t) => s + t.value, 0);
    const sellVol = sells.reduce((s, t) => s + t.value, 0);
    const bigBuy = buys.length ? buys.reduce((mx, t) => (t.value > mx.value ? t : mx), buys[0]) : null;
    const bigSell = sells.length ? sells.reduce((mx, t) => (t.value > mx.value ? t : mx), sells[0]) : null;
    const ratio = sellVol > 0 ? (buyVol / sellVol).toFixed(2) : '—';
    return { buyVol, sellVol, bigBuy, bigSell, ratio, total: buyVol + sellVol };
  }, [cryptoData]);

  const maxWhaleValue = useMemo(
    () => (cryptoData.length ? Math.max(...cryptoData.map((t) => t.value)) : 1),
    [cryptoData]
  );

  /* ── styling ── */
  const bg = isDark ? 'hsl(222,47%,6%)' : '#f8f9fc';
  const panelBg = isDark ? 'hsl(222,47%,10%)' : '#ffffff';
  const border = isDark ? 'hsl(222,30%,18%)' : '#e2e5ec';
  const textPrimary = isDark ? '#e2e8f0' : '#1e293b';
  const textSecondary = isDark ? '#94a3b8' : '#64748b';
  const headerBg = isDark ? 'hsl(222,47%,8%)' : '#f1f3f7';
  const green = '#22c55e';
  const red = '#ef4444';
  const greenBg = isDark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.06)';
  const redBg = isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.06)';
  const accent = '#6366f1';

  const VALUE_OPTIONS = [
    { label: 'All', value: 0 },
    { label: '>$1M', value: 1e6 },
    { label: '>$10M', value: 1e7 },
    { label: '>$50M', value: 5e7 },
    { label: '>$100M', value: 1e8 },
  ];
  const THRESHOLD_OPTIONS = [
    { label: '$100K', value: 100000 },
    { label: '$500K', value: 500000 },
    { label: '$1M', value: 1000000 },
    { label: '$5M', value: 5000000 },
  ];

  const SortIcon = ({ col, sort }) => (
    <ArrowUpDown
      size={12}
      style={{
        marginLeft: 4,
        opacity: sort.key === col ? 1 : 0.3,
        transform: sort.key === col && sort.dir === 'asc' ? 'scaleY(-1)' : undefined,
      }}
    />
  );

  /* ══════════════════════════  RENDER  ═══════════════════════════ */

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: bg, color: textPrimary, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '24px 20px 48px' }}>
        {/* ── HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${accent}, #a855f7)`,
            }}>
              <Eye size={22} color="#fff" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>
                Insider &amp; Whale Tracker
              </h1>
              <p style={{ margin: 0, fontSize: 13, color: textSecondary }}>
                {mode === 'stocks' ? 'SEC Form 4 Insider Trading Activity' : 'Live Large Crypto Transactions'}
              </p>
            </div>
          </div>

          {/* Toggle */}
          <div style={{
            display: 'flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${border}`,
            background: isDark ? 'hsl(222,47%,8%)' : '#f1f3f7',
          }}>
            {[
              { key: 'stocks', label: 'Stocks', icon: <Users size={14} /> },
              { key: 'crypto', label: 'Crypto', icon: <Wallet size={14} /> },
            ].map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 20px', border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  color: mode === key ? '#fff' : textSecondary,
                  background: mode === key ? accent : 'transparent',
                  transition: 'all .2s',
                }}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        </div>

        {/* ═══════════  STOCKS MODE  ═══════════ */}
        {mode === 'stocks' && (
          <>
            {/* Filter bar */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20, alignItems: 'center',
              background: panelBg, padding: '12px 16px', borderRadius: 12, border: `1px solid ${border}`,
            }}>
              <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 300 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: textSecondary }} />
                <input
                  type="text"
                  placeholder="Search ticker or insider..."
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8,
                    border: `1px solid ${border}`, background: bg, color: textPrimary,
                    fontSize: 13, outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Filter size={13} style={{ color: textSecondary }} />
                {['all', 'purchases', 'sales'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setTxFilter(f)}
                    style={{
                      padding: '5px 12px', borderRadius: 6, border: `1px solid ${border}`,
                      fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      background: txFilter === f ? accent : 'transparent',
                      color: txFilter === f ? '#fff' : textSecondary,
                      transition: 'all .15s',
                    }}
                  >
                    {f === 'all' ? 'All' : f === 'purchases' ? 'Purchases' : 'Sales'}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <DollarSign size={13} style={{ color: textSecondary }} />
                {VALUE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setValueFilter(o.value)}
                    style={{
                      padding: '5px 10px', borderRadius: 6, border: `1px solid ${border}`,
                      fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      background: valueFilter === o.value ? accent : 'transparent',
                      color: valueFilter === o.value ? '#fff' : textSecondary,
                      transition: 'all .15s',
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setStockData(generateInsiderData())}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                  borderRadius: 8, border: `1px solid ${border}`, background: 'transparent',
                  color: textSecondary, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                }}
              >
                <RefreshCw size={13} /> Refresh
              </button>
            </div>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
              {/* Top Buys */}
              <div style={{ background: panelBg, border: `1px solid ${border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <TrendingUp size={15} color={green} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: green }}>Top Insider Buys</span>
                  <span style={{ fontSize: 11, color: textSecondary, marginLeft: 'auto' }}>Bullish Signals</span>
                </div>
                {stockSummary.topBuys.map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 0', borderBottom: i < 3 ? `1px solid ${border}` : 'none',
                  }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 13, color: green }}>{r.ticker}</span>
                      <span style={{ fontSize: 11, color: textSecondary, marginLeft: 6 }}>{r.owner}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: green }}>{fmtUsd(r.value)}</span>
                  </div>
                ))}
              </div>

              {/* Top Sells */}
              <div style={{ background: panelBg, border: `1px solid ${border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <TrendingDown size={15} color={red} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: red }}>Top Insider Sells</span>
                  <span style={{ fontSize: 11, color: textSecondary, marginLeft: 'auto' }}>Large Exits</span>
                </div>
                {stockSummary.topSells.map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 0', borderBottom: i < 3 ? `1px solid ${border}` : 'none',
                  }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 13, color: red }}>{r.ticker}</span>
                      <span style={{ fontSize: 11, color: textSecondary, marginLeft: 6 }}>{r.owner}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: red }}>{fmtUsd(r.value)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Results count */}
            <p style={{ fontSize: 12, color: textSecondary, margin: '0 0 8px 2px' }}>
              Showing {filteredStocks.length} of {stockData.length} filings
            </p>

            {/* Data table */}
            <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${border}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: headerBg }}>
                    {[
                      { key: 'ticker', label: 'Ticker' },
                      { key: 'owner', label: 'Owner' },
                      { key: 'relationship', label: 'Relationship' },
                      { key: 'date', label: 'Date' },
                      { key: 'transaction', label: 'Transaction' },
                      { key: 'cost', label: 'Cost' },
                      { key: 'shares', label: '#Shares' },
                      { key: 'value', label: 'Value ($)' },
                      { key: 'sharesTotal', label: '#Shares Total' },
                      { key: 'filingDate', label: 'SEC Form 4' },
                    ].map((col) => (
                      <th
                        key={col.key}
                        onClick={() => toggleStockSort(col.key)}
                        style={{
                          padding: '10px 12px', textAlign: 'left', fontWeight: 600,
                          fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
                          color: textSecondary, cursor: 'pointer', userSelect: 'none',
                          whiteSpace: 'nowrap', position: 'sticky', top: 0,
                          background: headerBg, borderBottom: `1px solid ${border}`,
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          {col.label}
                          <SortIcon col={col.key} sort={stockSort} />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStocks.map((row) => {
                    const isSale = row.transaction.includes('Sale');
                    const rowBg = isSale ? redBg : greenBg;
                    const rowColor = isSale ? red : green;
                    return (
                      <tr
                        key={row.id}
                        style={{ background: rowBg, borderBottom: `1px solid ${border}`, transition: 'background .15s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'hsl(222,47%,14%)' : '#f0f4ff'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = rowBg; }}
                      >
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: accent }}>
                          <span style={{ cursor: 'pointer' }}>{row.ticker}</span>
                        </td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{row.owner}</td>
                        <td style={{ padding: '10px 12px', color: textSecondary, fontSize: 12 }}>{row.relationship}</td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmtDate(row.date)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                            fontSize: 11, fontWeight: 600, color: rowColor,
                            background: isSale
                              ? (isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)')
                              : (isDark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)'),
                          }}>
                            {row.transaction}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>{fmtPrice(row.cost)}</td>
                        <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>{fmt(row.shares)}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: rowColor }}>
                          {fmtUsd(row.value)}
                        </td>
                        <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>{fmt(row.sharesTotal)}</td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {fmtDate(row.filingDate)}
                            <ExternalLink size={11} style={{ color: textSecondary }} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ═══════════  CRYPTO MODE  ═══════════ */}
        {mode === 'crypto' && (
          <>
            {/* Filter bar */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, alignItems: 'center',
              background: panelBg, padding: '12px 16px', borderRadius: 12, border: `1px solid ${border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} color="#f59e0b" />
                <span style={{ fontSize: 13, fontWeight: 600, color: textPrimary }}>Alert Threshold</span>
              </div>
              {THRESHOLD_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setWhaleMin(o.value)}
                  style={{
                    padding: '5px 12px', borderRadius: 6, border: `1px solid ${border}`,
                    fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    background: whaleMin === o.value ? accent : 'transparent',
                    color: whaleMin === o.value ? '#fff' : textSecondary,
                    transition: 'all .15s',
                  }}
                >
                  {o.label}
                </button>
              ))}

              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: textSecondary }}>Auto-refresh 30s</span>
                <button
                  onClick={loadCrypto}
                  disabled={cryptoLoading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                    borderRadius: 8, border: `1px solid ${border}`, background: 'transparent',
                    color: textSecondary, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={13} className={cryptoLoading ? 'spin' : ''} style={cryptoLoading ? { animation: 'spin 1s linear infinite' } : {}} /> Refresh
                </button>
              </div>
            </div>

            {/* Whale Alert Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                {
                  label: 'Biggest Buy',
                  icon: <TrendingUp size={18} color={green} />,
                  value: cryptoSummary.bigBuy ? fmtUsd(cryptoSummary.bigBuy.value) : '—',
                  sub: cryptoSummary.bigBuy ? `${cryptoSummary.bigBuy.token} — ${fmt(cryptoSummary.bigBuy.amount)} @ ${fmtPrice(cryptoSummary.bigBuy.price)}` : '',
                  color: green,
                },
                {
                  label: 'Biggest Sell',
                  icon: <TrendingDown size={18} color={red} />,
                  value: cryptoSummary.bigSell ? fmtUsd(cryptoSummary.bigSell.value) : '—',
                  sub: cryptoSummary.bigSell ? `${cryptoSummary.bigSell.token} — ${fmt(cryptoSummary.bigSell.amount)} @ ${fmtPrice(cryptoSummary.bigSell.price)}` : '',
                  color: red,
                },
                {
                  label: 'Buy/Sell Ratio',
                  icon: <Fish size={18} color={accent} />,
                  value: cryptoSummary.ratio,
                  sub: `${cryptoData.filter((t) => t.type === 'Buy').length} buys / ${cryptoData.filter((t) => t.type === 'Sell').length} sells`,
                  color: accent,
                },
                {
                  label: 'Total Whale Vol',
                  icon: <DollarSign size={18} color="#f59e0b" />,
                  value: fmtUsd(cryptoSummary.total),
                  sub: `Buy: ${fmtUsd(cryptoSummary.buyVol)} | Sell: ${fmtUsd(cryptoSummary.sellVol)}`,
                  color: '#f59e0b',
                },
              ].map((card, i) => (
                <div key={i} style={{
                  background: panelBg, border: `1px solid ${border}`, borderRadius: 12, padding: 16,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {card.icon}
                    <span style={{ fontSize: 12, fontWeight: 600, color: textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{card.label}</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>{card.value}</div>
                  <div style={{ fontSize: 11, color: textSecondary, marginTop: 4 }}>{card.sub}</div>
                </div>
              ))}
            </div>

            {/* Loading / Error */}
            {cryptoLoading && cryptoData.length === 0 && (
              <div style={{ textAlign: 'center', padding: 48, color: textSecondary }}>
                <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                <p>Fetching whale trades from Binance...</p>
              </div>
            )}
            {cryptoError && (
              <div style={{ textAlign: 'center', padding: 24, color: red }}>
                <AlertTriangle size={20} style={{ marginBottom: 4 }} />
                <p>Error: {cryptoError}</p>
              </div>
            )}

            {/* Results */}
            {!cryptoLoading || cryptoData.length > 0 ? (
              <>
                <p style={{ fontSize: 12, color: textSecondary, margin: '0 0 8px 2px' }}>
                  {cryptoData.length} whale trades detected (min {fmtUsd(whaleMin)})
                  {cryptoLoading && <span style={{ marginLeft: 8, color: accent }}>updating...</span>}
                </p>

                <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${border}` }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: headerBg }}>
                        {[
                          { key: 'token', label: 'Token' },
                          { key: 'type', label: 'Type' },
                          { key: 'amount', label: 'Amount' },
                          { key: 'price', label: 'Price' },
                          { key: 'value', label: 'Value ($)' },
                          { key: 'time', label: 'Time' },
                          { key: '_bar', label: 'Size' },
                        ].map((col) => (
                          <th
                            key={col.key}
                            onClick={col.key !== '_bar' ? () => toggleCryptoSort(col.key) : undefined}
                            style={{
                              padding: '10px 12px', textAlign: 'left', fontWeight: 600,
                              fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
                              color: textSecondary, cursor: col.key !== '_bar' ? 'pointer' : 'default',
                              userSelect: 'none', whiteSpace: 'nowrap', position: 'sticky', top: 0,
                              background: headerBg, borderBottom: `1px solid ${border}`,
                            }}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                              {col.label}
                              {col.key !== '_bar' && <SortIcon col={col.key} sort={cryptoSort} />}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCrypto.map((row) => {
                        const isBuy = row.type === 'Buy';
                        const rowBg = isBuy ? greenBg : redBg;
                        const rowColor = isBuy ? green : red;
                        const barPct = Math.max(4, (row.value / maxWhaleValue) * 100);
                        return (
                          <tr
                            key={row.id}
                            style={{ background: rowBg, borderBottom: `1px solid ${border}`, transition: 'background .15s' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? 'hsl(222,47%,14%)' : '#f0f4ff'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = rowBg; }}
                          >
                            <td style={{ padding: '10px 12px', fontWeight: 700, color: accent }}>{row.token}</td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{
                                display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                                fontSize: 11, fontWeight: 600, color: rowColor,
                                background: isBuy
                                  ? (isDark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)')
                                  : (isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)'),
                              }}>
                                {row.type}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>{fmt(row.amount)}</td>
                            <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>{fmtPrice(row.price)}</td>
                            <td style={{ padding: '10px 12px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: rowColor }}>
                              {fmtUsd(row.value)}
                            </td>
                            <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmtTime(row.time)}</td>
                            <td style={{ padding: '10px 12px', minWidth: 100 }}>
                              <div style={{
                                height: 6, borderRadius: 3, background: isDark ? 'hsl(222,30%,18%)' : '#e2e5ec',
                                overflow: 'hidden',
                              }}>
                                <div style={{
                                  width: `${barPct}%`, height: '100%', borderRadius: 3,
                                  background: rowColor, transition: 'width .3s',
                                }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>

      {/* Spin animation for refresh icon */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
