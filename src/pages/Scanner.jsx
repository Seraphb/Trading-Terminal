import React, { Suspense, lazy, useEffect, useState, useRef, useCallback } from 'react';
import { useTheme } from '../components/ThemeContext';
import { buildSignalData, SIGNAL_THRESHOLD, STRONG_THRESHOLD, ELITE_THRESHOLD } from '../components/terminal/SniperSignals';
import { Brain, Loader2, TrendingUp, TrendingDown, Link as LinkIcon, Filter, Zap, Sparkles, ChevronRight, Send, Bell, BellOff, Settings2, Clock, Eye, ArrowUpDown, FlaskConical, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchStockHistory, normalizeStockSymbol } from '@/api/stockMarketClient';
import { formatAssetPrice } from '@/lib/assetPriceFormat';
import { loadBacktestCache, runFullBacktest } from '@/utils/backtestEngine';
const AssetPreviewModal    = lazy(() => import('@/components/scanner/AssetPreviewModal'));
const SymbolTerminalModal  = lazy(() => import('@/components/scanner/SymbolTerminalModal'));

const TOP_100_STOCKS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'BRK.B', 'JNJ', 'V', 'WMT', 'JPM', 'PG', 'ABBV', 'XOM', 'MA', 'MCD', 'BAC', 'KO', 'CSCO', 'CRM', 'PEP', 'LLY', 'AVGO', 'TXN', 'QCOM', 'COST', 'NOW', 'AMD', 'INTC', 'NFLX', 'DIS', 'ADBE', 'ACN', 'IBM', 'GE', 'AMGN', 'NKE', 'SO', 'CAT', 'INTU', 'AXP', 'T', 'VZ', 'GS', 'ISRG', 'HON', 'MU', 'SBUX', 'BKNG', 'ELV', 'SNPS', 'CDNS', 'EL', 'AMAT', 'LRCX', 'CPRT', 'ABNB', 'UBER', 'PYPL', 'ASML', 'ADI', 'KLAC', 'MCHP', 'ADSK', 'CRWD', 'PSTG', 'DDOG', 'TEAM', 'DASH', 'SNOW', 'OKTA', 'ZS', 'RBLX', 'PLTR', 'COIN', 'RIOT', 'MARA', 'MSTR', 'CIR', 'SQ', 'AFRM', 'NET', 'TTD', 'MSFT', 'GOOGL', 'AMZN'];

const TOP_500_STOCKS = [...TOP_100_STOCKS, 'WBA', 'MMM', 'SCHW', 'ADP', 'GILD', 'CHTR', 'VRTX', 'DXCM', 'REGN', 'ROST', 'BSX', 'TMUS', 'ALGN', 'PAYX', 'BIIB', 'XLNX', 'VEEV', 'WDAY', 'DNOW', 'RMD', 'ENPH', 'SEDG', 'PLUG', 'NXPI', 'ANSS', 'CFG', 'UNP', 'OKE', 'SLB', 'MPC', 'VLO', 'PSX', 'HES', 'EOG', 'COP', 'FANG', 'HAL', 'MRO', 'DVN', 'PXD', 'LNG', 'PLD', 'AMT', 'EQIX', 'DLR', 'WELL', 'PSA', 'AVB', 'ESS', 'UMH', 'ARR', 'OHI', 'STAG', 'VICI', 'TRNO', 'SUNS', 'BDN', 'NHI', 'WY', 'IP', 'KEX', 'GEL', 'TPH', 'LAD', 'MAS', 'TOL', 'LEN', 'PHM', 'KNSL', 'NDSN', 'SM', 'RYN', 'WLK', 'OVV', 'TPG', 'CIM', 'KKR', 'BDT', 'APE', 'LYFT', 'GRAB', 'SMCI', 'DELL', 'HPQ', 'PANW', 'SPLK', 'FTNT', 'ZM', 'TWLO', 'SNPS', 'SLAB', 'VERIFONE', 'ERJ', 'SKX', 'HCP', 'PSH', 'DOW', 'ALB', 'FSLR', 'FORM', 'SCCO', 'MT', 'AA', 'X', 'ARCH', 'RTX', 'BA', 'LMT', 'NOC', 'GD', 'LDOS', 'HII', 'TDG', 'UTC', 'SPR', 'PM', 'MO', 'BTI', 'ULTA', 'DECK', 'SKX', 'UAL', 'DAL', 'AAL', 'SAVE', 'ALKS', 'EXPE', 'BOOKING', 'TRVG', 'AIR'];

const TOP_100_CRYPTOS = [
  // Majors
  'BTCUSDT','ETHUSDT','BNBUSDT','XRPUSDT','SOLUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT',
  'TRXUSDT','DOTUSDT','LINKUSDT','LTCUSDT','NEARUSDT','UNIUSDT','XLMUSDT','ATOMUSDT',
  'ETCUSDT','ICPUSDT','APTUSDT','SHIBUSDT','ARBUSDT','OPUSDT','INJUSDT','SUIUSDT',
  // DeFi
  'AAVEUSDT','CRVUSDT','MKRUSDT','SUSHIUSDT','COMPUSDT','SNXUSDT','YFIUSDT','DYDXUSDT',
  'BALUSDT','KNCUSDT','ZRXUSDT','1INCHUSDT','CVXUSDT','PENDLEUSDT','GMXUSDT',
  // L2 / Infra
  'MATICUSDT','STXUSDT','IMXUSDT','LRCUSDT','FLOWUSDT','IDUSDT','CHRUSDT','WOOUSDT',
  // Gaming / Metaverse
  'MANAUSDT','SANDUSDT','GALAUSDT','AXSUSDT','ENJUSDT','CHZUSDT','APAUSDT','MAGICUSDT',
  // Smaller alts (still active on Binance)
  'HBARUSDT','RUNEUSDT','LDOUSDT','FILUSDT','ALGOUSDT','ZILLUSDT','QTUMUSDT','KSMUSDT',
  'ANKRUSDT','GMTUSDT','ROSEUSDT','STORJUSDT','BANDUSDT','SKLUSDT','OGNUSDT','AUDIOUSDT',
  'BATUSDT','ARKUSDT','BLURUSDT','DUSKUSDT','KEYUSDT','COTIUSDT','ZILUSDT',
  // New cycle coins
  'PEPEUSDT','FLOKIUSDT','BONKUSDT','WIFUSDT','SEIUSDT','TIAUSDT','ORDIUSDT','ENAUSDT',
  'JUPUSDT','FETUSDT','RENDERUSDT','WLDUSDT','EIGENUSDT','CATIUSDT','NOTUSDT',
  'TURBOUSDT','PYUSDT','JTOUSDT','SCRUSDT','POLUSDT',
];

const MEME_COINS = [
  'PEPEUSDT','DOGEUSDT','SHIBUSDT','BONKUSDT','WIFUSDT','FLOKIUSDT',
  'TURBOUSDT','NOTUSDT','CATIUSDT','BLURUSDT','MEMEUSDT',
  'PEOPLEUSDT','LUNCUSDT','1000SATSUSDT',
];
const STOCK_SYMBOLS = Array.from(new Set(TOP_500_STOCKS));
const CRYPTO_SYMBOLS = Array.from(new Set(TOP_100_CRYPTOS));
const MEME_SYMBOLS = Array.from(new Set(MEME_COINS));
const MAX_SCAN_LIMIT = 250;
const MAX_LOOKBACK_WEEKS = 260;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const SCAN_TIMEFRAMES = {
  '4h': {
    label: '4H',
    intervalLabel: '4-hour',
    stockSupported: false,
    maxLookbackWeeks: 26,
  },
  '1d': {
    label: '1D',
    intervalLabel: 'daily',
    stockSupported: true,
    maxLookbackWeeks: 260,
  },
  '1w': {
    label: '1W',
    intervalLabel: 'weekly',
    stockSupported: true,
    maxLookbackWeeks: 260,
  },
};

function getCryptoBarCount(interval, lookbackWeeks) {
  // Warmup must match indicator history depth so the WT2 extreme-oversold touch
  // lookup (findLastIndex v <= -75) sees the same history as the VuManChu indicator.
  // Indicator loads: 1w→260 bars, 1d→1825 bars, 4h→2190 bars.
  const warmupBars = interval === '1w' ? 260 : interval === '1d' ? 1200 : 400;
  const barsPerWeek = interval === '4h' ? 42 : interval === '1d' ? 7 : 1;
  return Math.min(12000, Math.max(300, Math.ceil(lookbackWeeks * barsPerWeek) + warmupBars));
}

function getStockHistoryConfig(interval, lookbackWeeks) {
  if (interval === '1d') {
    // Use at least 1000 bars so the WT2 extreme-touch history matches the indicator
    const bars = Math.min(1300, Math.max(1000, Math.ceil(lookbackWeeks * 5) + 200));
    return {
      interval: '1d',
      range: '5y',
      bars,
    };
  }

  return {
    interval: '1w',
    range: '5y',
    bars: Math.min(260, Math.max(200, lookbackWeeks + 120)),
  };
}

