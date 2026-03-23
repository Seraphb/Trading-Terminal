import React, { useMemo, useState, useRef, useCallback } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts';

// ══════════════════════════════════════════════════════════════════════════════
// SNIPER SIGNALS v2 — Smart Money Confluence Engine
//
// Factor stack (weights sum to 100):
//  1. Market Structure — BOS / ChoCH  (25 pts)  ← institutional price action
//  2. Fair Value Gap fills             (20 pts)  ← imbalance exploitation
//  3. Order Block retests              (18 pts)  ← supply / demand zones
//  4. Liquidity Sweeps                 (12 pts)  ← stop-hunt reversal
//  5. EMA Ribbon (8/21/50)             (13 pts)  ← macro trend filter
//  6. Wave Trend oscillator            ( 8 pts)  ← momentum timing
//  7. Volume confirmation              ( 4 pts)  ← institutional participation
//                                     ═══════
//                               Total: 100 pts
//
// Tiers:  ◆◆ ELITE  ≥ 75  |  ◆ STRONG ≥ 55  |  ● SIGNAL ≥ 40
// Cooldown: 5 bars between same-direction signals
// Regime filter: ATR percentile < 25th → halve scores (chop suppression)
// ══════════════════════════════════════════════════════════════════════════════

// ── Math primitives ───────────────────────────────────────────────────────────
function ema(src, len) {
  const k = 2 / (len + 1);
  const out = new Array(src.length);
  let v = src[0] ?? 0;
  for (let i = 0; i < src.length; i++) {
    v = (src[i] ?? v) * k + v * (1 - k);
    out[i] = v;
  }
  return out;
}

function sma(src, len) {
  const out = new Array(src.length);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= len) sum -= src[i - len];
    out[i] = sum / Math.min(i + 1, len);
  }
  return out;
}

// Wilder's RMA — used for ATR
function rma(src, len) {
  const out = new Array(src.length).fill(0);
  if (src.length < len) return out;
  let val = src.slice(0, len).reduce((a, b) => a + b, 0) / len;
  out[len - 1] = val;
  for (let i = len; i < src.length; i++) {
    val = (val * (len - 1) + src[i]) / len;
    out[i] = val;
  }
  return out;
}

function atrCalc(klines, len = 14) {
  const n = klines.length;
  const out = new Array(n).fill(0);
  if (n < 2) return out;
  const trs = [];
  for (let i = 1; i < n; i++) {
    trs.push(Math.max(
      klines[i].high - klines[i].low,
      Math.abs(klines[i].high - klines[i - 1].close),
      Math.abs(klines[i].low  - klines[i - 1].close),
    ));
  }
  const smoothed = rma(trs, len);
  for (let i = 0; i < smoothed.length; i++) out[i + 1] = smoothed[i];
  return out;
}

function rsiCalc(closes, len = 14) {
  const n = closes.length;
  const out = new Array(n).fill(50);
  if (n < len + 1) return out;
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= len; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgG += d; else avgL -= d;
  }
  avgG /= len; avgL /= len;
  out[len] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = len + 1; i < n; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (len - 1) + (d > 0 ? d : 0)) / len;
    avgL = (avgL * (len - 1) + (d < 0 ? -d : 0)) / len;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

function waveTrendCalc(hlc3, chLen = 9, avgLen = 12, maLen = 3) {
  const esaArr = ema(hlc3, chLen);
  const de  = ema(hlc3.map((v, i) => Math.abs(v - esaArr[i])), chLen);
  const ci  = hlc3.map((v, i) => de[i] === 0 ? 0 : (v - esaArr[i]) / (0.015 * de[i]));
  const wt1 = ema(ci, avgLen);
  const wt2 = sma(wt1, maLen);
  return { wt1, wt2 };
}

// ── Smart Money Concepts Engine ───────────────────────────────────────────────

// 1. Fractal pivot detection (left=2, right=2 — confirmed with 4-bar window)
//    Pivot at index p is confirmed after we see bar p+right.
function detectPivots(klines, left = 2, right = 2) {
  const n = klines.length;
  const pivHigh = []; // { idx, price }
  const pivLow  = [];

  for (let i = left; i < n - right; i++) {
    const h = klines[i].high;
    const l = klines[i].low;
    let isPH = true, isPL = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (klines[j].high >= h) isPH = false;
      if (klines[j].low  <= l) isPL = false;
      if (!isPH && !isPL) break;
    }
    if (isPH) pivHigh.push({ idx: i, price: h });
    if (isPL) pivLow .push({ idx: i, price: l });
  }

  return { pivHigh, pivLow };
}

// 2. BOS / ChoCH per bar
//    BOS  = trend continuation (close breaks beyond last swing in same direction)
//    ChoCH = trend change (first break opposite to current bias)
function detectStructure(klines, pivHigh, pivLow) {
  const RIGHT = 2;
  const n = klines.length;
  const structure = new Array(n).fill(null);
  let lastSH = null; // most recent confirmed swing high available for use
  let lastSL = null;
  let bias   = 'neutral';
  let shPtr  = 0, slPtr = 0;

  for (let i = 0; i < n; i++) {
    // Admit pivots whose right-bar window is complete
    while (shPtr < pivHigh.length && pivHigh[shPtr].idx + RIGHT <= i) {
      lastSH = pivHigh[shPtr++];
    }
    while (slPtr < pivLow.length && pivLow[slPtr].idx + RIGHT <= i) {
      lastSL = pivLow[slPtr++];
    }

    const close = klines[i].close;

    if (lastSH && close > lastSH.price) {
      const isChoCH = bias === 'bear';
      structure[i] = { score: 1, isChoCH, level: lastSH.price };
      bias   = 'bull';
      lastSH = null; // consumed — wait for next pivot
    } else if (lastSL && close < lastSL.price) {
      const isChoCH = bias === 'bull';
      structure[i] = { score: -1, isChoCH, level: lastSL.price };
      bias   = 'bear';
      lastSL = null;
    }
  }

  // Carry running bias forward for regime colouring
  const biasByBar = new Array(n).fill('neutral');
  let runBias = 'neutral';
  for (let i = 0; i < n; i++) {
    if (structure[i]) runBias = structure[i].score > 0 ? 'bull' : 'bear';
    biasByBar[i] = runBias;
  }

  return { structure, biasByBar };
}

