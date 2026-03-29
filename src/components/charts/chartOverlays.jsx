import React from 'react';

// ════════════════════════════════════════════════════════════════════════════
// AUTO FIBONACCI RETRACEMENT  (TradingView port)
// Uses ATR-based ZigZag deviation threshold + depth to detect pivots.
// Draws retracement between the last two ZigZag pivots with TV-exact
// levels, colors, fills, and price labels.
// ════════════════════════════════════════════════════════════════════════════

// TradingView default levels & colors
const FIB_LEVEL_CONFIG = [
  { value: 0,     color: '#787B86', show: true },
  { value: 0.236, color: '#F44336', show: true },
  { value: 0.382, color: '#81C784', show: true },
  { value: 0.5,   color: '#4CAF50', show: true },
  { value: 0.618, color: '#009688', show: true },
  { value: 0.786, color: '#64B5F6', show: true },
  { value: 1,     color: '#787B86', show: true },
  { value: 1.618, color: '#2962FF', show: true },
];

// ── ATR (Average True Range) ──
function calcATR(data, period) {
  if (data.length < 2) return 0;
  const trs = [];
  for (let i = 1; i < data.length; i++) {
    const hi = data[i].high;
    const lo = data[i].low;
    const pc = data[i - 1].close;
    trs.push(Math.max(hi - lo, Math.abs(hi - pc), Math.abs(lo - pc)));
  }
  if (trs.length === 0) return 0;
  // Simple moving average of last `period` TRs
  const start = Math.max(0, trs.length - period);
  let sum = 0;
  for (let i = start; i < trs.length; i++) sum += trs[i];
  return sum / (trs.length - start);
}

// ── ZigZag with deviation threshold (TradingView algorithm) ──
// Deviation = ATR(10) / close * 100 * multiplier
// A new pivot is confirmed when price deviates by at least `deviation`%
// from the current extreme, and at least `depth` bars have passed.
function zigzagPivots(data, devMultiplier = 3, depth = 10) {
  const len = data.length;
  if (len < depth + 2) return [];

  const atr = calcATR(data, 10);
  const lastClose = data[len - 1].close || 1;
  const deviation = (atr / lastClose) * 100 * devMultiplier;

  const pivots = []; // { idx, price, type: 'high'|'low' }

  // State
  let trend = 0; // 1 = looking for high (uptrend), -1 = looking for low (downtrend)
  let lastHigh = data[0].high, lastHighIdx = 0;
  let lastLow = data[0].low, lastLowIdx = 0;

  for (let i = 1; i < len; i++) {
    const hi = data[i].high;
    const lo = data[i].low;

    if (trend === 0) {
      // Initialize direction
      if (hi > lastHigh) { lastHigh = hi; lastHighIdx = i; }
      if (lo < lastLow)  { lastLow = lo;  lastLowIdx = i;  }

      const upDev = lastHigh > 0 ? ((lastHigh - lastLow) / lastHigh) * 100 : 0;
      if (upDev >= deviation && i - Math.min(lastHighIdx, lastLowIdx) >= depth) {
        if (lastLowIdx < lastHighIdx) {
          pivots.push({ idx: lastLowIdx, price: lastLow, type: 'low' });
          trend = 1; // now in uptrend, looking for the high to complete
          lastLow = lo; lastLowIdx = i; // reset
        } else {
          pivots.push({ idx: lastHighIdx, price: lastHigh, type: 'high' });
          trend = -1;
          lastHigh = hi; lastHighIdx = i;
        }
      }
      continue;
    }

    if (trend === 1) {
      // In uptrend — tracking the high
      if (hi > lastHigh) { lastHigh = hi; lastHighIdx = i; }

      // Check if price deviated down enough from the high
      const downDev = lastHigh > 0 ? ((lastHigh - lo) / lastHigh) * 100 : 0;
      if (downDev >= deviation && i - lastHighIdx >= depth) {
        // Confirm the high pivot
        pivots.push({ idx: lastHighIdx, price: lastHigh, type: 'high' });
        trend = -1; // switch to downtrend
        lastLow = lo; lastLowIdx = i;
        lastHigh = hi; lastHighIdx = i;
      }
    } else {
      // In downtrend — tracking the low
      if (lo < lastLow) { lastLow = lo; lastLowIdx = i; }

      // Check if price deviated up enough from the low
      const upDev = lastLow > 0 ? ((hi - lastLow) / lastLow) * 100 : 0;
      if (upDev >= deviation && i - lastLowIdx >= depth) {
        // Confirm the low pivot
        pivots.push({ idx: lastLowIdx, price: lastLow, type: 'low' });
        trend = 1; // switch to uptrend
        lastHigh = hi; lastHighIdx = i;
        lastLow = lo; lastLowIdx = i;
      }
    }
  }

  // Add the pending last extreme as a potential last pivot
  if (pivots.length > 0) {
    const lastPivot = pivots[pivots.length - 1];
    if (lastPivot.type === 'low' && lastHighIdx > lastPivot.idx) {
      pivots.push({ idx: lastHighIdx, price: lastHigh, type: 'high' });
    } else if (lastPivot.type === 'high' && lastLowIdx > lastPivot.idx) {
      pivots.push({ idx: lastLowIdx, price: lastLow, type: 'low' });
    }
  }

  return pivots;
}

function formatFibPrice(p) {
  if (p >= 10000) return p.toFixed(0);
  if (p >= 100)   return p.toFixed(1);
  if (p >= 1)     return p.toFixed(2);
  if (p >= 0.01)  return p.toFixed(4);
  return p.toFixed(6);
}

export function renderFibonacciOverlay(chartData, { toX, toY, plotW, plotH, marginTop, spacing }) {
  // Strip blank placeholder candles (appended when user pans past the last real bar).
  // Blanks always sit at the end so indices still map 1-to-1 with chartData for toX().
  const realData = chartData.filter(d => !d.isBlank);
  if (realData.length < 15) return null;

  const pivots = zigzagPivots(realData, 3, 10);
  if (pivots.length < 2) return null;

  // Last two pivots = the impulse move
  const pivotA = pivots[pivots.length - 2]; // start of move
  const pivotB = pivots[pivots.length - 1]; // end of move

  const startPrice = pivotB.price; // TV: startPrice = lastP.end.price
  const endPrice = pivotA.price;   // TV: endPrice = lastP.start.price
  const height = (startPrice > endPrice ? -1 : 1) * Math.abs(startPrice - endPrice);

  if (Math.abs(height) <= 0) return null;

  // Fib lines span from pivotA to pivotB horizontally, extending right
  const lineX1 = toX(pivotA.idx);
  const lineX2 = toX(chartData.length - 1) + spacing * 2;

  const elements = [];

  // Draw fills between consecutive levels + lines + labels
  const levelsWithY = FIB_LEVEL_CONFIG.filter(l => l.show).map(l => {
    const price = startPrice + height * l.value;
    return { ...l, price, y: toY(price) };
  });

  // Background fills between consecutive levels
  for (let i = 0; i < levelsWithY.length - 1; i++) {
    const upper = levelsWithY[i];
    const lower = levelsWithY[i + 1];
    const yTop = Math.min(upper.y, lower.y);
    const yBot = Math.max(upper.y, lower.y);
    const fillH = yBot - yTop;
    if (fillH > 0) {
      elements.push(
        <rect
          key={`fib-fill-${i}`}
          x={lineX1}
          y={yTop}
          width={lineX2 - lineX1}
          height={fillH}
          fill={upper.color}
          opacity={0.06}
        />
      );
    }
  }

  // Lines and labels
  levelsWithY.forEach((l) => {
    const { value, color, price, y } = l;
    const isKey = value === 0.5 || value === 0.618;

    elements.push(
      <g key={`fib-${value}`}>
        <line
          x1={lineX1}
          x2={lineX2}
          y1={y}
          y2={y}
          stroke={color}
          strokeWidth={isKey ? 1 : 0.8}
          opacity={0.7}
        />
        {/* Label: level (price) — left side */}
        <text
          x={lineX1 + 4}
          y={y - 4}
          fill={color}
          fontSize={9}
          fontFamily="'JetBrains Mono', monospace"
          fontWeight="500"
          opacity={0.85}
        >
          {value === 0 || value === 1 ? value.toFixed(0) : value.toFixed(3)} ({formatFibPrice(price)})
        </text>
      </g>
    );
  });

  // Dashed trend line connecting the two pivots
  elements.push(
    <line
      key="fib-trendline"
      x1={toX(pivotA.idx)}
      y1={toY(pivotA.price)}
      x2={toX(pivotB.idx)}
      y2={toY(pivotB.price)}
      stroke="#9e9e9e"
      strokeWidth={1}
      strokeDasharray="4,4"
      opacity={0.5}
    />
  );

  return <g className="fib-overlay">{elements}</g>;
}


