import React, { useMemo, useState } from 'react';
import {
  buildSignalData, runBacktest, formatPrice, signalColor,
  SIGNAL_THRESHOLD, STRONG_THRESHOLD, ELITE_THRESHOLD,
} from './SniperSignals';

// ── TF label mapping ──────────────────────────────────────────────────────────
const TF_LABELS = {
  '1m':  ['1m',  '5m',  '15m'],
  '5m':  ['5m',  '20m', '1h'],
  '15m': ['15m', '1h',  '3h'],
  '1h':  ['1h',  '4h',  '12h'],
  '4h':  ['4h',  '1d',  '3d'],
  '1d':  ['1d',  '4d',  '2w'],
  '1w':  ['1w',  '1mo', '3mo'],
};

// Aggregate klines into a higher timeframe (period candles → 1 candle)
function aggregateKlines(klines, period) {
  if (period === 1) return klines;
  const out = [];
  for (let i = 0; i + period <= klines.length; i += period) {
    const s = klines.slice(i, i + period);
    out.push({
      open:   s[0].open,
      high:   Math.max(...s.map(k => k.high)),
      low:    Math.min(...s.map(k => k.low)),
      close:  s[s.length - 1].close,
      volume: s.reduce((acc, k) => acc + k.volume, 0),
      time:   s[0].time,
    });
  }
  return out;
}

// ── MTF computation ───────────────────────────────────────────────────────────
function computeMTF(klines, interval) {
  const periods   = [1, 4, 12];
  const tfLabels  = TF_LABELS[interval] || ['1x', '4x', '12x'];

  // Signal data for each timeframe
  const tfData = periods.map(p => buildSignalData(aggregateKlines(klines, p)));

  // Enrich current-TF signals with higher-TF bias
  const enriched = tfData[0].map(sig => {
    if (!sig.signalType) return { ...sig, mtfScore: 0, confirmed: false };

    const sigBias = sig.signalType.includes('BUY') ? 'bull' : 'bear';
    const idx4    = Math.min(Math.floor(sig.idx / 4),  tfData[1].length - 1);
    const idx12   = Math.min(Math.floor(sig.idx / 12), tfData[2].length - 1);
    const bias4   = tfData[1][idx4]?.bias  ?? 'neutral';
    const bias12  = tfData[2][idx12]?.bias ?? 'neutral';

    const mtfScore = [sigBias, bias4, bias12].filter(b => b === sigBias).length;
    // 1 = only current TF, 2 = current + one HTF, 3 = all agree
    return { ...sig, mtfScore, confirmed: mtfScore >= 2, bias4, bias12 };
  });

  // Overview per TF
  const overview = periods.map((p, i) => {
    const data    = tfData[i];
    const lastBias = data[data.length - 1]?.bias ?? 'neutral';
    const signals = data.filter(d => d.signalType);
    const lastSig = signals[signals.length - 1];
    return { label: tfLabels[i], bias: lastBias, signalCount: signals.length, lastSig };
  });

  // Confirmed signals only (MTF aligned + zone confirmation)
  const confirmed = enriched.filter(s =>
    s.confirmed &&
    (Math.abs(s.obS ?? 0) > 0 || Math.abs(s.fvgS ?? 0) > 0 || Math.abs(s.swpS ?? 0) > 0),
  );

  return { enriched, overview, confirmed, tfLabels };
}

// ── Mini badge ────────────────────────────────────────────────────────────────
function MtfBadge({ score }) {
  const colors = ['#475569', '#f59e0b', '#00f5a0'];
  const labels = ['1/3', '2/3', '3/3'];
  const color  = colors[Math.min(score - 1, 2)];
  return (
    <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: `${color}20`, color }}>
      {labels[Math.min(score - 1, 2)] ?? '?'} MTF
    </span>
  );
}