// 3. Fair Value Gaps (3-bar imbalance)
//    bullFVG: klines[i].low > klines[i-2].high  (gap up — unfilled air below)
//    bearFVG: klines[i].high < klines[i-2].low  (gap down)
//    Signal fires when price RETRACES into the gap from the correct side.
function detectFVGSignals(klines) {
  const n = klines.length;
  const out = new Array(n).fill(0);
  const FVG_EXPIRY = 25; // bars until gap expires

  const bullFVGs = []; // { lo, hi, born }
  const bearFVGs = [];

  for (let i = 2; i < n; i++) {
    // Register new FVGs
    if (klines[i].low > klines[i - 2].high) {
      bullFVGs.push({ lo: klines[i - 2].high, hi: klines[i].low, born: i });
    }
    if (klines[i].high < klines[i - 2].low) {
      bearFVGs.push({ lo: klines[i].high, hi: klines[i - 2].low, born: i });
    }

    // Check retracement into active bullish FVG (expect bounce up)
    for (const fvg of bullFVGs) {
      if (i <= fvg.born || i - fvg.born > FVG_EXPIRY) continue;
      if (klines[i].low <= fvg.hi && klines[i].close >= fvg.lo) {
        out[i] = 1;
        break;
      }
    }

    // Check retracement into active bearish FVG (expect bounce down)
    if (out[i] === 0) {
      for (const fvg of bearFVGs) {
        if (i <= fvg.born || i - fvg.born > FVG_EXPIRY) continue;
        if (klines[i].high >= fvg.lo && klines[i].close <= fvg.hi) {
          out[i] = -1;
          break;
        }
      }
    }
  }

  return out;
}

// 4. Order Block retests
//    After bullish BOS: the last bearish candle before the impulse = bullish OB
//    After bearish BOS: the last bullish candle = bearish OB
//    Signal fires when price returns to the OB zone.
function detectOrderBlockSignals(klines, structure) {
  const n = klines.length;
  const out = new Array(n).fill(0);
  const OB_EXPIRY = 35;

  const bullOBs = []; // { lo, hi, born }
  const bearOBs = [];

  for (let i = 3; i < n; i++) {
    // Register OBs on BOS/ChoCH events
    if (structure[i]?.score === 1) {
      for (let j = i - 1; j >= Math.max(0, i - 25); j--) {
        if (klines[j].close < klines[j].open) {
          const lo = Math.min(klines[j].open, klines[j].close);
          const hi = Math.max(klines[j].open, klines[j].close);
          bullOBs.push({ lo, hi, born: i });
          break;
        }
      }
    }
    if (structure[i]?.score === -1) {
      for (let j = i - 1; j >= Math.max(0, i - 25); j--) {
        if (klines[j].close > klines[j].open) {
          const lo = Math.min(klines[j].open, klines[j].close);
          const hi = Math.max(klines[j].open, klines[j].close);
          bearOBs.push({ lo, hi, born: i });
          break;
        }
      }
    }

    // Retest detection
    for (const ob of bullOBs) {
      if (i <= ob.born || i - ob.born > OB_EXPIRY) continue;
      if (klines[i].low <= ob.hi && klines[i].close >= ob.lo) {
        out[i] = 1; break;
      }
    }
    if (out[i] === 0) {
      for (const ob of bearOBs) {
        if (i <= ob.born || i - ob.born > OB_EXPIRY) continue;
        if (klines[i].high >= ob.lo && klines[i].close <= ob.hi) {
          out[i] = -1; break;
        }
      }
    }
  }

  return out;
}

// 5. Liquidity Sweeps ("stop hunt reversal")
//    Price wicks beyond a recent confirmed swing high/low, then closes BACK inside.
//    This is one of the highest-quality reversal setups in institutional playbooks.
function detectLiquiditySweeps(klines, pivHigh, pivLow) {
  const RIGHT   = 2;
  const LOOKBACK = 12; // bars to look back for the swept swing
  const n = klines.length;
  const out = new Array(n).fill(0);

  const activeHighs = [];
  const activeLows  = [];
  let shPtr = 0, slPtr = 0;

  for (let i = 0; i < n; i++) {
    while (shPtr < pivHigh.length && pivHigh[shPtr].idx + RIGHT <= i) {
      activeHighs.push(pivHigh[shPtr++]);
    }
    while (slPtr < pivLow.length && pivLow[slPtr].idx + RIGHT <= i) {
      activeLows.push(pivLow[slPtr++]);
    }

    if (i < 3) continue;

    // Bullish sweep: wick dips below recent swing low, candle closes BACK ABOVE it
    const recentLows = activeLows.filter(sl => sl.idx >= i - LOOKBACK);
    for (const sl of recentLows.slice(-5)) {
      if (klines[i].low < sl.price && klines[i].close > sl.price) {
        out[i] = 1;
        break;
      }
    }

    // Bearish sweep: wick pokes above recent swing high, closes BACK BELOW it
    if (out[i] === 0) {
      const recentHighs = activeHighs.filter(sh => sh.idx >= i - LOOKBACK);
      for (const sh of recentHighs.slice(-5)) {
        if (klines[i].high > sh.price && klines[i].close < sh.price) {
          out[i] = -1;
          break;
        }
      }
    }
  }

  return out;
}