// ════════════════════════════════════════════════════════════════════════════
// OPEN INTEREST OVERLAY
// Same logic as volume bars — bottom-anchored, per-candle bars.
// OI rising (vs previous) = purple, OI falling = slate.
// Height proportional to OI value, sitting behind volume bars.
// ════════════════════════════════════════════════════════════════════════════

function findOIEntry(sortedOI, targetTime) {
  let lo = 0, hi = sortedOI.length - 1, result = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedOI[mid].time <= targetTime) { result = sortedOI[mid]; lo = mid + 1; }
    else hi = mid - 1;
  }
  return result;
}

function formatOICompact(v) {
  if (v == null) return '—';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function renderOpenInterestOverlay(chartData, oiData, { toX, toY, plotW, plotH, adjustedMin, adjustedMax, marginTop, spacing }) {
  if (!oiData?.length || !chartData.length) return null;

  const sorted = [...oiData].sort((a, b) => a.time - b.time);

  // Map OI to each candle
  const oiByCandle = chartData.map((k) => {
    const entry = findOIEntry(sorted, k.time);
    return entry ? entry.oiValue : null;
  });

  const validOI = oiByCandle.filter((v) => v != null);
  if (validOI.length < 2) return null;

  const maxOI = Math.max(...validOI);
  if (maxOI <= 0) return null;

  // Same sizing as volume: bars occupy bottom 20% of chart, same candle width
  const oiH = plotH * 0.20;
  const candleBodyW = Math.max(2, spacing * 0.6);
  const chartBottom = marginTop + plotH;

  const bars = [];
  for (let i = 0; i < chartData.length; i++) {
    const oi = oiByCandle[i];
    if (oi == null) continue;

    const x = toX(i);
    const barH = (oi / maxOI) * oiH;
    const prevOI = i > 0 ? oiByCandle[i - 1] : null;
    const isRising = prevOI != null ? oi >= prevOI : true;

    bars.push(
      <rect
        key={`oi-${i}`}
        x={x - candleBodyW / 2}
        y={chartBottom - barH}
        width={candleBodyW}
        height={Math.max(barH, 1)}
        fill={isRising ? 'rgba(168,85,247,0.25)' : 'rgba(100,116,139,0.18)'}
      />
    );
  }

  // Current OI value label (top-right)
  const lastOI = validOI[validOI.length - 1];
  const firstOI = validOI[0];
  const oiChange = ((lastOI - firstOI) / firstOI * 100);
  const isUp = oiChange >= 0;

  return (
    <g className="oi-overlay">
      {bars}
      {/* OI label */}
      <text
        x={plotW - 4}
        y={marginTop + 24}
        textAnchor="end"
        fill="rgba(168,85,247,0.55)"
        fontSize={9}
        fontFamily="'JetBrains Mono', monospace"
        fontWeight="600"
      >
        OI {formatOICompact(lastOI)}
        <tspan fill={isUp ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'}>{' '}{isUp ? '▲' : '▼'}{Math.abs(oiChange).toFixed(1)}%</tspan>
      </text>
    </g>
  );
}


// ════════════════════════════════════════════════════════════════════════════
// FAIR VALUE GAPS (FVG) OVERLAY — SpaceManBTC PineScript port
// Detects imbalances between 3 consecutive candles:
//   Bullish FVG: current high < 2-bars-ago low (gap down — expected fill UP)
//   Bearish FVG: current low > 2-bars-ago high (gap up — expected fill DOWN)
// Middle candle direction determines gap type (bearish middle → bullish FVG)
// Gaps SHRINK as price partially fills them, matching TradingView behavior
// ════════════════════════════════════════════════════════════════════════════

export function renderFairValueGaps(chartData, { toX, toY, plotW, plotH, marginTop, spacing }) {
  if (chartData.length < 3) return null;

  const elements = [];
  const candleW = Math.max(2, spacing * 0.6);

  // Collect all gaps first, then process fills (matching PineScript's array-based approach)
  const bullishGaps = []; // { idx, top, bottom, mid, fillBar }
  const bearishGaps = [];

  // ── Gap detection (f_gapLogic port) ──
  // PineScript iterates bar_index; at each bar, looks at:
  //   _close = close[1], _high = high, _highp2 = high[2], _low = low, _lowp2 = low[2], _open = open[1]
  // Mapped to array: at index i, prev = i-1 (close[1]/open[1]), curr = i (high/low), twoBarsAgo = i-2 (high[2]/low[2])
  for (let i = 2; i < chartData.length; i++) {
    const twoBarsAgo = chartData[i - 2]; // high[2], low[2]
    const prev = chartData[i - 1];       // close[1], open[1] — middle candle
    const curr = chartData[i];           // high, low — current bar

    const isBearishMiddle = prev.open > prev.close;

    if (isBearishMiddle) {
      // Bullish FVG: current high < 2-bars-ago low → gap below
      if (curr.high < twoBarsAgo.low) {
        const top = twoBarsAgo.low;    // upperlimit = _lowp2
        const bottom = curr.high;       // lowerlimit = _high
        const mid = (top + bottom) / 2;
        bullishGaps.push({ idx: i, top, bottom, mid, fillBar: null, shrunkBottom: bottom });
      }
    } else {
      // Bearish FVG: current low > 2-bars-ago high → gap above
      if (curr.low > twoBarsAgo.high) {
        const top = curr.low;           // upperlimit = _low
        const bottom = twoBarsAgo.high; // lowerlimit = _highp2
        const mid = (top + bottom) / 2;
        bearishGaps.push({ idx: i, top, bottom, mid, fillBar: null, shrunkTop: top });
      }
    }
  }

  // ── Gap fill check (f_gapCheck port) ──
  // Bullish gaps: price fills from top down. If high >= top → fully filled.
  // If high enters gap partially → shrink bottom up to high.
  for (const gap of bullishGaps) {
    for (let j = gap.idx + 1; j < chartData.length; j++) {
      const h = chartData[j].high;
      // Check midpoint fill: if high reaches mid → filled
      if (h >= gap.mid) {
        gap.fillBar = j;
        break;
      }
      // Partial fill: shrink bottom up
      if (h > gap.shrunkBottom && h < gap.top) {
        gap.shrunkBottom = h;
      }
    }
  }

  // Bearish gaps: price fills from bottom up. If low <= bottom → fully filled.
  // If low enters gap partially → shrink top down to low.
  for (const gap of bearishGaps) {
    for (let j = gap.idx + 1; j < chartData.length; j++) {
      const l = chartData[j].low;
      // Check midpoint fill: if low reaches mid → filled
      if (l <= gap.mid) {
        gap.fillBar = j;
        break;
      }
      // Partial fill: shrink top down
      if (l < gap.shrunkTop && l > gap.bottom) {
        gap.shrunkTop = l;
      }
    }
  }

  // ── Render bullish FVGs ──
  for (const gap of bullishGaps) {
    const isFilled = gap.fillBar != null;
    const x1 = toX(gap.idx) - candleW / 2;
    const x2 = isFilled ? toX(gap.fillBar) + candleW / 2 : toX(chartData.length - 1) + spacing * 2;
    const effectiveBottom = isFilled ? gap.bottom : gap.shrunkBottom;
    const yTop = toY(gap.top);
    const yBot = toY(effectiveBottom);
    const gapH = yBot - yTop;

    if (gapH < 1) continue;

    if (!isFilled) {
      elements.push(
        <g key={`fvg-bull-${gap.idx}`}>
          <rect
            x={x1} y={yTop}
            width={x2 - x1} height={gapH}
            fill="rgba(0,128,0,0.10)"
          />
          {/* Midpoint CE line */}
          <line
            x1={x1} x2={x2}
            y1={toY(gap.mid)} y2={toY(gap.mid)}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={0.5}
            strokeDasharray="2,3"
          />
          {/* Left accent */}
          <rect
            x={x1} y={yTop}
            width={1.5} height={gapH}
            fill="rgba(0,200,0,0.45)"
          />
          <text
            x={x1 + 4}
            y={toY(gap.mid) - 3}
            fill="rgba(0,200,0,0.55)"
            fontSize={8}
            fontFamily="'JetBrains Mono', monospace"
            fontWeight="600"
          >
            FVG
          </text>
        </g>
      );
    } else {
      // Filled — show stopped box, dimmed
      elements.push(
        <g key={`fvg-bull-f-${gap.idx}`} opacity={0.25}>
          <rect
            x={x1} y={yTop}
            width={x2 - x1} height={gapH}
            fill="rgba(0,128,0,0.06)"
            stroke="rgba(0,128,0,0.12)"
            strokeWidth={0.5}
          />
        </g>
      );
    }
  }

  // ── Render bearish FVGs ──
  for (const gap of bearishGaps) {
    const isFilled = gap.fillBar != null;
    const x1 = toX(gap.idx) - candleW / 2;
    const x2 = isFilled ? toX(gap.fillBar) + candleW / 2 : toX(chartData.length - 1) + spacing * 2;
    const effectiveTop = isFilled ? gap.top : gap.shrunkTop;
    const yTop = toY(effectiveTop);
    const yBot = toY(gap.bottom);
    const gapH = yBot - yTop;

    if (gapH < 1) continue;

    if (!isFilled) {
      elements.push(
        <g key={`fvg-bear-${gap.idx}`}>
          <rect
            x={x1} y={yTop}
            width={x2 - x1} height={gapH}
            fill="rgba(128,0,0,0.10)"
          />
          {/* Midpoint CE line */}
          <line
            x1={x1} x2={x2}
            y1={toY(gap.mid)} y2={toY(gap.mid)}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={0.5}
            strokeDasharray="2,3"
          />
          {/* Left accent */}
          <rect
            x={x1} y={yTop}
            width={1.5} height={gapH}
            fill="rgba(200,0,0,0.45)"
          />
          <text
            x={x1 + 4}
            y={toY(gap.mid) - 3}
            fill="rgba(200,0,0,0.55)"
            fontSize={8}
            fontFamily="'JetBrains Mono', monospace"
            fontWeight="600"
          >
            FVG
          </text>
        </g>
      );
    } else {
      elements.push(
        <g key={`fvg-bear-f-${gap.idx}`} opacity={0.25}>
          <rect
            x={x1} y={yTop}
            width={x2 - x1} height={gapH}
            fill="rgba(128,0,0,0.06)"
            stroke="rgba(128,0,0,0.12)"
            strokeWidth={0.5}
          />
        </g>
      );
    }
  }

  if (elements.length === 0) return null;

  return (
    <g className="fvg-overlay">
      {elements}
    </g>
  );
}


// ════════════════════════════════════════════════════════════════════════════
// LIQUIDATION HEATMAP OVERLAY  (Coinglass-style)
// O(n) single-pass: plots liq levels per candle, then applies horizontal +
// vertical blur on the grid to create smooth flowing bands.
// Rendered to high-res canvas with bilinear interpolation.
// ════════════════════════════════════════════════════════════════════════════

const LEVERAGES = [5, 10, 25, 50, 100];

// Coinglass color ramp: dark → teal → green → yellow → hot magenta
function heatToRGBA(t) {
  if (t <= 0) return [0, 0, 0, 0];
  t = Math.min(1, t);
  let r, g, b, a;
  if (t < 0.2) {
    const s = t / 0.2;
    r = 0; g = Math.round(30 * s); b = Math.round(60 * s); a = Math.round(80 * s);
  } else if (t < 0.4) {
    const s = (t - 0.2) / 0.2;
    r = 0; g = Math.round(30 + 120 * s); b = Math.round(60 + 20 * s); a = Math.round(80 + 60 * s);
  } else if (t < 0.6) {
    const s = (t - 0.4) / 0.2;
    r = Math.round(100 * s); g = Math.round(150 + 80 * s); b = Math.round(80 - 60 * s); a = Math.round(140 + 40 * s);
  } else if (t < 0.8) {
    const s = (t - 0.6) / 0.2;
    r = Math.round(100 + 155 * s); g = Math.round(230 - 10 * s); b = Math.round(20 - 10 * s); a = Math.round(180 + 30 * s);
  } else {
    const s = (t - 0.8) / 0.2;
    r = 255; g = Math.round(220 - 140 * s); b = Math.round(10 + 100 * s); a = Math.round(210 + 45 * s);
  }
  return [r, g, b, a];
}

// 1D box blur on a Float32Array row
function blurRow(src, dst, w, radius) {
  const diam = radius * 2 + 1;
  let sum = 0;
  // Seed
  for (let x = 0; x < Math.min(radius + 1, w); x++) sum += src[x];
  for (let x = 0; x < w; x++) {
    dst[x] = sum / diam;
    const addIdx = x + radius + 1;
    const remIdx = x - radius;
    if (addIdx < w) sum += src[addIdx];
    if (remIdx >= 0) sum -= src[remIdx];
  }
}

export function renderLiquidationHeatmap(chartData, { toX, toY, plotW, plotH, adjustedMin, adjustedMax, candleCount, spacing, marginTop }) {
  if (chartData.length < 5 || typeof document === 'undefined') return null;

  const priceRange = adjustedMax - adjustedMin;
  if (priceRange <= 0) return null;

  // High-res grid: 1 col per candle (or grouped if >300), ~120 price rows
  const W = Math.min(candleCount, 300);
  const H = Math.min(120, Math.max(40, Math.round(plotH / 3)));
  const colGroup = Math.max(1, Math.ceil(candleCount / W));
  const cols = Math.ceil(candleCount / colGroup);
  const bucketH = priceRange / H;

  // Pass 1: O(n) — plot liquidation impulses per candle
  const raw = new Float32Array(cols * H);

  for (let i = 0; i < chartData.length; i++) {
    const c = Math.floor(i / colGroup);
    if (c >= cols) break;
    const candle = chartData[i];
    const mid = (candle.open + candle.close) / 2;
    const w = candle.volume;

    for (const lev of LEVERAGES) {
      const levW = lev <= 10 ? 0.3 : lev <= 25 ? 0.6 : lev <= 50 ? 0.85 : 1.0;
      const longP = mid * (1 - 1 / lev);
      const shortP = mid * (1 + 1 / lev);

      for (const p of [longP, shortP]) {
        const row = Math.floor((p - adjustedMin) / bucketH);
        if (row >= 0 && row < H) {
          const weight = w * levW;
          raw[row * cols + c] += weight;
          // Vertical spread
          if (row > 0)     raw[(row - 1) * cols + c] += weight * 0.5;
          if (row < H - 1) raw[(row + 1) * cols + c] += weight * 0.5;
          if (row > 1)     raw[(row - 2) * cols + c] += weight * 0.15;
          if (row < H - 2) raw[(row + 2) * cols + c] += weight * 0.15;
        }
      }
    }
  }

  // Pass 2: horizontal blur (creates the forward-extending bands)
  // Large radius = longer bands
  const hRadius = Math.max(3, Math.round(cols * 0.08));
  const blurred = new Float32Array(cols * H);
  const tmpSrc = new Float32Array(cols);
  const tmpDst = new Float32Array(cols);

  for (let r = 0; r < H; r++) {
    const offset = r * cols;
    for (let c = 0; c < cols; c++) tmpSrc[c] = raw[offset + c];
    // Two-pass blur for smoother result
    blurRow(tmpSrc, tmpDst, cols, hRadius);
    blurRow(tmpDst, tmpSrc, cols, Math.max(1, Math.round(hRadius * 0.6)));
    for (let c = 0; c < cols; c++) blurred[offset + c] = tmpSrc[c];
  }

  // Pass 3: light vertical blur
  const vRadius = 2;
  const colBuf = new Float32Array(H);
  const colOut = new Float32Array(H);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < H; r++) colBuf[r] = blurred[r * cols + c];
    blurRow(colBuf, colOut, H, vRadius);
    for (let r = 0; r < H; r++) blurred[r * cols + c] = colOut[r];
  }

  // Normalize (97th percentile)
  const sorted = Array.from(blurred).filter(v => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const maxI = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.97))] || sorted[sorted.length - 1];
  if (maxI <= 0) return null;

  // Render to canvas
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(cols, H);

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < cols; c++) {
      const t = Math.min(1, blurred[r * cols + c] / maxI);
      if (t < 0.01) continue;
      const [rv, gv, bv, av] = heatToRGBA(t);
      // Flip Y: row 0 in grid = lowest price → bottom of image
      const imgRow = H - 1 - r;
      const idx = (imgRow * cols + c) * 4;
      img.data[idx]     = rv;
      img.data[idx + 1] = gv;
      img.data[idx + 2] = bv;
      img.data[idx + 3] = av;
    }
  }
  ctx.putImageData(img, 0, 0);

  let dataUrl;
  try { dataUrl = canvas.toDataURL(); } catch { return null; }

  return (
    <g className="liquidation-heatmap-overlay">
      <image
        href={dataUrl}
        x={0}
        y={marginTop}
        width={plotW}
        height={plotH}
        preserveAspectRatio="none"
        style={{ imageRendering: 'auto' }}
      />
      <text
        x={8}
        y={marginTop + 12}
        fill="rgba(249,115,22,0.45)"
        fontSize={9}
        fontFamily="'JetBrains Mono', monospace"
        fontWeight="600"
      >
        LIQ HEATMAP
      </text>
    </g>
  );
}


