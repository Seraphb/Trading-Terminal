import React, { useMemo } from 'react';
import {
  ComposedChart, Area, Line, ReferenceLine,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts';

// ════════════════════════════════════════════════════════════════════════════
// VOLUME-WEIGHTED RSI (VWRSI)
// Standard RSI formula but gains/losses are weighted by relative volume.
// High-volume moves get more weight → filters out low-conviction noise.
//
// Divergence detection: price makes new high but VWRSI doesn't = bear div
//                       price makes new low but VWRSI doesn't = bull div
// ════════════════════════════════════════════════════════════════════════════

function computeVWRSI(data, period = 14) {
  if (!data?.length || data.length < period + 1) return [];

  const closes = data.map(d => d.close ?? 0);
  const volumes = data.map(d => d.volume ?? 1);

  // Normalize volume: ratio to its own SMA
  const volSma = [];
  for (let i = 0; i < volumes.length; i++) {
    if (i < period - 1) { volSma.push(volumes[i]); continue; }
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += volumes[j];
    volSma.push(s / period);
  }
  const relVol = volumes.map((v, i) => volSma[i] > 0 ? v / volSma[i] : 1);

  // Volume-weighted gains & losses
  const gains = [];
  const losses = [];
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const w = relVol[i];
    gains.push(change > 0 ? change * w : 0);
    losses.push(change < 0 ? -change * w : 0);
  }

  // EMA smoothing for avg gain / avg loss
  const k = 1 / period;
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period && i < gains.length; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;

  const vwrsi = new Array(data.length).fill(null);

  for (let i = period; i < gains.length; i++) {
    avgGain = avgGain * (1 - k) + gains[i] * k;
    avgLoss = avgLoss * (1 - k) + losses[i] * k;
    const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
    vwrsi[i + 1] = 100 - 100 / (1 + rs);
  }

  // Signal line (EMA9 of VWRSI)
  const signal = new Array(data.length).fill(null);
  const sigK = 2 / (9 + 1);
  let prev = null;
  for (let i = 0; i < data.length; i++) {
    if (vwrsi[i] == null) continue;
    if (prev == null) { prev = vwrsi[i]; signal[i] = prev; continue; }
    prev = vwrsi[i] * sigK + prev * (1 - sigK);
    signal[i] = prev;
  }

  return data.map((d, i) => ({
    time: d.time,
    vwrsi: vwrsi[i] != null ? Math.round(vwrsi[i] * 100) / 100 : null,
    signal: signal[i] != null ? Math.round(signal[i] * 100) / 100 : null,
    relVol: relVol[i] != null ? Math.round(relVol[i] * 100) / 100 : null,
  }));
}

export default function VolumeWeightedRSI({ klines, visibleRange, rightPad = 0, inspectionX }) {
  const data = useMemo(() => {
    if (!klines?.length) return [];
    const candles = klines.map(k => ({
      time: k.time ?? k[0],
      close: k.close ?? k[4],
      high: k.high ?? k[2],
      low: k.low ?? k[3],
      volume: k.volume ?? k[5] ?? 0,
    }));
    return computeVWRSI(candles, 14);
  }, [klines]);

  const visibleData = useMemo(() => {
    if (!data.length || !visibleRange) return data;
    const [s, e] = visibleRange;
    const sliced = data.slice(Math.max(0, s), Math.min(data.length, e + 1));
    if (rightPad > 0) {
      for (let i = 0; i < rightPad; i++) sliced.push({ time: null, vwrsi: null, signal: null });
    }
    return sliced;
  }, [data, visibleRange, rightPad]);

  if (!visibleData.length) return null;

  const lastVal = visibleData.filter(d => d.vwrsi != null).slice(-1)[0];
  const rsiColor = lastVal?.vwrsi >= 70 ? '#ef4444' : lastVal?.vwrsi <= 30 ? '#22c55e' : '#3b82f6';

  return (
    <div className="w-full h-full relative" style={{ minHeight: 80 }}>
      <div className="absolute top-0.5 left-2 z-10 flex items-center gap-2 text-[9px] font-mono opacity-60">
        <span style={{ color: '#3b82f6' }}>VWRSI(14)</span>
        <span style={{ color: '#f59e0b' }}>Signal(9)</span>
        {lastVal?.vwrsi != null && (
          <span style={{ color: rsiColor }} className="font-bold">{lastVal.vwrsi.toFixed(1)}</span>
        )}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={visibleData} margin={{ top: 16, right: 50, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="time" hide />
          <YAxis domain={[0, 100]} hide />

          {/* Overbought/oversold zones */}
          <ReferenceLine y={70} stroke="rgba(239,68,68,0.25)" strokeDasharray="4 3" />
          <ReferenceLine y={30} stroke="rgba(16,185,129,0.25)" strokeDasharray="4 3" />
          <ReferenceLine y={50} stroke="rgba(255,255,255,0.08)" />

          {/* Overbought fill (70-100) */}
          <Area dataKey="vwrsi" type="monotone" fill="none" stroke="none"
            baseValue={70} fillOpacity={0}
            activeDot={false} isAnimationActive={false} />

          {/* VWRSI line */}
          <Line dataKey="vwrsi" type="monotone" stroke="#3b82f6" strokeWidth={1.5}
            dot={false} isAnimationActive={false} connectNulls />

          {/* Signal line */}
          <Line dataKey="signal" type="monotone" stroke="#f59e0b" strokeWidth={1}
            dot={false} isAnimationActive={false} connectNulls opacity={0.6} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