// ── Scoring helpers ───────────────────────────────────────────────────────────
function emaAlignScore(ema8, ema21, ema50, i) {
  const bull = ema8[i] > ema21[i] && ema21[i] > ema50[i];
  const bear = ema8[i] < ema21[i] && ema21[i] < ema50[i];
  if (bull) return  1;
  if (bear) return -1;
  if (ema8[i] > ema21[i]) return  0.45;
  if (ema8[i] < ema21[i]) return -0.45;
  return 0;
}

function wtScore(wt1, wt2, i) {
  if (i < 1) return 0;
  const crossUp   = wt1[i - 1] <= wt2[i - 1] && wt1[i] > wt2[i];
  const crossDown = wt1[i - 1] >= wt2[i - 1] && wt1[i] < wt2[i];
  if (crossUp   && wt2[i] < -53) return  1;
  if (crossDown && wt2[i] >  53) return -1;
  if (crossUp   && wt2[i] < -20) return  0.5;
  if (crossDown && wt2[i] >  20) return -0.5;
  return 0;
}

// ── ATR regime percentile ─────────────────────────────────────────────────────
function atrRegimeFactor(atrArr, i, window = 50) {
  if (i < window) return 1.0;
  const slice  = atrArr.slice(i - window, i);
  const sorted = [...slice].sort((a, b) => a - b);
  const rank   = sorted.filter(x => x <= atrArr[i]).length / sorted.length;
  if (rank < 0.25) return 0.5;  // chop — reduce signals
  if (rank < 0.40) return 0.75;
  return 1.0;
}

// ── Price formatter ───────────────────────────────────────────────────────────
function formatPrice(p) {
  if (p == null) return '';
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 100)   return p.toFixed(1);
  if (p >= 1)     return p.toFixed(2);
  return p.toFixed(4);
}

// ── Signal tier colours ───────────────────────────────────────────────────────
const SIGNAL_THRESHOLD = 48;   // raised — fewer but cleaner entries
const STRONG_THRESHOLD = 62;
const ELITE_THRESHOLD  = 78;
const COOLDOWN_BARS    = 8;    // wider cooldown, less signal clustering

const WEIGHTS = {
  struct: 25,
  fvg:    20,
  ob:     18,
  sweep:  12,
  ema:    13,
  wt:      8,
  vol:     4,
};

function signalColor(type) {
  if (!type) return '#94a3b8';
  if (type.includes('BUY'))  {
    if (type.startsWith('ELITE'))  return '#ffd700';
    if (type.startsWith('STRONG')) return '#00f5a0';
    return '#00e676';
  }
  if (type.startsWith('ELITE'))  return '#ff9500';
  if (type.startsWith('STRONG')) return '#ff4d6d';
  return '#ff5252';
}

function tierFromScore(abs) {
  if (abs >= ELITE_THRESHOLD)  return 3;
  if (abs >= STRONG_THRESHOLD) return 2;
  if (abs >= SIGNAL_THRESHOLD) return 1;
  return 0;
}