// ════════════════════════════════════════════════════════════════════════════
// MACD OVERLAY
// MACD line, Signal line, and Histogram rendered in the bottom portion
// of the price chart. Histogram bars colored by momentum direction.
// ════════════════════════════════════════════════════════════════════════════

function emaArr(src, len) {
  const k = 2 / (len + 1);
  const out = new Array(src.length);
  let prev = src[0] ?? 0;
  for (let i = 0; i < src.length; i++) {
    prev = (src[i] ?? prev) * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function renderMACDOverlay(chartData, { toX, plotW, plotH, marginTop, spacing }) {
  if (chartData.length < 30) return null;

  const closes = chartData.map((d) => d.close);
  const fast = emaArr(closes, 12);
  const slow = emaArr(closes, 26);
  const macd = fast.map((f, i) => f - slow[i]);
  const signal = emaArr(macd, 9);
  const hist = macd.map((m, i) => m - signal[i]);

  // Scale to bottom 18% of chart
  const zoneH = plotH * 0.18;
  const zoneTop = marginTop + plotH - zoneH;
  const candleW = Math.max(2, spacing * 0.6);

  const maxAbs = Math.max(...hist.map(Math.abs), ...macd.map(Math.abs), ...signal.map(Math.abs)) || 1;

  const scaleY = (v) => zoneTop + zoneH / 2 - (v / maxAbs) * (zoneH / 2 * 0.85);
  const zeroY = zoneTop + zoneH / 2;

  const elements = [];

  // Semi-transparent background for the MACD zone
  elements.push(
    <rect
      key="macd-bg"
      x={0}
      y={zoneTop}
      width={plotW}
      height={zoneH}
      fill="rgba(0,0,0,0.25)"
      rx={0}
    />
  );

  // Zero line
  elements.push(
    <line
      key="macd-zero"
      x1={0}
      x2={plotW}
      y1={zeroY}
      y2={zeroY}
      stroke="rgba(255,255,255,0.12)"
      strokeWidth={0.5}
    />
  );

  // Histogram bars
  for (let i = 0; i < chartData.length; i++) {
    const x = toX(i);
    const h = hist[i];
    if (Math.abs(h) < maxAbs * 0.005) continue;
    const barY = scaleY(h);
    const barH = Math.abs(barY - zeroY);

    // Color: green growing, green fading, red growing, red fading
    let fill;
    const prevH = i > 0 ? hist[i - 1] : 0;
    if (h >= 0) {
      fill = h >= prevH ? 'rgba(0,230,118,0.6)' : 'rgba(0,230,118,0.3)';
    } else {
      fill = h <= prevH ? 'rgba(255,82,82,0.6)' : 'rgba(255,82,82,0.3)';
    }

    elements.push(
      <rect
        key={`macd-h-${i}`}
        x={x - candleW / 2}
        y={Math.min(barY, zeroY)}
        width={candleW}
        height={Math.max(barH, 0.5)}
        fill={fill}
      />
    );
  }

  // MACD line
  const macdPoints = chartData
    .map((_, i) => `${toX(i)},${scaleY(macd[i])}`)
    .join(' ');
  elements.push(
    <polyline
      key="macd-line"
      points={macdPoints}
      fill="none"
      stroke="#3b82f6"
      strokeWidth={1.2}
      opacity={0.8}
    />
  );

  // Signal line
  const sigPoints = chartData
    .map((_, i) => `${toX(i)},${scaleY(signal[i])}`)
    .join(' ');
  elements.push(
    <polyline
      key="macd-sig"
      points={sigPoints}
      fill="none"
      stroke="#f59e0b"
      strokeWidth={1}
      opacity={0.7}
    />
  );

  // Label
  elements.push(
    <text
      key="macd-label"
      x={8}
      y={zoneTop + 11}
      fill="rgba(59,130,246,0.5)"
      fontSize={9}
      fontFamily="'JetBrains Mono', monospace"
      fontWeight="600"
    >
      MACD(12,26,9)
    </text>
  );

  return <g className="macd-overlay">{elements}</g>;
}


// ════════════════════════════════════════════════════════════════════════════
// FUNDING RATE OVERLAY  (Binance Perpetual Futures)
// Renders a thin bar histogram at the bottom of the price chart.
//
//   Positive rate (red bars, down from zero-line):
//     Longs are paying shorts → market over-leveraged to the upside.
//     Historically precedes corrections / blow-off tops.
//
//   Negative rate (green bars, up from zero-line):
//     Shorts are paying longs → market over-leveraged to the downside.
//     Often seen at capitulation bottoms — a contrarian BULLISH signal.
//
// The bar area occupies the bottom 9% of the chart height and overlaps
// slightly with the volume bars (which use 20%).  Both remain readable
// thanks to distinct colors and semi-transparency.
// ════════════════════════════════════════════════════════════════════════════

export function renderFundingRateOverlay(chartData, fundingData, { toX, plotW, plotH, marginTop, spacing }) {
  if (!fundingData?.length || !chartData.length) return null;

  // fundingData is already sorted ascending by the hook — copy to be safe
  const sorted = fundingData[0].time <= fundingData[fundingData.length - 1].time
    ? fundingData
    : [...fundingData].sort((a, b) => a.time - b.time);

  // Binary search: find the index of the last funding entry with time <= target
  const bisect = (target) => {
    let lo = 0, hi = sorted.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].time <= target) { idx = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return idx;
  };

  // For each candle pick the last known funding rate at or before its open time
  const rateByCandle = chartData.map((k) => {
    if (k.isBlank) return null;
    const idx = bisect(k.time);
    return idx >= 0 ? sorted[idx].rate : null;
  });

  const validRates = rateByCandle.filter((r) => r != null);
  if (!validRates.length) return null;

  const maxAbs  = Math.max(...validRates.map(Math.abs), 0.00001);
  const barH    = plotH * 0.09;              // total bar area height
  const half    = barH / 2;
  const bottom  = marginTop + plotH;         // chart bottom
  const zeroY   = bottom - half - 4;        // zero-line sits just above the bottom edge
  const barW    = Math.max(1.5, spacing * 0.65);

  const elements = [];

  // Zero-line
  elements.push(
    <line key="fr-zero"
      x1={0} x2={plotW} y1={zeroY} y2={zeroY}
      stroke="rgba(255,255,255,0.14)" strokeWidth={0.6} strokeDasharray="3,3"
    />
  );

  // Bars
  for (let i = 0; i < chartData.length; i++) {
    const rate = rateByCandle[i];
    if (rate == null) continue;
    const x    = toX(i);
    const h    = Math.max(1, (Math.abs(rate) / maxAbs) * half);
    const isPos = rate >= 0;
    elements.push(
      <rect key={`fr-${i}`}
        x={x - barW / 2}
        y={isPos ? zeroY : zeroY - h}   // positive → below zero, negative → above zero
        width={barW}
        height={h}
        fill={isPos ? 'rgba(239,68,68,0.58)' : 'rgba(16,185,129,0.58)'}
      />
    );
  }

  // Current-rate label (top-right, same style as OI label)
  const lastRate = validRates[validRates.length - 1];
  const isNeg    = lastRate < 0;
  const rateStr  = `${lastRate >= 0 ? '+' : ''}${(lastRate * 100).toFixed(4)}%`;
  const signalLabel = isNeg ? '▲ BULLISH' : '▼ BEARISH';
  const labelColor  = isNeg ? 'rgba(16,185,129,0.70)' : 'rgba(239,68,68,0.70)';
  const signalColor = isNeg ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.45)';

  elements.push(
    <text key="fr-label"
      x={plotW - 4} y={marginTop + 52}
      textAnchor="end"
      fontSize={9} fontFamily="'JetBrains Mono', monospace" fontWeight="600"
    >
      <tspan fill={labelColor}>FUNDING {rateStr}</tspan>
      <tspan fill={signalColor}> {signalLabel}</tspan>
    </text>
  );

  // Section label bottom-left
  elements.push(
    <text key="fr-area-label"
      x={6} y={zeroY - half + 10}
      fill="rgba(168,85,247,0.40)"
      fontSize={8} fontFamily="'JetBrains Mono', monospace" fontWeight="600"
    >
      FUNDING
    </text>
  );

  return <g className="funding-rate-overlay">{elements}</g>;
}