async function fetchBinanceHistory(symbol, interval, totalBars) {
  const pageSize = 1000;
  let endTime = null;
  let klines = [];

  while (klines.length < totalBars) {
    const params = new URLSearchParams({
      symbol,
      interval,
      limit: String(Math.min(pageSize, totalBars - klines.length)),
    });

    if (endTime != null) {
      params.set('endTime', String(endTime));
    }

    const response = await fetch(`https://api.binance.com/api/v3/klines?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Binance ${response.status}`);
    }

    const raw = await response.json();
    if (!Array.isArray(raw) || raw.length === 0) {
      break;
    }

    const mapped = raw.map((kline) => ({
      time: kline[0],
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
    }));

    klines = [...mapped, ...klines];

    const oldestOpenTime = raw[0]?.[0];
    if (!Number.isFinite(oldestOpenTime) || raw.length < Math.min(pageSize, totalBars - klines.length + raw.length)) {
      break;
    }

    endTime = oldestOpenTime - 1;
  }

  return klines
    .sort((a, b) => a.time - b.time)
    .slice(-totalBars);
}


function ema(src, len) {
  const k = 2 / (len + 1);
  const out = [];
  let prev = src[0] ?? 0;
  for (let i = 0; i < src.length; i++) {
    prev = (src[i] ?? prev) * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function sma(src, len) {
  return src.map((_, i) => {
    const slice = src.slice(Math.max(0, i - len + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function rsiCalc(closes, len = 14) {
  const out = new Array(closes.length).fill(50);
  if (closes.length < len + 1) return out;
  let avgG = 0;
  let avgL = 0;
  for (let i = 1; i <= len; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgG += d;
    else avgL -= d;
  }
  avgG /= len;
  avgL /= len;
  out[len] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = len + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (len - 1) + (d > 0 ? d : 0)) / len;
    avgL = (avgL * (len - 1) + (d < 0 ? -d : 0)) / len;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

function waveTrendCalc(hlc3, chLen = 9, avgLen = 12, maLen = 3) {
  const esa = ema(hlc3, chLen);
  const de = ema(hlc3.map((v, i) => Math.abs(v - esa[i])), chLen);
  const ci = hlc3.map((v, i) => de[i] === 0 ? 0 : (v - esa[i]) / (0.015 * de[i]));
  const wt1 = ema(ci, avgLen);
  const wt2 = sma(wt1, maLen);
  return { wt1, wt2 };
}

function crossUp(a, b, i) {
  return i > 0 && a[i - 1] <= b[i - 1] && a[i] > b[i];
}

function detectVuManChuSignals(klines, symbol = '') {
  if (klines.length < 20) return { goldBuys: [], greenBuys: [] };

  const closes = klines.map((k) => k.close);
  const hlc3 = klines.map((k) => (k.high + k.low + k.close) / 3);
  const rsiVals = rsiCalc(closes, 14);
  const { wt1, wt2 } = waveTrendCalc(hlc3, 9, 12, 3);
  const oversold = wt2.map((v) => v <= -53);
  const wtCrossUpArr = wt1.map((_, i) => crossUp(wt1, wt2, i));

  const goldBuys = [];
  const greenBuys = [];

  for (let i = 1; i < wt1.length; i++) {
    if (wtCrossUpArr[i] && oversold[i]) {
      greenBuys.push(i);
    }

    if (!wtCrossUpArr[i]) continue;
    const prevWT = wt2.slice(0, i).findLastIndex((v) => v <= -75);
    if (prevWT >= 0 && wt2[i] > -75 && rsiVals[i] < 30) {
      goldBuys.push(i);
    }
  }

  console.log(`${symbol}: weekly gold=${goldBuys.length} green=${greenBuys.length}`);

  return { greenBuys, goldBuys };
}

// ── MFI (Money Flow Index) ─────────────────────────────────────────────────
function mfiCalc(klines, len = 14) {
  const tp = klines.map((k) => (k.high + k.low + k.close) / 3);
  const rawMF = tp.map((t, i) => t * klines[i].volume);
  const out = new Array(klines.length).fill(50);
  for (let i = len; i < klines.length; i++) {
    let pos = 0, neg = 0;
    for (let j = i - len + 1; j <= i; j++) {
      if (tp[j] > tp[j - 1]) pos += rawMF[j];
      else neg += rawMF[j];
    }
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

// ── Volume spike: volume > multiplier × N-bar average ─────────────────────
function volumeSpikeArr(klines, len = 20, mult = 1.5) {
  const vols = klines.map((k) => k.volume);
  return vols.map((v, i) => {
    if (i < len) return false;
    const avg = vols.slice(i - len, i).reduce((a, b) => a + b, 0) / len;
    return v > avg * mult;
  });
}

// ── Bullish RSI divergence: price lower low, RSI higher low (within window) ─
function hasBullishRsiDivergence(closes, rsiVals, atIndex, lookback = 20) {
  const start = Math.max(1, atIndex - lookback);
  // find a prior local price low between start and atIndex-1
  for (let j = start; j < atIndex; j++) {
    if (closes[j] < closes[atIndex] && rsiVals[j] < rsiVals[atIndex]) {
      // price[j] < price[atIndex] but rsi[j] < rsi[atIndex] → higher RSI low at signal = bullish divergence
      return true;
    }
  }
  return false;
}

// ── VuManChu B Ultra: quant confluence scoring (6 votes, gold≥4, green≥2)
function detectVuManChuUltra(klines) {
  if (klines.length < 30) return { goldBuys: [], greenBuys: [] };

  const closes = klines.map((k) => k.close);
  const hlc3 = klines.map((k) => (k.high + k.low + k.close) / 3);
  const rsiVals = rsiCalc(closes, 14);
  const { wt1, wt2 } = waveTrendCalc(hlc3, 9, 12, 3);
  const mfi = mfiCalc(klines, 14);
  const volSpike = volumeSpikeArr(klines, 20, 1.5);
  const wtCrossUpArr = wt1.map((_, i) => crossUp(wt1, wt2, i));

  // Bullish RSI divergence: price lower low but RSI higher low over last 10 bars
  function hasBullishDivergence(i) {
    if (i < 10) return false;
    const lookback = 10;
    let prevLowPriceIdx = -1;
    for (let j = i - 1; j >= i - lookback; j--) {
      if (closes[j] < closes[i]) { prevLowPriceIdx = j; break; }
    }
    if (prevLowPriceIdx < 0) return false;
    return rsiVals[i] > rsiVals[prevLowPriceIdx];
  }

  const goldBuys = [];
  const greenBuys = [];

  for (let i = 1; i < wt1.length; i++) {
    if (!wtCrossUpArr[i]) continue;

    // Condition 1: WT cross from deep oversold (≤-55)
    const c1 = wt2[i] <= -55 ? 1 : 0;
    // Condition 2: WT2 touched extreme oversold (≤-70) in last 5 bars
    const c2 = wt2.slice(Math.max(0, i - 5), i + 1).some((v) => v <= -70) ? 1 : 0;
    // Condition 3: RSI<35 or bullish divergence
    const c3 = rsiVals[i] < 35 || hasBullishDivergence(i) ? 1 : 0;
    // Condition 4: MFI<45 (money flow still bearish → spring setup)
    const c4 = mfi[i] < 45 ? 1 : 0;
    // Condition 5: volume spike (1.5× average)
    const c5 = volSpike[i] ? 1 : 0;
    // Condition 6: close > open (green candle confirmation)
    const c6 = closes[i] > klines[i].open ? 1 : 0;

    const votes = c1 + c2 + c3 + c4 + c5 + c6;

    if (votes >= 4) {
      goldBuys.push(i);
    } else if (votes >= 2) {
      greenBuys.push(i);
    }
  }

  return { greenBuys, goldBuys };
}

// ── Bollinger Band Width ───────────────────────────────────────────────────
function bollingerBandWidth(closes, len = 20, mult = 2) {
  return closes.map((_, i) => {
    if (i < len) return null;
    const slice = closes.slice(i - len, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - avg) ** 2, 0) / slice.length);
    return avg === 0 ? null : (mult * 2 * std) / avg; // normalised BBW
  });
}

// ── Resample daily klines → synthetic weekly candles ──────────────────────
function resampleToWeekly(dailyKlines) {
  const weeks = [];
  let current = null;
  for (const k of dailyKlines) {
    const d = new Date(k.time);
    const weekKey = `${d.getFullYear()}-${Math.floor((d.getMonth() * 31 + d.getDate()) / 7)}`;
    if (!current || current.weekKey !== weekKey) {
      if (current) weeks.push(current);
      current = { weekKey, time: k.time, open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume };
    } else {
      current.high = Math.max(current.high, k.high);
      current.low = Math.min(current.low, k.low);
      current.close = k.close;
      current.volume += k.volume;
    }
  }
  if (current) weeks.push(current);
  return weeks;
}

// ── Multi-Timeframe: weekly oversold + daily WT cross-up ──────────────────
function detectMultiTimeframe(klines) {
  if (klines.length < 60) return { goldBuys: [], greenBuys: [] };

  // Daily layer
  const closes = klines.map((k) => k.close);
  const hlc3D = klines.map((k) => (k.high + k.low + k.close) / 3);
  const rsiD = rsiCalc(closes, 14);
  const { wt1: wt1D, wt2: wt2D } = waveTrendCalc(hlc3D, 9, 12, 3);
  const crossUpD = wt1D.map((_, i) => crossUp(wt1D, wt2D, i));

  // Weekly layer (synthesised from daily)
  const weekly = resampleToWeekly(klines);
  const hlc3W = weekly.map((k) => (k.high + k.low + k.close) / 3);
  const { wt2: wt2W } = waveTrendCalc(hlc3W, 9, 12, 3);
  // Map each weekly bar back to daily indices by timestamp
  const weeklyOversold = new Map(); // time → wt2W value
  weekly.forEach((w, wi) => { weeklyOversold.set(w.time, wt2W[wi]); });

  // For each daily bar, find its corresponding weekly WT2
  const dailyWeeklyWT2 = klines.map((k) => {
    const d = new Date(k.time);
    // find the weekly bar that started on or before this day
    let best = null;
    for (const w of weekly) {
      if (w.time <= k.time) best = weeklyOversold.get(w.time) ?? best;
      else break;
    }
    return best;
  });

  const goldBuys = [];
  const greenBuys = [];

  for (let i = 1; i < klines.length; i++) {
    if (!crossUpD[i]) continue;
    const wW = dailyWeeklyWT2[i];
    if (wW == null) continue;

    // Gold MTF: daily cross-up + weekly WT2 deeply oversold (≤ -60) + daily RSI < 35
    const prevWT = wt2D.slice(0, i).findLastIndex((v) => v <= -70);
    if (prevWT >= 0 && wt2D[i] > -70 && wW <= -60 && rsiD[i] < 35) {
      goldBuys.push(i);
    }
    // Green MTF: daily cross-up in oversold + weekly in oversold territory
    else if (wt2D[i] <= -53 && wW <= -40) {
      greenBuys.push(i);
    }
  }

  return { goldBuys, greenBuys };
}

// ── Explosive Move Setup — true multi-timeframe (1W + 1D + 4H) ────────────
// Pattern behind PLTR ($15→$80), TSLA ($70→$900), BONK, TAO:
//   WEEKLY : capitulation + BB squeeze + basing near lows + EMA flattening
//   DAILY  : WT cross-up trigger + RSI divergence
//   4H     : volume spike confirmation (crypto only, ignored for stocks)
//
// The detect function receives { weekly, daily, fourHour } from the scanner.
function detectExplosiveSetup({ weekly, daily, fourHour }) {
  if (!weekly || weekly.length < 40) return { goldBuys: [], greenBuys: [] };
  if (!daily || daily.length < 30) return { goldBuys: [], greenBuys: [] };

  // ── Weekly analysis: macro setup ──
  const wCloses = weekly.map((k) => k.close);
  const wHlc3 = weekly.map((k) => (k.high + k.low + k.close) / 3);
  const { wt2: wWT2 } = waveTrendCalc(wHlc3, 9, 12, 3);
  const wBBW = bollingerBandWidth(wCloses, 20, 2);
  const wEma20 = ema(wCloses, 20);

  // Check the latest weekly bars for macro conditions
  const wi = weekly.length - 1;

  // 1. Prior capitulation on weekly: WT2 was ≤ -55 in last 30 weekly bars
  let hadCapitulation = false;
  for (let j = Math.max(0, wi - 30); j <= wi; j++) {
    if (wWT2[j] <= -55) { hadCapitulation = true; break; }
  }
  if (!hadCapitulation) return { goldBuys: [], greenBuys: [] };

  // 2. Price near weekly lows: close within 30% of 52-week low
  let wLow52 = wCloses[wi];
  for (let j = Math.max(0, wi - 52); j < wi; j++) {
    if (weekly[j].low < wLow52) wLow52 = weekly[j].low;
  }
  const distFromLow = (wCloses[wi] - wLow52) / (wLow52 || 1);
  if (distFromLow > 0.30) return { goldBuys: [], greenBuys: [] };

  // 3. Weekly BB squeeze: BBW in bottom 30% of its range
  let weeklySqueeze = false;
  if (wBBW[wi] != null) {
    const recentBBW = wBBW.slice(Math.max(0, wi - 52), wi + 1).filter((v) => v != null);
    if (recentBBW.length >= 10) {
      let bbMin = recentBBW[0], bbMax = recentBBW[0];
      for (const v of recentBBW) { if (v < bbMin) bbMin = v; if (v > bbMax) bbMax = v; }
      const bbwPct = (wBBW[wi] - bbMin) / (bbMax - bbMin || 1);
      weeklySqueeze = bbwPct < 0.30;
    }
  }

  // 4. Weekly EMA20 flattening
  const wEmaSlope = wi >= 3 ? (wEma20[wi] - wEma20[wi - 3]) / (wEma20[wi - 3] || 1) : 0;
  const weeklyFlat = wEmaSlope > -0.03;

  // Must have at least squeeze OR flat EMA (ideally both)
  if (!weeklySqueeze && !weeklyFlat) return { goldBuys: [], greenBuys: [] };

  // ── Daily analysis: entry triggers ──
  const dCloses = daily.map((k) => k.close);
  const dHlc3 = daily.map((k) => (k.high + k.low + k.close) / 3);
  const dRSI = rsiCalc(dCloses, 14);
  const { wt1: dWT1, wt2: dWT2 } = waveTrendCalc(dHlc3, 9, 12, 3);
  const dCrossUp = dWT1.map((_, i) => crossUp(dWT1, dWT2, i));
  const dVols = daily.map((k) => k.volume);

  // ── 4H analysis: volume confirmation (optional, crypto only) ──
  let has4hVolSpike = false;
  if (fourHour && fourHour.length > 30) {
    const hVols = fourHour.map((k) => k.volume);
    const last = hVols.length - 1;
    const avg20 = hVols.slice(Math.max(0, last - 20), last).reduce((a, b) => a + b, 0) / 20;
    // check last 6 bars (≈ 1 day of 4h) for any volume spike
    for (let j = Math.max(0, last - 6); j <= last; j++) {
      if (hVols[j] > avg20 * 1.5) { has4hVolSpike = true; break; }
    }
  }

  const goldBuys = [];
  const greenBuys = [];

  // Scan the last 30 daily bars for triggers
  for (let i = Math.max(20, daily.length - 30); i < daily.length; i++) {
    const diverg = hasBullishRsiDivergence(dCloses, dRSI, i, 25);
    const vol20 = dVols.slice(Math.max(0, i - 20), i).reduce((a, b) => a + b, 0) / 20;
    const dVolSpike = dVols[i] > vol20 * 1.4;

    if (dCrossUp[i]) {
      // Gold: weekly setup confirmed + daily WT cross + (divergence OR daily vol spike OR 4h vol spike)
      if (weeklySqueeze && weeklyFlat && (diverg || dVolSpike || has4hVolSpike)) {
        goldBuys.push(i);
      }
      // Green: weekly capitulation + near lows + daily cross (setup forming)
      else {
        greenBuys.push(i);
      }
    } else if (diverg && (dVolSpike || has4hVolSpike) && dRSI[i] < 40) {
      // Green: divergence + volume even without WT cross
      greenBuys.push(i);
    }
  }

  return { goldBuys, greenBuys, _dailyKlines: daily };
}

// ── RSI Oversold Bounce ────────────────────────────────────────────────────
// RSI dips below 25 (extreme oversold) then starts turning up.
// Gold = also has bullish RSI divergence; Green = just the bounce.
function detectRsiOversoldBounce(klines) {
  if (klines.length < 20) return { goldBuys: [], greenBuys: [] };
  const closes  = klines.map((k) => k.close);
  const rsi     = rsiCalc(closes, 14);
  const goldBuys  = [];
  const greenBuys = [];
  for (let i = 3; i < klines.length; i++) {
    const recentMin = Math.min(rsi[i - 1], rsi[i - 2], rsi[i - 3]);
    if (recentMin >= 25) continue;         // wasn't deeply oversold
    if (rsi[i] <= rsi[i - 1]) continue;   // not turning up yet
    if (rsi[i] >= 38) continue;            // already bounced too far
    if (hasBullishRsiDivergence(closes, rsi, i, 20)) {
      goldBuys.push(i);
    } else {
      greenBuys.push(i);
    }
  }
  return { goldBuys, greenBuys };
}

// ── MACD helpers + detect ──────────────────────────────────────────────────
function macdCalc(closes, fast = 12, slow = 26, signalLen = 9) {
  const emaFast  = ema(closes, fast);
  const emaSlow  = ema(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
  const signalLine = ema(macdLine, signalLen);
  return { macdLine, signalLine };
}

// Gold = MACD crosses up while both lines are still negative (accumulation zone).
// Green = cross up with RSI < 60.
function detectMacdBullishCross(klines) {
  if (klines.length < 40) return { goldBuys: [], greenBuys: [] };
  const closes = klines.map((k) => k.close);
  const rsi    = rsiCalc(closes, 14);
  const { macdLine, signalLine } = macdCalc(closes);
  const goldBuys  = [];
  const greenBuys = [];
  for (let i = 1; i < klines.length; i++) {
    const crossedUp = macdLine[i - 1] <= signalLine[i - 1] && macdLine[i] > signalLine[i];
    if (!crossedUp) continue;
    if (macdLine[i] < 0 && signalLine[i] < 0 && rsi[i] < 50) {
      goldBuys.push(i);
    } else if (rsi[i] < 60) {
      greenBuys.push(i);
    }
  }
  return { goldBuys, greenBuys };
}

// ── Momentum Reversal: WaveTrend × RSI Bounce hybrid ────────────────────
// Combines VuManChu B (WaveTrend oversold cross) with RSI bounce confirmation
// and structural filters for high-probability mean-reversion entries.
//
// 8-condition confluence scoring:
//  C1: WaveTrend cross-up (wt1 crosses above wt2) — REQUIRED gate
//  C2: WT2 in oversold zone (≤ −53)
//  C3: WT2 touched deep oversold (≤ −70) within last 8 bars
//  C4: RSI < 35 OR bullish RSI divergence (price LL, RSI HL)
//  C5: RSI momentum turning (rsi[i] > rsi[i-1] && rsi[i-1] < 40)
//  C6: MFI < 45 (money flow depressed → spring coil)
//  C7: Volume spike ≥ 1.4× 20-bar avg (capitulation / absorption)
//  C8: Green candle (close > open) — buyers stepping in
//
// GOLD: 5+ votes (institutional-grade)
// GREEN: 3–4 votes (solid but not perfect)
// < 3 votes: skip
function detectGoldenCross(klines) {
  if (klines.length < 30) return { goldBuys: [], greenBuys: [] };

  const closes = klines.map(k => k.close);
  const hlc3   = klines.map(k => (k.high + k.low + k.close) / 3);
  const rsiVals       = rsiCalc(closes, 14);
  const { wt1, wt2 }  = waveTrendCalc(hlc3, 9, 12, 3);
  const mfi           = mfiCalc(klines, 14);
  const volSpike      = volumeSpikeArr(klines, 20, 1.4);
  const wtCrossUpArr  = wt1.map((_, i) => crossUp(wt1, wt2, i));

  const goldBuys = [], greenBuys = [];

  for (let i = 2; i < wt1.length; i++) {
    // C1: must have a WaveTrend cross-up — hard gate
    if (!wtCrossUpArr[i]) continue;
    const c1 = 1;

    // C2: WT2 oversold
    const c2 = wt2[i] <= -53 ? 1 : 0;

    // C3: deep oversold touch in last 8 bars
    const c3 = wt2.slice(Math.max(0, i - 8), i + 1).some(v => v <= -70) ? 1 : 0;

    // C4: RSI oversold OR bullish divergence
    const c4 = (rsiVals[i] < 35 || hasBullishRsiDivergence(closes, rsiVals, i, 15)) ? 1 : 0;

    // C5: RSI momentum turning (bouncing off bottom)
    const c5 = (rsiVals[i] > rsiVals[i - 1] && rsiVals[i - 1] < 40) ? 1 : 0;

    // C6: MFI depressed (spring coil)
    const c6 = mfi[i] < 45 ? 1 : 0;

    // C7: volume spike (capitulation / absorption)
    const c7 = volSpike[i] ? 1 : 0;

    // C8: green candle confirmation
    const c8 = closes[i] > klines[i].open ? 1 : 0;

    const votes = c1 + c2 + c3 + c4 + c5 + c6 + c7 + c8;

    if (votes >= 5) {
      goldBuys.push(i);
    } else if (votes >= 3) {
      greenBuys.push(i);
    }
  }

  return { goldBuys, greenBuys };
}

// ── Sniper Signals detect wrapper ─────────────────────────────────────────
// Maps buildSignalData output → { goldBuys, greenBuys } index arrays.
// goldBuys = ELITE tier (score ≥ 78), greenBuys = STRONG/SIGNAL tier (≥ 48).
function detectSniperSignals(klines) {
  if (klines.length < 60) return { goldBuys: [], greenBuys: [] };
  try {
    const signals = buildSignalData(klines);
    const buySignals = signals.filter(s => s.signalType && s.signalType.includes('BUY'));
    const goldBuys  = buySignals.filter(s => s.isElite).map(s => s.idx);
    const greenBuys = buySignals.filter(s => !s.isElite).map(s => s.idx);
    return { goldBuys, greenBuys };
  } catch { return { goldBuys: [], greenBuys: [] }; }
}

// ── Strategy registry ──────────────────────────────────────────────────────
const SCAN_STRATEGIES = {
  vumanchu_b: {
    id: 'vumanchu_b',
    name: 'VuManChu Cipher B',
    shortName: 'VMC B',
    description: 'WaveTrend cross-up from deep oversold (WT2 ≤ −75) with RSI < 30. The classic gold ball signal.',
    color: '#f59e0b',
    detect: detectVuManChuSignals,
  },
  vumanchu_b_ultra: {
    id: 'vumanchu_b_ultra',
    name: 'VuManChu B Ultra',
    shortName: 'VMC Ultra',
    description: 'Gold ball + MFI oversold (< 35) + volume spike (1.3×). More confluences, higher conviction than classic VMC B.',
    color: '#8b5cf6',
    detect: detectVuManChuUltra,
  },
  multi_timeframe: {
    id: 'multi_timeframe',
    name: 'Multi-Timeframe',
    shortName: 'MTF',
    description: 'Weekly WT2 deeply oversold (≤ −60) AND daily WaveTrend cross-up. Both timeframes aligned = stronger signal.',
    color: '#06b6d4',
    detect: detectMultiTimeframe,
  },
  explosive_setup: {
    id: 'explosive_setup',
    name: 'Explosive Move Setup',
    shortName: 'EXP',
    description: 'Multi-TF: Weekly BB squeeze + capitulation at lows → Daily WT cross-up trigger → 4H volume spike. The PLTR/TSLA/BONK pattern.',
    color: '#f97316',
    detect: detectExplosiveSetup,
    multiTimeframe: true,
  },
  rsi_oversold: {
    id: 'rsi_oversold',
    name: 'RSI Oversold Bounce',
    shortName: 'RSI Bounce',
    description: 'RSI dips below 25 then turns up. Gold = confirmed by bullish divergence.',
    color: '#10b981',
    detect: detectRsiOversoldBounce,
  },
  macd_cross: {
    id: 'macd_cross',
    name: 'MACD Bullish Cross',
    shortName: 'MACD Cross',
    description: 'MACD crosses above signal while both lines are negative — accumulation zone reversal.',
    color: '#3b82f6',
    detect: detectMacdBullishCross,
  },
  golden_cross: {
    id: 'golden_cross',
    name: 'Momentum Reversal',
    shortName: 'MomRev',
    description: 'WaveTrend × RSI Bounce hybrid — 8-condition confluence scoring. Gold ≥ 5 votes, Green ≥ 3.',
    color: '#eab308',
    detect: detectGoldenCross,
  },
  sniper_signals: {
    id: 'sniper_signals',
    name: '⚡ Sniper Signals',
    shortName: 'Sniper',
    description: 'Full SMC confluence engine: BOS/ChoCH, FVG, Order Blocks, Liquidity Sweeps + WaveTrend. Gold = ELITE tier (≥78 score). Green = STRONG/SIGNAL.',
    color: '#facc15',
    detect: detectSniperSignals,
  },
};

// ── Telegram notifications ─────────────────────────────────────────────────
const TG_STORAGE_KEY = 'scanner_telegram_config';

function loadTelegramConfig() {
  try {
    const raw = localStorage.getItem(TG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : { botToken: '', chatId: '', enabled: false };
  } catch { return { botToken: '', chatId: '', enabled: false }; }
}

function saveTelegramConfig(cfg) {
  localStorage.setItem(TG_STORAGE_KEY, JSON.stringify(cfg));
}

async function sendTelegramMessage(botToken, chatId, text) {
  if (!botToken || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    return res.ok;
  } catch { return false; }
}

function formatTelegramSignals(newResults, strategyName, scanTimeframe) {
  if (!newResults.length) return '';
  const header = `🔔 <b>Scanner Alert — ${strategyName} (${scanTimeframe.toUpperCase()})</b>\n\n`;
  const lines = newResults.map((r) => {
    const arrow = r.changeSinceSignal >= 0 ? '📈' : '📉';
    const pct = `${r.changeSinceSignal >= 0 ? '+' : ''}${r.changeSinceSignal.toFixed(1)}%`;
    return `${arrow} <b>${r.symbol}</b>  $${r.goldSignalPrice.toFixed(2)} → $${r.price.toFixed(2)}  (${pct})  ${formatDaysAgo(r.goldSignalDaysAgo)}`;
  });
  return header + lines.join('\n') + `\n\n⏰ ${new Date().toLocaleString()}`;
}

const SORT_OPTIONS = [
  { value: 'best_return',  label: '↑ Best Return'   },
  { value: 'worst_return', label: '↓ Worst Return'  },
  { value: 'newest',       label: 'Newest Signal'   },
  { value: 'oldest',       label: 'Oldest Signal'   },
  { value: 'symbol_az',    label: 'A → Z'           },
];

const AUTO_SCAN_INTERVALS = [
  { value: 3600000,    label: '1 hour' },
  { value: 21600000,   label: '6 hours' },
  { value: 43200000,   label: '12 hours' },
  { value: 86400000,   label: '24 hours' },
];

function getDaysAgo(time) {
  return Math.max(0, (Date.now() - time) / 86400000);
}

function formatDaysAgo(daysAgo) {
  if (daysAgo < 0.2) return 'today';
  if (daysAgo < 1) return `${daysAgo.toFixed(1)}d ago`;
  return `${Math.round(daysAgo)}d ago`;
}

export default function Scanner() {
  const { theme } = useTheme();
  const [selectedStrategy, setSelectedStrategy] = useState('vumanchu_b');
  const [mode, setMode] = useState(null); // 'stocks', 'crypto', or null
  const [scope, setScope] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState([]);
  const [filterSignal, setFilterSignal] = useState('all'); // all, green, gold
  const [scanLimit, setScanLimit] = useState(50);
  const [scanTimeframe, setScanTimeframe] = useState('1w');
  const [signalLookbackWeeks, setSignalLookbackWeeks] = useState(26);
  const [previewResult, setPreviewResult] = useState(null);
  const [scannedCount, setScannedCount] = useState(0);

  // ── Telegram & Auto-scan state ──
  const [sortBy, setSortBy] = useState('best_return');
  const [terminalResult, setTerminalResult] = useState(null);

  const [backtestResults, setBacktestResults] = useState(() => loadBacktestCache() ?? {});
  const [backtestRunning, setBacktestRunning] = useState(false);
  const [backtestProgress, setBacktestProgress] = useState(0);

  const [tgConfig, setTgConfig] = useState(loadTelegramConfig);
  const [showTgSettings, setShowTgSettings] = useState(false);
  const [autoScanMode, setAutoScanMode] = useState(null); // 'stocks' | 'crypto' | 'both' | null
  const [autoScanInterval, setAutoScanInterval] = useState(21600000); // 6h default
  const [autoScanActive, setAutoScanActive] = useState(false);
  const [lastAutoScan, setLastAutoScan] = useState(null);
  const [tgTestStatus, setTgTestStatus] = useState(''); // '', 'sending', 'ok', 'fail'
  const autoScanTimerRef = useRef(null);
  const prevSignalKeysRef = useRef(new Set());

  const activeTimeframe = SCAN_TIMEFRAMES[scanTimeframe];
  const maxLookbackWeeks = activeTimeframe.maxLookbackWeeks;

  useEffect(() => {
    setSignalLookbackWeeks((current) => Math.min(current, maxLookbackWeeks));
  }, [maxLookbackWeeks]);

  // Auto-set best timeframe when strategy or mode changes (if backtest data available)
  useEffect(() => {
    const entry = backtestResults[selectedStrategy];
    if (!entry) return;
    const stratObj = SCAN_STRATEGIES[selectedStrategy];
    if (stratObj?.multiTimeframe) return; // MTF manages its own timeframes
    const modeKey = mode === 'crypto' ? 'crypto' : 'stocks';
    const bestTf = entry[modeKey]?.best;
    if (bestTf && SCAN_TIMEFRAMES[bestTf]) {
      setScanTimeframe(bestTf);
    }
  }, [selectedStrategy, mode, backtestResults]);

  useEffect(() => {
    if (!mode) return;
    setResults([]);
    setPreviewResult(null);
  }, [mode, scanTimeframe, signalLookbackWeeks, selectedStrategy]);

  const fetchRealData = async (symbol, isCrypto) => {
    try {
      if (isCrypto) {
        return await fetchBinanceHistory(
          symbol,
          scanTimeframe,
          getCryptoBarCount(scanTimeframe, signalLookbackWeeks)
        );
      }

      if (scanTimeframe === '4h') {
        throw new Error('4H stock scanning is not available with the current market-data feed');
      }

      return await fetchStockHistory(symbol, getStockHistoryConfig(scanTimeframe, signalLookbackWeeks));
    } catch (err) {
      console.warn(`Data fetch failed for ${symbol}: ${err.message}`);
      return null;
    }
  };

  const scanSingleSymbol = async (symbol, isCrypto) => {
    const strategy = SCAN_STRATEGIES[selectedStrategy];

    let klines, detectionResult;

    if (strategy.multiTimeframe) {
      // ── Multi-timeframe: fetch 1W + 1D + 4H separately ──
      try {
        let weekly, daily, fourHour = null;

        if (isCrypto) {
          [weekly, daily, fourHour] = await Promise.all([
            fetchBinanceHistory(symbol, '1w', Math.min(260, signalLookbackWeeks + 60)),
            fetchBinanceHistory(symbol, '1d', Math.min(1800, signalLookbackWeeks * 7 + 120)),
            fetchBinanceHistory(symbol, '4h', Math.min(2000, signalLookbackWeeks * 42 + 200)),
          ]);
        } else {
          [weekly, daily] = await Promise.all([
            fetchStockHistory(symbol, { interval: '1w', range: '5y', bars: Math.min(260, signalLookbackWeeks + 60) }),
            fetchStockHistory(symbol, { interval: '1d', range: '5y', bars: Math.min(1300, signalLookbackWeeks * 5 + 120) }),
          ]);
          // 4H not available for stocks
        }

        if (!weekly?.length || !daily?.length) return null;

        detectionResult = strategy.detect({ weekly, daily, fourHour });
        // Use daily klines for signal timestamps/prices
        klines = detectionResult._dailyKlines || daily;
      } catch (err) {
        console.warn(`MTF fetch failed for ${symbol}: ${err.message}`);
        return null;
      }
    } else {
      // ── Single timeframe ──
      klines = await fetchRealData(symbol, isCrypto);
      if (!klines || klines.length === 0) return null;
      detectionResult = strategy.detect(klines, symbol);
    }

    const { greenBuys, goldBuys } = detectionResult;
    const lastCandle = klines[klines.length - 1];
    const minGoldTime = (lastCandle?.time ?? Date.now()) - signalLookbackWeeks * MS_PER_WEEK;
    const recentGoldBuys = goldBuys.filter((index) => (klines[index]?.time ?? 0) >= minGoldTime);
    const lastGoldIndex = recentGoldBuys[recentGoldBuys.length - 1];

    if (recentGoldBuys.length === 0) return null;

    const goldSignalPrice = klines[lastGoldIndex]?.close ?? lastCandle.close;
    const changeSinceSignal = ((lastCandle.close - goldSignalPrice) / goldSignalPrice * 100);

    // Build all signal markers for the chart overlay
    const allSignals = [
      ...goldBuys.map((idx) => ({ time: klines[idx]?.time, price: klines[idx]?.close, type: 'gold' })),
      ...greenBuys.map((idx) => ({ time: klines[idx]?.time, price: klines[idx]?.close, type: 'green' })),
    ].filter((s) => s.time != null && s.price != null);

    return {
      symbol: isCrypto ? symbol : normalizeStockSymbol(symbol),
      isCrypto,
      price: lastCandle.close,
      greenBuyCount: greenBuys.length,
      goldBuyCount: recentGoldBuys.length,
      hasGreenBuy: greenBuys.length > 0,
      hasGoldBuy: recentGoldBuys.length > 0,
      signalType: 'gold',
      changeSinceSignal,
      goldSignalPrice,
      goldSignalTime: klines[lastGoldIndex]?.time ?? lastCandle.time,
      goldSignalDaysAgo: getDaysAgo(klines[lastGoldIndex]?.time ?? lastCandle.time),
      signalLookbackWeeks,
      scanTimeframe: strategy.multiTimeframe ? '1W+1D+4H' : scanTimeframe,
      strategyId: selectedStrategy,
      signals: allSignals,
    };
  };

  const scanSymbols = async (symbolList, isCrypto) => {
    setMode(isCrypto ? 'crypto' : 'stocks');
    setScope(symbolList.length);
    setScanning(true);
    setResults([]);
    setScannedCount(0);

    const scanResults = [];
    const batchSize = isCrypto ? 10 : 6;
    let done = 0;

    for (let i = 0; i < symbolList.length; i += batchSize) {
      const batch = symbolList.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((symbol) => scanSingleSymbol(symbol, isCrypto))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          scanResults.push(result.value);
        }
      }

      done += batch.length;
      setScannedCount(done);
      setResults([...scanResults]);
    }

    setScannedCount(symbolList.length);
    setResults(scanResults);
    setScanning(false);
  };

  const startScan = (nextMode) => {
    const isCrypto = nextMode === 'crypto' || nextMode === 'memes';
    const source = nextMode === 'memes' ? MEME_SYMBOLS
                 : nextMode === 'crypto' ? CRYPTO_SYMBOLS
                 : STOCK_SYMBOLS;
    const actualCount = Math.min(scanLimit, isCrypto ? source.length : MAX_SCAN_LIMIT, source.length);
    scanSymbols(source.slice(0, actualCount), isCrypto);
  };

  // ── Telegram helpers ──
  const updateTgConfig = useCallback((patch) => {
    setTgConfig((prev) => {
      const next = { ...prev, ...patch };
      saveTelegramConfig(next);
      return next;
    });
  }, []);

  const testTelegram = useCallback(async () => {
    setTgTestStatus('sending');
    const ok = await sendTelegramMessage(
      tgConfig.botToken,
      tgConfig.chatId,
      '✅ <b>Scanner connected!</b>\nYou will receive alerts when new signals are detected.'
    );
    setTgTestStatus(ok ? 'ok' : 'fail');
    setTimeout(() => setTgTestStatus(''), 3000);
  }, [tgConfig.botToken, tgConfig.chatId]);

  // ── Auto-scan: silent scan that compares with previous results ──
  const runAutoScan = useCallback(async () => {
    const strategyObj = SCAN_STRATEGIES[selectedStrategy];
    const runForMode = async (modeType) => {
      const isCrypto = modeType === 'crypto';
      if (isCrypto && scanTimeframe === '4h') { /* ok, crypto supports 4h */ }
      else if (!isCrypto && scanTimeframe === '4h') return []; // stocks don't support 4h

      const source = isCrypto ? CRYPTO_SYMBOLS : STOCK_SYMBOLS;
      const actualCount = Math.min(scanLimit, isCrypto ? source.length : MAX_SCAN_LIMIT, source.length);
      const symbolList = source.slice(0, actualCount);
      const batchSize = isCrypto ? 10 : 6;
      const found = [];

      for (let i = 0; i < symbolList.length; i += batchSize) {
        const batch = symbolList.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map((sym) => scanSingleSymbol(sym, isCrypto))
        );
        for (const r of batchResults) {
          if (r.status === 'fulfilled' && r.value) found.push(r.value);
        }
      }
      return found;
    };

    let allResults = [];
    if (autoScanMode === 'stocks' || autoScanMode === 'both') {
      allResults = allResults.concat(await runForMode('stocks'));
    }
    if (autoScanMode === 'crypto' || autoScanMode === 'both') {
      allResults = allResults.concat(await runForMode('crypto'));
    }

    // Find NEW signals not seen before
    const newSignals = allResults.filter((r) => {
      const key = `${r.symbol}-${r.goldSignalTime}-${r.strategyId}`;
      return !prevSignalKeysRef.current.has(key);
    });

    // Update known signals
    for (const r of allResults) {
      prevSignalKeysRef.current.add(`${r.symbol}-${r.goldSignalTime}-${r.strategyId}`);
    }

    // Send Telegram if new signals found
    if (newSignals.length > 0 && tgConfig.botToken && tgConfig.chatId) {
      const msg = formatTelegramSignals(newSignals, strategyObj.name, scanTimeframe);
      await sendTelegramMessage(tgConfig.botToken, tgConfig.chatId, msg);
    }

    setLastAutoScan(new Date());
    return { total: allResults.length, new: newSignals.length };
  }, [selectedStrategy, scanTimeframe, scanLimit, autoScanMode, tgConfig.botToken, tgConfig.chatId]);

  // Start/stop auto-scan timer
  const toggleAutoScan = useCallback(() => {
    if (autoScanActive) {
      // Stop
      if (autoScanTimerRef.current) clearInterval(autoScanTimerRef.current);
      autoScanTimerRef.current = null;
      setAutoScanActive(false);
    } else {
      // Start — run immediately, then on interval
      if (!autoScanMode) return;
      setAutoScanActive(true);
      runAutoScan();
      autoScanTimerRef.current = setInterval(runAutoScan, autoScanInterval);
    }
  }, [autoScanActive, autoScanMode, autoScanInterval, runAutoScan]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoScanTimerRef.current) clearInterval(autoScanTimerRef.current);
    };
  }, []);

  // Restart timer if interval changes while active
  useEffect(() => {
    if (!autoScanActive) return;
    if (autoScanTimerRef.current) clearInterval(autoScanTimerRef.current);
    autoScanTimerRef.current = setInterval(runAutoScan, autoScanInterval);
  }, [autoScanInterval, autoScanActive, runAutoScan]);

  const filtered = results.filter(r => {
    if (filterSignal === 'all') return true;
    if (filterSignal === 'green') return r.hasGreenBuy && !r.hasGoldBuy;
    if (filterSignal === 'gold') return r.hasGoldBuy;
    return true;
  });

  const sortedResults = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'best_return':  return b.changeSinceSignal - a.changeSinceSignal;
      case 'worst_return': return a.changeSinceSignal - b.changeSinceSignal;
      case 'newest':       return a.goldSignalDaysAgo - b.goldSignalDaysAgo;
      case 'oldest':       return b.goldSignalDaysAgo - a.goldSignalDaysAgo;
      case 'symbol_az':    return a.symbol.localeCompare(b.symbol);
      default:             return 0;
    }
  });

  const handleRunBacktest = useCallback(async () => {
    if (backtestRunning) return;
    setBacktestRunning(true);
    setBacktestProgress(0);
    try {
      const res = await runFullBacktest(
        SCAN_STRATEGIES,
        fetchBinanceHistory,
        fetchStockHistory,
        (p) => setBacktestProgress(p),
      );
      setBacktestResults(res);
    } catch (err) {
      console.error('Backtest failed:', err);
    } finally {
      setBacktestRunning(false);
      setBacktestProgress(0);
    }
  }, [backtestRunning]);

  const bg = theme === 'light' ? 'hsl(210,20%,96%)' : 'hsl(222,47%,10%)';
  const cardBg = theme === 'light' ? '#ffffff' : 'hsl(222,47%,12%)';
  const borderColor = theme === 'light' ? 'hsl(240,20%,88%)' : 'hsl(217,33%,20%)';
  const textColor = theme === 'light' ? 'hsl(240,15%,15%)' : '#e2e8f0';
  const mutedColor = theme === 'light' ? 'hsl(240,8%,45%)' : 'hsl(215,20%,55%)';
  const sliderFill = ((scanLimit - 1) / (MAX_SCAN_LIMIT - 1)) * 100;
  const lookbackSliderFill = ((signalLookbackWeeks - 1) / (maxLookbackWeeks - 1 || 1)) * 100;
  const activeUniverseSize = mode === 'crypto'
    ? Math.min(scanLimit, CRYPTO_SYMBOLS.length)
    : Math.min(scanLimit, MAX_SCAN_LIMIT, STOCK_SYMBOLS.length);
  const displayedResults = sortedResults;
  const isExplosiveSetup = SCAN_STRATEGIES[selectedStrategy]?.multiTimeframe === true;
  const stocksDisabledForTimeframe = scanTimeframe === '4h' && !isExplosiveSetup;

  const tgSaved = !!(tgConfig.botToken && tgConfig.chatId);
  const sliderTrack = theme === 'light' ? 'hsl(210,20%,88%)' : 'hsl(217,33%,21%)';
  const STRATEGY_SHORT_DESC = {
    vumanchu_b:      'WT cross-up from oversold + RSI < 30',
    vumanchu_b_ultra:'Gold ball + MFI + volume spike',
    multi_timeframe: 'Weekly oversold + daily WT cross',
    explosive_setup: 'BB squeeze + capitulation + MTF',
    rsi_oversold:    'RSI < 25 bounce + divergence',
    macd_cross:      'MACD cross in negative territory',
    golden_cross:    'WT cross + RSI bounce + MFI + vol',
  };

  return (
    <div className="w-full h-screen flex overflow-hidden" style={{ background: bg }}>
      {/* ═══ LEFT SIDEBAR — controls ═══ */}
      <div className="flex-shrink-0 flex flex-col overflow-y-auto border-r p-3 gap-2.5"
        style={{ width: 397, borderColor, background: cardBg }}>

        {/* Strategy selector */}
        <div className="grid grid-cols-2 gap-1.5">
          {Object.values(SCAN_STRATEGIES).map((strategy) => {
            const isActive = selectedStrategy === strategy.id;
            const btEntry = backtestResults[strategy.id];
            const modeKey = mode === 'crypto' ? 'crypto' : 'stocks';
            const btScore = btEntry?.[modeKey];
            const winRate = btScore?.scores?.[btScore?.best]?.winRate;
            return (
              <button key={strategy.id} type="button" disabled={scanning}
                onClick={() => { setSelectedStrategy(strategy.id); setResults([]); setMode(null); }}
                className="rounded-lg border p-2 text-left transition-all"
                style={{
                  background: isActive ? `${strategy.color}15` : 'transparent',
                  borderColor: isActive ? strategy.color : borderColor,
                  opacity: scanning ? 0.6 : 1,
                }}>
                <div className="flex items-center justify-between gap-1">
                  <div className="text-[11px] font-bold leading-tight truncate" style={{ color: isActive ? strategy.color : textColor }}>
                    {strategy.shortName}
                  </div>
                  {winRate != null && (
                    <span className="text-[8px] font-bold px-1 py-0.5 rounded flex-shrink-0"
                      style={{
                        background: winRate >= 0.6 ? 'rgba(16,185,129,0.18)' : winRate >= 0.45 ? 'rgba(234,179,8,0.18)' : 'rgba(239,68,68,0.15)',
                        color: winRate >= 0.6 ? '#10b981' : winRate >= 0.45 ? '#eab308' : '#ef4444',
                      }}>
                      {Math.round(winRate * 100)}%
                    </span>
                  )}
                </div>
                <div className="text-[9px] mt-0.5 leading-snug" style={{ color: mutedColor }}>
                  {STRATEGY_SHORT_DESC[strategy.id]}
                </div>
                {btEntry && btScore?.best && (
                  <div className="text-[8px] mt-0.5 font-mono" style={{ color: strategy.color, opacity: 0.7 }}>
                    best: {SCAN_TIMEFRAMES[btScore.best]?.label ?? btScore.best}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Backtest runner */}
        <button
          type="button"
          onClick={handleRunBacktest}
          disabled={backtestRunning || scanning}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[10px] font-medium transition-all hover:opacity-80"
          style={{ borderColor, color: mutedColor, opacity: (backtestRunning || scanning) ? 0.6 : 1 }}
          title="Fetch historical data for 5 representative symbols per asset class and score each strategy across timeframes"
        >
          {backtestRunning ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Backtesting… {Math.round(backtestProgress * 100)}%</span>
              <div className="ml-auto w-16 h-1 rounded-full overflow-hidden" style={{ background: 'hsl(217,33%,25%)' }}>
                <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.round(backtestProgress * 100)}%` }} />
              </div>
            </>
          ) : (
            <>
              <FlaskConical className="w-3 h-3" />
              <span>{Object.keys(backtestResults).length > 0 ? 'Re-run Backtest' : 'Run Backtest'}</span>
              {Object.keys(backtestResults).length === 0 && (
                <span className="ml-auto text-[8px] text-blue-400">auto-select best TF</span>
              )}
            </>
          )}
        </button>

        {/* Scan universe slider */}
        <div className="rounded-lg border p-2.5" style={{ borderColor }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: mutedColor }}>Number of Symbols</span>
            <span className="text-xs font-semibold" style={{ color: textColor }}>{scanLimit}</span>
          </div>
          <input type="range" min="1" max={MAX_SCAN_LIMIT} step="1" value={scanLimit}
            onChange={(e) => setScanLimit(Number(e.target.value))}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
            style={{ background: `linear-gradient(90deg, #3b82f6 ${sliderFill}%, ${sliderTrack} ${sliderFill}%)` }} />
        </div>

        {/* Timeframe */}
        <div className="rounded-lg border p-2.5"
          style={{ borderColor, opacity: isExplosiveSetup ? 0.4 : 1, pointerEvents: isExplosiveSetup ? 'none' : 'auto' }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: mutedColor }}>Timeframe</span>
            <span className="text-[10px] font-semibold" style={{ color: isExplosiveSetup ? '#f97316' : textColor }}>
              {isExplosiveSetup ? '1W+1D+4H' : activeTimeframe.label}
            </span>
          </div>
          <div className="flex gap-1">
            {isExplosiveSetup
              ? ['1W','1D','4H'].map((tf) => (
                  <span key={tf} className="flex-1 text-center rounded border px-1 py-1 text-[10px] font-semibold"
                    style={{ background: '#f9731618', borderColor: '#f97316', color: '#f97316' }}>{tf}</span>
                ))
              : Object.entries(SCAN_TIMEFRAMES).map(([value, config]) => (
                  <button key={value} type="button" onClick={() => setScanTimeframe(value)} disabled={scanning}
                    className="flex-1 rounded border px-1 py-1 text-[10px] font-semibold transition-colors"
                    style={{
                      background: scanTimeframe === value ? '#2563eb' : 'transparent',
                      borderColor: scanTimeframe === value ? '#2563eb' : borderColor,
                      color: scanTimeframe === value ? '#fff' : textColor,
                    }}>{config.label}</button>
                ))}
          </div>
        </div>

        {/* Lookback slider */}
        <div className="rounded-lg border p-2.5" style={{ borderColor }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: mutedColor }}>Range</span>
            <span className="text-xs font-semibold" style={{ color: textColor }}>{signalLookbackWeeks * 7}d</span>
          </div>
          <input type="range" min="1" max={maxLookbackWeeks} step="1" value={signalLookbackWeeks}
            onChange={(e) => setSignalLookbackWeeks(Number(e.target.value))} disabled={scanning}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer"
            style={{ background: `linear-gradient(90deg, #f59e0b ${lookbackSliderFill}%, ${sliderTrack} ${lookbackSliderFill}%)` }} />
        </div>

        {/* Scan buttons */}
        <div className="flex flex-col gap-1.5">
          {!mode ? (
            <>
              <Button onClick={() => startScan('stocks')} disabled={scanning || stocksDisabledForTimeframe}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs w-full justify-center">
                <TrendingUp className="w-3.5 h-3.5 mr-1.5" />Scan Stocks ({Math.min(scanLimit, MAX_SCAN_LIMIT, STOCK_SYMBOLS.length)})
              </Button>
              <Button onClick={() => startScan('crypto')} disabled={scanning}
                className="bg-orange-600 hover:bg-orange-700 text-white text-xs w-full justify-center">
                <Zap className="w-3.5 h-3.5 mr-1.5" />Scan Crypto ({Math.min(scanLimit, CRYPTO_SYMBOLS.length)})
              </Button>
              <Button onClick={() => startScan('memes')} disabled={scanning}
                className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs w-full justify-center">
                <Flame className="w-3.5 h-3.5 mr-1.5" />Scan Memes ({MEME_SYMBOLS.length})
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-[10px] px-1" style={{ color: mutedColor }}>
                <span>{mode === 'stocks' ? '📈' : '⚡'} {scope} sym • {isExplosiveSetup ? 'MTF' : activeTimeframe.label} • {signalLookbackWeeks * 7}d</span>
              </div>
              <Button onClick={() => startScan(mode)} disabled={scanning || (mode === 'stocks' && stocksDisabledForTimeframe)}
                className={`${mode === 'stocks' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'} text-white text-xs w-full justify-center`}>
                Re-scan ({activeUniverseSize})
              </Button>
              <button type="button" onClick={() => { setMode(null); setScope(null); setResults([]); }}
                className="text-[10px] py-1 transition-colors hover:underline" style={{ color: mutedColor }}>
                ← Change mode
              </button>
            </>
          )}
        </div>

        {/* Telegram & Auto-scan */}
        <div className="rounded-lg border overflow-hidden" style={{ borderColor }}>
          <button type="button" onClick={() => setShowTgSettings((v) => !v)}
            className="w-full flex items-center justify-between px-2.5 py-2 text-[10px] font-medium hover:opacity-80"
            style={{ color: textColor }}>
            <div className="flex items-center gap-1.5">
              <Send className="w-3 h-3 text-blue-400" />
              <span>Telegram</span>
              {tgSaved && <span className="text-[9px] text-emerald-500">● saved</span>}
              {autoScanActive && (
                <span className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold bg-emerald-500/20 text-emerald-400">
                  <span className="w-1 h-1 rounded-full bg-emerald-400 live-dot" /> ON
                </span>
              )}
            </div>
            <Settings2 className="w-3 h-3" style={{ color: mutedColor, transform: showTgSettings ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {showTgSettings && (
            <div className="px-2.5 pb-2.5 pt-1 border-t space-y-2" style={{ borderColor }}>
              <div>
                <label className="block text-[9px] uppercase tracking-wider mb-0.5 font-medium" style={{ color: mutedColor }}>Bot Token</label>
                <input type="password" value={tgConfig.botToken}
                  onChange={(e) => updateTgConfig({ botToken: e.target.value })}
                  placeholder={tgSaved ? '••••••••••••••' : '123456:ABC-DEF...'}
                  className="w-full rounded border px-2 py-1 text-[10px] font-mono"
                  style={{ background: 'transparent', borderColor, color: textColor }} />
              </div>
              <div>
                <label className="block text-[9px] uppercase tracking-wider mb-0.5 font-medium" style={{ color: mutedColor }}>Chat ID</label>
                <div className="flex gap-1.5">
                  <input type="text" value={tgConfig.chatId}
                    onChange={(e) => updateTgConfig({ chatId: e.target.value })}
                    placeholder="-100123456789"
                    className="flex-1 rounded border px-2 py-1 text-[10px] font-mono"
                    style={{ background: 'transparent', borderColor, color: textColor }} />
                  <button type="button" onClick={testTelegram}
                    disabled={!tgConfig.botToken || !tgConfig.chatId || tgTestStatus === 'sending'}
                    className="rounded border px-2 py-1 text-[9px] font-semibold disabled:opacity-40"
                    style={{ borderColor: tgTestStatus === 'ok' ? '#10b981' : tgTestStatus === 'fail' ? '#ef4444' : borderColor, color: tgTestStatus === 'ok' ? '#10b981' : tgTestStatus === 'fail' ? '#ef4444' : textColor }}>
                    {tgTestStatus === 'sending' ? '...' : tgTestStatus === 'ok' ? '✓' : tgTestStatus === 'fail' ? '✗' : 'Test'}
                  </button>
                </div>
              </div>

              {/* Auto-scan */}
              <div className="pt-1.5 border-t space-y-1.5" style={{ borderColor }}>
                <div className="flex gap-1">
                  {['stocks', 'crypto', 'both'].map((m) => (
                    <button key={m} type="button" onClick={() => setAutoScanMode(m)} disabled={autoScanActive}
                      className="flex-1 rounded border px-1 py-0.5 text-[9px] font-semibold capitalize transition-colors"
                      style={{
                        background: autoScanMode === m ? '#2563eb' : 'transparent',
                        borderColor: autoScanMode === m ? '#2563eb' : borderColor,
                        color: autoScanMode === m ? '#fff' : textColor,
                        opacity: autoScanActive ? 0.6 : 1,
                      }}>{m}</button>
                  ))}
                </div>
                <div className="flex gap-1">
                  {AUTO_SCAN_INTERVALS.map(({ value, label }) => (
                    <button key={value} type="button" onClick={() => setAutoScanInterval(value)} disabled={autoScanActive}
                      className="flex-1 rounded border px-1 py-0.5 text-[9px] font-semibold transition-colors"
                      style={{
                        background: autoScanInterval === value ? '#2563eb' : 'transparent',
                        borderColor: autoScanInterval === value ? '#2563eb' : borderColor,
                        color: autoScanInterval === value ? '#fff' : textColor,
                        opacity: autoScanActive ? 0.6 : 1,
                      }}>{label}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={toggleAutoScan}
                    disabled={!autoScanMode || (!tgConfig.botToken && !autoScanActive)}
                    className="flex-1 flex items-center justify-center gap-1 rounded px-2 py-1.5 text-[10px] font-bold disabled:opacity-40"
                    style={{
                      background: autoScanActive ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                      color: autoScanActive ? '#ef4444' : '#10b981',
                      border: `1px solid ${autoScanActive ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                    }}>
                    {autoScanActive ? <><BellOff className="w-3 h-3" /> Stop</> : <><Bell className="w-3 h-3" /> Start</>}
                  </button>
                  {lastAutoScan && (
                    <span className="text-[9px] flex-shrink-0" style={{ color: mutedColor }}>
                      {lastAutoScan.toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ RIGHT PANEL — progress + results ═══ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden p-3 gap-3">

        {/* Status bar + sort */}
        {mode && results.length > 0 && !scanning && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-2 text-xs" style={{ color: textColor }}>
              <Filter className="w-3.5 h-3.5 flex-shrink-0" style={{ color: mutedColor }} />
              <span>{displayedResults.length} signals in last {signalLookbackWeeks * 7}d</span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <ArrowUpDown className="w-3 h-3 flex-shrink-0" style={{ color: mutedColor }} />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="rounded border px-2 py-0.5 text-[10px] font-semibold cursor-pointer"
                style={{ background: cardBg, borderColor, color: textColor, outline: 'none' }}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {scanning && scope > 0 && (
          <div className="rounded-lg border p-2.5 flex-shrink-0" style={{ background: cardBg, borderColor }}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                <span className="text-[11px] font-medium" style={{ color: textColor }}>{scannedCount}/{scope}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-yellow-500 font-semibold">⚡ {results.length}</span>
                <span style={{ color: mutedColor }}>{Math.round((scannedCount / scope) * 100)}%</span>
              </div>
            </div>
            <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: sliderTrack }}>
              <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
                style={{ width: `${(scannedCount / scope) * 100}%`, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }} />
            </div>
          </div>
        )}

        {/* Results grid */}
        <div className="flex-1 overflow-auto">
          {displayedResults.length === 0 && !scanning ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <Brain className="w-10 h-10 text-purple-500/40" />
              <p className="text-xs" style={{ color: mutedColor }}>Select a strategy and scan</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {displayedResults.map((result) => {
              return (
                <button
                  key={result.symbol}
                  type="button"
                  onClick={() => setPreviewResult(result)}
                  className="rounded-lg p-3 border hover:shadow-lg transition-all text-left w-full"
                  style={{ background: cardBg, borderColor }}
                >
                  {/* Row 1: symbol + current price + eye button */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-sm" style={{ color: textColor }}>{result.symbol}</h3>
                      <p className="text-xs mt-0.5 font-mono" style={{ color: mutedColor }}>
                        Now: ${formatAssetPrice(result.price)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Eye — opens live terminal view */}
                      <button
                        type="button"
                        title="Open in terminal"
                        onClick={(e) => { e.stopPropagation(); setTerminalResult(result); }}
                        className="rounded p-1 transition-opacity hover:opacity-70"
                        style={{ color: mutedColor }}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <LinkIcon className="w-3.5 h-3.5 mt-0.5" style={{ color: mutedColor }} />
                    </div>
                  </div>

                  {/* Row 2: strategy badge + signal count + timeframe */}
                  {(() => {
                    const st = SCAN_STRATEGIES[result.strategyId] ?? SCAN_STRATEGIES.vumanchu_b;
                    const BADGE_ICONS = {
                      vumanchu_b:      <Zap className="w-3 h-3" />,
                      vumanchu_b_ultra:<Sparkles className="w-3 h-3" />,
                      multi_timeframe: <Filter className="w-3 h-3" />,
                      explosive_setup: <TrendingUp className="w-3 h-3" />,
                      rsi_oversold:    <TrendingUp className="w-3 h-3" />,
                      macd_cross:      <ChevronRight className="w-3 h-3" />,
                      golden_cross:    <Zap className="w-3 h-3" />,
                    };
                    const BADGE_LABELS = {
                      vumanchu_b:      `Gold ×${result.goldBuyCount}`,
                      vumanchu_b_ultra:`Ultra ×${result.goldBuyCount}`,
                      multi_timeframe: `MTF ×${result.goldBuyCount}`,
                      explosive_setup: `Coil ×${result.goldBuyCount}`,
                      rsi_oversold:    `RSI ×${result.goldBuyCount}`,
                      macd_cross:      `MACD ×${result.goldBuyCount}`,
                      golden_cross:    `MR ×${result.goldBuyCount}`,
                    };
                    return (
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
                          style={{ background: `${st.color}20`, color: st.color }}>
                          {BADGE_ICONS[result.strategyId]}
                          {BADGE_LABELS[result.strategyId]}
                        </div>
                        <span className="text-[10px]" style={{ color: mutedColor }}>
                          {result.scanTimeframe?.toUpperCase()} • {formatDaysAgo(result.goldSignalDaysAgo)}
                        </span>
                      </div>
                    );
                  })()}

                  {/* Row 3: signal price → current price + % since signal */}
                  <div
                    className="mt-1 rounded-lg px-3 py-2.5"
                    style={{
                      background: result.changeSinceSignal >= 0
                        ? 'rgba(16,185,129,0.08)'
                        : 'rgba(239,68,68,0.08)',
                      border: `1px solid ${result.changeSinceSignal >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.18)'}`,
                    }}
                  >
                    <div className="text-[10px] mb-2 uppercase tracking-widest font-medium" style={{ color: mutedColor }}>Since gold signal</div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-mono">
                        <div className="flex flex-col">
                          <span className="text-[10px]" style={{ color: mutedColor }}>Signal</span>
                          <span className="text-sm font-semibold text-yellow-500">${formatAssetPrice(result.goldSignalPrice)}</span>
                        </div>
                        <span className="text-base" style={{ color: mutedColor }}>→</span>
                        <div className="flex flex-col">
                          <span className="text-[10px]" style={{ color: mutedColor }}>Now</span>
                          <span className="text-sm font-semibold" style={{ color: textColor }}>${formatAssetPrice(result.price)}</span>
                        </div>
                      </div>
                      <div className={`flex flex-col items-end ${result.changeSinceSignal >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        <div className="flex items-center gap-1">
                          {result.changeSinceSignal >= 0
                            ? <TrendingUp className="h-4 w-4" />
                            : <TrendingDown className="h-4 w-4" />}
                          <span className="text-base font-bold">
                            {result.changeSinceSignal >= 0 ? '+' : ''}{result.changeSinceSignal.toFixed(1)}%
                          </span>
                        </div>
                        <span className="text-[10px] opacity-70">return</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      </div>

      {previewResult ? (
        <Suspense fallback={null}>
          <AssetPreviewModal
            result={previewResult}
            mode={mode}
            onClose={() => setPreviewResult(null)}
          />
        </Suspense>
      ) : null}

      {terminalResult ? (
        <Suspense fallback={null}>
          <SymbolTerminalModal
            result={terminalResult}
            onClose={() => setTerminalResult(null)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
