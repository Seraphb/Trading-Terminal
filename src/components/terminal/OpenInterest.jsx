import React, { useMemo, useState } from 'react';
import {
  ComposedChart, Area, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { useOpenInterest } from './useBinanceWS';

function formatOI(val, inUSD) {
  if (val == null) return '—';
  if (inUSD) {
    if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    if (Math.abs(val) >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
    return `$${val.toFixed(0)}`;
  }
  if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (Math.abs(val) >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
  return val.toFixed(2);
}

// Binary search: latest OI entry with time <= targetTime
function findOIEntry(sortedOI, targetTime) {
  let lo = 0, hi = sortedOI.length - 1, result = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedOI[mid].time <= targetTime) { result = sortedOI[mid]; lo = mid + 1; }
    else hi = mid - 1;
  }
  return result;
}

export default function OpenInterest({ klines, visibleRange, inspectionX, symbol, interval }) {
  const { oiData, error } = useOpenInterest(symbol, interval);
  const [showUSD, setShowUSD] = useState(false);

  const data = useMemo(() => {
    if (!klines.length || !oiData.length) return [];
    const sorted = [...oiData].sort((a, b) => a.time - b.time);

    // Attach OI entry to each kline by timestamp
    const oiByKline = klines.map(k => findOIEntry(sorted, k.time));

    return klines.map((k, i) => {
      const entry = oiByKline[i];
      const oi = entry ? (showUSD ? entry.oiValue : entry.oi) : null;

      // Show delta bar only when OI period changes (new candle enters new OI bucket)
      let oiDelta = null;
      if (entry && i > 0) {
        const prevEntry = oiByKline[i - 1];
        if (prevEntry && entry.time !== prevEntry.time) {
          const prev = showUSD ? prevEntry.oiValue : prevEntry.oi;
          oiDelta = oi - prev;
        }
      }

      return { idx: i, oi, oiDelta };
    });
  }, [klines, oiData, showUSD]);

  const [startIdx, endIdx] = visibleRange ?? [Math.max(0, data.length - 120), data.length];
  const visible = data.slice(startIdx, endIdx);

  if (error === 'not_futures') {
    return (
      <div className="terminal-panel flex items-center justify-center h-full text-slate-600 text-xs">
        Open Interest is only available for futures pairs (e.g. BTCUSDT)
      </div>
    );
  }

  if (!visible.length || !oiData.length) {
    return (
      <div className="terminal-panel flex items-center justify-center h-full text-slate-600 text-xs animate-pulse">
        Loading Open Interest…
      </div>
    );
  }

  const oiVals = visible.map(d => d.oi).filter(v => v != null);
  const oiMin = Math.min(...oiVals) * 0.997;
  const oiMax = Math.max(...oiVals) * 1.003;

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
      <div style={{
        background: 'hsl(222,47%,13%)', border: '1px solid hsl(217,33%,27%)',
        borderRadius: 6, padding: '6px 10px', fontSize: 10, color: '#e2e8f0',
      }}>
        <div><span style={{ color: '#a855f7' }}>OI</span> {formatOI(d.oi, showUSD)}</div>
        {d.oiDelta != null && (
          <div style={{ color: d.oiDelta >= 0 ? '#10b981' : '#ef4444' }}>
            Δ {d.oiDelta >= 0 ? '+' : ''}{formatOI(d.oiDelta, showUSD)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="terminal-panel flex flex-col" style={{ height: '100%' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-2 py-0.5 border-b border-[hsl(217,33%,20%)] flex-shrink-0">
        <span className="text-[10px] font-semibold text-purple-400 mr-1">Open Interest</span>
        <button
          onClick={() => setShowUSD(v => !v)}
          className={`px-1.5 py-0.5 rounded text-[10px] border transition-all ${
            showUSD
              ? 'border-purple-500 text-purple-300 bg-purple-900/20'
              : 'border-slate-700 text-slate-500 hover:text-slate-300'
          }`}
        >
          {showUSD ? 'USD' : 'Coin'}
        </button>
      </div>

      {/* Chart */}
      <div
        className="flex-1 min-h-0"
        ref={el => { if (el) el.onwheel = e => e.stopPropagation(); }}
        style={{ touchAction: 'none', position: 'relative' }}
        onMouseDown={e => e.stopPropagation()}
        onMouseMove={e => e.stopPropagation()}
        onMouseUp={e => e.stopPropagation()}
      >
        {inspectionX != null && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-10"
            style={{ left: `${inspectionX}px`, borderLeft: '1px dashed rgba(148,163,184,0.45)' }}
          />
        )}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={visible} margin={{ top: 10, right: 12, bottom: 10, left: 0 }}>
            <CartesianGrid stroke="hsl(217,33%,15%)" strokeDasharray="3 3" />
            <XAxis dataKey="idx" hide />
            <YAxis
              yAxisId="oi"
              orientation="right"
              domain={[oiMin, oiMax]}
              tick={{ fill: '#475569', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              width={60}
              tickFormatter={v => formatOI(v, showUSD)}
            />
            <YAxis yAxisId="delta" hide domain={['auto', 'auto']} />
            <Tooltip content={<CustomTooltip />} />

            {/* OI delta bars (green = increase, red = decrease) */}
            <Bar yAxisId="delta" dataKey="oiDelta" isAnimationActive={false} radius={[1, 1, 0, 0]}>
              {visible.map((entry, i) => (
                <Cell key={i} fill={entry.oiDelta == null ? 'transparent' : entry.oiDelta >= 0 ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'} />
              ))}
            </Bar>

            {/* OI area line */}
            <Area
              yAxisId="oi"
              type="stepAfter"
              dataKey="oi"
              stroke="#a855f7"
              fill="rgba(168,85,247,0.12)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