// ── Volume Profile (VPVR) ─────────────────────────────────────────────────────
// Renders horizontal volume bars on the right side of the chart.
// POC = highest volume node (gold), VAH/VAL = 70% value area (cyan dashed lines).
export function renderVolumeProfile(chartData, { toY, plotW, plotH, marginTop, adjustedMin, adjustedMax }) {
  const visible = chartData.filter(d => d && d.close != null && !d._isBlank && d.volume > 0);
  if (visible.length < 5) return null;

  const BUCKETS = 80;
  const priceRange = adjustedMax - adjustedMin;
  if (priceRange <= 0) return null;

  const bucketSize = priceRange / BUCKETS;
  const volumes = new Float64Array(BUCKETS);

  for (const d of visible) {
    const lo = Math.max(d.low ?? d.close, adjustedMin);
    const hi = Math.min(d.high ?? d.close, adjustedMax);
    const loIdx = Math.max(0, Math.floor((lo - adjustedMin) / bucketSize));
    const hiIdx = Math.min(BUCKETS - 1, Math.floor((hi - adjustedMin) / bucketSize));
    const spread = hiIdx - loIdx + 1;
    const share = d.volume / spread;
    for (let i = loIdx; i <= hiIdx; i++) volumes[i] += share;
  }

  const maxVol = Math.max(...volumes);
  if (maxVol === 0) return null;

  // Value Area: find POC then expand until 70% of total volume is covered
  const totalVol = volumes.reduce((s, v) => s + v, 0);
  let pocIdx = 0;
  for (let i = 1; i < BUCKETS; i++) if (volumes[i] > volumes[pocIdx]) pocIdx = i;

  let vaVol = volumes[pocIdx], vaLo = pocIdx, vaHi = pocIdx;
  while (vaVol < totalVol * 0.70 && (vaLo > 0 || vaHi < BUCKETS - 1)) {
    const extLo = vaLo > 0 ? volumes[vaLo - 1] : 0;
    const extHi = vaHi < BUCKETS - 1 ? volumes[vaHi + 1] : 0;
    if (extHi >= extLo) { vaHi++; vaVol += volumes[vaHi]; }
    else { vaLo--; vaVol += volumes[vaLo]; }
  }

  const BAR_MAX_W = Math.min(80, plotW * 0.12);
  const elements = [];

  for (let i = 0; i < BUCKETS; i++) {
    if (volumes[i] === 0) continue;
    const priceLo = adjustedMin + i * bucketSize;
    const y = toY(priceLo + bucketSize);
    const barH = Math.max(1, toY(priceLo) - y);
    const barW = (volumes[i] / maxVol) * BAR_MAX_W;
    const isPOC = i === pocIdx;
    const isVA = i >= vaLo && i <= vaHi;
    const fill = isPOC ? 'rgba(251,191,36,0.85)' : isVA ? 'rgba(99,179,237,0.35)' : 'rgba(99,179,237,0.18)';
    elements.push(
      <rect key={i}
        x={plotW - barW} y={y + marginTop}
        width={barW} height={Math.max(1, barH - 0.5)}
        fill={fill}
        style={{ pointerEvents: 'none' }}
      />
    );
  }

  // POC line
  const pocPrice = adjustedMin + (pocIdx + 0.5) * bucketSize;
  const pocY = toY(pocPrice) + marginTop;
  elements.push(
    <line key="poc" x1={0} y1={pocY} x2={plotW} y2={pocY}
      stroke="rgba(251,191,36,0.6)" strokeWidth={1} strokeDasharray="4,3"
      style={{ pointerEvents: 'none' }} />
  );
  elements.push(
    <text key="poc-label" x={plotW - BAR_MAX_W - 4} y={pocY - 3}
      fill="rgba(251,191,36,0.8)" fontSize={8} textAnchor="end"
      style={{ pointerEvents: 'none', fontFamily: 'monospace' }}>POC</text>
  );

  return <g className="vpvr-overlay">{elements}</g>;
}


