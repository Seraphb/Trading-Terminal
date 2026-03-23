import React, { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, Cell,
} from 'recharts';

// ── Math helpers ───────────────────────────────────────────────────────────────

function sma(src, len) {
  return src.map((_, i) => {
    const slice = src.slice(Math.max(0, i - len + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
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

// ── Event colors ───────────────────────────────────────────────────────────────
const EVENT_COLORS = {
  SC:  '#10b981',
  BC:  '#ef4444',
  SPR: '#22c55e',
  UT:  '#f87171',
  SOS: '#3b82f6',
  SOW: '#f43f5e',
};

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function CustomTooltip({ active = false, payload = [] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  let phaseColor = '#64748b';
  if (d.flow > 0.2) phaseColor = '#10b981';
  else if (d.flow < -0.2) phaseColor = '#ef4444';

  const phaseLabel = d.flow > 0.2 ? 'ACCUMULATION' : d.flow < -0.2 ? 'DISTRIBUTION' : 'NEUTRAL';

  return (
    <div style={{
      background: 'hsl(222,47%,13%)',
      border: '1px solid hsl(217,33%,27%)',
      borderRadius: 6,
      padding: '6px 10px',
      fontSize: 10,
      color: '#e2e8f0',
      minWidth: 130,
      fontFamily: 'monospace',
    }}>
      {d.timeStr && <div style={{ color: '#475569', marginBottom: 3 }}>{d.timeStr}</div>}
      <div><span style={{ color: '#10b981' }}>Flow</span>{'   '}{d.flow?.toFixed(3)}</div>
      <div><span style={{ color: '#f59e0b' }}>Signal</span>{' '}{d.signal?.toFixed(3)}</div>
      {d.event && (
        <div style={{ marginTop: 4, borderTop: '1px solid hsl(217,33%,27%)', paddingTop: 4 }}>
          <span style={{ color: EVENT_COLORS[d.event] ?? '#e2e8f0' }}>● {d.event}</span>
        </div>
      )}
      <div style={{ marginTop: 4, borderTop: '1px solid hsl(217,33%,27%)', paddingTop: 4 }}>
        <span style={{ color: phaseColor }}>● {phaseLabel}</span>
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function WyckoffIndicator({ klines, visibleRange, rightPad = 0, inspectionX = null }) {
  const data = useMemo(() => {
    if (!klines || klines.length < 20) return [];

    const n = klines.length;

    // Step 1: volSMA(20)
    const volumes = klines.map(k => k.volume);
    const volSMA = sma(volumes, 20);

    // Step 2: True Range and ATR(14)
    const trueRanges = klines.map((k, i) => {
      const prevClose = i > 0 ? klines[i - 1].close : k.close;
      return Math.max(k.high - k.low, Math.abs(k.high - prevClose), Math.abs(k.low - prevClose));
    });
    const ATR = sma(trueRanges, 14);

    // Step 3: priceSMA50
    const closes = klines.map(k => k.close);
    const priceSMA50 = sma(closes, 50);

    // Step 4: Per-candle metrics
    const netTicks = klines.map((k, i) => {
      const spread = (k.high - k.low) || 0.0001;
      const closeRatio = (k.close - k.low) / spread;
      const rawRelVol = volSMA[i] > 0 ? k.volume / volSMA[i] : 1;
      const relVol = Math.min(rawRelVol, 3.0);
      return (2 * closeRatio - 1) * relVol;
    });

    // Step 5-7: flow, signal, histogram
    const flowArr = ema(netTicks, 13);
    const signalArr = ema(flowArr, 8);

    // Step 8: per-candle relVol + spread needed again for events
    const perCandle = klines.map((k, i) => {
      const spread = (k.high - k.low) || 0.0001;
      const closeRatio = (k.close - k.low) / spread;
      const rawRelVol = volSMA[i] > 0 ? k.volume / volSMA[i] : 1;
      const relVol = Math.min(rawRelVol, 3.0);
      return { spread, closeRatio, relVol };
    });

    // Event detection — min 5 bars apart, 20-bar lookback
    const LOOKBACK = 20;
    const MIN_GAP = 5;
    const events = new Array(n).fill(null);
    let lastEventIdx = -MIN_GAP - 1;

    for (let i = 1; i < n; i++) {
      const k = klines[i];
      const { spread, closeRatio, relVol } = perCandle[i];
      const flow = flowArr[i];
      const atr = ATR[i];
      const sma50 = priceSMA50[i];

      // 20-bar recent range (excluding current)
      const rangeStart = Math.max(0, i - LOOKBACK);
      let recentRangeLow = Infinity;
      let recentRangeHigh = -Infinity;
      for (let j = rangeStart; j < i; j++) {
        if (klines[j].low < recentRangeLow) recentRangeLow = klines[j].low;
        if (klines[j].high > recentRangeHigh) recentRangeHigh = klines[j].high;
      }

      if (i - lastEventIdx < MIN_GAP) continue;

      let detectedEvent = null;

      // SC — Selling Climax
      if (
        k.close < sma50 &&
        relVol > 1.8 &&
        spread > atr * 1.3 &&
        k.close < k.open &&
        closeRatio > 0.3
      ) {
        detectedEvent = 'SC';
      }
      // BC — Buying Climax
      else if (
        k.close > sma50 &&
        relVol > 1.8 &&
        spread > atr * 1.3 &&
        k.close > k.open &&
        closeRatio < 0.7
      ) {
        detectedEvent = 'BC';
      }
      // SPR — Spring
      else if (
        recentRangeLow !== Infinity &&
        k.low < recentRangeLow &&
        k.close > recentRangeLow &&
        relVol < 0.9
      ) {
        detectedEvent = 'SPR';
      }
      // UT — Upthrust
      else if (
        recentRangeHigh !== -Infinity &&
        k.high > recentRangeHigh &&
        k.close < recentRangeHigh &&
        relVol > 1.1
      ) {
        detectedEvent = 'UT';
      }
      // SOS — Sign of Strength
      else if (
        k.close > k.open &&
        closeRatio > 0.7 &&
        relVol > 1.5 &&
        spread > atr * 1.3 &&
        flow > 0
      ) {
        detectedEvent = 'SOS';
      }
      // SOW — Sign of Weakness
      else if (
        k.close < k.open &&
        closeRatio < 0.3 &&
        relVol > 1.5 &&
        spread > atr * 1.3 &&
        flow < 0
      ) {
        detectedEvent = 'SOW';
      }

      if (detectedEvent) {
        events[i] = detectedEvent;
        lastEventIdx = i;
      }
    }

    return klines.map((k, i) => ({
      timeStr: k.timeStr ?? String(k.time),
      flow: flowArr[i],
      signal: signalArr[i],
      histogram: flowArr[i] - signalArr[i],
      event: events[i],
    }));
  }, [klines]);

  const [startIdx, endIdx] = visibleRange ?? [Math.max(0, data.length - 120), data.length];
  const realSlice = data.slice(startIdx, endIdx);
  if (!realSlice.length) return null;
  // Append blank entries to mirror the right-side blank space of the main price chart
  const blanks = Array.from({ length: rightPad }, (_, i) => ({ timeStr: '', idx: endIdx + i }));
  const visibleData = rightPad > 0 ? [...realSlice, ...blanks] : realSlice;

  // Phase is based on last real bar's flow value (ignore blank right-pad entries)
  const lastFlow = realSlice[realSlice.length - 1]?.flow ?? 0;
  let phaseLabel = 'NEUTRAL';
  let phaseColor = '#64748b';
  if (lastFlow > 0.2) { phaseLabel = 'ACCUMULATION'; phaseColor = '#10b981'; }
  else if (lastFlow < -0.2) { phaseLabel = 'DISTRIBUTION'; phaseColor = '#ef4444'; }

  // renderEventDot — function (not component) used as dot prop on the flow Line
  /**
   * @param {{ cx?: number, cy?: number, payload?: { event?: string }, index?: number }} props
   */
  function renderEventDot(props) {
    const { cx, cy, payload, index } = props;
    if (!payload?.event) return null;
    const evt = payload.event;
    const color = EVENT_COLORS[evt] ?? '#e2e8f0';
    // Place label above for positive flow events (SOS, BC, SPR), below for negative (SOW, SC, UT)
    const above = ['SOS', 'BC', 'SPR'].includes(evt);
    const textY = above ? cy - 10 : cy + 18;
    const circleY = above ? cy - 3.5 : cy + 3.5;
    return (
      <g key={`evt-${index}`}>
        <circle cx={cx} cy={cy} r={3.5} fill={color} opacity={0.9} />
        <text
          x={cx}
          y={textY}
          textAnchor="middle"
          fill={color}
          fontSize={8}
          fontFamily="monospace"
          fontWeight="700"
        >
          {evt}
        </text>
      </g>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        background: 'hsl(222,47%,8%)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Overlay: phase label + legend */}
      <div style={{
        position: 'absolute',
        top: 6,
        left: 8,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        pointerEvents: 'none',
      }}>
        {/* Title row */}
        <span style={{ fontSize: 9, color: '#475569', fontFamily: 'monospace' }}>
          Wyckoff Flow
        </span>
        {/* Phase row */}
        <span style={{ fontSize: 9, fontWeight: 700, color: phaseColor, fontFamily: 'monospace' }}>
          ● {phaseLabel}
        </span>
        {/* Legend row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            Flow
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
            Signal
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#94a3b8', fontFamily: 'monospace' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#475569', display: 'inline-block' }} />
            Histogram
          </span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {inspectionX != null ? (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${inspectionX}px`,
              borderLeft: '1px dashed rgba(148,163,184,0.45)',
              pointerEvents: 'none',
              zIndex: 6,
            }}
          />
        ) : null}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={visibleData} margin={{ top: 16, right: 72, bottom: 4, left: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(217,33%,15%)" strokeWidth={0.5} />
            <XAxis dataKey="timeStr" tick={false} axisLine={false} tickLine={false} />
            <YAxis
              domain={['auto', 'auto']}
              width={72}
              orientation="right"
              tick={{ fontSize: 9, fill: '#475569', fontFamily: 'monospace' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => v.toFixed(2)}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#334155', strokeWidth: 1 }} />
            <ReferenceLine y={0} stroke="#334155" strokeWidth={1} />

            {/* Histogram bars */}
            <Bar dataKey="histogram" maxBarSize={8} isAnimationActive={false}>
              {visibleData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.histogram >= 0 ? 'rgba(16,185,129,0.55)' : 'rgba(239,68,68,0.55)'}
                />
              ))}
            </Bar>

            {/* Signal line */}
            <Line
              dataKey="signal"
              stroke="#f59e0b"
              strokeWidth={1}
              dot={false}
              activeDot={{ r: 3, fill: '#f59e0b' }}
              isAnimationActive={false}
            />

            {/* Flow line with event dots */}
            <Line
              dataKey="flow"
              stroke="#10b981"
              strokeWidth={1.5}
              dot={renderEventDot}
              activeDot={{ r: 3, fill: '#10b981' }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
