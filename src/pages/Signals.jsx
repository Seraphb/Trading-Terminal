import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { Brain, TrendingUp, TrendingDown, Minus, Trash2, BarChart2, Activity, BarChart3 } from 'lucide-react';
import { loadSignals, clearSignals } from '@/lib/signalStore';

const directionConfig = {
  LONG:    { icon: TrendingUp,   color: '#22c55e', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.25)'  },
  SHORT:   { icon: TrendingDown, color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)'  },
  NEUTRAL: { icon: Minus,        color: '#eab308', bg: 'rgba(234,179,8,0.1)', border: 'rgba(234,179,8,0.25)'  },
};

const indicatorColor = {
  bullish: '#22c55e', bearish: '#ef4444', neutral: '#94a3b8',
  strong:  '#22c55e', moderate: '#eab308', weak:    '#ef4444',
  high:    '#f97316', medium:   '#eab308', low:     '#60a5fa',
};

function fmtPrice(n) {
  if (!n) return '—';
  if (n >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1)    return '$' + n.toFixed(4);
  return '$' + n.toFixed(6);
}

export default function Signals() {
  const [all, setAll]       = useState([]);
  const [mode, setMode]     = useState('crypto'); // 'crypto' | 'stock'
  const [expanded, setExpanded] = useState(null);

  const refresh = () => setAll(loadSignals());

  useEffect(() => {
    refresh();
    window.addEventListener('signals-updated', refresh);
    return () => window.removeEventListener('signals-updated', refresh);
  }, []);

  const signals = useMemo(() =>
    all.filter(s => mode === 'stock' ? s.asset_type === 'stock' : s.asset_type !== 'stock'),
  [all, mode]);

  const cryptoCount = all.filter(s => s.asset_type !== 'stock').length;
  const stockCount  = all.filter(s => s.asset_type === 'stock').length;

  const stats = useMemo(() => {
    const total = signals.length;
    if (!total) return null;
    const longs  = signals.filter(s => s.direction === 'LONG').length;
    const shorts = signals.filter(s => s.direction === 'SHORT').length;
    const avgConf = Math.round(signals.reduce((a, s) => a + (s.confidence || 0), 0) / total);
    const withPrices = signals.filter(s => s.entry_price && s.target_price && s.stop_loss);
    const avgTpPct = withPrices.length
      ? withPrices.reduce((a, s) => a + Math.abs((s.target_price - s.entry_price) / s.entry_price * 100), 0) / withPrices.length
      : 0;
    const avgSlPct = withPrices.length
      ? withPrices.reduce((a, s) => a + Math.abs((s.entry_price - s.stop_loss) / s.entry_price * 100), 0) / withPrices.length
      : 0;
    const avgRR = withPrices.length
      ? withPrices.reduce((a, s) => a + (s.risk_reward_ratio || 0), 0) / withPrices.length
      : 0;
    // Theoretical PnL: assume each LONG/SHORT hit TP 50% of time and SL 50%
    // Simple: sum of (direction === LONG ? tpPct : -tpPct) — just show avg expected TP vs SL
    return { total, longs, shorts, avgConf, avgTpPct, avgSlPct, avgRR };
  }, [signals]);

  const cardStyle = { background: 'hsl(222,47%,13%)', border: '1px solid hsl(217,33%,22%)' };

  return (
    <div className="h-full overflow-y-auto bg-[hsl(222,47%,10%)] p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-purple-400" />
            <h1 className="text-lg font-bold text-white">Signal History</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Crypto / Stock toggle */}
            <div className="flex items-center overflow-hidden rounded-xl"
              style={{ border: '1px solid hsl(217,33%,22%)', background: 'hsl(222,47%,13%)' }}>
              <button
                onClick={() => setMode('crypto')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all"
                style={{
                  background: mode === 'crypto' ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: mode === 'crypto' ? '#60a5fa' : '#64748b',
                }}
              >
                <Activity className="w-3.5 h-3.5" />
                Crypto {cryptoCount > 0 && <span className="ml-1 opacity-60">({cryptoCount})</span>}
              </button>
              <div style={{ width: 1, height: 18, background: 'hsl(217,33%,22%)' }} />
              <button
                onClick={() => setMode('stock')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all"
                style={{
                  background: mode === 'stock' ? 'rgba(16,185,129,0.2)' : 'transparent',
                  color: mode === 'stock' ? '#34d399' : '#64748b',
                }}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Stocks {stockCount > 0 && <span className="ml-1 opacity-60">({stockCount})</span>}
              </button>
            </div>
            {all.length > 0 && (
              <button
                onClick={() => { if (confirm('Clear all signals?')) clearSignals(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-red-400 transition-colors"
                style={cardStyle}
              >
                <Trash2 className="w-3 h-3" />
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* PnL / Stats bar */}
        {stats && (
          <div className="rounded-2xl p-4 mb-4" style={cardStyle}>
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase">Signal Performance</span>
            </div>
            <div className="grid grid-cols-5 gap-3 mb-3">
              {[
                { label: 'Total',       value: stats.total,             color: '#c084fc' },
                { label: 'Long',        value: stats.longs,             color: '#22c55e' },
                { label: 'Short',       value: stats.shorts,            color: '#ef4444' },
                { label: 'Avg Conf',    value: stats.avgConf + '%',     color: '#60a5fa' },
                { label: 'Avg R:R',     value: '1:' + stats.avgRR.toFixed(1), color: stats.avgRR >= 2 ? '#22c55e' : '#eab308' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <div className="text-[9px] text-slate-500 mb-1">{label}</div>
                  <div className="text-base font-bold font-mono" style={{ color }}>{value}</div>
                </div>
              ))}
            </div>
            {/* TP vs SL bar */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-emerald-400 w-16 text-right font-mono">+{stats.avgTpPct.toFixed(1)}% TP</span>
              <div className="flex-1 h-2 rounded-full overflow-hidden flex" style={{ background: 'hsl(217,33%,18%)' }}>
                {/* green left half = TP, red right half = SL */}
                <div style={{
                  width: `${Math.min(100, (stats.avgTpPct / (stats.avgTpPct + stats.avgSlPct || 1)) * 100)}%`,
                  background: 'linear-gradient(90deg, #16a34a, #22c55e)',
                  borderRadius: '3px 0 0 3px',
                  transition: 'width 0.4s',
                }} />
                <div style={{
                  flex: 1,
                  background: 'linear-gradient(90deg, #ef4444, #b91c1c)',
                  borderRadius: '0 3px 3px 0',
                }} />
              </div>
              <span className="text-[10px] text-red-400 w-16 font-mono">-{stats.avgSlPct.toFixed(1)}% SL</span>
            </div>
          </div>
        )}

        {/* Empty state */}
        {signals.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <Brain className="w-8 h-8 text-purple-500/30" />
            </div>
            <p className="text-slate-500 text-sm">No {mode} signals yet.</p>
            <p className="text-slate-600 text-xs">
              {mode === 'crypto'
                ? 'Go to the Crypto page and click Generate in the AI Signal Engine.'
                : 'Go to the Stocks page and click Generate in the AI Signal Engine.'}
            </p>
          </div>
        )}

        {/* Column headers */}
        {signals.length > 0 && (
          <div className="hidden sm:flex items-center gap-4 px-4 pb-1 text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
            <div className="w-9 flex-shrink-0" />
            <div className="flex-1" />
            <div className="flex items-center gap-4 flex-shrink-0" style={{ minWidth: 280 }}>
              <div className="w-20 text-center">Entry</div>
              <div className="w-20 text-center text-emerald-700">Target</div>
              <div className="w-20 text-center text-red-700">Stop</div>
              <div className="w-12 text-center">R:R</div>
            </div>
            <div className="w-4 flex-shrink-0" />
          </div>
        )}

        {/* Signal cards */}
        <div className="space-y-2">
          {signals.map((signal) => {
            const cfg = directionConfig[signal.direction] || directionConfig.NEUTRAL;
            const Icon = cfg.icon;
            const isOpen = expanded === signal.id;
            const entry = signal.entry_price || 0;
            const tpPct = entry ? (((signal.target_price - entry) / entry) * 100) : 0;
            const slPct = entry ? (((entry - signal.stop_loss) / entry) * 100) : 0;

            return (
              <div key={signal.id} className="rounded-xl overflow-hidden transition-all"
                style={{ border: `1px solid ${isOpen ? cfg.border : 'hsl(217,33%,22%)'}`, background: 'hsl(222,47%,12%)' }}>

                <button className="w-full text-left p-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors"
                  onClick={() => setExpanded(isOpen ? null : signal.id)}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                    <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-bold text-white">
                        {mode === 'stock' ? signal.symbol : signal.symbol?.replace('USDT', '/USDT')}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: cfg.bg, color: cfg.color }}>{signal.direction}</span>
                      <span className="text-[10px] text-slate-500">{signal.confidence}% conf.</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1 rounded-full overflow-hidden" style={{ background: 'hsl(217,33%,22%)' }}>
                        <div className="h-full rounded-full"
                          style={{
                            width: `${signal.confidence}%`,
                            background: signal.confidence >= 70 ? '#22c55e' : signal.confidence >= 45 ? '#eab308' : '#ef4444',
                          }} />
                      </div>
                      <span className="text-[9px] text-slate-600">
                        {signal.created_date && format(new Date(signal.created_date), 'MMM d, HH:mm')}
                      </span>
                    </div>
                  </div>

                  <div className="hidden sm:flex items-center gap-4 font-mono flex-shrink-0" style={{ minWidth: 280 }}>
                    <div className="w-20 text-center text-sm font-semibold text-slate-300">{fmtPrice(signal.entry_price)}</div>
                    <div className="w-20 text-center">
                      <div className="text-sm font-semibold text-emerald-400">{fmtPrice(signal.target_price)}</div>
                      <div className="text-[10px] text-emerald-600">+{Math.abs(tpPct).toFixed(1)}%</div>
                    </div>
                    <div className="w-20 text-center">
                      <div className="text-sm font-semibold text-red-400">{fmtPrice(signal.stop_loss)}</div>
                      <div className="text-[10px] text-red-600">-{Math.abs(slPct).toFixed(1)}%</div>
                    </div>
                    <div className="w-12 text-center text-sm font-bold"
                      style={{ color: (signal.risk_reward_ratio || 0) >= 2 ? '#22c55e' : '#eab308' }}>
                      1:{signal.risk_reward_ratio?.toFixed(1) || '—'}
                    </div>
                  </div>

                  <div className="text-slate-600 transition-transform flex-shrink-0"
                    style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: 'hsl(217,33%,20%)' }}>
                    {signal.indicators_summary && (
                      <div className="flex gap-2 pt-3">
                        {Object.entries(signal.indicators_summary).map(([key, val]) => (
                          <div key={key} className="flex-1 rounded-lg px-2 py-1.5"
                            style={{ background: 'hsl(222,47%,10%)', border: '1px solid hsl(217,33%,20%)' }}>
                            <div className="text-[9px] text-slate-600 capitalize mb-0.5">{key}</div>
                            <div className="text-[10px] font-semibold capitalize" style={{ color: indicatorColor[val] || '#94a3b8' }}>{val}</div>
                          </div>
                        ))}
                        {signal.key_levels && (
                          <>
                            <div className="flex-1 rounded-lg px-2 py-1.5"
                              style={{ background: 'hsl(222,47%,10%)', border: '1px solid hsl(217,33%,20%)' }}>
                              <div className="text-[9px] text-slate-600 mb-0.5">Resistance</div>
                              <div className="text-[10px] font-bold font-mono text-red-400">{fmtPrice(signal.key_levels.resistance)}</div>
                            </div>
                            <div className="flex-1 rounded-lg px-2 py-1.5"
                              style={{ background: 'hsl(222,47%,10%)', border: '1px solid hsl(217,33%,20%)' }}>
                              <div className="text-[9px] text-slate-600 mb-0.5">Support</div>
                              <div className="text-[10px] font-bold font-mono text-emerald-400">{fmtPrice(signal.key_levels.support)}</div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {signal.reasoning && (
                      <div className="rounded-xl p-3"
                        style={{ background: 'hsl(222,47%,10%)', border: '1px solid hsl(217,33%,20%)' }}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <BarChart2 className="w-3 h-3 text-purple-400" />
                          <span className="text-[9px] font-semibold text-slate-500 tracking-wider uppercase">AI Reasoning</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{signal.reasoning}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