// ════════════════════════════════════════════════════════════════════════════
// LIQUIDITY SWEEP OVERLAY
// Detects swing highs/lows that get swept (wick through, close back inside).
// Marks stop-hunt events where price wicks past a key level then reverses.
// ════════════════════════════════════════════════════════════════════════════

function findSwingPoints(data, lookback = 10) {
  const swingHighs = [];
  const swingLows = [];
  for (let i = lookback; i < data.length - lookback; i++) {
    let isHigh = true, isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (data[i].high <= data[i - j].high || data[i].high <= data[i + j].high) isHigh = false;
      if (data[i].low >= data[i - j].low || data[i].low >= data[i + j].low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) swingHighs.push({ idx: i, price: data[i].high });
    if (isLow) swingLows.push({ idx: i, price: data[i].low });
  }
  return { swingHighs, swingLows };
}

export function renderLiquiditySweep(chartData, { toX, toY, plotW, plotH, marginTop, spacing }) {
  const realData = chartData.filter(d => !d.isBlank);
  if (realData.length < 25) return null;

  const { swingHighs, swingLows } = findSwingPoints(realData, 5);
  const elements = [];
  const MIN_BARS_AFTER = 2;

  // Sweep of swing highs (bearish sweep — wick above, close below)
  for (const sh of swingHighs) {
    for (let j = sh.idx + MIN_BARS_AFTER; j < realData.length; j++) {
      const candle = realData[j];
      if (candle.high > sh.price && candle.close < sh.price && candle.open < sh.price) {
        const x = toX(j);
        const y = toY(candle.high);
        elements.push(
          <g key={`sweep-h-${sh.idx}-${j}`}>
            <line x1={toX(sh.idx)} y1={toY(sh.price)} x2={x} y2={toY(sh.price)}
              stroke="rgba(239,68,68,0.35)" strokeWidth={0.8} strokeDasharray="3,3" />
            <circle cx={x} cy={y} r={4} fill="none" stroke="rgba(239,68,68,0.8)" strokeWidth={1.5} />
            <text x={x + 6} y={y - 2} fill="rgba(239,68,68,0.8)" fontSize={8}
              fontFamily="'JetBrains Mono', monospace" fontWeight="700">SWEEP</text>
          </g>
        );
        break;
      }
      if (j - sh.idx > 60) break;
    }
  }

  // Sweep of swing lows (bullish sweep — wick below, close above)
  for (const sl of swingLows) {
    for (let j = sl.idx + MIN_BARS_AFTER; j < realData.length; j++) {
      const candle = realData[j];
      if (candle.low < sl.price && candle.close > sl.price && candle.open > sl.price) {
        const x = toX(j);
        const y = toY(candle.low);
        elements.push(
          <g key={`sweep-l-${sl.idx}-${j}`}>
            <line x1={toX(sl.idx)} y1={toY(sl.price)} x2={x} y2={toY(sl.price)}
              stroke="rgba(16,185,129,0.35)" strokeWidth={0.8} strokeDasharray="3,3" />
            <circle cx={x} cy={y} r={4} fill="none" stroke="rgba(16,185,129,0.8)" strokeWidth={1.5} />
            <text x={x + 6} y={y + 10} fill="rgba(16,185,129,0.8)" fontSize={8}
              fontFamily="'JetBrains Mono', monospace" fontWeight="700">SWEEP</text>
          </g>
        );
        break;
      }
      if (j - sl.idx > 60) break;
    }
  }

  return elements.length > 0 ? <g className="liq-sweep-overlay">{elements}</g> : null;
}