// ── Main computation ──────────────────────────────────────────────────────────
function buildSignalData(klines) {
  if (klines.length < 60) return [];

  const closes  = klines.map(k => k.close);
  const volumes = klines.map(k => k.volume);
  const hlc3    = klines.map(k => (k.high + k.low + k.close) / 3);

  // Indicators
  const ema8  = ema(closes, 8);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const rsi   = rsiCalc(closes, 14);
  const atr   = atrCalc(klines, 14);
  const volSma = sma(volumes, 20);
  const { wt1, wt2 } = waveTrendCalc(hlc3);

  // SMC layers
  const { pivHigh, pivLow }         = detectPivots(klines, 2, 2);
  const { structure, biasByBar }    = detectStructure(klines, pivHigh, pivLow);
  const fvgSig                       = detectFVGSignals(klines);
  const obSig                        = detectOrderBlockSignals(klines, structure);
  const sweepSig                     = detectLiquiditySweeps(klines, pivHigh, pivLow);

  // Per-bar result
  const result = [];
  let lastSignalBar = -100;
  let lastSignalDir = 0;

  for (let i = 0; i < klines.length; i++) {
    const st     = structure[i];
    const stScoreRaw = st?.score ?? 0;
    // ChoCH is a more decisive signal than plain BOS
    const stWeight = st?.isChoCH ? 1.0 : 0.72;

    const emaS   = emaAlignScore(ema8, ema21, ema50, i);
    const wtS    = wtScore(wt1, wt2, i);
    const fvgS   = fvgSig[i];
    const obS    = obSig[i];
    const swpS   = sweepSig[i];

    // Volume: only adds signal if it agrees with the ema bias direction
    const emaDir = emaS > 0 ? 1 : emaS < 0 ? -1 : 0;
    const volS   = volumes[i] > volSma[i] * 1.5 ? emaDir : 0;

    const rawScore =
      stScoreRaw * stWeight * WEIGHTS.struct +
      fvgS  * WEIGHTS.fvg   +
      obS   * WEIGHTS.ob    +
      swpS  * WEIGHTS.sweep +
      emaS  * WEIGHTS.ema   +
      wtS   * WEIGHTS.wt    +
      volS  * WEIGHTS.vol;

    // Regime filter — quiet/choppy markets get reduced signal strength
    const regimeFactor = atrRegimeFactor(atr, i);
    const confluence   = Math.max(-100, Math.min(100, rawScore * regimeFactor));

    // Cooldown — prevent radar-painting the chart
    const coolOk = (i - lastSignalBar) >= COOLDOWN_BARS;
    const isBuy  = confluence >=  SIGNAL_THRESHOLD && coolOk;
    const isSell = confluence <= -SIGNAL_THRESHOLD && coolOk;

    let signalType = null;
    if (isBuy) {
      const tier = tierFromScore(confluence);
      signalType = tier === 3 ? 'ELITE_BUY' : tier === 2 ? 'STRONG_BUY' : 'BUY';
      lastSignalDir = 1; lastSignalBar = i;
    } else if (isSell) {
      const tier = tierFromScore(Math.abs(confluence));
      signalType = tier === 3 ? 'ELITE_SELL' : tier === 2 ? 'STRONG_SELL' : 'SELL';
      lastSignalDir = -1; lastSignalBar = i;
    }

    // ATR-based targets (asymmetric R:R)
    const a = atr[i] || 0;
    let tp1 = null, tp2 = null, tp3 = null, sl = null;
    if (isBuy) {
      tp1 = klines[i].close + a * 1.5;
      tp2 = klines[i].close + a * 2.5;
      tp3 = klines[i].close + a * 4.2;
      sl  = klines[i].close - a * 1.1;
    } else if (isSell) {
      tp1 = klines[i].close - a * 1.5;
      tp2 = klines[i].close - a * 2.5;
      tp3 = klines[i].close - a * 4.2;
      sl  = klines[i].close + a * 1.1;
    }

    // Risk:Reward
    const rrRatio = tp2 && sl
      ? Math.abs(tp2 - klines[i].close) / Math.abs(klines[i].close - sl)
      : null;

    // How many factors fired
    const factorCount = [
      Math.abs(stScoreRaw) > 0,
      Math.abs(fvgS)  > 0,
      Math.abs(obS)   > 0,
      Math.abs(swpS)  > 0,
      Math.abs(emaS)  > 0.3,
      Math.abs(wtS)   > 0.3,
      Math.abs(volS)  > 0,
    ].filter(Boolean).length;

    const tier = tierFromScore(Math.abs(confluence));

    result.push({
      idx: i,
      price: klines[i].close,
      confluence,
      confluenceBar: confluence,
      rsi: rsi[i],
      wt1:  wt1[i],
      signalType,
      signalColor: signalColor(signalType),
      // Fixed Y position in oscillator: buys at bottom, sells at top
      signalDot: isBuy ? -88 : isSell ? 88 : null,
      isStrong: tier >= 2,
      isElite:  tier === 3,
      tier,
      tp1, tp2, tp3, sl, rrRatio,
      factorCount,
      // Factor breakdown for tooltip
      stScore: stScoreRaw * stWeight,
      fvgS, obS, swpS,
      isChoCH:  st?.isChoCH ?? false,
      bias: biasByBar[i],
    });
  }

  return result;
}

// ── Backtest engine ───────────────────────────────────────────────────────────
// Rules:
//  • Entry = signal candle close
//  • Only trades with a pullback confirmation (OB retest, FVG fill, or liq sweep)
//    to avoid chasing raw breakouts
//  • Exit = TP1 (1.5 ATR) or SL (1.1 ATR), whichever hits first
//  • Time-exit after 55 bars at close price
function runBacktest(signalData, klines) {
  const trades = [];

  // Only take signals that have at least one pullback/zone confirmation
  const signals = signalData.filter(d =>
    d.signalType &&
    d.tp1 != null &&
    d.sl  != null &&
    (Math.abs(d.obS) > 0 || Math.abs(d.fvgS) > 0 || Math.abs(d.swpS) > 0),
  );

  for (const sig of signals) {
    const isBuy     = sig.signalType.includes('BUY');
    const entry     = sig.price;
    const tp        = sig.tp1;   // 1.5 ATR — realistic first target
    const sl        = sig.sl;    // 1.1 ATR stop
    let   result    = 'open';
    let   exitPrice = null;
    let   barsHeld  = 0;

    for (let i = sig.idx + 1; i < Math.min(sig.idx + 56, klines.length); i++) {
      barsHeld++;
      const { high, low, close } = klines[i];

      if (isBuy) {
        if (low  <= sl) { result = 'loss'; exitPrice = sl; break; }
        if (high >= tp) { result = 'win';  exitPrice = tp; break; }
      } else {
        if (high >= sl) { result = 'loss'; exitPrice = sl; break; }
        if (low  <= tp) { result = 'win';  exitPrice = tp; break; }
      }

      if (barsHeld === 55) { result = 'timeout'; exitPrice = close; }
    }

    if (result === 'open') continue;

    const pnlPct = isBuy
      ? ((exitPrice - entry) / entry) * 100
      : ((entry - exitPrice) / entry) * 100;

    trades.push({
      idx: sig.idx,
      signalType: sig.signalType,
      tier:       sig.tier,
      entry,
      exitPrice,
      tp, sl,
      result,
      pnlPct,
      barsHeld,
      factorCount: sig.factorCount,
    });
  }

  if (!trades.length) return null;

  const wins     = trades.filter(t => t.result === 'win');
  const losses   = trades.filter(t => t.result === 'loss');
  const timeouts = trades.filter(t => t.result === 'timeout');
  const totalPnl = trades.reduce((s, t) => s + t.pnlPct, 0);
  const winRate  = (wins.length / trades.length) * 100;

  // Max drawdown (running cumulative)
  let peak = 0, cum = 0, maxDD = 0;
  for (const t of trades) {
    cum += t.pnlPct;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }

  const avgWin  = wins.length   ? wins.reduce((s, t)   => s + t.pnlPct, 0) / wins.length   : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0;
  const profitFactor = avgLoss !== 0 ? Math.abs(avgWin * wins.length / (avgLoss * losses.length)) : Infinity;

  return { trades, wins, losses, timeouts, totalPnl, winRate, maxDD, avgWin, avgLoss, profitFactor };
}

