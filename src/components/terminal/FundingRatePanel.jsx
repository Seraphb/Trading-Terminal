import React, { useMemo } from 'react';
import {
  ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from 'recharts';
import { format } from 'date-fns';

// ── Signal thresholds (rates stored as decimals, e.g. 0.0001 = 0.01%) ────────
const BULL_THRESHOLD = -0.0001;   // ≤ -0.01% → extreme negative → bullish signal
const BEAR_THRESHOLD =  0.0005;   // ≥  0.05% → extreme positive → bearish signal

function fmtRate(rate) {
  if (rate == null) return '—';
  return `${(rate * 100).toFixed(4)}%`;
}

function FRTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d || d.rate == null) return null;
  return (
    <div style={{
      background: 'hsl(222,47%,17%)', border: '1px solid hsl(217,33%,27%)',
      borderRadius: 6, padding: '6px 10px', fontSize: 10, color: '#e2e8f0', minWidth: 130,
    }}>
      <div className="font-mono">
        <span style={{ color: d.rate < 0 ? '#22c55e' : '#ef4444' }}>Funding </span>
        <span className="font-bold">{fmtRate(d.rate)}</span>
      </div>
      {d.timeStr && <div className="text-slate-500 mt-0.5">{d.timeStr}</div>}
      {d.signal === 'bull' && <div className="mt-1 font-semibold text-emerald-400">▲ LONG SQUEEZE — shorts overpaying</div>}
      {d.signal === 'bear' && <div className="mt-1 font-semibold text-red-400">▼ LONGS OVERHEATED — reversal risk</div>}
    </div>
  );
}

export default function FundingRatePanel({ fundingData, klines, visibleRange, rightPad = 0 }) {
  // Sort funding data once
  const sorted = useMemo(() => {
    if (!fundingData?.length) return [];
    return [...fundingData].sort((a, b) => a.time - b.time);
  }, [fundingData]);

  // Build display data using fundingData as its own X-axis,
  // filtered to the time range covered by the visible klines.
  // This avoids the mapping artefact where kline-granularity hides brief negative periods.
  const data = useMemo(() => {
    if (!sorted.length || !klines?.length) return [];

    const [si, ei] = visibleRange ?? [0, klines.length];
    const startTime = klines[Math.max(0, si)]?.time ?? 0;
    const endTime   = klines[Math.min(ei, klines.length - 1)]?.time ?? Date.now();

    const points = sorted
      .filter(d => d.time >= startTime && d.time <= endTime)
      .map(d => {
        let signal = null;
        if (d.rate <= BULL_THRESHOLD) signal = 'bull';
        else if (d.rate >= BEAR_THRESHOLD) signal = 'bear';
        return {
          time: d.time,
          timeStr: format(new Date(d.time), 'MMM dd HH:mm'),
          rate: d.rate,
          signal,
        };
      });

    // Append blank right-pad slots to mirror main chart spacing
    const blanks = Array.from({ length: rightPad }, (_, i) => ({
      time: null, timeStr: '', rate: null, signal: null,
    }));

    return [...points, ...blanks];
  }, [sorted, klines, visibleRange, rightPad]);

  // Current (latest) rate
  const currentRate = sorted.length ? sorted[sorted.length - 1].rate : null;

  // Dynamic Y domain: symmetric around 0, at least ±0.0002
  const maxAbs = useMemo(() => {
    let m = 0.0002;
    for (const d of data) {
      if (d.rate != null) m = Math.max(m, Math.abs(d.rate));
    }
    return m * 1.2;
  }, [data]);

  if (!sorted.length) {
    return (
      <div className="terminal-panel flex flex-col h-full">
        <div className="flex items-center gap-2 px-2 py-1 border-b border-[hsl(217,33%,25%)] flex-shrink-0">
          <span className="text-[10px] font-semibold text-emerald-400">Funding Rate</span>
          <span className="text-[10px] text-slate-600">Loading…</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-[10px] text-slate-700">No funding data</div>
      </div>
    );
  }

  const rateColor = currentRate == null ? '#94a3b8' : currentRate < 0 ? '#22c55e' : '#ef4444';

  return (
    <div className="terminal-panel flex flex-col" style={{ height: '100%' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-2 py-0.5 border-b border-[hsl(217,33%,25%)] flex-shrink-0">
        <span className="text-[10px] font-semibold text-emerald-400">Funding Rate</span>
        {currentRate != null && (
          <span className="text-[10px] font-mono font-bold" style={{ color: rateColor }}>
            {fmtRate(currentRate)}
          </span>
        )}
        <span className="text-[9px] text-slate-600 ml-auto">
          green = negative (shorts overpaying ↑) · red = positive (longs ↑risk)
        </span>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 52, bottom: 2, left: 0 }}>
            <YAxis
              domain={[-maxAbs, maxAbs]}
              tickFormatter={(v) => `${(v * 100).toFixed(3)}%`}
              tick={{ fill: '#6b7280', fontSize: 8, fontFamily: 'JetBrains Mono, monospace' }}
              width={56}
              axisLine={false}
              tickLine={false}
            />
            <XAxis dataKey="timeStr" hide />
            <Tooltip content={<FRTooltip />} />

            {/* Zero line */}
            <ReferenceLine y={0} stroke="hsl(217,33%,35%)" strokeWidth={1} />
            {/* Signal threshold lines */}
            <ReferenceLine y={BULL_THRESHOLD} stroke="#22c55e" strokeWidth={0.6} strokeDasharray="3 3" opacity={0.5} />
            <ReferenceLine y={BEAR_THRESHOLD} stroke="#ef4444" strokeWidth={0.6} strokeDasharray="3 3" opacity={0.5} />

            <Bar dataKey="rate" maxBarSize={10} isAnimationActive={false}>
              {data.map((d, i) => {
                if (d.rate == null) return <Cell key={i} fill="transparent" />;
                if (d.signal === 'bull') return <Cell key={i} fill="#22c55e" opacity={0.9} />;
                if (d.signal === 'bear') return <Cell key={i} fill="#ef4444" opacity={0.9} />;
                if (d.rate < 0) return <Cell key={i} fill="rgba(34,197,94,0.5)" />;
                return <Cell key={i} fill="rgba(239,68,68,0.5)" />;
              })}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