// ════════════════════════════════════════════════════════════════════════════
// INVERSE FAIR VALUE GAPS (IFVG) OVERLAY
// When a regular FVG gets fully filled AND price closes through it,
// the zone inverts: bullish FVG → bearish IFVG (resistance),
// bearish FVG → bullish IFVG (support).
// ════════════════════════════════════════════════════════════════════════════

export function renderInverseFVG(chartData, { toX, toY, plotW, plotH, marginTop, spacing }) {
  if (chartData.length < 3) return null;

  const elements = [];
  const candleW = Math.max(2, spacing * 0.6);

  // Detect all FVGs first
  const gaps = [];
  for (let i = 2; i < chartData.length; i++) {
    const twoBarsAgo = chartData[i - 2];
    const prev = chartData[i - 1];
    const curr = chartData[i];
    const isBearishMiddle = prev.open > prev.close;

    if (isBearishMiddle && curr.high < twoBarsAgo.low) {
      gaps.push({ idx: i, top: twoBarsAgo.low, bottom: curr.high, mid: (twoBarsAgo.low + curr.high) / 2, type: 'bull' });
    } else if (!isBearishMiddle && curr.low > twoBarsAgo.high) {
      gaps.push({ idx: i, top: curr.low, bottom: twoBarsAgo.high, mid: (curr.low + twoBarsAgo.high) / 2, type: 'bear' });
    }
  }

  // Check for inversion: FVG fully filled + price continues through
  for (const gap of gaps) {
    let fillBar = null;
    let inversionBar = null;

    for (let j = gap.idx + 1; j < chartData.length; j++) {
      const c = chartData[j];
      if (gap.type === 'bull') {
        // Bullish FVG inverts when price drops through the bottom
        if (c.close < gap.bottom && fillBar == null) { fillBar = j; }
        if (fillBar != null && c.close < gap.bottom) { inversionBar = j; break; }
      } else {
        // Bearish FVG inverts when price rallies through the top
        if (c.close > gap.top && fillBar == null) { fillBar = j; }
        if (fillBar != null && c.close > gap.top) { inversionBar = j; break; }
      }
      if (j - gap.idx > 80) break;
    }

    if (inversionBar == null) continue;

    // Render the IFVG zone (inverted colors)
    const x1 = toX(inversionBar) - candleW / 2;
    const x2 = toX(chartData.length - 1) + spacing * 2;
    const yTop = toY(gap.top);
    const yBot = toY(gap.bottom);
    const gapH = yBot - yTop;
    if (gapH < 1) continue;

    // Check if IFVG was respected (price bounced from zone)
    let respected = false;
    for (let j = inversionBar + 1; j < chartData.length; j++) {
      const c = chartData[j];
      if (gap.type === 'bull') {
        // Inverted to bearish → acts as resistance
        if (c.high >= gap.bottom && c.high <= gap.top && c.close < gap.bottom) { respected = true; break; }
      } else {
        // Inverted to bullish → acts as support
        if (c.low <= gap.top && c.low >= gap.bottom && c.close > gap.top) { respected = true; break; }
      }
      if (j - inversionBar > 40) break;
    }

    const isInvertedBull = gap.type === 'bear'; // bearish FVG → bullish IFVG
    const color = isInvertedBull ? '16,185,129' : '239,68,68';

    elements.push(
      <g key={`ifvg-${gap.idx}`}>
        <rect x={x1} y={yTop} width={x2 - x1} height={gapH}
          fill={`rgba(${color},0.08)`} stroke={`rgba(${color},0.30)`}
          strokeWidth={0.8} strokeDasharray="4,3" />
        <line x1={x1} x2={x2} y1={toY(gap.mid)} y2={toY(gap.mid)}
          stroke={`rgba(255,255,255,0.12)`} strokeWidth={0.5} strokeDasharray="2,3" />
        <rect x={x1} y={yTop} width={2} height={gapH} fill={`rgba(${color},0.6)`} />
        <text x={x1 + 5} y={toY(gap.mid) - 3} fill={`rgba(${color},0.7)`}
          fontSize={8} fontFamily="'JetBrains Mono', monospace" fontWeight="700">
          IFVG{respected ? ' ✓' : ''}
        </text>
      </g>
    );
  }

  return elements.length > 0 ? <g className="ifvg-overlay">{elements}</g> : null;
}