// ── Backtest stats bar ────────────────────────────────────────────────────────
function BtStats({ bt }) {
  if (!bt) return (
    <div className="text-center text-slate-600 text-xs py-4">
      Not enough confirmed signals for backtest
    </div>
  );

  const { trades, wins, losses, timeouts, totalPnl, winRate, maxDD, profitFactor } = bt;
  const items = [
    { label: 'Total P&L',     val: `${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(1)}%`,  color: totalPnl >= 0 ? '#00f5a0' : '#ff4d6d' },
    { label: 'Win Rate',      val: `${winRate.toFixed(0)}%`,                               color: winRate >= 55 ? '#00f5a0' : winRate >= 45 ? '#f59e0b' : '#ff4d6d' },
    { label: 'Profit Factor', val: isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞', color: profitFactor >= 1.5 ? '#00f5a0' : '#f59e0b' },
    { label: 'Max DD',        val: `-${maxDD.toFixed(1)}%`,                                color: '#fb923c' },
    { label: 'Trades',        val: trades.length, color: '#94a3b8' },
    { label: 'Wins',          val: wins.length,   color: '#00f5a0' },
    { label: 'Losses',        val: losses.length, color: '#ff4d6d' },
    { label: 'Timeouts',      val: timeouts.length, color: '#f59e0b' },
  ];

  return (
    <div>
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {items.map(({ label, val, color }) => (
          <div key={label} className="flex flex-col items-center py-2 rounded" style={{ background: 'hsl(222,47%,13%)' }}>
            <span className="text-[9px] text-slate-600 uppercase tracking-wide mb-0.5">{label}</span>
            <span className="font-bold font-mono text-sm" style={{ color }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Equity curve */}
      <div className="mb-2">
        <div className="text-[9px] text-slate-600 uppercase tracking-wide mb-1">Equity Curve (MTF-confirmed only)</div>
        <div className="flex items-end gap-px" style={{ height: 44 }}>
          {(() => {
            let cum = 0;
            const equity = trades.map(t => { cum += t.pnlPct; return cum; });
            const min = Math.min(0, ...equity), max = Math.max(0, ...equity);
            const range = max - min || 1, zero = (0 - min) / range;
            return equity.map((v, i) => {
              const norm = (v - min) / range;
              const col  = v >= 0 ? '#00f5a0' : '#ff4d6d';
              return (
                <div key={i} className="flex-1 flex flex-col justify-end" style={{ height: '100%' }}>
                  {v >= 0
                    ? <div style={{ height: `${(norm - zero) * 100}%`, background: col, opacity: 0.75, borderRadius: '1px 1px 0 0', minHeight: 1 }} />
                    : <div style={{ height: `${(zero - norm) * 100}%`, background: col, opacity: 0.75, borderRadius: '0 0 1px 1px', minHeight: 1 }} />
                  }
                </div>
              );
            });
          })()}
        </div>
        <div className="border-t border-slate-800 mt-0" />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Modal
// ══════════════════════════════════════════════════════════════════════════════
export default function SniperStrategyModal({ klines, interval, symbol, onClose }) {
  const [tab, setTab] = useState('signals'); // 'signals' | 'backtest'

  const { enriched, overview, confirmed, tfLabels } = useMemo(
    () => computeMTF(klines, interval),
    [klines, interval],
  );

  const allSignals   = enriched.filter(s => s.signalType).reverse();
  const btResult     = useMemo(() => runBacktest(confirmed, klines), [confirmed, klines]);

  const biasBg  = (bias) => bias === 'bull' ? 'rgba(0,245,160,0.08)' : bias === 'bear' ? 'rgba(255,77,109,0.08)' : 'rgba(71,85,105,0.08)';
  const biasCol = (bias) => bias === 'bull' ? '#00f5a0' : bias === 'bear' ? '#ff4d6d' : '#64748b';
  const biasLabel = (bias) => bias === 'bull' ? '▲ BULL' : bias === 'bear' ? '▼ BEAR' : '— NEUTRAL';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col"
        style={{
          background: 'hsl(222,47%,11%)',
          border: '1px solid hsl(217,33%,22%)',
          borderRadius: 14,
          width: 'min(960px, 95vw)',
          maxHeight: '90vh',
          boxShadow: '0 32px 100px rgba(0,0,0,0.8)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[hsl(217,33%,20%)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold" style={{ color: '#00f5a0' }}>⚡ Sniper Strategy</span>
            <span className="text-sm font-semibold text-white">{symbol}</span>
            <span className="text-[10px] text-slate-500 font-mono">
              MTF: {tfLabels.join(' / ')} · {confirmed.length} confirmed signals
            </span>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-white text-xl leading-none px-1 transition-colors">✕</button>
        </div>

        {/* ── MTF Overview ── */}
        <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b border-[hsl(217,33%,18%)] flex-shrink-0">
          {overview.map((tf, i) => (
            <div key={i} className="rounded-lg p-3 flex flex-col gap-1" style={{ background: biasBg(tf.bias), border: `1px solid ${biasCol(tf.bias)}30` }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-500 uppercase">{tf.label}</span>
                <span className="text-[9px] text-slate-600">{tf.signalCount} signals</span>
              </div>
              <span className="text-lg font-bold" style={{ color: biasCol(tf.bias) }}>{biasLabel(tf.bias)}</span>
              {tf.lastSig && (
                <span className="text-[10px]" style={{ color: signalColor(tf.lastSig.signalType) }}>
                  Last: {tf.lastSig.signalType?.replace('_', ' ')} @ {formatPrice(tf.lastSig.price)}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 px-5 pt-2 flex-shrink-0">
          {[
            { id: 'signals',  label: `Signals (${allSignals.length})` },
            { id: 'confirmed', label: `MTF Confirmed (${confirmed.length})` },
            { id: 'backtest', label: 'Backtest' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3 py-1 text-xs rounded-t transition-all"
              style={{
                background: tab === t.id ? 'hsl(217,33%,18%)' : 'transparent',
                color:      tab === t.id ? '#e2e8f0' : '#475569',
                borderBottom: tab === t.id ? '2px solid #00f5a0' : '2px solid transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">

          {/* All signals tab */}
          {tab === 'signals' && (
            <div className="space-y-1">
              {!allSignals.length && (
                <div className="text-center text-slate-600 py-8">No signals on this timeframe</div>
              )}
              {allSignals.map((sig, i) => {
                const isBuy = sig.signalType.includes('BUY');
                const col   = signalColor(sig.signalType);
                return (
                  <div
                    key={i}
                    className="grid items-center gap-3 px-3 py-2 rounded text-[11px]"
                    style={{
                      background: sig.confirmed ? 'hsl(222,47%,13%)' : 'hsl(222,47%,11%)',
                      border: sig.confirmed ? `1px solid ${col}25` : '1px solid transparent',
                      gridTemplateColumns: '18px 70px 1fr auto auto auto auto auto',
                      opacity: sig.confirmed ? 1 : 0.55,
                    }}
                  >
                    <span style={{ color: col, fontSize: 12 }}>{isBuy ? '▲' : '▼'}</span>
                    <span className="font-mono font-bold" style={{ color: col }}>{formatPrice(sig.price)}</span>
                    <span className="text-slate-500 text-[10px]">{sig.signalType?.replace('_', ' ')}</span>
                    <MtfBadge score={sig.mtfScore} />
                    <span className="text-slate-600 text-[10px]">{sig.factorCount}f</span>
                    {sig.tp1 && <span className="text-blue-400 font-mono text-[10px]">TP1 {formatPrice(sig.tp1)}</span>}
                    {sig.sl  && <span className="text-orange-400 font-mono text-[10px]">SL {formatPrice(sig.sl)}</span>}
                    {sig.rrRatio && <span className="text-slate-500 text-[10px]">{sig.rrRatio.toFixed(1)}R</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* MTF Confirmed tab */}
          {tab === 'confirmed' && (
            <div className="space-y-1.5">
              {!confirmed.length && (
                <div className="text-center text-slate-600 py-8">
                  No MTF-confirmed signals yet — need 2+ timeframes to agree
                </div>
              )}
              {[...confirmed].reverse().map((sig, i) => {
                const isBuy = sig.signalType.includes('BUY');
                const col   = signalColor(sig.signalType);
                const biasList = [
                  { label: tfLabels[0], bias: isBuy ? 'bull' : 'bear' },
                  { label: tfLabels[1], bias: sig.bias4  },
                  { label: tfLabels[2], bias: sig.bias12 },
                ];
                return (
                  <div
                    key={i}
                    className="rounded-lg px-4 py-3"
                    style={{ background: 'hsl(222,47%,13%)', border: `1px solid ${col}30` }}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-bold text-sm" style={{ color: col }}>
                        {sig.signalType?.startsWith('ELITE') ? '◆◆ ' : sig.signalType?.startsWith('STRONG') ? '◆ ' : '● '}
                        {sig.signalType?.replace('_', ' ')}
                      </span>
                      <span className="font-mono font-bold text-white">{formatPrice(sig.price)}</span>
                      <MtfBadge score={sig.mtfScore} />
                      <span className="text-slate-600 text-[10px]">{sig.factorCount}/7 factors</span>
                    </div>

                    {/* TF alignment badges */}
                    <div className="flex gap-2 mb-2">
                      {biasList.map(({ label, bias }) => (
                        <span key={label} className="text-[10px] px-2 py-0.5 rounded font-mono"
                          style={{ background: biasBg(bias), color: biasCol(bias), border: `1px solid ${biasCol(bias)}30` }}>
                          {label}: {bias === 'bull' ? '▲' : bias === 'bear' ? '▼' : '—'}
                        </span>
                      ))}
                    </div>

                    {/* Targets */}
                    <div className="flex gap-4 text-[10px] font-mono">
                      {sig.tp1 && <span className="text-blue-400">TP1 {formatPrice(sig.tp1)}</span>}
                      {sig.tp2 && <span className="text-indigo-400">TP2 {formatPrice(sig.tp2)}</span>}
                      {sig.tp3 && <span className="text-purple-400">TP3 {formatPrice(sig.tp3)}</span>}
                      {sig.sl  && <span className="text-orange-400">SL {formatPrice(sig.sl)}</span>}
                      {sig.rrRatio && <span className="text-slate-500">R:R {sig.rrRatio.toFixed(1)}x</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Backtest tab */}
          {tab === 'backtest' && (
            <div>
              <div className="text-[10px] text-slate-600 mb-3">
                Backtesting only MTF-confirmed signals with zone confirmation (OB/FVG/Sweep).
                Entry = signal close · Exit = TP1 (1.5 ATR) or SL (1.1 ATR) · Max 55 bars.
              </div>
              <BtStats bt={btResult} />

              {btResult && (
                <div className="space-y-1 mt-3">
                  <div className="text-[9px] text-slate-600 uppercase tracking-wide mb-1">Trade Log</div>
                  {btResult.trades.map((t, i) => {
                    const isBuy = t.signalType.includes('BUY');
                    const col   = t.result === 'win' ? '#00f5a0' : t.result === 'loss' ? '#ff4d6d' : '#f59e0b';
                    return (
                      <div key={i} className="flex items-center gap-3 text-[11px] py-1.5 px-3 rounded" style={{ background: 'hsl(222,47%,12%)' }}>
                        <span style={{ color: isBuy ? '#00f5a0' : '#ff4d6d', minWidth: 14 }}>{isBuy ? '▲' : '▼'}</span>
                        <span className="font-mono text-slate-400" style={{ minWidth: 64 }}>{formatPrice(t.entry)}</span>
                        <span className="text-slate-700">→</span>
                        <span className="font-mono text-slate-300" style={{ minWidth: 64 }}>{formatPrice(t.exitPrice)}</span>
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
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