// ── Backtest modal ────────────────────────────────────────────────────────────
function BacktestModal({ bt, onClose }) {
  if (!bt) return null;
  const { trades, wins, losses, timeouts, totalPnl, winRate, maxDD, avgWin, avgLoss, profitFactor } = bt;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col"
        style={{
          background: 'hsl(222,47%,10%)',
          border: '1px solid hsl(217,33%,22%)',
          borderRadius: 12,
          width: 680,
          maxHeight: '90vh',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(217,33%,20%)]">
          <div>
            <span className="text-sm font-bold text-white">⚡ Sniper v2 Backtest</span>
            <span className="ml-2 text-[10px] text-slate-500">OB/FVG/Sweep confirmed entries → TP1 or SL</span>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-white text-lg leading-none px-1">✕</button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-px p-4" style={{ background: 'transparent' }}>
          {[
            { label: 'Total P&L',      val: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(1)}%`,  color: totalPnl >= 0 ? '#00f5a0' : '#ff4d6d' },
            { label: 'Win Rate',       val: `${winRate.toFixed(0)}%`,                               color: winRate >= 55 ? '#00f5a0' : winRate >= 45 ? '#f59e0b' : '#ff4d6d' },
            { label: 'Profit Factor',  val: isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞', color: profitFactor >= 1.5 ? '#00f5a0' : '#ff4d6d' },
            { label: 'Max Drawdown',   val: `-${maxDD.toFixed(1)}%`,                                color: '#fb923c' },
            { label: 'Trades',         val: trades.length,    color: '#94a3b8' },
            { label: 'Wins',           val: wins.length,      color: '#00f5a0' },
            { label: 'Losses',         val: losses.length,    color: '#ff4d6d' },
            { label: 'Timeouts',       val: timeouts.length,  color: '#f59e0b' },
            { label: 'Avg Win',        val: `+${avgWin.toFixed(2)}%`,   color: '#00f5a0' },
            { label: 'Avg Loss',       val: `${avgLoss.toFixed(2)}%`,   color: '#ff4d6d' },
          ].map(({ label, val, color }) => (
            <div key={label} className="flex flex-col items-center justify-center py-2 px-1 rounded" style={{ background: 'hsl(222,47%,13%)' }}>
              <span className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">{label}</span>
              <span className="font-bold font-mono text-base" style={{ color }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Equity curve (simple bar chart) */}
        <div className="px-4 pb-2">
          <div className="text-[9px] text-slate-600 uppercase tracking-wide mb-1">Equity Curve</div>
          <div className="flex items-end gap-px" style={{ height: 48 }}>
            {(() => {
              let cum = 0;
              const equity = trades.map(t => { cum += t.pnlPct; return cum; });
              const min = Math.min(0, ...equity);
              const max = Math.max(0, ...equity);
              const range = max - min || 1;
              const zero  = (0 - min) / range;
              return equity.map((v, i) => {
                const norm  = (v - min) / range;
                const color = v >= 0 ? '#00f5a0' : '#ff4d6d';
                return (
                  <div key={i} className="flex-1 flex flex-col justify-end" style={{ height: '100%' }}>
                    {v >= 0
                      ? <div style={{ height: `${(norm - zero) * 100}%`, background: color, opacity: 0.75, borderRadius: '1px 1px 0 0', minHeight: 1 }} />
                      : <div style={{ height: `${(zero - norm) * 100}%`, background: color, opacity: 0.75, borderRadius: '0 0 1px 1px', marginTop: 'auto', minHeight: 1 }} />
                    }
                  </div>
                );
              });
            })()}
          </div>
          <div className="border-t border-slate-800 mt-0" />
        </div>

        {/* Trade list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ minHeight: 0 }}>
          <div className="text-[9px] text-slate-600 uppercase tracking-wide mb-1">Trade Log</div>
          <div className="space-y-0.5">
            {trades.map((t, i) => {
              const isBuy = t.signalType.includes('BUY');
              const col   = t.result === 'win' ? '#00f5a0' : t.result === 'loss' ? '#ff4d6d' : '#f59e0b';
              return (
                <div key={i} className="flex items-center gap-3 text-[11px] py-1 px-3 rounded" style={{ background: 'hsl(222,47%,12%)' }}>
                  <span style={{ color: isBuy ? '#00f5a0' : '#ff4d6d', minWidth: 14, fontSize: 12 }}>{isBuy ? '▲' : '▼'}</span>
                  <span className="text-slate-400 font-mono" style={{ minWidth: 60 }}>{formatPrice(t.entry)}</span>
                  <span className="text-slate-700">→</span>
                  <span className="font-mono text-slate-300" style={{ minWidth: 60 }}>{formatPrice(t.exitPrice)}</span>
                  <span className="text-slate-600">{t.barsHeld}b</span>
                  <span className="ml-auto font-bold font-mono text-sm" style={{ color: col }}>
                    {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(2)}%
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: `${col}18`, color: col }}>{t.result}</span>
                  <span className="text-slate-600 text-[10px]">{t.factorCount}f</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Toggle chip ───────────────────────────────────────────────────────────────
function Chip({ label, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-all border border-transparent ${active ? 'opacity-100' : 'opacity-20 hover:opacity-40'}`}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-slate-300">{label}</span>
    </button>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function SniperTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d || d.confluence == null) return null;

  const col = signalColor(d.signalType);

  return (
    <div style={{
      background: 'hsl(222,47%,10%)',
      border: '1px solid hsl(217,33%,24%)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 10,
      color: '#e2e8f0',
      minWidth: 168,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    }}>
      {/* Score */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-slate-600 text-[9px] uppercase tracking-wider">Confluence</span>
        <span className="font-bold text-sm" style={{ color: d.confluence > 0 ? '#00f5a0' : d.confluence < 0 ? '#ff4d6d' : '#94a3b8' }}>
          {d.confluence > 0 ? '+' : ''}{d.confluence.toFixed(0)}
        </span>
        <span className="text-slate-700 text-[9px]">/ 100</span>
        {d.bias !== 'neutral' && (
          <span className="ml-auto text-[9px] px-1 rounded" style={{
            background: d.bias === 'bull' ? 'rgba(0,245,160,0.12)' : 'rgba(255,77,109,0.12)',
            color: d.bias === 'bull' ? '#00f5a0' : '#ff4d6d',
          }}>
            {d.bias === 'bull' ? '▲ bull' : '▼ bear'}
          </span>
        )}
      </div>

      {/* Factor breakdown */}
      <div className="space-y-0.5 border-t border-slate-800 pt-1.5 mb-1.5">
        {[
          { label: 'Structure',   val: d.stScore,  w: null },
          { label: 'FVG Fill',    val: d.fvgS,     w: WEIGHTS.fvg  },
          { label: 'Order Block', val: d.obS,      w: WEIGHTS.ob   },
          { label: 'Liq Sweep',   val: d.swpS,     w: WEIGHTS.sweep },
        ].map(({ label, val, w }) => {
          if (!val) return null;
          const pts = w ? Math.round(val * w) : Math.round(d.stScore * WEIGHTS.struct);
          return (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: val > 0 ? '#00f5a0' : '#ff4d6d' }} />
              <span className="text-slate-500 flex-1 text-[9px]">{label}</span>
              <span className="font-mono text-[9px]" style={{ color: val > 0 ? '#00f5a0' : '#ff4d6d' }}>
                {pts > 0 ? '+' : ''}{pts}
              </span>
            </div>
          );
        })}
      </div>

      {/* Signal details */}
      {d.signalType && (
        <div className="border-t border-slate-800 pt-1.5 space-y-0.5">
          <div className="font-bold text-[11px]" style={{ color: col }}>
            {d.isElite ? '◆◆ ' : d.isStrong ? '◆ ' : '● '}{d.signalType} @ {formatPrice(d.price)}
          </div>
          <div className="text-slate-600 text-[9px]">
            {d.factorCount}/7 factors · {d.isChoCH ? 'ChoCH reversal' : 'BOS continuation'}
            {d.rrRatio ? ` · R:R ${d.rrRatio.toFixed(1)}x` : ''}
          </div>
          {d.tp1 && <div style={{ color: '#60a5fa' }}>TP1 {formatPrice(d.tp1)}</div>}
          {d.tp2 && <div style={{ color: '#818cf8' }}>TP2 {formatPrice(d.tp2)}</div>}
          {d.tp3 && <div style={{ color: '#c084fc' }}>TP3 {formatPrice(d.tp3)}</div>}
          {d.sl  && <div style={{ color: '#fb923c' }}>SL  {formatPrice(d.sl)}</div>}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════════
export default function SniperSignals({ klines, visibleRange, rightPad = 0, inspectionX = null }) {
  const [yOffset, setYOffset]   = useState(0);
  const dragStartY   = useRef(null);
  const dragStartOff = useRef(0);

  const [show, setShow] = useState({
    confluence: true,
    signals:    true,
    targets:    true,
    wt:         true,
    rsi:        false,
  });
  const toggle = key => setShow(s => ({ ...s, [key]: !s[key] }));
  const [showBT, setShowBT] = useState(false);

  // All data computed from raw klines
  const data = useMemo(() => buildSignalData(klines), [klines]);
  const btResult = useMemo(() => showBT ? runBacktest(data, klines) : null, [showBT, data, klines]);

  // Y-axis drag
  const handleYDrag = useCallback((e) => {
    e.stopPropagation();
    dragStartY.current   = e.clientY;
    dragStartOff.current = yOffset;
    const onMove = ev => setYOffset(dragStartOff.current + (dragStartY.current - ev.clientY) * 0.5);
    const onUp   = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [yOffset]);

  const [startIdx, endIdx] = visibleRange ?? [Math.max(0, data.length - 120), data.length];
  const realSlice = data.slice(startIdx, endIdx);
  if (!realSlice.length) return null;

  const blanks  = Array.from({ length: rightPad }, (_, i) => ({ idx: endIdx + i }));
  const visible = rightPad > 0 ? [...realSlice, ...blanks] : realSlice;

  const lastSignal = [...visible].reverse().find(d => d.signalType);
  const yMin = -100 + yOffset;
  const yMax =  100 + yOffset;

  const chips = [
    { key: 'confluence', label: 'Score',   color: '#3b82f6' },
    { key: 'signals',    label: 'Signals', color: '#00f5a0' },
    { key: 'targets',    label: 'Targets', color: '#60a5fa' },
    { key: 'wt',         label: 'WT',      color: '#a78bfa' },
    { key: 'rsi',        label: 'RSI',     color: '#f59e0b' },
  ];

  return (
    <div className="terminal-panel flex flex-col" style={{ height: '100%' }}>
      {/* ── Header ── */}
      <div className="flex items-center flex-wrap gap-0.5 px-2 py-0.5 border-b border-[hsl(217,33%,20%)] flex-shrink-0">
        <span className="mr-1.5 text-[10px] font-bold" style={{ color: '#00f5a0', letterSpacing: '0.04em' }}>
          ⚡ SNIPER v2
        </span>

        {chips.map(c => (
          <Chip key={c.key} label={c.label} active={show[c.key]} color={c.color} onClick={() => toggle(c.key)} />
        ))}

        <button
          onClick={() => setShowBT(true)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border transition-all hover:opacity-90"
          style={{ borderColor: 'hsl(217,33%,28%)', color: '#94a3b8', background: 'hsl(217,33%,16%)' }}
        >
          📊 Backtest
        </button>

        {/* Last signal badge */}
        {lastSignal && (
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
              style={{
                color:       signalColor(lastSignal.signalType),
                background: `${signalColor(lastSignal.signalType)}15`,
                borderColor:`${signalColor(lastSignal.signalType)}35`,
              }}
            >
              {lastSignal.isElite ? '◆◆ ' : lastSignal.isStrong ? '◆ ' : '● '}
              {lastSignal.signalType} @ {formatPrice(lastSignal.price)}
            </span>
            {lastSignal.tp2 && (
              <span className="text-[9px] text-blue-400/60">
                TP2 {formatPrice(lastSignal.tp2)}
                {lastSignal.rrRatio ? ` · ${lastSignal.rrRatio.toFixed(1)}R` : ''}
              </span>
            )}
            {lastSignal.sl && (
              <span className="text-[9px] text-orange-400/60">SL {formatPrice(lastSignal.sl)}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Chart ── */}
      <div
        className="flex-1 min-h-0 grow"
        ref={el => { if (el) el.onwheel = e => e.stopPropagation(); }}
        style={{ touchAction: 'none', position: 'relative' }}
        onMouseDown={e => e.stopPropagation()}
        onMouseMove={e => e.stopPropagation()}
        onMouseUp={e => e.stopPropagation()}
      >
        {/* Crosshair guide */}
        {inspectionX != null && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-10"
            style={{ left: `${inspectionX}px`, borderLeft: '1px dashed rgba(148,163,184,0.3)' }}
          />
        )}

        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={visible} margin={{ top: 72, right: 72, bottom: 14, left: 0 }}>
            <CartesianGrid stroke="hsl(217,33%,12%)" strokeDasharray="3 3" />
            <XAxis dataKey="idx" hide />
            <YAxis
              orientation="right"
              domain={[yMin, yMax]}
              tick={{ fill: '#334155', fontSize: 9, cursor: 'ns-resize' }}
              axisLine={false}
              tickLine={false}
              width={36}
              ticks={[-100, -75, -55, -40, 0, 40, 55, 75, 100].map(t => t + yOffset)}
              onMouseDown={handleYDrag}
              style={{ cursor: 'ns-resize', userSelect: 'none' }}
            />
            <Tooltip content={<SniperTooltip />} />

            {/* Reference zones */}
            <ReferenceLine y={0 + yOffset}              stroke="rgba(255,255,255,0.15)"   strokeWidth={1} />
            <ReferenceLine y={ SIGNAL_THRESHOLD + yOffset} stroke="rgba(0,245,160,0.12)"   strokeDasharray="4 4" />
            <ReferenceLine y={-SIGNAL_THRESHOLD + yOffset} stroke="rgba(255,77,109,0.12)"  strokeDasharray="4 4" />
            <ReferenceLine y={ STRONG_THRESHOLD + yOffset} stroke="rgba(0,245,160,0.22)"   strokeDasharray="2 5" />
            <ReferenceLine y={-STRONG_THRESHOLD + yOffset} stroke="rgba(255,77,109,0.22)"  strokeDasharray="2 5" />
            <ReferenceLine y={ ELITE_THRESHOLD  + yOffset} stroke="rgba(255,215,0,0.32)"   strokeDasharray="1 5" />
            <ReferenceLine y={-ELITE_THRESHOLD  + yOffset} stroke="rgba(255,149,0,0.32)"   strokeDasharray="1 5" />

            {/* RSI overlay */}
            {show.rsi && (
              <>
                <YAxis yAxisId="rsi" hide domain={[0, 100]} />
                <Line type="monotone" dataKey="rsi" yAxisId="rsi"
                  stroke="rgba(245,158,11,0.45)" strokeWidth={1}
                  dot={false} isAnimationActive={false} />
              </>
            )}

            {/* Wave Trend line */}
            {show.wt && (
              <>
                <YAxis yAxisId="wt" hide domain={[-100, 100]} />
                <Line type="monotone" dataKey="wt1" yAxisId="wt"
                  stroke="rgba(167,139,250,0.45)" strokeWidth={1}
                  dot={false} isAnimationActive={false} />
              </>
            )}

            {/* Confluence score bars — colour-coded by tier */}
            {show.confluence && (
              <Bar
                dataKey="confluenceBar"
                isAnimationActive={false}
                shape={(props) => {
                  const { x, y, width: w, height: h, payload } = props;
                  const score = payload.confluence ?? 0;
                  if (Math.abs(score) < 1) return null;

                  const abs  = Math.abs(score);
                  let fill, opacity;

                  if (score > 0) {
                    fill    = abs >= ELITE_THRESHOLD ? '#ffd700' : abs >= STRONG_THRESHOLD ? '#00f5a0' : '#00e676';
                    opacity = abs >= ELITE_THRESHOLD ? 0.9 : abs >= STRONG_THRESHOLD ? 0.65 : abs >= SIGNAL_THRESHOLD ? 0.45 : 0.18;
                  } else {
                    fill    = abs >= ELITE_THRESHOLD ? '#ff9500' : abs >= STRONG_THRESHOLD ? '#ff4d6d' : '#ff5252';
                    opacity = abs >= ELITE_THRESHOLD ? 0.9 : abs >= STRONG_THRESHOLD ? 0.65 : abs >= SIGNAL_THRESHOLD ? 0.45 : 0.18;
                  }

                  return <rect x={x} y={y} width={w} height={Math.abs(h)} fill={fill} opacity={opacity} rx={0.5} />;
                }}
              />
            )}

            {/* Signal markers */}
            {show.signals && (
              <Line
                type="monotone"
                dataKey="signalDot"
                isAnimationActive={false}
                stroke="none"
                activeDot={false}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (payload.signalDot == null || !payload.signalType) return null;

                  const isBuy  = payload.signalType.includes('BUY');
                  const col    = signalColor(payload.signalType);
                  const tier   = payload.tier ?? 1;
                  const size   = tier === 3 ? 10 : tier === 2 ? 7 : 5;
                  const tpShow = show.targets && tier >= 2;

                  return (
                    <g key={`sniper-${props.index}`}>
                      {/* Outer glow ring for strong / elite */}
                      {tier >= 2 && (
                        <circle cx={cx} cy={cy} r={size + 5}
                          fill="none" stroke={col} strokeWidth={0.5} opacity={0.25} />
                      )}
                      {tier === 3 && (
                        <circle cx={cx} cy={cy} r={size + 9}
                          fill="none" stroke={col} strokeWidth={0.3} opacity={0.12} />
                      )}

                      {/* Marker shape */}
                      {tier >= 2 ? (
                        <polygon
                          points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`}
                          fill={col}
                          stroke={tier === 3 ? 'rgba(255,255,255,0.7)' : 'none'}
                          strokeWidth={0.5}
                          opacity={0.95}
                        />
                      ) : (
                        <circle cx={cx} cy={cy} r={size} fill={col} opacity={0.85} />
                      )}

                      {/* Entry price pill — BUY labels go UP, SELL labels go DOWN */}
                      <rect
                        x={cx - 30} y={isBuy ? cy - 27 : cy + 13}
                        width={60}  height={14}
                        fill={`${col}20`} stroke={col} strokeWidth={0.5} rx={2}
                      />
                      <text
                        x={cx} y={isBuy ? cy - 16 : cy + 24}
                        textAnchor="middle"
                        fill={col} fontSize={9} fontFamily="monospace" fontWeight="700"
                      >
                        {formatPrice(payload.price)}
                      </text>

                      {/* Factor count badge */}
                      <circle cx={cx + (isBuy ? 16 : -16)} cy={cy} r={6.5}
                        fill="rgba(0,0,0,0.8)" stroke={col} strokeWidth={0.5} />
                      <text
                        x={cx + (isBuy ? 16 : -16)} y={cy + 3.5}
                        textAnchor="middle" fill={col} fontSize={7} fontWeight="bold"
                      >
                        {payload.factorCount}
                      </text>

                      {/* TP/SL labels for strong+ */}
                      {tpShow && payload.tp1 && (
                        <>
                          <text x={cx} y={isBuy ? cy - 31 : cy + 38}
                            textAnchor="middle" fill="#60a5fa"
                            fontSize={7} fontFamily="monospace" opacity={0.85}>
                            TP1 {formatPrice(payload.tp1)}
                          </text>
                          <text x={cx} y={isBuy ? cy - 42 : cy + 49}
                            textAnchor="middle" fill="#818cf8"
                            fontSize={7} fontFamily="monospace" opacity={0.75}>
                            TP2 {formatPrice(payload.tp2)}
                          </text>
                          {tier === 3 && (
                            <text x={cx} y={isBuy ? cy - 53 : cy + 60}
                              textAnchor="middle" fill="#c084fc"
                              fontSize={7} fontFamily="monospace" opacity={0.65}>
                              TP3 {formatPrice(payload.tp3)}
                            </text>
                          )}
                          <text x={cx} y={isBuy ? cy - 64 : cy + 71}
                            textAnchor="middle" fill="#fb923c"
                            fontSize={7} fontFamily="monospace" opacity={0.65}>
                            SL {formatPrice(payload.sl)}
                          </text>
                        </>
                      )}
                    </g>
                  );
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Backtest modal */}
      {showBT && <BacktestModal bt={btResult} onClose={() => setShowBT(false)} />}
    </div>
  );
}

// ── Named exports for SniperStrategyModal ────────────────────────────────────
export { buildSignalData, runBacktest, formatPrice, signalColor, SIGNAL_THRESHOLD, STRONG_THRESHOLD, ELITE_THRESHOLD };
