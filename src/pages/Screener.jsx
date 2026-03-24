import React, { Suspense, lazy, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../components/ThemeContext';
import {
  Search, Loader2, TrendingUp, TrendingDown, Filter, Eye,
  ArrowUpDown, Activity, BarChart3, Zap, ChevronDown, ChevronUp,
  SlidersHorizontal, Play, RotateCcw, Sparkles, ToggleLeft, ToggleRight,
  Coins, LineChart, Save, Download, Bell, BellOff, Clock
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

function calcSMA(closes, period) {
  if (closes.length < period) return [];
  const sma = [];
  for (let i = period - 1; i < closes.length; i++) {
    sma.push(closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
  }
  return sma;
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

  // Compute all MA period signals + values (EMA + SMA)
  const emaSignals = {};
  const emaValues = {};
  const smaValues = {};
  MA_PERIODS.forEach(p => {
    const ema = calcEMA(closes, p);
    if (ema.length > 0) {
      const val = ema[ema.length - 1];
      emaValues[p] = val;
      emaSignals[p] = price > val ? 'above' : 'below';
    }
    const sma = calcSMA(closes, p);
    if (sma.length > 0) smaValues[p] = sma[sma.length - 1];
  });

  // Compute all cross pairs
  const emaCrosses = {};
  CROSS_PAIRS.forEach(([s, l]) => {
    emaCrosses[`${s}_${l}`] = detectEmaCrossover(closes, s, l);
  });

  const ema20Last = emaSignals[21] ? calcEMA(closes, 21).slice(-1)[0] : null;
  const ema50Last = emaSignals[50] ? calcEMA(closes, 50).slice(-1)[0] : null;
  const ema20Signal = emaSignals[21] || null;
  const ema50Signal = emaSignals[50] || null;
  const emaCross = emaCrosses['9_21'];

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
    emaSignals,
    emaValues,
    smaValues,
    emaCrosses,
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
  'BABA', 'CRM', 'ORCL', 'CSCO', 'ADBE', 'QCOM', 'TXN', 'AVGO', 'MU', 'AMAT',
  'GS', 'MS', 'BAC', 'C', 'WFC', 'BLK', 'AXP', 'SCHW', 'USB', 'PNC',
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY', 'HAL',
  'LLY', 'MRK', 'ABBV', 'BMY', 'AMGN', 'GILD', 'REGN', 'BIIB', 'VRTX', 'ZTS',
  'KO', 'PEP', 'MCD', 'SBUX', 'YUM', 'CMG', 'DPZ', 'DKNG', 'WYNN', 'MGM',
  'BA', 'LMT', 'RTX', 'NOC', 'GD', 'HON', 'MMM', 'GE', 'CAT', 'DE',
  'AMZN', 'ETSY', 'SHOP', 'MELI', 'SE', 'CPNG', 'W', 'CHWY', 'EBAY', 'FTCH',
  'UBER', 'LYFT', 'ABNB', 'DASH', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'GM',
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

  const emaSignals = {};
  const emaValues = {};
  const smaValues = {};
  MA_PERIODS.forEach(p => {
    const dir = rng() > 0.45 ? 'above' : 'below';
    emaSignals[p] = dir;
    const factor = dir === 'above' ? (0.85 + rng() * 0.14) : (1.01 + rng() * 0.15);
    emaValues[p] = basePrice * factor;
    smaValues[p] = basePrice * (factor * (0.98 + rng() * 0.04));
  });
  const emaCrosses = {};
  CROSS_PAIRS.forEach(([s, l]) => { emaCrosses[`${s}_${l}`] = rng() > 0.65 ? 'bullish' : rng() > 0.45 ? 'bearish' : 'none'; });

  return {
    symbol: ticker,
    price: Math.round(basePrice * 100) / 100,
    priceChange24h: Math.round(change * 100) / 100,
    rsi: Math.round(rsi * 100) / 100,
    ema20Signal: ema20Sig,
    ema50Signal: ema50Sig,
    emaCross: emaCrossVal,
    emaSignals,
    emaValues,
    smaValues,
    emaCrosses,
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

const MA_PERIODS = [9, 21, 50, 100, 200];
const CROSS_PAIRS = [[9,21],[9,50],[21,50],[50,100],[100,200]];

const DEFAULT_FILTERS = {
  rsiEnabled: false,
  rsiMin: 0,
  rsiMax: 100,
  emaCross: 'any',
  emaCrossEnabled: false,
  crossShort: 9,
  crossLong: 21,
  vsMa: 'any',
  vsMaPeriod: 50,
  maDistEnabled: true,
  maDistPeriod: 'ema_200', // 'ema_N' or 'sma_N'
  maDistMode: 'within',    // 'within' | 'above' | 'below'
  maDistPct: 5,
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
  if (filters.emaCrossEnabled && filters.emaCross !== 'any') {
    const key = `${filters.crossShort}_${filters.crossLong}`;
    if ((ind.emaCrosses?.[key] || 'none') !== filters.emaCross) return false;
  }
  if (filters.vsMa !== 'any') {
    if ((ind.emaSignals?.[filters.vsMaPeriod] || null) !== filters.vsMa) return false;
  }
  if (filters.maDistEnabled) {
    const [type, periodStr] = filters.maDistPeriod.split('_');
    const period = Number(periodStr);
    const maVal = type === 'sma' ? ind.smaValues?.[period] : ind.emaValues?.[period];
    if (maVal != null) {
      // Only apply the distance filter if the MA was computable (enough candles)
      const dist = ((ind.price - maVal) / maVal) * 100;
      const pct = filters.maDistPct;
      if (filters.maDistMode === 'within' && Math.abs(dist) > pct) return false;
      if (filters.maDistMode === 'above' && (dist < 0 || dist > pct)) return false;
      if (filters.maDistMode === 'below' && (dist > 0 || dist < -pct)) return false;
    }
    // if maVal is null → not enough candles for this MA → skip silently
  }
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
/*                     SCREENER UTILITIES                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

async function sendScanAlert(matchedResults, mode) {
  if (!matchedResults.length) return;
  try {
    const cfg = JSON.parse(localStorage.getItem('scanner_telegram_config') || '{}');
    if (!cfg.botToken || !cfg.chatId) return;
    const top = matchedResults.slice(0, 5).map(r =>
      `• <b>${r.symbol}</b> — ${r.signalStatus.replace('_', ' ').toUpperCase()} | RSI ${r.rsi != null ? r.rsi.toFixed(1) : '—'}`
    ).join('\n');
    const text = `🔍 <b>Screener Alert (${mode})</b>\n${matchedResults.length} match${matchedResults.length !== 1 ? 'es' : ''} found\n\n${top}`;
    await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: 'HTML' }),
    });
  } catch {}
}

function exportToCSV(results, isCrypto) {
  if (!results.length) return;
  const headers = ['Symbol', 'Price', '24h%', 'RSI', 'Signal', 'ΔMA21%', 'ΔMA50%', 'ΔMA200%', 'EMA Cross', 'Vol Chg%', 'MACD', 'Volume24h'];
  const rows = results.map(r => [
    r.symbol,
    r.price ?? '',
    r.priceChange24h ?? '',
    r.rsi != null ? r.rsi.toFixed(2) : '',
    r.signalStatus,
    r.dist21 != null ? r.dist21.toFixed(2) : '',
    r.dist50 != null ? r.dist50.toFixed(2) : '',
    r.dist200 != null ? r.dist200.toFixed(2) : '',
    r.emaCross ?? '',
    r.volumeChange ?? '',
    r.macdCross ?? '',
    r.quoteVolume ?? '',
  ]);
  const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `screener_${isCrypto ? 'crypto' : 'stocks'}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*                          MAIN COMPONENT                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

export default function Screener() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const navigate = useNavigate();

  const bg       = dark ? '#0f172a' : '#f8fafc';
  const cardBg   = dark ? '#1e293b' : '#ffffff';
  const borderC  = dark ? '#334155' : '#e2e8f0';
  const textC    = dark ? '#e2e4e8' : '#1e293b';
  const mutedC   = dark ? '#94a3b8' : '#64748b';
  const accentC  = '#3b82f6';

  const [savedFlash, setSavedFlash] = useState(false);
  const saveFlashTimer = useRef(null);
  const [autoScanMins, setAutoScanMins] = useState(0); // 0 = off
  const autoScanTimerRef = useRef(null);

  const loadSaved = () => {
    try { return JSON.parse(localStorage.getItem('screener_settings_v1') || 'null'); } catch { return null; }
  };
  const saved = loadSaved();

  const [mode, setMode] = useState(saved?.mode ?? 'crypto'); // 'crypto' | 'stocks'
  const [filters, setFilters] = useState(saved?.filters ? { ...DEFAULT_FILTERS, ...saved.filters } : { ...DEFAULT_FILTERS });
  const [results, setResults] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [sortCol, setSortCol] = useState('priceChange24h');
  const [sortDir, setSortDir] = useState('desc');
  const [terminalResult, setTerminalResult] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState(null);
  const [symbolSearch, setSymbolSearch] = useState('');
  const [timeframe, setTimeframe] = useState(saved?.timeframe ?? '1h');
  const [dateRange, setDateRange] = useState(saved?.dateRange ?? '1M');
  const [symLimit, setSymLimit] = useState(saved?.symLimit ?? 50); // number of symbols to scan

  // Days per date range label
  const DATE_RANGE_DAYS = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };
  // Candles per day for each timeframe
  const TF_CANDLES_PER_DAY = { '1m': 1440, '5m': 288, '15m': 96, '30m': 48, '1h': 24, '4h': 6, '1d': 1, '1w': 0.143 };
  const TIMEFRAMES = ['1m','5m','15m','1h','4h','1d','1w'];
  const DATE_RANGES = ['1D','1W','1M','3M','6M','1Y'];

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

  /* --- save settings --- */
  const saveSettings = useCallback(() => {
    localStorage.setItem('screener_settings_v1', JSON.stringify({ filters, mode, timeframe, dateRange, symLimit }));
    setSavedFlash(true);
    clearTimeout(saveFlashTimer.current);
    saveFlashTimer.current = setTimeout(() => setSavedFlash(false), 1800);
  }, [filters, mode, timeframe, dateRange]);

  /* --- auto-scan interval --- */
  useEffect(() => {
    if (autoScanTimerRef.current) clearInterval(autoScanTimerRef.current);
    if (autoScanMins > 0) {
      autoScanTimerRef.current = setInterval(() => { runScan(); }, autoScanMins * 60 * 1000);
    }
    return () => { if (autoScanTimerRef.current) clearInterval(autoScanTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScanMins]);

  /* --- scan crypto --- */
  const runCryptoScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setResults([]);
    // Always use the user-selected timeframe as kline interval
    const klineInterval = timeframe;
    // Compute how many candles are needed: days × candles-per-day, capped at 1000
    const days = DATE_RANGE_DAYS[dateRange] || 90;
    const cpd  = TF_CANDLES_PER_DAY[timeframe] || 24;
    const klineLimit = Math.min(1000, Math.max(250, Math.ceil(days * cpd)));
    try {
      const tickerRes = await fetch('https://api.binance.com/api/v3/ticker/24hr');
      if (!tickerRes.ok) throw new Error(`Ticker API error: ${tickerRes.status}`);
      const tickers = await tickerRes.json();

      let usdtTickers = tickers
        .filter(t => t.symbol.endsWith('USDT') && !t.symbol.includes('UP') && !t.symbol.includes('DOWN'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));

      if (symbolSearch.trim()) {
        const q = symbolSearch.trim().toUpperCase().replace('/USDT','').replace('USDT','');
        usdtTickers = usdtTickers.filter(t => t.symbol.startsWith(q));
      } else {
        usdtTickers = usdtTickers.slice(0, symLimit);
      }

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
              `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${klineInterval}&limit=${klineLimit}`
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
      sendScanAlert(filtered, 'crypto');
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }, [filters, timeframe, dateRange, symbolSearch, symLimit]);

  /* --- scan stocks (placeholder) --- */
  const runStockScan = useCallback(() => {
    setScanning(true);
    setError(null);
    setResults([]);
    const stocksToScan = STOCK_TICKERS.slice(0, symLimit);
    setProgress({ done: 0, total: stocksToScan.length });

    // Simulate brief loading for UX
    setTimeout(() => {
      const allResults = stocksToScan.map(t => generateStockPlaceholder(t));
      setProgress({ done: stocksToScan.length, total: stocksToScan.length });
      const filtered = allResults.filter(r => matchesFilters(r, filters));
      setResults(filtered);
      sendScanAlert(filtered, 'stocks');
      setScanning(false);
    }, 600);
  }, [filters, symLimit]);

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
    { key: 'dist21',        label: 'Δ MA21',      w: '75px'  },
    { key: 'dist50',        label: 'Δ MA50',      w: '75px'  },
    { key: 'dist200',       label: 'Δ MA200',     w: '75px'  },
    { key: 'emaCross',      label: 'EMA Cross',   w: '90px'  },
    { key: 'volumeChange',  label: 'Vol Chg %',   w: '90px'  },
    { key: 'macdCross',     label: 'MACD',        w: '85px'  },
    { key: 'quoteVolume',   label: 'Volume 24h',  w: '100px' },
  ];

  // Pre-compute distances for sorting/display
  const sortedResultsWithDist = useMemo(() => {
    return sortedResults.map(row => ({
      ...row,
      dist21:  row.emaValues?.[21]  ? ((row.price - row.emaValues[21])  / row.emaValues[21])  * 100 : null,
      dist50:  row.emaValues?.[50]  ? ((row.price - row.emaValues[50])  / row.emaValues[50])  * 100 : null,
      dist200: row.emaValues?.[200] ? ((row.price - row.emaValues[200]) / row.emaValues[200]) * 100 : null,
    }));
  }, [sortedResults]);

  const sidebarBg  = dark ? 'hsl(217,33%,7%)'  : '#f1f5f9';
  const topBarBg   = dark ? 'hsl(217,33%,7%)'  : '#f1f5f9';
  const rowHoverBg = dark ? 'hsl(217,33%,14%)' : '#eef2f7';

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', background: bg, color: textC, fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>

      {/* ═══════════ LEFT SIDEBAR ═══════════ */}
      <div style={{
        width: sidebarOpen ? '308px' : '0px',
        minWidth: sidebarOpen ? '308px' : '0px',
        transition: 'all 0.2s ease',
        overflow: 'hidden',
        borderRight: sidebarOpen ? `1px solid ${borderC}` : 'none',
        display: 'flex', flexDirection: 'column',
        background: sidebarBg,
      }}>
        {/* Sidebar header */}
        <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${borderC}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SlidersHorizontal size={15} color={accentC} />
          <span style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.3px' }}>Filters</span>
        </div>

        <div style={{ padding: '14px 14px 0', overflowY: 'auto', flex: 1 }}>

          {/* Mode Toggle */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{
              display: 'flex', borderRadius: '10px', padding: '3px',
              background: dark ? 'hsl(217,33%,12%)' : '#e2e8f0',
              border: `1px solid ${borderC}`,
            }}>
              {[{ id: 'crypto', icon: Coins, label: 'Crypto' }, { id: 'stocks', icon: LineChart, label: 'Stocks' }].map(m => {
                const active = mode === m.id;
                const Icon = m.icon;
                return (
                  <button key={m.id} onClick={() => switchMode(m.id)} style={{
                    flex: 1, padding: '7px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                    fontSize: '12px', fontWeight: 600, transition: 'all 0.15s',
                    background: active ? (dark ? accentC : '#fff') : 'transparent',
                    color: active ? (dark ? '#fff' : accentC) : mutedC,
                    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.25)' : 'none',
                  }}>
                    <Icon size={13} /> {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Symbol Search */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', color: mutedC, marginBottom: '5px', fontWeight: 700, letterSpacing: '0.7px' }}>
              {isCrypto ? 'Symbol (USDT pairs)' : 'Stock Symbol'}
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: mutedC, pointerEvents: 'none' }} />
              <input
                type="text"
                value={symbolSearch}
                onChange={e => setSymbolSearch(e.target.value)}
                placeholder={isCrypto ? 'e.g. BTC, ETH…' : 'e.g. AAPL, TSLA…'}
                style={{
                  width: '100%', padding: '7px 9px 7px 28px', borderRadius: '7px',
                  border: `1px solid ${borderC}`, background: cardBg, color: textC,
                  fontSize: '12px', outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => { e.target.style.borderColor = accentC; }}
                onBlur={e => { e.target.style.borderColor = borderC; }}
              />
            </div>
          </div>

          {/* Symbol Count */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', color: mutedC, fontWeight: 700, letterSpacing: '0.7px' }}>
                {isCrypto ? 'Symbols to Scan' : 'Stocks to Scan'}
              </div>
              <span style={{ fontSize: '11px', color: accentC, fontWeight: 700 }}>Top {symLimit}</span>
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {(isCrypto ? [25, 50, 100, 200] : [10, 25, 50, 100]).map(n => (
                <button key={n} onClick={() => setSymLimit(n)} style={{
                  flex: 1, padding: '4px 0', borderRadius: '6px',
                  border: `1px solid ${symLimit === n ? accentC + '88' : borderC}`,
                  background: symLimit === n ? `${accentC}18` : 'transparent',
                  color: symLimit === n ? accentC : mutedC,
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
                }}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Timeframe */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', color: mutedC, marginBottom: '5px', fontWeight: 700, letterSpacing: '0.7px' }}>Timeframe</div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {TIMEFRAMES.map(tf => (
                <button key={tf} onClick={() => setTimeframe(tf)} style={{
                  padding: '4px 9px', borderRadius: '6px', border: `1px solid ${timeframe === tf ? accentC + '88' : borderC}`,
                  background: timeframe === tf ? `${accentC}18` : 'transparent',
                  color: timeframe === tf ? accentC : mutedC,
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
                }}>
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', color: mutedC, marginBottom: '5px', fontWeight: 700, letterSpacing: '0.7px' }}>Date Range</div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {DATE_RANGES.map(r => (
                <button key={r} onClick={() => setDateRange(r)} style={{
                  flex: 1, padding: '4px 0', borderRadius: '6px', border: `1px solid ${dateRange === r ? accentC + '88' : borderC}`,
                  background: dateRange === r ? `${accentC}18` : 'transparent',
                  color: dateRange === r ? accentC : mutedC,
                  fontSize: '10px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
                }}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: borderC, marginBottom: '14px' }} />

          {/* Presets */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', color: mutedC, marginBottom: '7px', fontWeight: 700, letterSpacing: '0.8px' }}>Presets</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
              {PRESETS.map(p => {
                const Icon = p.icon;
                return (
                  <button key={p.id} onClick={() => applyPreset(p)} style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '7px 9px', borderRadius: '8px',
                    border: `1px solid ${p.color}30`,
                    background: `${p.color}12`, color: p.color,
                    fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${p.color}28`; e.currentTarget.style.borderColor = `${p.color}55`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = `${p.color}12`; e.currentTarget.style.borderColor = `${p.color}30`; }}
                  >
                    <Icon size={12} /> {p.label}
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
            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
              {[
                { label: 'Oversold <30', fn: () => { setFilter('rsiEnabled', true); setFilter('rsiMin', 0); setFilter('rsiMax', 30); } },
                { label: 'Overbought >70', fn: () => { setFilter('rsiEnabled', true); setFilter('rsiMin', 70); setFilter('rsiMax', 100); } },
                { label: 'Custom', fn: () => { setFilter('rsiEnabled', true); } },
              ].map(btn => (
                <button key={btn.label} onClick={btn.fn} style={{
                  padding: '3px 7px', borderRadius: '5px', border: `1px solid ${borderC}`,
                  background: 'transparent', color: mutedC, fontSize: '10px', cursor: 'pointer',
                  transition: 'all 0.1s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.color = textC; e.currentTarget.style.borderColor = accentC; }}
                  onMouseLeave={e => { e.currentTarget.style.color = mutedC; e.currentTarget.style.borderColor = borderC; }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
            {filters.rsiEnabled && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '10px', color: accentC, fontWeight: 600 }}>{filters.rsiMin}</span>
                  <span style={{ fontSize: '10px', color: mutedC }}>RSI range</span>
                  <span style={{ fontSize: '10px', color: accentC, fontWeight: 600 }}>{filters.rsiMax}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input type="range" min={0} max={100} value={filters.rsiMin}
                    onChange={e => setFilter('rsiMin', Number(e.target.value))}
                    style={{ flex: 1, accentColor: accentC }} />
                  <input type="range" min={0} max={100} value={filters.rsiMax}
                    onChange={e => setFilter('rsiMax', Number(e.target.value))}
                    style={{ flex: 1, accentColor: accentC }} />
                </div>
              </div>
            )}
          </FilterSection>

          {/* Price Change 24h */}
          <FilterSection label="Price Change 24h" mutedC={mutedC} borderC={borderC} cardBg={cardBg}>
            <SelectFilter value={filters.priceChangePreset}
              onChange={v => setFilter('priceChangePreset', v)}
              options={[['any','Any'],['gt5','> +5%'],['gt10','> +10%'],['lt-5','< −5%'],['lt-10','< −10%']]}
              cardBg={cardBg} borderC={borderC} textC={textC} accentC={accentC} dark={dark} />
          </FilterSection>

          {/* Min Volume */}
          <FilterSection label={isCrypto ? 'Min Volume (USDT)' : 'Min Volume ($)'} mutedC={mutedC} borderC={borderC} cardBg={cardBg}>
            <input type="range" min={0} max={isCrypto ? 500000000 : 5000000000} step={isCrypto ? 5000000 : 50000000}
              value={filters.minVolume}
              onChange={e => setFilter('minVolume', Number(e.target.value))}
              style={{ width: '100%', accentColor: accentC }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
              <span style={{ fontSize: '10px', color: mutedC }}>Any</span>
              <span style={{ fontSize: '10px', color: filters.minVolume > 0 ? accentC : mutedC, fontWeight: 600 }}>
                {filters.minVolume > 0 ? fmtVol(filters.minVolume) : '—'}
              </span>
            </div>
          </FilterSection>

          {/* MA Distance */}
          <FilterSection label="MA Distance %" mutedC={mutedC} borderC={borderC} cardBg={cardBg}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
              <select value={filters.maDistPeriod} onChange={e => setFilter('maDistPeriod', e.target.value)} style={{
                flex: 1, background: cardBg, border: `1px solid ${borderC}`, borderRadius: '6px',
                color: textC, padding: '5px 8px', fontSize: '11px',
              }}>
                {['ema_9','ema_21','ema_50','ema_100','ema_200'].map(v => (
                  <option key={v} value={v}>{v.replace('_',' ').toUpperCase()}</option>
                ))}
                {['sma_9','sma_21','sma_50','sma_100','sma_200'].map(v => (
                  <option key={v} value={v}>{v.replace('_',' ').toUpperCase()}</option>
                ))}
              </select>
              <SelectFilter value={filters.maDistMode} onChange={v => setFilter('maDistMode', v)}
                options={[['within','Within'],['above','Above'],['below','Below']]}
                cardBg={cardBg} borderC={borderC} textC={textC} accentC={accentC} dark={dark} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="range" min={0} max={30} step={0.5}
                value={filters.maDistPct}
                onChange={e => setFilter('maDistPct', Number(e.target.value))}
                style={{ flex: 1, accentColor: accentC }} />
              <span style={{ fontSize: '11px', color: accentC, minWidth: '32px', textAlign: 'right' }}>
                {filters.maDistPct}%
              </span>
            </div>
          </FilterSection>

          {/* MA Crossover */}
          <FilterSection label="MA Crossover" mutedC={mutedC} borderC={borderC} cardBg={cardBg}
            enabled={filters.emaCrossEnabled}
            onToggle={() => setFilter('emaCrossEnabled', !filters.emaCrossEnabled)}>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <SelectFilter value={String(filters.crossShort)} onChange={v => setFilter('crossShort', Number(v))}
                options={MA_PERIODS.map(p => [String(p), `MA ${p}`])}
                cardBg={cardBg} borderC={borderC} textC={textC} accentC={accentC} dark={dark} />
              <span style={{ color: mutedC, fontSize: '11px', flexShrink: 0 }}>×</span>
              <SelectFilter value={String(filters.crossLong)} onChange={v => setFilter('crossLong', Number(v))}
                options={MA_PERIODS.map(p => [String(p), `MA ${p}`])}
                cardBg={cardBg} borderC={borderC} textC={textC} accentC={accentC} dark={dark} />
            </div>
            <div style={{ marginTop: '6px' }}>
              <SelectFilter value={filters.emaCross} onChange={v => setFilter('emaCross', v)}
                options={[['any','Any Direction'],['bullish','Bullish Cross ↑'],['bearish','Bearish Cross ↓']]}
                cardBg={cardBg} borderC={borderC} textC={textC} accentC={accentC} dark={dark} />
            </div>
          </FilterSection>


          {/* Volume Change */}
          <FilterSection label="Volume Spike" mutedC={mutedC} borderC={borderC} cardBg={cardBg}>
            <SelectFilter value={filters.volumeChangeMin == null ? 'any' : String(filters.volumeChangeMin)}
              onChange={v => setFilter('volumeChangeMin', v === 'any' ? null : Number(v))}
              options={[['any','Any'],['50','> 50%'],['100','> 100%'],['200','> 200%']]}
              cardBg={cardBg} borderC={borderC} textC={textC} accentC={accentC} dark={dark} />
          </FilterSection>

          {/* MACD */}
          <FilterSection label="MACD Signal" mutedC={mutedC} borderC={borderC} cardBg={cardBg}>
            <SelectFilter value={filters.macd} onChange={v => setFilter('macd', v)}
              options={[['any','Any'],['bullish','Bullish Cross'],['bearish','Bearish Cross']]}
              cardBg={cardBg} borderC={borderC} textC={textC} accentC={accentC} dark={dark} />
          </FilterSection>

          <div style={{ height: '80px' }} />
        </div>

        {/* Scan + Reset buttons */}
        <div style={{ padding: '12px 14px', borderTop: `1px solid ${borderC}`, display: 'flex', gap: '7px', background: sidebarBg }}>
          <button onClick={runScan} disabled={scanning} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '10px', borderRadius: '9px', border: 'none',
            background: scanning
              ? `${accentC}77`
              : 'linear-gradient(135deg, #3b82f6, #6366f1)',
            color: '#fff', fontWeight: 700, fontSize: '13px',
            cursor: scanning ? 'wait' : 'pointer',
            transition: 'opacity 0.15s',
            boxShadow: scanning ? 'none' : '0 2px 12px rgba(99,102,241,0.35)',
          }}>
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            {scanning ? `${progress.done}/${progress.total}` : 'Auto-Scan'}
          </button>
          <button onClick={resetFilters} title="Reset filters" style={{
            padding: '10px 13px', borderRadius: '9px', border: `1px solid ${borderC}`,
            background: 'transparent', color: mutedC, cursor: 'pointer',
            display: 'flex', alignItems: 'center', transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = textC; e.currentTarget.style.borderColor = accentC; }}
            onMouseLeave={e => { e.currentTarget.style.color = mutedC; e.currentTarget.style.borderColor = borderC; }}
          >
            <RotateCcw size={13} />
          </button>
          <button onClick={saveSettings} title="Save settings" style={{
            padding: '10px 13px', borderRadius: '9px', border: `1px solid ${savedFlash ? '#22c55e' : borderC}`,
            background: savedFlash ? 'rgba(34,197,94,0.12)' : 'transparent',
            color: savedFlash ? '#22c55e' : mutedC, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, transition: 'all 0.15s',
          }}
            onMouseEnter={e => { if (!savedFlash) { e.currentTarget.style.color = '#22c55e'; e.currentTarget.style.borderColor = '#22c55e'; } }}
            onMouseLeave={e => { if (!savedFlash) { e.currentTarget.style.color = mutedC; e.currentTarget.style.borderColor = borderC; } }}
          >
            <Save size={13} />
            {savedFlash ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      {/* ═══════════ MAIN CONTENT ═══════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{
          padding: '10px 18px', borderBottom: `1px solid ${borderC}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: topBarBg,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={() => setSidebarOpen(p => !p)} title="Toggle filters" style={{
              background: sidebarOpen ? `${accentC}18` : 'transparent',
              border: `1px solid ${sidebarOpen ? accentC + '44' : borderC}`,
              borderRadius: '7px', padding: '5px 7px', cursor: 'pointer',
              color: sidebarOpen ? accentC : mutedC, display: 'flex', alignItems: 'center',
              transition: 'all 0.15s',
            }}>
              <Filter size={13} />
            </button>
            {/* Active scan config info */}
            <span style={{
              fontSize: '10px', padding: '2px 8px', borderRadius: '20px',
              background: dark ? 'hsl(217,33%,14%)' : '#e2e8f0', color: mutedC,
              border: `1px solid ${borderC}`, fontWeight: 600, letterSpacing: '0.3px',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {timeframe.toUpperCase()} · {dateRange} · Top {symLimit}
              {isCrypto && (() => {
                const days = DATE_RANGE_DAYS[dateRange] || 90;
                const cpd  = TF_CANDLES_PER_DAY[timeframe] || 24;
                const cnt  = Math.min(1000, Math.max(250, Math.ceil(days * cpd)));
                return <span style={{ color: accentC }}>({cnt} candles)</span>;
              })()}
            </span>
            {!isCrypto && (
              <span style={{
                fontSize: '10px', padding: '2px 7px', borderRadius: '20px',
                background: '#f59e0b18', color: '#f59e0b',
                border: '1px solid #f59e0b33', fontWeight: 600, letterSpacing: '0.4px',
              }}>
                DEMO
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            {scanning && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: accentC, fontWeight: 500 }}>
                <Loader2 size={12} className="animate-spin" />
                Scanning {progress.done}/{progress.total}
              </span>
            )}
            {!scanning && results.length > 0 && (
              <span style={{
                padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                background: `${accentC}18`, color: accentC, border: `1px solid ${accentC}33`,
              }}>
                {results.length} result{results.length !== 1 ? 's' : ''}
              </span>
            )}
            {/* CSV Export */}
            {results.length > 0 && !scanning && (
              <button
                onClick={() => exportToCSV(sortedResultsWithDist, isCrypto)}
                title="Export to CSV"
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 9px', borderRadius: '7px',
                  border: `1px solid ${borderC}`, background: 'transparent',
                  color: mutedC, cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#22c55e'; e.currentTarget.style.borderColor = '#22c55e'; }}
                onMouseLeave={e => { e.currentTarget.style.color = mutedC; e.currentTarget.style.borderColor = borderC; }}
              >
                <Download size={12} /> CSV
              </button>
            )}
            {/* Auto-scan interval */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} style={{ color: autoScanMins > 0 ? '#f59e0b' : mutedC }} />
              <select
                value={autoScanMins}
                onChange={e => setAutoScanMins(Number(e.target.value))}
                title="Auto-scan interval"
                style={{
                  padding: '3px 6px', borderRadius: '6px',
                  border: `1px solid ${autoScanMins > 0 ? '#f59e0b55' : borderC}`,
                  background: autoScanMins > 0 ? '#f59e0b12' : (dark ? 'hsl(217,33%,10%)' : '#f1f5f9'),
                  color: autoScanMins > 0 ? '#f59e0b' : mutedC,
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer', outline: 'none',
                }}
              >
                <option value={0}>Off</option>
                <option value={5}>5 min</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>1 hr</option>
              </select>
              {autoScanMins > 0 && (
                <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 600 }}>AUTO</span>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {scanning && (
          <div style={{ height: '2px', background: dark ? 'hsl(217,33%,14%)' : '#e2e8f0' }}>
            <div style={{
              height: '100%',
              background: 'linear-gradient(90deg, #3b82f6, #6366f1)',
              transition: 'width 0.3s',
              width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : '0%',
            }} />
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 18px', fontSize: '12px', fontWeight: 500,
            background: '#ef444415', color: '#ef4444',
            borderBottom: `1px solid #ef444430`,
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <span style={{ fontWeight: 700 }}>Error:</span> {error}
          </div>
        )}

        {/* Results table */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {results.length === 0 && !scanning ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', color: mutedC, gap: '10px',
            }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '16px',
                background: dark ? 'hsl(217,33%,12%)' : '#e2e8f0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${borderC}`,
              }}>
                <BarChart3 size={28} strokeWidth={1.5} color={mutedC} />
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: textC }}>
                {isCrypto ? 'Set filters and run Auto-Scan' : 'Configure filters and scan stocks'}
              </div>
              <div style={{ fontSize: '12px', color: mutedC, maxWidth: '320px', textAlign: 'center', lineHeight: 1.5 }}>
                {isCrypto
                  ? 'Scans top 50 USDT pairs by volume via Binance API with live kline data'
                  : `Screens ${STOCK_TICKERS.length} tickers using technical indicator simulation`}
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: topBarBg, zIndex: 2 }}>
                  <th style={{ width: '36px', padding: '9px 8px', borderBottom: `1px solid ${borderC}` }} />
                  {columns.map(col => (
                    <th key={col.key} onClick={() => handleSort(col.key)} style={{
                      padding: '9px 10px', textAlign: 'left', cursor: 'pointer',
                      borderBottom: `1px solid ${borderC}`, fontWeight: 600,
                      color: sortCol === col.key ? accentC : mutedC,
                      fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.7px',
                      width: col.w, whiteSpace: 'nowrap', userSelect: 'none',
                    }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        {col.label}
                        {sortCol === col.key
                          ? (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)
                          : <ArrowUpDown size={9} style={{ opacity: 0.3 }} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedResultsWithDist.map((row, idx) => (
                  <tr key={row.symbol}
                    style={{ transition: 'background 0.1s', borderBottom: `1px solid ${borderC}22` }}
                    onMouseEnter={e => { e.currentTarget.style.background = rowHoverBg; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    {/* Eye button */}
                    <td style={{ padding: '7px 6px 7px 10px', textAlign: 'center' }}>
                      <button onClick={() => openTerminal(row)} style={{
                        background: 'none', border: 'none', cursor: 'pointer', color: mutedC,
                        padding: '4px', borderRadius: '5px', display: 'flex', alignItems: 'center',
                        transition: 'color 0.1s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.color = accentC; }}
                        onMouseLeave={e => { e.currentTarget.style.color = mutedC; }}
                      >
                        <Eye size={14} />
                      </button>
                    </td>

                    {/* Symbol */}
                    <td style={{ padding: '7px 10px', fontWeight: 700, fontSize: '13px', color: textC }}>
                      {isCrypto ? (
                        <span>
                          {row.symbol.replace('USDT', '')}
                          <span style={{ color: mutedC, fontWeight: 400, fontSize: '10px' }}>/USDT</span>
                        </span>
                      ) : row.symbol}
                    </td>

                    {/* Price */}
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: '12px', color: textC }}>
                      {isCrypto ? fmtPrice(row.price) : fmtStockPrice(row.price)}
                    </td>

                    {/* 24h % */}
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 600 }}>
                      <span style={{
                        color: row.priceChange24h > 0 ? '#22c55e' : row.priceChange24h < 0 ? '#ef4444' : mutedC,
                      }}>
                        {fmtPct(row.priceChange24h)}
                      </span>
                    </td>

                    {/* RSI */}
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 600 }}>
                      <span style={{
                        color: row.rsi != null
                          ? (row.rsi < 30 ? '#22c55e' : row.rsi > 70 ? '#ef4444' : mutedC)
                          : mutedC,
                      }}>
                        {row.rsi != null ? row.rsi.toFixed(1) : '—'}
                      </span>
                    </td>

                    {/* Signal Status */}
                    <td style={{ padding: '7px 10px' }}>
                      <SignalStatusBadge status={row.signalStatus} />
                    </td>

                    {/* Δ MA21 */}
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: '11px', fontWeight: 600 }}>
                      <DistBadge val={row.dist21} />
                    </td>
                    {/* Δ MA50 */}
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: '11px', fontWeight: 600 }}>
                      <DistBadge val={row.dist50} />
                    </td>
                    {/* Δ MA200 */}
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: '11px', fontWeight: 600 }}>
                      <DistBadge val={row.dist200} />
                    </td>

                    {/* EMA Cross */}
                    <td style={{ padding: '7px 10px' }}><MACDBadge cross={row.emaCross} /></td>

                    {/* Volume Change */}
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: '11px' }}>
                      <span style={{ color: row.volumeChange > 100 ? '#f59e0b' : mutedC }}>
                        {fmtPct(row.volumeChange)}
                      </span>
                    </td>

                    {/* MACD */}
                    <td style={{ padding: '7px 10px' }}><MACDBadge cross={row.macdCross} /></td>

                    {/* Volume 24h */}
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: '11px', color: mutedC }}>
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
    <div style={{ marginBottom: '13px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
        <div style={{ fontSize: '10px', textTransform: 'uppercase', color: mutedC, fontWeight: 700, letterSpacing: '0.7px' }}>
          {label}
        </div>
        {onToggle && (
          <button onClick={onToggle} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '0',
            color: enabled ? (accentC || '#3b82f6') : mutedC, display: 'flex', alignItems: 'center',
            transition: 'color 0.15s',
          }}>
            {enabled ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
          </button>
        )}
      </div>
      <div style={{
        opacity: onToggle && !enabled ? 0.4 : 1,
        pointerEvents: onToggle && !enabled ? 'none' : 'auto',
        transition: 'opacity 0.15s',
      }}>
        {children}
      </div>
    </div>
  );
}

function SelectFilter({ value, onChange, options, cardBg, borderC, textC, accentC, dark }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      width: '100%', padding: '6px 9px', borderRadius: '7px',
      border: `1px solid ${borderC}`, background: cardBg, color: textC,
      fontSize: '12px', cursor: 'pointer', outline: 'none',
      appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
      paddingRight: '28px',
    }}>
      {options.map(([val, label]) => (
        <option key={val} value={val}>{label}</option>
      ))}
    </select>
  );
}

function SignalBadge({ value }) {
  if (!value) return <span style={{ color: '#475569', fontSize: '11px' }}>—</span>;
  const isAbove = value === 'above';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
      background: isAbove ? '#22c55e15' : '#ef444415',
      color: isAbove ? '#4ade80' : '#f87171',
      border: `1px solid ${isAbove ? '#22c55e30' : '#ef444430'}`,
    }}>
      {isAbove ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {isAbove ? 'Above' : 'Below'}
    </span>
  );
}

function MACDBadge({ cross }) {
  if (!cross || cross === 'none') return <span style={{ color: '#475569', fontSize: '11px' }}>—</span>;
  const bull = cross === 'bullish';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
      background: bull ? '#22c55e15' : '#ef444415',
      color: bull ? '#4ade80' : '#f87171',
      border: `1px solid ${bull ? '#22c55e30' : '#ef444430'}`,
    }}>
      {bull ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {bull ? 'Bullish' : 'Bearish'}
    </span>
  );
}

