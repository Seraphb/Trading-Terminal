import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTheme } from '@/components/ThemeContext';
import { computePumpScore, THRESHOLDS } from '@/utils/pumpDetector';
import { ArrowUp, ArrowDown, Zap, Target, RefreshCw, Eye, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

// ── Symbol pools ─────────────────────────────────────────────────────────────
const CRYPTO_SYMBOLS = [
  'PEPEUSDT', 'BONKUSDT', 'FLOKIUSDT', 'SHIBUSDT', 'DOGEUSDT',
  'WIFUSDT', 'POPCATUSDT', 'BRETTUSDT', 'NEIROUSDT', 'GOATUSDT',
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'AVAXUSDT', 'LINKUSDT', 'SUIUSDT', 'DOGSUSDT', 'CATIUSDT',
  'TRXUSDT', 'ADAUSDT', 'NEARUSDT', 'FILUSDT', 'ARBUSDT',
  'OPUSDT', 'APTUSDT', 'SEIUSDT', 'RENDERUSDT', 'INJUSDT',
  'PEOPLEUSDT', 'RUNEUSDT', 'TIAUSDT', 'STXUSDT', 'FETUSDT',
  'AAVEUSDT', 'GRTUSDT', 'IMXUSDT', 'ATOMUSDT', 'LDOUSDT',
  'MKRUSDT', 'CRVUSDT', 'SANDUSDT', 'MANAUSDT', 'AXSUSDT',
  'GALAUSDT', 'FTMUSDT', 'ALGOUSDT', 'ICPUSDT', 'EOSUSDT',
  'DOTUSDT', 'MATICUSDT', 'UNIUSDT', 'ETCUSDT', 'XLMUSDT',
  'LTCUSDT', 'BCHUSDT', 'ETCUSDT', 'VETUSDT', 'FILUSDT',
  'THETAUSDT', 'EOSUSDT', 'AXSUSDT', 'SANDUSDT', 'MANAUSDT',
  'ICPUSDT', 'FILUSDT', 'VETUSDT', 'TRXUSDT', 'EOSUSDT',
  'ARBUSDT', 'OPUSDT', 'APTUSDT', 'SUIUSDT', 'SEIUSDT',
  'TIAUSDT', 'ORDIUSDT', 'BONKUSDT', 'PEPEUSDT', 'FLOKIUSDT',
  'WLDUSDT', 'PENDLEUSDT', 'STXUSDT', 'INJUSDT', 'TIAUSDT',
  'PYTHUSDT', 'JUPUSDT', 'WIFUSDT', 'BOMEUSDT', 'ENAUSDT',
  'WUSDT', 'NOTUSDT', 'IOUSDT', 'ZKUSDT', 'ZROUSDT',
  'GUSDT', 'BANANAUSDT', 'TONUSDT', 'DOGSUSDT', 'NEIROUSDT',
  'HMSTRUSDT', 'CATIUSDT', 'SCRUSDT', 'ACTUSDT', 'ACXUSDT',
  'MOVEUSDT', 'VIRTUALUSDT', 'SPXUSDT', 'MOODENGUSDT', 'PNUTUSDT',
  'GOATUSDT', 'USUALUSDT', 'PENGUUSDT', 'HYPEUSDT', 'AIXBTUSDT',
  'TRUMPUSDT', 'MELANIAUSDT', 'BERAUSDT', 'ONDOUSDT', 'POLUSDT',
  'LDOUSDT', 'ENSUSDT', 'GALAUSDT', 'ROSEUSDT', 'DUSKUSDT',
  'ALPACAUSDT', 'STRKUSDT', 'MAVUSDT', 'ARKMUSDT', 'AGLDUSDT',
  'YGGUSDT', 'DYMUSDT', 'PIXELUSDT', 'ALTUSDT', 'JUPUSDT',
  'AEVOUSDT', 'METISUSDT', 'RIFUSDT', 'BANDUSDT', 'GFTUSDT',
  'OMNIUSDT', 'KAVAUSDT', 'RADUSDT', 'CVCUSDT', 'BELUSDT',
  'WOOUSDT', 'ICXUSDT', 'NKNUSDT', 'DENTUSDT', 'KEYUSDT',
  'STORJUSDT', 'RLCUSDT', 'BATUSDT', 'ZRXUSDT', 'REPUSDT',
  'CHZUSDT', 'CELRUSDT', 'HOTUSDT', 'WINUSDT', 'BTTUSDT',
  'OGNUSDT', 'PERPUSDT', 'FORUSDT', 'DODOUSDT', 'REEFUSDT',
  'OGUSDT', 'SFPUSDT', 'DREPUSDT', 'MDTUSDT', 'QUICKUSDT',
];

const STOCK_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA',
  'META', 'TSLA', 'BRK.B', 'JPM', 'V',
  'PLTR', 'COIN', 'MSTR', 'SOFI', 'AMD',
  'NFLX', 'DIS', 'BA', 'PYPL', 'UBER',
  'NIO', 'RIVN', 'LCID', 'F', 'GM',
  'BABA', 'PDD', 'SNAP', 'PINS', 'SQ',
  'SHOP', 'ROKU', 'RBLX', 'HOOD', 'AFRM',
  'PLUG', 'ENPH', 'SEDG', 'SPY', 'QQQ',
  'IWM', 'DIA', 'XLE', 'ARKK', 'INTC',
  'LYFT', 'ABNB', 'DASH', 'MRVL', 'CRWD',
  'PANW', 'SNOW', 'NET', 'DDOG', 'ZS',
  'MDB', 'TEAM', 'WDAY', 'NOW', 'CRM',
  'ORCL', 'IBM', 'CSCO', 'QCOM', 'AVGO',
  'MU', 'AMAT', 'LRCX', 'KLAC', 'ASML',
  'TSM', 'UMC', 'ASX', 'ON', 'NXPI',
  'ADI', 'TXN', 'MCHP', 'MRVL', 'SWKS',
  'JNJ', 'UNH', 'PFE', 'MRK', 'ABBV',
  'LLY', 'BMY', 'AMGN', 'GILD', 'REGN',
  'VRTX', 'BIIB', 'ZTS', 'ISRG', 'DXCM',
  'ELV', 'CI', 'HUM', 'CVS', 'WBA',
  'XOM', 'CVX', 'COP', 'SLB', 'EOG',
  'MPC', 'PSX', 'VLO', 'OXY', 'HAL',
  'JPM', 'BAC', 'WFC', 'C', 'GS',
  'MS', 'AXP', 'USB', 'PNC', 'TFC',
  'BLK', 'SCHW', 'SPGI', 'MCO', 'ICE',
  'KO', 'PEP', 'MCD', 'SBUX', 'COST',
  'WMT', 'TGT', 'HD', 'LOW', 'NKE',
  'T', 'VZ', 'TMUS', 'CMCSA', 'CHTR',
  'AMT', 'PLD', 'AMT', 'CCI', 'EQIX',
  'GLD', 'SLV', 'TLT', 'HYG', 'LQD',
  'XLF', 'XLK', 'XLV', 'XLI', 'XLP',
  'XLY', 'XLU', 'XLB', 'XLRE', 'XLC',
  'IEMG', 'EEM', 'FXI', 'EWJ', 'EWZ',
];