// ════════════════════════════════════════════════════════════════════════════
// AMD MODEL OVERLAY (Accumulation → Manipulation → Distribution)
// Detects smart-money three-phase cycles:
//   1. Accumulation: tight range consolidation (low ATR)
//   2. Manipulation: false breakout (stop hunt) from the range
//   3. Distribution: true move in the opposite direction of the fake-out
// ════════════════════════════════════════════════════════════════════════════

export function renderAMDModel(chartData, { toX, toY, plotW, plotH, marginTop, spacing }) {
  const realData = chartData.filter(d => !d.isBlank);
  if (realData.length < 40) return null;

  const elements = [];
  const RANGE_LEN = 15;     // bars to define accumulation range
  const ATR_PERIOD = 14;
  const MANIP_LOOK = 5;     // bars to check for manipulation after range
  const DIST_LOOK = 15;     // bars to check for distribution after manipulation

  // Compute ATR
  const atrs = [];
  for (let i = 0; i < realData.length; i++) {
    if (i === 0) { atrs.push(realData[i].high - realData[i].low); continue; }
    const tr = Math.max(
      realData[i].high - realData[i].low,
      Math.abs(realData[i].high - realData[i - 1].close),
      Math.abs(realData[i].low - realData[i - 1].close)
    );
    atrs.push(tr);
  }
  const atrSma = [];
  for (let i = 0; i < atrs.length; i++) {
    if (i < ATR_PERIOD - 1) { atrSma.push(atrs[i]); continue; }
    let sum = 0;
    for (let j = i - ATR_PERIOD + 1; j <= i; j++) sum += atrs[j];
    atrSma.push(sum / ATR_PERIOD);
  }

  // Scan for AMD patterns
  for (let rangeEnd = RANGE_LEN; rangeEnd < realData.length - MANIP_LOOK - 2; rangeEnd++) {
    const rangeStart = rangeEnd - RANGE_LEN;

    // 1. Accumulation: find range high/low and check if ATR is compressed
    let rangeHigh = -Infinity, rangeLow = Infinity;
    let rangeATRsum = 0;
    for (let j = rangeStart; j <= rangeEnd; j++) {
      rangeHigh = Math.max(rangeHigh, realData[j].high);
      rangeLow = Math.min(rangeLow, realData[j].low);
      rangeATRsum += atrSma[j] ?? atrs[j];
    }
    const rangeATR = rangeATRsum / (RANGE_LEN + 1);
    const rangeSpread = rangeHigh - rangeLow;

    // Range must be tight: spread < 2x ATR (compressed)
    if (rangeSpread > rangeATR * 3.0) continue;

    // 2. Manipulation: false breakout in next MANIP_LOOK bars
    let manipBar = -1, manipDir = 0; // +1 = fake breakout UP, -1 = fake breakout DOWN
    for (let j = rangeEnd + 1; j <= Math.min(rangeEnd + MANIP_LOOK, realData.length - 1); j++) {
      const c = realData[j];
      // Fake breakout above: wick above range high, close back inside
      if (c.high > rangeHigh + rangeATR * 0.1 && c.close < rangeHigh && c.close >= rangeLow) {
        manipBar = j; manipDir = 1; break;
      }
      // Fake breakout below: wick below range low, close back inside
      if (c.low < rangeLow - rangeATR * 0.1 && c.close > rangeLow && c.close <= rangeHigh) {
        manipBar = j; manipDir = -1; break;
      }
    }
    if (manipBar < 0) continue;

    // 3. Distribution: true move opposite to fake-out
    let distBar = -1;
    for (let j = manipBar + 1; j <= Math.min(manipBar + DIST_LOOK, realData.length - 1); j++) {
      const c = realData[j];
      if (manipDir === 1 && c.close < rangeLow) { distBar = j; break; }  // faked up → real move down
      if (manipDir === -1 && c.close > rangeHigh) { distBar = j; break; } // faked down → real move up
    }
    if (distBar < 0) continue;

    const isBullish = manipDir === -1; // faked down → real move up = bullish AMD
    const color = isBullish ? '16,185,129' : '239,68,68';

    // Render: accumulation range box, manipulation arrow, distribution arrow
    const x1 = toX(rangeStart);
    const x2 = toX(rangeEnd);
    const xManip = toX(manipBar);
    const xDist = toX(distBar);
    const yHigh = toY(rangeHigh);
    const yLow = toY(rangeLow);

    elements.push(
      <g key={`amd-${rangeStart}`}>
        {/* Accumulation range */}
        <rect x={x1} y={yHigh} width={x2 - x1} height={yLow - yHigh}
          fill={`rgba(${color},0.06)`} stroke={`rgba(${color},0.25)`}
          strokeWidth={0.8} strokeDasharray="3,3" />
        <text x={x1 + 3} y={yHigh - 3} fill={`rgba(${color},0.6)`}
          fontSize={7} fontFamily="'JetBrains Mono', monospace" fontWeight="700">A</text>

        {/* Manipulation marker */}
        <circle cx={xManip} cy={manipDir === 1 ? toY(realData[manipBar].high) : toY(realData[manipBar].low)}
          r={3.5} fill="none" stroke="rgba(251,191,36,0.8)" strokeWidth={1.5} />
        <text x={xManip + 5} y={manipDir === 1 ? toY(realData[manipBar].high) - 3 : toY(realData[manipBar].low) + 11}
          fill="rgba(251,191,36,0.7)" fontSize={7} fontFamily="'JetBrains Mono', monospace" fontWeight="700">M</text>

        {/* Distribution marker */}
        <line x1={xManip} y1={toY(realData[manipBar].close)} x2={xDist} y2={toY(realData[distBar].close)}
          stroke={`rgba(${color},0.5)`} strokeWidth={1.2} />
        <text x={xDist + 5} y={toY(realData[distBar].close) + 3}
          fill={`rgba(${color},0.7)`} fontSize={7} fontFamily="'JetBrains Mono', monospace" fontWeight="700">D</text>
      </g>
    );

    // Skip ahead past this pattern to avoid overlapping detections
    rangeEnd = distBar + RANGE_LEN;
  }

  return elements.length > 0 ? <g className="amd-overlay">{elements}</g> : null;
}