function SignalStatusBadge({ status }) {
  const config = {
    strong_buy:  { label: 'Strong Buy',  bg: '#22c55e22', color: '#4ade80', border: '#22c55e40', dot: '#22c55e' },
    buy:         { label: 'Buy',         bg: '#22c55e12', color: '#86efac', border: '#22c55e28', dot: '#4ade80' },
    neutral:     { label: 'Neutral',     bg: '#64748b12', color: '#94a3b8', border: '#64748b28', dot: '#64748b' },
    sell:        { label: 'Sell',        bg: '#ef444412', color: '#fca5a5', border: '#ef444428', dot: '#f87171' },
    strong_sell: { label: 'Strong Sell', bg: '#ef444422', color: '#f87171', border: '#ef444440', dot: '#ef4444' },
  };
  const c = config[status] || config.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {c.label}
    </span>
  );
}

function DistBadge({ val }) {
  if (val == null) return <span style={{ color: '#475569' }}>—</span>;
  const pct = Math.round(val * 100) / 100;
  const abs = Math.abs(pct);
  const bull = pct >= 0;
  const intense = abs > 10;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
      background: bull ? (intense ? '#22c55e25' : '#22c55e12') : (intense ? '#ef444425' : '#ef444412'),
      color: bull ? '#4ade80' : '#f87171',
      border: `1px solid ${bull ? '#22c55e30' : '#ef444430'}`,
    }}>
      {bull ? '+' : ''}{pct.toFixed(2)}%
    </span>
  );
}