const TIMEFRAMES = ['15m', '1h', '4h', '1d', '1w'];

const HISTORY_TARGETS = {
  '15m': { rest: '15m', limit: 672 },
  '1h':  { rest: '1h',  limit: 500 },
  '4h':  { rest: '4h',  limit: 500 },
  '1d':  { rest: '1d',  limit: 365 },
  '1w':  { rest: '1wk', limit: 260 },
};

const KLINE_LIMIT = 500; // enough for all indicators

// ════════════════════════════════════════════════════════════════════════════
// Data fetchers with timeouts
// ════════════════════════════════════════════════════════════════════════════

function fetchWithTimeout(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeout);
    fetch(url).then(res => { clearTimeout(timer); resolve(res); }).catch(err => { clearTimeout(timer); reject(err); });
  });
}

async function fetchCryptoKlines(symbol, interval) {
  const { rest, limit } = HISTORY_TARGETS[interval] || HISTORY_TARGETS['1h'];
  try {
    const res = await fetchWithTimeout(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${rest}&limit=${Math.min(limit, KLINE_LIMIT)}`,
      8000
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 40) return null;
    return data.map(k => ({
      time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
    }));
  } catch { return null; }
}

async function fetchCryptoOI(symbol, interval) {
  const oiMap = { '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1d' };
  const oi = oiMap[interval] || '1h';
  try {
    const res = await fetchWithTimeout(
      `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=${oi}&limit=50`,
      6000
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map(d => ({ time: d.timestamp, oi: +d.sumOpenInterest, oiValue: +d.sumOpenInterestValue }));
  } catch { return []; }
}

async function fetchCryptoFunding(symbol) {
  try {
    const res = await fetchWithTimeout(
      `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=60`,
      6000
    );
    if (!res.ok) return [];
    const raw = await res.json();
    if (!Array.isArray(raw)) return [];
    return raw.map(d => ({ time: d.fundingTime, rate: +d.fundingRate }));
  } catch { return []; }
}

async function fetchCryptoPrices() {
  // Fetch ALL 24h tickers in one call (like screener does)
  try {
    const res = await fetchWithTimeout('https://api.binance.com/api/v3/ticker/24hr', 8000);
    if (!res.ok) return {};
    const data = await res.json();
    const map = {};
    for (const t of data) {
      if (t.symbol && t.symbol.endsWith('USDT')) {
        map[t.symbol] = {
          price: +t.lastPrice,
          change: +t.priceChangePercent,
          volume: +t.volume,
        };
      }
    }
    return map;
  } catch { return {}; }
}

// Stock data via our Vite proxy
async function fetchStockKlines(symbol) {
  try {
    const res = await fetch(`/api/stocks/history?symbol=${symbol}&interval=1d&range=1y&bars=300`);
    if (!res.ok) return null;
    const payload = await res.json();
    const candles = Array.isArray(payload?.candles) ? payload.candles : null;
    return candles && candles.length >= 40 ? candles : null;
  } catch { return null; }
}

async function fetchStockPrices(symbols) {
  try {
    const res = await fetch(`/api/stocks/quotes?symbols=${symbols.join(',')}`);
    if (!res.ok) return {};
    const data = await res.json();
    const map = {};
    for (const q of (data?.quotes || [])) {
      map[q.symbol] = { price: q.price, change: q.change, volume: q.volume };
    }
    return map;
  } catch { return {}; }
}

// ════════════════════════════════════════════════════════════════════════════
// Scan functions — batched parallel like the screener
// ════════════════════════════════════════════════════════════════════════════

async function scanCryptoBatch(symbols, interval, priceMap) {
  const results = await Promise.all(symbols.map(async (sym) => {
    try {
      const [klines, oiData, fundingData] = await Promise.all([
        fetchCryptoKlines(sym, interval),
        fetchCryptoOI(sym, interval),
        fetchCryptoFunding(sym),
      ]);
      if (!klines) return null;
      const priceData = priceMap[sym] || null;
      const pumpScore = computePumpScore({ klines, oiData, fundingData });
      return { symbol: sym, priceData, pumpScore, error: null };
    } catch { return null; }
  }));
  return results.filter(Boolean);
}

async function scanStockBatch(symbols, priceMap) {
  const results = await Promise.all(symbols.map(async (sym) => {
    try {
      const klines = await fetchStockKlines(sym);
      if (!klines) return null;
      const priceData = priceMap[sym] || null;
      const pumpScore = computePumpScore({ klines, oiData: [], fundingData: [] });
      return { symbol: sym, priceData, pumpScore, error: null };
    } catch { return null; }
  }));
  return results.filter(Boolean);
}

// ════════════════════════════════════════════════════════════════════════════
// UI Components
// ════════════════════════════════════════════════════════════════════════════

function ScoreBadge({ score, size = 44 }) {
  let color, bg;
  if (score >= 85)      { color = '#ef4444'; bg = 'rgba(239,68,68,0.15)'; }
  else if (score >= 70) { color = '#f59e0b'; bg = 'rgba(245,158,11,0.15)'; }
  else if (score >= 55) { color = '#3b82f6'; bg = 'rgba(59,130,246,0.15)'; }
  else if (score >= 40) { color = '#64748b'; bg = 'rgba(100,116,139,0.10)'; }
  else                  { color = '#475569'; bg = 'rgba(71,85,105,0.08)'; }

  return (
    <div className="flex items-center justify-center font-bold rounded-full flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.32, color, background: bg, border: `1px solid ${color}33` }}>
      {score}
    </div>
  );
}

function SignalPill({ label, score }) {
  let color = '#475569';
  if (score >= 70) color = '#ef4444';
  else if (score >= 50) color = '#f59e0b';
  else if (score >= 30) color = '#3b82f6';
  const active = score >= 50;

  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors ${active ? 'bg-white/5' : 'opacity-40'}`}>
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span className="text-slate-400">{label}</span>
      <span className="font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

function ProbabilityBadge({ probability, activeCount }) {
  let color, bg, label;
  if (probability >= 85) { color = '#ef4444'; bg = 'rgba(239,68,68,0.2)'; label = '🎯 HIGH PROB'; }
  else if (probability >= 65) { color = '#f97316'; bg = 'rgba(249,115,22,0.2)'; label = '⚡ STRONG'; }
  else if (probability >= 45) { color = '#f59e0b'; bg = 'rgba(245,158,11,0.15)'; label = '📊 BUILDING'; }
  else if (probability >= 25) { color = '#3b82f6'; bg = 'rgba(59,130,246,0.15)'; label = '🔵 EARLY'; }
  else { color = '#475569'; bg = 'rgba(71,85,105,0.1)'; label = '—'; }

  return (
    <div className="flex items-center gap-1.5">
      <span className="px-2 py-0.5 rounded text-[9px] font-bold" style={{ background: bg, color }}>
        {label} {probability}%
      </span>
      <span className="text-[9px] text-slate-500 font-mono">{activeCount}/4 signals</span>
    </div>
  );
}

function CoinRow({ result, expanded, onToggle, onTrade, isStock }) {
  const { theme } = useTheme();
  const { symbol, priceData, pumpScore } = result;
  const cleanSymbol = isStock ? symbol : symbol.replace('USDT', '');
  if (!pumpScore) return null;

  return (
    <div className="border-b border-[hsl(217,33%,16%)] hover:bg-white/[0.02] transition-colors"
      onClick={onToggle}>
      <div className="flex items-center gap-3 px-4 py-2.5">
        <ScoreBadge score={pumpScore.totalScore} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-100">{cleanSymbol}</span>
            <ProbabilityBadge probability={pumpScore.pumpProbability} activeCount={pumpScore.activeCount} />
          </div>
          {priceData && (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] font-mono text-slate-400">
                ${priceData.price < 0.01 ? priceData.price.toFixed(6) : priceData.price < 1 ? priceData.price.toFixed(4) : priceData.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              <span className={`text-[10px] font-mono flex items-center gap-0.5 ${priceData.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {priceData.change >= 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                {Math.abs(priceData.change).toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {/* Signal pills */}
        <div className="hidden lg:flex items-center gap-1.5">
          <SignalPill label="Vol/OI" score={pumpScore.modules.volumeOI.score} />
          <SignalPill label="Fund" score={pumpScore.modules.funding.score} />
          <SignalPill label="BB" score={pumpScore.modules.bbSqueeze.score} />
          <SignalPill label="Mom" score={pumpScore.modules.momentum.score} />
        </div>

        <div className={`w-4 h-4 flex-shrink-0 ${expanded ? 'rotate-180' : ''} transition-transform text-slate-500`}>
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-3 pt-1" style={{ background: theme === 'light' ? 'rgba(241,245,249,0.5)' : 'rgba(15,23,42,0.6)' }}>
          <div className="text-[11px] text-slate-300 mb-3 font-medium">{pumpScore.action}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(pumpScore.modules).map(([key, mod]) => (
              <div key={key} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-500">{key}</span>
                  <span className="font-mono font-bold text-slate-300">{mod.score}</span>
                </div>
                <div className="h-1 rounded-full overflow-hidden bg-[hsl(217,33%,15%)]">
                  <div className="h-full rounded-full" style={{ width: `${mod.score}%`, background: mod.score >= 50 ? '#f59e0b' : '#475569' }} />
                </div>
                {mod.details && Object.entries(mod.details).slice(0, 3).map(([k, v]) => (
                  <div key={k} className="text-[9px] text-slate-600 font-mono">{k}: {v}</div>
                ))}
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-3">
            <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 transition-colors"
              onClick={(e) => { e.stopPropagation(); onTrade(symbol); }}>
              <Eye className="w-3 h-3" /> Open in {isStock ? 'Stocks' : 'Terminal'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════

export default function PumpSignalScanner({ onOpenSymbol }) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const [mode, setMode] = useState('crypto');
  const [symLimit, setSymLimit] = useState(30);
  const [timeframe, setTimeframe] = useState('1h');
  const [results, setResults] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [expandedRow, setExpandedRow] = useState(null);
  const [lastScan, setLastScan] = useState(null);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(null);
  const [autoScanMins, setAutoScanMins] = useState(0);
  const autoScanTimerRef = useRef(null);
  const scanCancelled = useRef(false);

  const handleTrade = useCallback((symbol) => {
    if (onOpenSymbol) onOpenSymbol(symbol, mode);
  }, [onOpenSymbol, mode]);

  const runScan = useCallback(async () => {
    scanCancelled.current = false;
    setScanning(true);
    setError(null);

    const pool = mode === 'crypto' ? CRYPTO_SYMBOLS : STOCK_SYMBOLS;
    const toScan = pool.slice(0, symLimit);
    setProgress({ current: 0, total: toScan.length });

    const BATCH = 5; // same as screener
    const allResults = [];

    try {
      if (mode === 'crypto') {
        // Fetch all prices upfront in one call (like screener)
        const priceMap = await fetchCryptoPrices();

        for (let i = 0; i < toScan.length; i += BATCH) {
          if (scanCancelled.current) break;
          const batch = toScan.slice(i, i + BATCH);
          const batchResults = await scanCryptoBatch(batch, timeframe, priceMap);
          allResults.push(...batchResults);
          // Update results progressively so user sees them appear
          const sorted = [...allResults].sort((a, b) => b.pumpScore.totalScore - a.pumpScore.totalScore);
          setResults(sorted);
          setProgress({ current: Math.min(i + BATCH, toScan.length), total: toScan.length });
        }
      } else {
        // Fetch stock prices
        const priceMap = await fetchStockPrices(toScan);

        for (let i = 0; i < toScan.length; i += BATCH) {
          if (scanCancelled.current) break;
          const batch = toScan.slice(i, i + BATCH);
          const batchResults = await scanStockBatch(batch, priceMap);
          allResults.push(...batchResults);
          const sorted = [...allResults].sort((a, b) => b.pumpScore.totalScore - a.pumpScore.totalScore);
          setResults(sorted);
          setProgress({ current: Math.min(i + BATCH, toScan.length), total: toScan.length });
        }
      }

      setLastScan(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }, [mode, symLimit, timeframe]);

  // Auto-scan
  useEffect(() => {
    if (autoScanTimerRef.current) clearInterval(autoScanTimerRef.current);
    if (autoScanMins > 0) {
      autoScanTimerRef.current = setInterval(() => runScan(), autoScanMins * 60 * 1000);
    }
    return () => { if (autoScanTimerRef.current) clearInterval(autoScanTimerRef.current); };
  }, [autoScanMins, runScan]);

  useEffect(() => {
    return () => { scanCancelled.current = true; };
  }, []);

  // Filter
  const filteredResults = useMemo(() => {
    if (filter === 'best') return results.filter(r => r.pumpScore.pumpProbability >= 70 && r.pumpScore.activeCount >= 3);
    if (filter === 'high') return results.filter(r => r.pumpScore.pumpProbability >= 65);
    if (filter === 'watch') return results.filter(r => r.pumpScore.pumpProbability >= 40 && r.pumpScore.pumpProbability < 65);
    if (filter === 'active') return results.filter(r => r.pumpScore.activeCount >= 2);
    return results;
  }, [results, filter]);

  const summary = useMemo(() => ({
    total: results.length,
    best: results.filter(r => r.pumpScore.pumpProbability >= 70 && r.pumpScore.activeCount >= 3).length,
    high: results.filter(r => r.pumpScore.pumpProbability >= 65).length,
    watch: results.filter(r => r.pumpScore.pumpProbability >= 40 && r.pumpScore.pumpProbability < 65).length,
  }), [results]);

  // Slider styling
  const accentColor = '#f59e0b';
  const maxLimit = 200;
  const sliderFill = ((symLimit - 1) / (maxLimit - 1)) * 100;
  const sliderTrack = dark ? 'hsl(217,33%,21%)' : 'hsl(210,20%,88%)';
  const borderC = dark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)';
  const mutedC = dark ? '#64748b' : '#94a3b8';

  return (
    <div className="flex flex-col h-full">
      {/* ── Controls bar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-[hsl(217,33%,20%)] flex-shrink-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-slate-100">PUMP SCANNER</span>
        </div>

        {/* Crypto / Stock toggle */}
        <div className="flex items-center rounded-lg overflow-hidden flex-shrink-0" style={{ border: `1px solid ${borderC}` }}>
          <button onClick={() => setMode('crypto')}
            className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${mode === 'crypto' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
            ₿ Crypto
          </button>
          <div className="w-px h-4" style={{ background: borderC }} />
          <button onClick={() => setMode('stock')}
            className={`px-2.5 py-1 text-[10px] font-semibold transition-colors ${mode === 'stock' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}>
            📊 Stocks
          </button>
        </div>

        {/* Timeframe buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {TIMEFRAMES.map(tf => (
            <button key={tf} onClick={() => setTimeframe(tf)} style={{
              padding: '4px 9px', borderRadius: '6px',
              border: `1px solid ${timeframe === tf ? accentColor + '88' : borderC}`,
              background: timeframe === tf ? `${accentColor}18` : 'transparent',
              color: timeframe === tf ? accentColor : mutedC,
              fontSize: '11px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
            }}>
              {tf}
            </button>
          ))}
        </div>

        {summary.total > 0 && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {summary.best > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/25 text-red-400 animate-pulse">🎯 {summary.best}</span>}
            {summary.high > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/20 text-orange-400">⚡ {summary.high}</span>}
            {summary.watch > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-400">🔵 {summary.watch}</span>}
          </div>
        )}

        <button onClick={runScan} disabled={scanning}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 transition-colors disabled:opacity-50 flex-shrink-0">
          <RefreshCw className={`w-3 h-3 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? `${progress.current}/${progress.total}` : 'Scan'}
        </button>
      </div>

      {/* Progress bar */}
      {scanning && (
        <div className="h-0.5 bg-[hsl(217,33%,12%)]">
          <div className="h-full bg-gradient-to-r from-sky-500 to-amber-500 transition-all duration-300"
            style={{ width: `${(progress.current / progress.total) * 100}%` }} />
        </div>
      )}

      {/* Secondary bar */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2 border-b border-[hsl(217,33%,15%)] flex-shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div style={{ fontSize: '9px', textTransform: 'uppercase', color: mutedC, fontWeight: 700, letterSpacing: '0.6px' }}>
            {mode === 'crypto' ? 'Coins' : 'Stocks'}
          </div>
          <input type="range" min={1} max={maxLimit} step={1} value={symLimit}
            onChange={e => setSymLimit(Number(e.target.value))}
            className="w-24 h-1.5 rounded-lg appearance-none cursor-pointer"
            style={{ background: `linear-gradient(90deg, ${accentColor} ${sliderFill}%, ${sliderTrack} ${sliderFill}%)` }} />
          <span style={{ fontSize: '11px', color: accentColor, fontWeight: 700, minWidth: 18 }}>{symLimit}</span>
        </div>

        <div className="flex items-center gap-0.5">
          {['all', 'best', 'high', 'watch', 'active'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${filter === f ? 'bg-white/10 text-slate-200' : 'text-slate-600 hover:text-slate-400'}`}>
              {f === 'all' ? `All (${results.length})` :
               f === 'best' ? '🎯 Best Bets' :
               f === 'high' ? '⚡ ≥65%' :
               f === 'watch' ? '🔵 40-64%' : '📊 2+ signals'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[9px] text-slate-600">Auto:</span>
          {[0, 1, 3, 5, 15].map(mins => (
            <button key={mins} onClick={() => setAutoScanMins(mins)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors ${autoScanMins === mins ? 'bg-amber-500/20 text-amber-400' : 'text-slate-600 hover:text-slate-400'}`}>
              {mins === 0 ? 'Off' : `${mins}m`}
            </button>
          ))}
        </div>

        {lastScan && <span className="text-[9px] text-slate-600 font-mono">{format(lastScan, 'HH:mm:ss')}</span>}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 text-xs border-b border-red-500/20">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {results.length === 0 && !scanning ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3 px-8">
            <Target className="w-10 h-10 opacity-20" />
            <span className="text-sm font-semibold text-slate-400">Hit <b className="text-sky-400">Scan</b> to start</span>

            <div className="mt-2 p-4 rounded-xl border border-[hsl(217,33%,20%)] bg-[hsl(217,33%,8%)] max-w-md">
              <div className="text-[11px] font-bold text-amber-400 mb-2">🎯 Best Settings for Finding Big Pumps</div>
              <div className="space-y-1.5 text-[10px] text-slate-400">
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 mt-px">1.</span>
                  <span><b className="text-slate-200">Timeframe: 4H</b> — sweet spot between noise and signal. 1H for earlier entries, 1D for highest conviction.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 mt-px">2.</span>
                  <span><b className="text-slate-200">Filter: "Best Bets"</b> — shows only coins with ≥70% probability AND 3+ signals active. This is the confluence filter.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 mt-px">3.</span>
                  <span><b className="text-slate-200">Scan 100-200 coins</b> — the wider the net, the higher the chance of catching a setup building.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 mt-px">4.</span>
                  <span><b className="text-slate-200">Auto-scan: 3m or 5m</b> — let it run in the background. Best setups persist across multiple scans.</span>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-[hsl(217,33%,15%)] text-[10px] text-slate-500">
                💡 <b className="text-slate-400">The mechanism:</b> Extreme pumps happen when 4 things align — OI rising (leverage building), funding negative (shorts trapped), BB squeeze (volatility compressed), and hidden bullish divergence (momentum shift). When all 4 fire → explosion likely.
              </div>
            </div>
          </div>
        ) : results.length === 0 && scanning ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
            <Target className="w-8 h-8 opacity-30 animate-pulse" />
            <div className="text-sm">Scanning {progress.current}/{progress.total} {mode} symbols…</div>
            <div className="w-48 h-1 rounded-full bg-[hsl(217,33%,15%)] overflow-hidden">
              <div className="h-full bg-sky-500 transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }} />
            </div>
          </div>
        ) : (
          <>
            {/* Scanning indicator at top */}
            {scanning && (
              <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-500/5 border-b border-[hsl(217,33%,15%)]">
                <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                <span className="text-[10px] text-amber-400/80">
                  Scanning… {progress.current}/{progress.total}
                </span>
              </div>
            )}
            {filteredResults.map((result) => (
              <CoinRow
                key={result.symbol}
                result={result}
                isStock={mode === 'stock'}
                expanded={expandedRow === result.symbol}
                onToggle={() => setExpandedRow(prev => prev === result.symbol ? null : result.symbol)}
                onTrade={handleTrade}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
