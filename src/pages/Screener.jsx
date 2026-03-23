import React, { Suspense, lazy, useState, useCallback, useMemo } from 'react';
import { useTheme } from '../components/ThemeContext';
import {
  Search, Loader2, TrendingUp, TrendingDown, Filter, Eye,
  ArrowUpDown, Activity, BarChart3, Zap, ChevronDown, ChevronUp,
  SlidersHorizontal, Play, RotateCcw, Sparkles, ToggleLeft, ToggleRight,
  Coins, LineChart
} from 'lucide-react';

const SymbolTerminalModal = lazy(() => import('../components/scanner/SymbolTerminalModal'));

/* ══════════════════════════════════════════════════════════════════════════ */
/*                        TECHNICAL INDICATOR MATH                          */
/* ══════════════════════════════════════════════════════════════════════════ */

function calcEMA(closes, period) {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const ema = [closes.slice(0, period).reduce((a, b) => a + b, 0) / period];
  for (let i = period; i < closes.length; i++) {
    ema.push(closes[i] * k + ema[ema.length - 1] * (1 - k));
  }
  return ema;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcATR(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  if (ema26.length < 2) return { macdLine: 0, signal: 0, histogram: 0, cross: 'none' };
  const offset = 26 - 12;
  const macdArr = [];
  for (let i = 0; i < ema26.length; i++) {
    macdArr.push(ema12[i + offset] - ema26[i]);
  }
  const signalArr = calcEMA(macdArr, 9);
  if (signalArr.length < 2) return { macdLine: 0, signal: 0, histogram: 0, cross: 'none' };
  const signalOffset = 9;
  const lastIdx = signalArr.length - 1;
  const prevIdx = lastIdx - 1;
  const macdLast = macdArr[lastIdx + signalOffset];
  const macdPrev = macdArr[prevIdx + signalOffset];
  const sigLast = signalArr[lastIdx];
  const sigPrev = signalArr[prevIdx];
  let cross = 'none';
  if (macdPrev <= sigPrev && macdLast > sigLast) cross = 'bullish';
  else if (macdPrev >= sigPrev && macdLast < sigLast) cross = 'bearish';
  return { macdLine: macdLast, signal: sigLast, histogram: macdLast - sigLast, cross };
}

function detectEmaCrossover(closes, shortPeriod = 9, longPeriod = 21) {
  const shortEma = calcEMA(closes, shortPeriod);
  const longEma = calcEMA(closes, longPeriod);
  if (shortEma.length < 2 || longEma.length < 2) return 'none';
  const offset = longPeriod - shortPeriod;
  const lastShort = shortEma[shortEma.length - 1];
  const prevShort = shortEma[shortEma.length - 2];
  const lastLong = longEma[longEma.length - 1];
  const prevLong = longEma[longEma.length - 2];
  const lastShortAligned = shortEma.length > longEma.length
    ? shortEma[shortEma.length - 1 - (shortEma.length - longEma.length - offset) + offset] || lastShort
    : lastShort;
  const prevShortAligned = shortEma.length > longEma.length
    ? shortEma[shortEma.length - 2 - (shortEma.length - longEma.length - offset) + offset] || prevShort
    : prevShort;
  // Simplified: just use the tail values
  if (prevShort <= prevLong && lastShort > lastLong) return 'bullish';
  if (prevShort >= prevLong && lastShort < lastLong) return 'bearish';
  return 'none';
}

function computeIndicators(klines, ticker) {
  const closes = klines.map(k => parseFloat(k[4]));
  const highs  = klines.map(k => parseFloat(k[2]));
  const lows   = klines.map(k => parseFloat(k[3]));
  const volumes = klines.map(k => parseFloat(k[5]));
  const price = closes[closes.length - 1] || 0;

  const rsi = calcRSI(closes);
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const ema20Last = ema20.length > 0 ? ema20[ema20.length - 1] : null;
  const ema50Last = ema50.length > 0 ? ema50[ema50.length - 1] : null;

  const ema20Signal = ema20Last != null ? (price > ema20Last ? 'above' : 'below') : null;
  const ema50Signal = ema50Last != null ? (price > ema50Last ? 'above' : 'below') : null;

  const emaCross = detectEmaCrossover(closes, 9, 21);

  const todayVol = volumes[volumes.length - 1] || 0;
  const avg20Vol = volumes.length >= 21
    ? volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20
    : volumes.length > 1
      ? volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1)
      : todayVol;
  const volumeChange = avg20Vol > 0 ? ((todayVol - avg20Vol) / avg20Vol) * 100 : 0;

  const atr = calcATR(highs, lows, closes);
  const macd = calcMACD(closes);

  const priceChange24h = ticker ? parseFloat(ticker.priceChangePercent || 0) : 0;
  const quoteVolume = ticker ? parseFloat(ticker.quoteVolume || 0) : 0;

  // Composite signal
  let signalScore = 0;
  if (rsi != null && rsi < 30) signalScore += 1;
  if (rsi != null && rsi > 70) signalScore -= 1;
  if (ema20Signal === 'above') signalScore += 0.5;
  if (ema50Signal === 'above') signalScore += 0.5;
  if (macd.cross === 'bullish') signalScore += 1;
  if (macd.cross === 'bearish') signalScore -= 1;
  if (emaCross === 'bullish') signalScore += 1;
  if (emaCross === 'bearish') signalScore -= 1;

  let signalStatus = 'neutral';
  if (signalScore >= 2) signalStatus = 'strong_buy';
  else if (signalScore >= 1) signalStatus = 'buy';
  else if (signalScore <= -2) signalStatus = 'strong_sell';
  else if (signalScore <= -1) signalStatus = 'sell';

  return {
    price,
    rsi: rsi != null ? Math.round(rsi * 100) / 100 : null,
    ema20Signal,
    ema50Signal,
    ema20Value: ema20Last,
    ema50Value: ema50Last,
    emaCross,
    volumeChange: Math.round(volumeChange * 100) / 100,
    atr: atr != null ? Math.round(atr * 10000) / 10000 : null,
    macdCross: macd.cross,
    macdHistogram: macd.histogram,
    priceChange24h: Math.round(priceChange24h * 100) / 100,
    quoteVolume,
    signalStatus,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*                           STOCK DATA                                      */
/* ══════════════════════════════════════════════════════════════════════════ */

const STOCK_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'V', 'WMT',
  'JNJ', 'PG', 'UNH', 'HD', 'MA', 'DIS', 'PYPL', 'NFLX', 'INTC', 'AMD',
];

function generateStockPlaceholder(ticker) {
  // Seeded pseudo-random based on ticker string for consistent placeholder data
  let seed = 0;
  for (let i = 0; i < ticker.length; i++) seed = ((seed << 5) - seed + ticker.charCodeAt(i)) | 0;
  const rng = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed & 0x7fffffff) / 2147483647; };

  const basePrice = 50 + rng() * 450;
  const change = (rng() - 0.45) * 8;
  const rsi = 25 + rng() * 55;
  const vol = 1e6 + rng() * 5e9;
  const volChange = (rng() - 0.3) * 200;

  const ema20Sig = rng() > 0.4 ? 'above' : 'below';
  const ema50Sig = rng() > 0.45 ? 'above' : 'below';
  const emaCrossVal = rng() > 0.7 ? 'bullish' : rng() > 0.5 ? 'bearish' : 'none';
  const macdVal = rng() > 0.6 ? 'bullish' : rng() > 0.4 ? 'bearish' : 'none';

  let signalScore = 0;
  if (rsi < 30) signalScore += 1;
  if (rsi > 70) signalScore -= 1;
  if (ema20Sig === 'above') signalScore += 0.5;
  if (ema50Sig === 'above') signalScore += 0.5;
  if (macdVal === 'bullish') signalScore += 1;
  if (macdVal === 'bearish') signalScore -= 1;
  let signalStatus = 'neutral';
  if (signalScore >= 2) signalStatus = 'strong_buy';
  else if (signalScore >= 1) signalStatus = 'buy';
  else if (signalScore <= -2) signalStatus = 'strong_sell';
  else if (signalScore <= -1) signalStatus = 'sell';

  return {
    symbol: ticker,
    price: Math.round(basePrice * 100) / 100,
    priceChange24h: Math.round(change * 100) / 100,
    rsi: Math.round(rsi * 100) / 100,
    ema20Signal: ema20Sig,
    ema50Signal: ema50Sig,
    emaCross: emaCrossVal,
    volumeChange: Math.round(volChange * 100) / 100,
    atr: Math.round(rng() * 5 * 10000) / 10000,
    macdCross: macdVal,
    macdHistogram: (rng() - 0.5) * 2,
    quoteVolume: vol,
    signalStatus,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*                              PRESETS                                      */
/* ══════════════════════════════════════════════════════════════════════════ */

const PRESETS = [
  { id: 'oversold',  label: 'Oversold Bounce', icon: TrendingUp,   color: '#22c55e',
    filters: { rsiMax: 30, ema50: 'above' } },
  { id: 'breakout',  label: 'Breakout',        icon: Zap,          color: '#f59e0b',
    filters: { ema20: 'above', volumeChangeMin: 200 } },
  { id: 'overbought',label: 'Overbought',      icon: TrendingDown, color: '#ef4444',
    filters: { rsiMin: 70 } },
  { id: 'trend',     label: 'Trend Following', icon: Activity,     color: '#3b82f6',
    filters: { ema20: 'above', ema50: 'above', macd: 'bullish' } },
];

const DEFAULT_FILTERS = {
  rsiEnabled: false,
  rsiMin: 0,
  rsiMax: 100,
  ema20: 'any',
  ema50: 'any',
  emaCross: 'any',
  volumeChangeMin: null,
  priceChangePreset: 'any',
  macd: 'any',
  minVolume: 0,
};

/* ══════════════════════════════════════════════════════════════════════════ */
/*                            FILTER LOGIC                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

function matchesFilters(ind, filters) {
  if (filters.rsiEnabled && ind.rsi != null) {
    if (ind.rsi < filters.rsiMin || ind.rsi > filters.rsiMax) return false;
  }
  if (filters.ema20 !== 'any' && ind.ema20Signal !== filters.ema20) return false;
  if (filters.ema50 !== 'any' && ind.ema50Signal !== filters.ema50) return false;
  if (filters.emaCross !== 'any' && ind.emaCross !== filters.emaCross) return false;
  if (filters.volumeChangeMin != null && ind.volumeChange < filters.volumeChangeMin) return false;
  if (filters.priceChangePreset !== 'any') {
    const pc = ind.priceChange24h;
    switch (filters.priceChangePreset) {
      case 'gt5':   if (pc <= 5)   return false; break;
      case 'gt10':  if (pc <= 10)  return false; break;
      case 'lt-5':  if (pc >= -5)  return false; break;
      case 'lt-10': if (pc >= -10) return false; break;
      default: break;
    }
  }
  if (filters.macd !== 'any' && ind.macdCross !== filters.macd) return false;
  if (filters.minVolume > 0 && ind.quoteVolume < filters.minVolume) return false;
  return true;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*                           FORMAT HELPERS                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

function fmtPrice(n) {
  if (n == null) return '\u2014';
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.0001) return n.toFixed(6);
  return n.toFixed(8);
}

function fmtStockPrice(n) {
  if (n == null) return '\u2014';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n) {
  if (n == null) return '\u2014';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function fmtVol(n) {
  if (n == null) return '\u2014';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*                          MAIN COMPONENT                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

export default function Screener() {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const bg       = dark ? '#0f172a' : '#f8fafc';
  const cardBg   = dark ? '#1e293b' : '#ffffff';
  const borderC  = dark ? '#334155' : '#e2e8f0';
  const textC    = dark ? '#e2e4e8' : '#1e293b';
  const mutedC   = dark ? '#94a3b8' : '#64748b';
  const accentC  = '#3b82f6';

  const [mode, setMode] = useState('crypto'); // 'crypto' | 'stocks'
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [results, setResults] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [sortCol, setSortCol] = useState('priceChange24h');
  const [sortDir, setSortDir] = useState('desc');
  const [terminalResult, setTerminalResult] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState(null);

  /* --- apply preset --- */
  const applyPreset = useCallback((preset) => {
    const newFilters = { ...DEFAULT_FILTERS, ...preset.filters };
    if (preset.filters.rsiMax != null || preset.filters.rsiMin != null) {
      newFilters.rsiEnabled = true;
    }
    setFilters(newFilters);
  }, []);

  /* --- reset filters --- */
  const resetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
  }, []);

  /* --- scan crypto --- */
  const runCryptoScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setResults([]);
    try {
      const tickerRes = await fetch('https://api.binance.com/api/v3/ticker/24hr');
      if (!tickerRes.ok) throw new Error(`Ticker API error: ${tickerRes.status}`);
      const tickers = await tickerRes.json();

      const usdtTickers = tickers
        .filter(t => t.symbol.endsWith('USDT') && !t.symbol.includes('UP') && !t.symbol.includes('DOWN'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 50);

      const symbols = usdtTickers.map(t => t.symbol);
      const tickerMap = {};
      usdtTickers.forEach(t => { tickerMap[t.symbol] = t; });

      setProgress({ done: 0, total: symbols.length });

      const allResults = [];
      const batchSize = 5;
      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const promises = batch.map(async (sym) => {
          try {
            const res = await fetch(
              `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1h&limit=100`
            );
            if (!res.ok) return null;
            const klines = await res.json();
            if (!klines || klines.length < 30) return null;
            const indicators = computeIndicators(klines, tickerMap[sym]);
            return { symbol: sym, ...indicators };
          } catch { return null; }
        });
        const batchResults = await Promise.all(promises);
        batchResults.forEach(r => { if (r) allResults.push(r); });
        setProgress({ done: Math.min(i + batchSize, symbols.length), total: symbols.length });
      }

      const filtered = allResults.filter(r => matchesFilters(r, filters));
      setResults(filtered);
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }, [filters]);

  /* --- scan stocks (placeholder) --- */
  const runStockScan = useCallback(() => {
    setScanning(true);
    setError(null);
    setResults([]);
    setProgress({ done: 0, total: STOCK_TICKERS.length });

    // Simulate brief loading for UX
    setTimeout(() => {
      const allResults = STOCK_TICKERS.map(t => generateStockPlaceholder(t));
      setProgress({ done: STOCK_TICKERS.length, total: STOCK_TICKERS.length });
      const filtered = allResults.filter(r => matchesFilters(r, filters));
      setResults(filtered);
      setScanning(false);
    }, 600);
  }, [filters]);

  const runScan = useCallback(() => {
    if (mode === 'crypto') runCryptoScan();
    else runStockScan();
  }, [mode, runCryptoScan, runStockScan]);

  /* --- sorting --- */
  const handleSort = useCallback((col) => {
    setSortDir(prev => (sortCol === col ? (prev === 'asc' ? 'desc' : 'asc') : 'desc'));
    setSortCol(col);
  }, [sortCol]);

  const sortedResults = useMemo(() => {
    const arr = [...results];
    arr.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (typeof va === 'string') { va = va === 'above' || va === 'bullish' ? 1 : 0; vb = vb === 'above' || vb === 'bullish' ? 1 : 0; }
      if (va == null) va = -Infinity;
      if (vb == null) vb = -Infinity;
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return arr;
  }, [results, sortCol, sortDir]);

  /* --- open terminal --- */
  const openTerminal = useCallback((row) => {
    setTerminalResult({
      symbol: row.symbol,
      isCrypto: mode === 'crypto',
      price: row.price,
      goldSignalTime: null,
      goldSignalPrice: null,
      signals: [],
      scanTimeframe: '1d',
    });
  }, [mode]);

  /* --- update single filter --- */
  const setFilter = useCallback((key, val) => {
    setFilters(prev => ({ ...prev, [key]: val }));
  }, []);

  /* --- mode switch --- */
  const switchMode = useCallback((newMode) => {
    setMode(newMode);
    setResults([]);
    setError(null);
    setProgress({ done: 0, total: 0 });
  }, []);

  /* ═══════════════════════════════════════════════════════════════════════ */
  /*                              RENDER                                    */
  /* ═══════════════════════════════════════════════════════════════════════ */

  const isCrypto = mode === 'crypto';

  const columns = [
    { key: 'symbol',        label: 'Symbol',      w: '110px' },
    { key: 'price',         label: 'Price',       w: '100px' },
    { key: 'priceChange24h',label: '24h %',       w: '80px'  },
    { key: 'rsi',           label: 'RSI(14)',     w: '70px'  },
    { key: 'signalStatus',  label: 'Signal',      w: '95px'  },
    { key: 'ema20Signal',   label: 'EMA20',       w: '75px'  },
    { key: 'ema50Signal',   label: 'EMA50',       w: '75px'  },
    { key: 'emaCross',      label: 'EMA Cross',   w: '90px'  },
    { key: 'volumeChange',  label: 'Vol Chg %',   w: '90px'  },
    { key: 'macdCross',     label: 'MACD',        w: '85px'  },
    { key: 'quoteVolume',   label: 'Volume 24h',  w: '100px' },
  ];

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', background: bg, color: textC, fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>

      {/* ═══════════ LEFT SIDEBAR ═══════════ */}
      <div style={{
        width: sidebarOpen ? '300px' : '0px',
        minWidth: sidebarOpen ? '300px' : '0px',
        transition: 'all 0.2s ease',
        overflow: 'hidden',
        borderRight: sidebarOpen ? `1px solid ${borderC}` : 'none',
        display: 'flex',
        flexDirection: 'column',
        background: dark ? '#0b1120' : '#f1f5f9',
      }}>
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>

          {/* Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <SlidersHorizontal size={18} color={accentC} />
            <span style={{ fontWeight: 700, fontSize: '15px' }}>Technical Screener</span>
          </div>

          {/* Mode Toggle */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: mutedC, marginBottom: '8px', fontWeight: 600, letterSpacing: '0.5px' }}>Mode</div>
            <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${borderC}` }}>
              <button
                onClick={() => switchMode('crypto')}
                style={{
                  flex: 1, padding: '8px 12px', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  fontSize: '13px', fontWeight: 600, transition: 'all 0.15s',
                  background: isCrypto ? accentC : cardBg,
                  color: isCrypto ? '#fff' : mutedC,
                }}
              >
                <Coins size={14} />
                Crypto
              </button>
              <button
                onClick={() => switchMode('stocks')}
                style={{
                  flex: 1, padding: '8px 12px', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  fontSize: '13px', fontWeight: 600, transition: 'all 0.15s',
                  background: !isCrypto ? accentC : cardBg,
                  color: !isCrypto ? '#fff' : mutedC,
                  borderLeft: `1px solid ${borderC}`,
                }}
              >
                <LineChart size={14} />
                Stocks
              </button>
            </div>
          </div>

          {/* Presets */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: mutedC, marginBottom: '8px', fontWeight: 600, letterSpacing: '0.5px' }}>Presets</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {PRESETS.map(p => {
                const Icon = p.icon;
                return (
                  <button key={p.id} onClick={() => applyPreset(p)} style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '5px 10px', borderRadius: '6px', border: `1px solid ${p.color}33`,
                    background: `${p.color}15`, color: p.color, fontSize: '12px', fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                    onMouseEnter={e => { e.target.style.background = `${p.color}30`; }}
                    onMouseLeave={e => { e.target.style.background = `${p.color}15`; }}
                  >
                    <Icon size={13} /> {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* RSI Filter */}
          <FilterSection label="RSI (14)" mutedC={mutedC} borderC={borderC} cardBg={cardBg}
            enabled={filters.rsiEnabled}
            onToggle={() => setFilter('rsiEnabled', !filters.rsiEnabled)}
            accentC={accentC}
          >
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
              {[
                { label: 'Oversold (<30)', fn: () => { setFilter('rsiEnabled', true); setFilter('rsiMin', 0); setFilter('rsiMax', 30); } },
                { label: 'Overbought (>70)', fn: () => { setFilter('rsiEnabled', true); setFilter('rsiMin', 70); setFilter('rsiMax', 100); } },
                { label: 'Custom', fn: () => { setFilter('rsiEnabled', true); } },
              ].map(btn => (
                <button key={btn.label} onClick={btn.fn} style={{
                  padding: '3px 8px', borderRadius: '4px', border: `1px solid ${borderC}`,
                  background: cardBg, color: mutedC, fontSize: '11px', cursor: 'pointer',
                }}>
                  {btn.label}
                </button>
              ))}
            </div>
            {filters.rsiEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: mutedC, width: '24px' }}>{filters.rsiMin}</span>
                <input type="range" min={0} max={100} value={filters.rsiMin}
                  onChange={e => setFilter('rsiMin', Number(e.target.value))}
                  style={{ flex: 1, accentColor: accentC }} />
                <input type="range" min={0} max={100} value={filters.rsiMax}
                  onChange={e => setFilter('rsiMax', Number(e.target.value))}
                  style={{ flex: 1, accentColor: accentC }} />
                <span style={{ fontSize: '11px', color: mutedC, width: '24px', textAlign: 'right' }}>{filters.rsiMax}</span>
              </div>
            )}
          </FilterSection>

          {/* Price Change 24h */}
          <FilterSection label="Price Change 24h" mutedC={mutedC} borderC={borderC} cardBg={cardBg}>
            <SelectFilter value={filters.priceChangePreset}
              onChange={v => setFilter('priceChangePreset', v)}
              options={[['any','Any'],['gt5','> +5%'],['gt10','> +10%'],['lt-5','< -5%'],['lt-10','< -10%']]}
              cardBg={cardBg} borderC={borderC} textC={textC} />
          </FilterSection>

          {/* Min Volume */}
          <FilterSection label={isCrypto ? 'Min 24h Volume (USDT)' : 'Min 24h Volume ($)'} mutedC={mutedC} borderC={borderC} cardBg={cardBg}>
            <input type="range" min={0} max={isCrypto ? 500000000 : 5000000000} step={isCrypto ? 5000000 : 50000000}
              value={filters.minVolume}
              onChange={e => setFilter('minVolume', Number(e.target.value))}
              style={{ width: '100%', accentColor: accentC }} />
            <div style={{ fontSize: '11px', color: mutedC, marginTop: '4px' }}>
              {filters.minVolume > 0 ? fmtVol(filters.minVolume) : 'Any'}
            </div>
          </FilterSection>

          {/* EMA Crossover */}
          <FilterSection label="EMA Crossover (9/21)" mutedC={mutedC} borderC={borderC} cardBg={cardBg}>
            <SelectFilter value={filters.emaCross} onChange={v => setFilter('emaCross', v)}
              options={[['any','Any'],['bullish','Bullish Cross'],['bearish','Bearish Cross']]}
              cardBg={cardBg} borderC={borderC} textC={textC} />
          </FilterSection>

          {/* EMA20 */}
          <FilterSection label="Price vs EMA(20)" mutedC={mutedC} borderC={borderC} cardBg={cardBg}>
            <SelectFilter value={filters.ema20} onChange={v => setFilter('ema20', v)}
              options={[['any','Any'],['above','Above'],['below','Below']]}
              cardBg={cardBg} borderC={borderC} textC={textC} />
          </FilterSection>

          {/* EMA50 */}
          <FilterSection label="Price vs EMA(50)" mutedC={mutedC} borderC={borderC} cardBg={cardBg}>
            <SelectFilter value={filters.ema50} onChange={v => setFilter('ema50', v)}
              options={[['any','Any'],['above','Above'],['below','Below']]}
              cardBg={cardBg} borderC={borderC} textC={textC} />
          </FilterSection>

          {/* Volume Change */}
          <FilterSection label="Volume Spike" mutedC={mutedC} borderC={borderC} cardBg={cardBg}>
            <SelectFilter value={filters.volumeChangeMin == null ? 'any' : String(filters.volumeChangeMin)}
              onChange={v => setFilter('volumeChangeMin', v === 'any' ? null : Number(v))}
              options={[['any','Any'],['50','> 50%'],['100','> 100%'],['200','> 200%']]}
              cardBg={cardBg} borderC={borderC} textC={textC} />
          </FilterSection>

          {/* MACD */}
          <FilterSection label="MACD Signal" mutedC={mutedC} borderC={borderC} cardBg={cardBg}>
            <SelectFilter value={filters.macd} onChange={v => setFilter('macd', v)}
              options={[['any','Any'],['bullish','Bullish Cross'],['bearish','Bearish Cross']]}
              cardBg={cardBg} borderC={borderC} textC={textC} />
          </FilterSection>
        </div>

        {/* Scan + Reset buttons */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${borderC}`, display: 'flex', gap: '8px' }}>
          <button onClick={runScan} disabled={scanning} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '10px', borderRadius: '8px', border: 'none',
            background: scanning ? `${accentC}88` : accentC,
            color: '#fff', fontWeight: 700, fontSize: '13px', cursor: scanning ? 'wait' : 'pointer',
            transition: 'all 0.15s',
          }}>
            {scanning ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            {scanning ? 'Scanning...' : 'Auto-Scan'}
          </button>
          <button onClick={resetFilters} style={{
            padding: '10px 14px', borderRadius: '8px', border: `1px solid ${borderC}`,
            background: cardBg, color: mutedC, cursor: 'pointer', display: 'flex', alignItems: 'center',
          }}>
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* ═══════════ MAIN CONTENT ═══════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{
          padding: '12px 20px', borderBottom: `1px solid ${borderC}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: dark ? '#0b1120' : '#f1f5f9',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setSidebarOpen(p => !p)} style={{
              background: 'none', border: `1px solid ${borderC}`, borderRadius: '6px',
              padding: '6px 8px', cursor: 'pointer', color: mutedC, display: 'flex', alignItems: 'center',
            }}>
              <Filter size={14} />
            </button>
            <span style={{ fontWeight: 700, fontSize: '16px' }}>
              <Sparkles size={16} style={{ display: 'inline', marginRight: '6px', color: accentC }} />
              {isCrypto ? 'Crypto' : 'Stock'} Technical Screener
            </span>
            {!isCrypto && (
              <span style={{
                fontSize: '10px', padding: '2px 8px', borderRadius: '4px',
                background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44',
                fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                Placeholder Data
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: mutedC }}>
            {scanning && (
              <span>Scanning {progress.done}/{progress.total}...</span>
            )}
            {!scanning && results.length > 0 && (
              <span>{results.length} result{results.length !== 1 ? 's' : ''} found</span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {scanning && (
          <div style={{ height: '3px', background: borderC }}>
            <div style={{
              height: '100%', background: accentC, transition: 'width 0.3s',
              width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%',
            }} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: '12px 20px', background: '#ef444420', color: '#ef4444', fontSize: '13px', borderBottom: `1px solid #ef444444` }}>
            Error: {error}
          </div>
        )}

        {/* Results table */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {results.length === 0 && !scanning ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: mutedC, gap: '12px' }}>
              <BarChart3 size={48} strokeWidth={1} />
              <div style={{ fontSize: '15px', fontWeight: 600 }}>
                {isCrypto
                  ? 'Set your filters and click Auto-Scan'
                  : 'Configure filters and scan stocks'}
              </div>
              <div style={{ fontSize: '12px' }}>
                {isCrypto
                  ? 'Fetches klines for the top 50 USDT pairs by volume from Binance'
                  : `Screens ${STOCK_TICKERS.length} predefined stock tickers with placeholder data`}
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: dark ? '#0b1120' : '#f1f5f9', zIndex: 2 }}>
                  {/* action col */}
                  <th style={{ width: '40px', padding: '10px 8px', borderBottom: `1px solid ${borderC}` }} />
                  {columns.map(col => (
                    <th key={col.key}
                      onClick={() => handleSort(col.key)}
                      style={{
                        padding: '10px 8px', textAlign: 'left', cursor: 'pointer',
                        borderBottom: `1px solid ${borderC}`, fontWeight: 600,
                        color: sortCol === col.key ? accentC : mutedC,
                        fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px',
                        width: col.w, whiteSpace: 'nowrap', userSelect: 'none',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        {col.label}
                        {sortCol === col.key && (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((row, idx) => (
                  <tr key={row.symbol} style={{
                    background: idx % 2 === 0 ? 'transparent' : (dark ? '#1e293b22' : '#f8fafc'),
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = dark ? '#1e293b55' : '#e2e8f0'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : (dark ? '#1e293b22' : '#f8fafc'); }}
                  >
                    {/* Eye button */}
                    <td style={{ padding: '8px', textAlign: 'center', borderBottom: `1px solid ${borderC}22` }}>
                      <button onClick={() => openTerminal(row)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: mutedC,
                        padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.color = accentC; }}
                        onMouseLeave={e => { e.currentTarget.style.color = mutedC; }}
                      >
                        <Eye size={15} />
                      </button>
                    </td>

                    {/* Symbol */}
                    <td style={{ padding: '8px', fontWeight: 700, borderBottom: `1px solid ${borderC}22`, color: textC }}>
                      {isCrypto ? (
                        <>
                          {row.symbol.replace('USDT', '')}
                          <span style={{ color: mutedC, fontWeight: 400, fontSize: '11px' }}>/USDT</span>
                        </>
                      ) : (
                        row.symbol
                      )}
                    </td>

                    {/* Price */}
                    <td style={{ padding: '8px', fontFamily: 'monospace', borderBottom: `1px solid ${borderC}22` }}>
                      {isCrypto ? fmtPrice(row.price) : fmtStockPrice(row.price)}
                    </td>

                    {/* 24h % */}
                    <td style={{
                      padding: '8px', fontWeight: 600, fontFamily: 'monospace',
                      color: row.priceChange24h > 0 ? '#22c55e' : row.priceChange24h < 0 ? '#ef4444' : mutedC,
                      borderBottom: `1px solid ${borderC}22`,
                    }}>
                      {fmtPct(row.priceChange24h)}
                    </td>

                    {/* RSI */}
                    <td style={{
                      padding: '8px', fontFamily: 'monospace', fontWeight: 600,
                      color: row.rsi != null ? (row.rsi < 30 ? '#22c55e' : row.rsi > 70 ? '#ef4444' : mutedC) : mutedC,
                      borderBottom: `1px solid ${borderC}22`,
                    }}>
                      {row.rsi != null ? row.rsi.toFixed(1) : '\u2014'}
                    </td>

                    {/* Signal Status */}
                    <td style={{ padding: '8px', borderBottom: `1px solid ${borderC}22` }}>
                      <SignalStatusBadge status={row.signalStatus} />
                    </td>

                    {/* EMA20 Signal */}
                    <td style={{ padding: '8px', borderBottom: `1px solid ${borderC}22` }}>
                      <SignalBadge value={row.ema20Signal} />
                    </td>

                    {/* EMA50 Signal */}
                    <td style={{ padding: '8px', borderBottom: `1px solid ${borderC}22` }}>
                      <SignalBadge value={row.ema50Signal} />
                    </td>

                    {/* EMA Cross */}
                    <td style={{ padding: '8px', borderBottom: `1px solid ${borderC}22` }}>
                      <MACDBadge cross={row.emaCross} />
                    </td>

                    {/* Volume Change */}
                    <td style={{
                      padding: '8px', fontFamily: 'monospace', fontSize: '12px',
                      color: row.volumeChange > 100 ? '#f59e0b' : mutedC,
                      borderBottom: `1px solid ${borderC}22`,
                    }}>
                      {fmtPct(row.volumeChange)}
                    </td>

                    {/* MACD */}
                    <td style={{ padding: '8px', borderBottom: `1px solid ${borderC}22` }}>
                      <MACDBadge cross={row.macdCross} />
                    </td>

                    {/* Volume 24h */}
                    <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '12px', color: mutedC, borderBottom: `1px solid ${borderC}22` }}>
                      {fmtVol(row.quoteVolume)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ═══════════ TERMINAL MODAL ═══════════ */}
      {terminalResult && (
        <Suspense fallback={null}>
          <SymbolTerminalModal
            result={terminalResult}
            onClose={() => setTerminalResult(null)}
          />
        </Suspense>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*                         SUB-COMPONENTS                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

function FilterSection({ label, children, mutedC, borderC, cardBg, enabled, onToggle, accentC }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', color: mutedC, fontWeight: 600, letterSpacing: '0.5px' }}>
          {label}
        </div>
        {onToggle && (
          <button onClick={onToggle} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '0',
            color: enabled ? (accentC || '#3b82f6') : mutedC, display: 'flex', alignItems: 'center',
          }}>
            {enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
          </button>
        )}
      </div>
      <div style={{
        padding: '10px', borderRadius: '8px', border: `1px solid ${borderC}`,
        background: cardBg,
        opacity: onToggle && !enabled ? 0.5 : 1,
        pointerEvents: onToggle && !enabled ? 'none' : 'auto',
        transition: 'opacity 0.15s',
      }}>
        {children}
      </div>
    </div>
  );
}

function SelectFilter({ value, onChange, options, cardBg, borderC, textC }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      width: '100%', padding: '6px 8px', borderRadius: '6px',
      border: `1px solid ${borderC}`, background: cardBg, color: textC,
      fontSize: '12px', cursor: 'pointer', outline: 'none',
    }}>
      {options.map(([val, label]) => (
        <option key={val} value={val}>{label}</option>
      ))}
    </select>
  );
}

function SignalBadge({ value }) {
  if (!value) return <span style={{ color: '#64748b' }}>{'\u2014'}</span>;
  const isAbove = value === 'above';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
      background: isAbove ? '#22c55e18' : '#ef444418',
      color: isAbove ? '#22c55e' : '#ef4444',
      border: `1px solid ${isAbove ? '#22c55e33' : '#ef444433'}`,
    }}>
      {isAbove ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {isAbove ? 'Above' : 'Below'}
    </span>
  );
}

function MACDBadge({ cross }) {
  if (!cross || cross === 'none') return <span style={{ color: '#64748b', fontSize: '11px' }}>Neutral</span>;
  const bull = cross === 'bullish';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
      background: bull ? '#22c55e18' : '#ef444418',
      color: bull ? '#22c55e' : '#ef4444',
      border: `1px solid ${bull ? '#22c55e33' : '#ef444433'}`,
    }}>
      {bull ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {bull ? 'Bullish' : 'Bearish'}
    </span>
  );
}

function SignalStatusBadge({ status }) {
  const config = {
    strong_buy:  { label: 'Strong Buy',  bg: '#22c55e25', color: '#22c55e', border: '#22c55e44' },
    buy:         { label: 'Buy',         bg: '#22c55e15', color: '#4ade80', border: '#4ade8033' },
    neutral:     { label: 'Neutral',     bg: '#64748b15', color: '#94a3b8', border: '#94a3b833' },
    sell:        { label: 'Sell',        bg: '#ef444415', color: '#f87171', border: '#f8717133' },
    strong_sell: { label: 'Strong Sell', bg: '#ef444425', color: '#ef4444', border: '#ef444444' },
  };
  const c = config[status] || config.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      letterSpacing: '0.3px',
    }}>
      {c.label}
    </span>
  );
}