// ════════════════════════════════════════════════════════════════════════════
// ORDER FLOW OVERLAY (Buy/Sell Volume Delta)
// Estimates buy vs sell volume using close position within bar range.
// Renders delta bars at chart bottom + cumulative delta line.
// ════════════════════════════════════════════════════════════════════════════

export function renderOrderFlow(chartData, { toX, toY, plotW, plotH, marginTop, spacing }) {
  if (chartData.length < 10) return null;

  const elements = [];
  const zoneH = plotH * 0.15;
  const chartBottom = marginTop + plotH;
  const zoneTop = chartBottom - zoneH;
  const candleW = Math.max(2, spacing * 0.6);

  // Compute delta per bar: buy vol = V * (C - L) / (H - L), sell vol = V - buy vol
  const deltas = chartData.map(c => {
    const range = c.high - c.low;
    if (range <= 0 || !c.volume) return 0;
    const buyRatio = (c.close - c.low) / range;
    const buyVol = c.volume * buyRatio;
    const sellVol = c.volume * (1 - buyRatio);
    return buyVol - sellVol;
  });

  // Cumulative delta
  const cumDelta = [];
  let cum = 0;
  for (const d of deltas) { cum += d; cumDelta.push(cum); }

  const maxAbsDelta = Math.max(...deltas.map(Math.abs)) || 1;
  const maxAbsCum = Math.max(...cumDelta.map(Math.abs)) || 1;
  const zeroY = zoneTop + zoneH / 2;
  const halfH = zoneH / 2 * 0.85;

  // Background
  elements.push(
    <rect key="of-bg" x={0} y={zoneTop} width={plotW} height={zoneH}
      fill="rgba(0,0,0,0.20)" />
  );
  elements.push(
    <line key="of-zero" x1={0} x2={plotW} y1={zeroY} y2={zeroY}
      stroke="rgba(255,255,255,0.10)" strokeWidth={0.5} />
  );

  // Delta bars
  for (let i = 0; i < chartData.length; i++) {
    const d = deltas[i];
    if (Math.abs(d) < maxAbsDelta * 0.005) continue;
    const barH = (Math.abs(d) / maxAbsDelta) * halfH;
    const y = d >= 0 ? zeroY - barH : zeroY;
    elements.push(
      <rect key={`of-${i}`} x={toX(i) - candleW / 2} y={y}
        width={candleW} height={Math.max(barH, 0.5)}
        fill={d >= 0 ? 'rgba(0,230,118,0.50)' : 'rgba(255,82,82,0.50)'} />
    );
  }

  // Cumulative delta line
  const points = chartData.map((_, i) => {
    const y = zeroY - (cumDelta[i] / maxAbsCum) * halfH;
    return `${toX(i)},${y}`;
  }).join(' ');
  elements.push(
    <polyline key="of-cum" points={points} fill="none"
      stroke="rgba(99,179,237,0.7)" strokeWidth={1.2} />
  );

  // Label
  const lastDelta = deltas[deltas.length - 1];
  const lastCum = cumDelta[cumDelta.length - 1];
  elements.push(
    <text key="of-label" x={8} y={zoneTop + 11}
      fill="rgba(99,179,237,0.55)" fontSize={9}
      fontFamily="'JetBrains Mono', monospace" fontWeight="600">
      ORDER FLOW
      <tspan fill={lastCum >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'}>{' '}Cum Δ {lastCum >= 0 ? '+' : ''}{(lastCum / 1e6).toFixed(1)}M</tspan>
    </text>
  );

  return <g className="order-flow-overlay">{elements}</g>;
}

// ── Bollinger Bands (20, 2) ───────────────────────────────────────────────
export function renderBollingerBands(chartData, { toX, toY, plotW, plotH, marginTop, spacing }) {
  const period = 20;
  if (chartData.length < period) return null;

  const closes = chartData.map(c => c.close);
  const upper = [], middle = [], lower = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(null); middle.push(null); lower.push(null); continue; }
    const slice = closes.slice(i - period + 1, i + 1);
    const sma = slice.reduce((s, v) => s + v, 0) / period;
    const variance = slice.reduce((s, v) => s + (v - sma) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    upper.push(sma + 2 * std);
    middle.push(sma);
    lower.push(sma - 2 * std);
  }

  const buildPath = (values) => {
    let d = '';
    for (let i = 0; i < values.length; i++) {
      if (values[i] === null) continue;
      const x = toX(i), y = toY(values[i]);
      d += d === '' ? `M${x},${y}` : ` L${x},${y}`;
    }
    return d;
  };

  // Fill band area (upper → lower backward)
  const fillPoints = [];
  for (let i = 0; i < upper.length; i++) {
    if (upper[i] !== null) fillPoints.push(`${toX(i)},${toY(upper[i])}`);
  }
  for (let i = upper.length - 1; i >= 0; i--) {
    if (lower[i] !== null) fillPoints.push(`${toX(i)},${toY(lower[i])}`);
  }

  const upperPath  = buildPath(upper);
  const midPath    = buildPath(middle);
  const lowerPath  = buildPath(lower);

  // Last band values for label
  const lastUpper  = upper[upper.length - 1];
  const lastMid    = middle[middle.length - 1];
  const lastLower  = lower[lower.length - 1];
  const lastX      = toX(chartData.length - 1);

  return (
    <g className="bollinger-bands-overlay">
      {/* Band fill */}
      {fillPoints.length > 2 && (
        <polygon
          points={fillPoints.join(' ')}
          fill="rgba(99,179,237,0.06)"
        />
      )}
      {/* Upper band */}
      <path d={upperPath} fill="none" stroke="rgba(99,179,237,0.55)" strokeWidth={1} />
      {/* Middle SMA */}
      <path d={midPath}   fill="none" stroke="rgba(251,191,36,0.65)"  strokeWidth={1} strokeDasharray="4 3" />
      {/* Lower band */}
      <path d={lowerPath} fill="none" stroke="rgba(99,179,237,0.55)" strokeWidth={1} />
      {/* Labels at right edge */}
      {lastUpper !== null && (
        <>
          <text x={lastX + 4} y={toY(lastUpper) + 3} fill="rgba(99,179,237,0.7)" fontSize={8}
            fontFamily="'JetBrains Mono', monospace">U</text>
          <text x={lastX + 4} y={toY(lastMid)   + 3} fill="rgba(251,191,36,0.7)"  fontSize={8}
            fontFamily="'JetBrains Mono', monospace">B</text>
          <text x={lastX + 4} y={toY(lastLower) + 3} fill="rgba(99,179,237,0.7)" fontSize={8}
            fontFamily="'JetBrains Mono', monospace">L</text>
        </>
      )}
    </g>
  );
}
