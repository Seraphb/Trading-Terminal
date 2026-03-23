import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Brain, TrendingUp, TrendingDown, Minus, ArrowLeft, Trash2, Target, Shield, Zap, BarChart2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
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
  if (n >= 1) return '$' + n.toFixed(4);
  return '$' + n.toFixed(6);
}

export default function Signals() {
  const [signals, setSignals] = useState([]);
  const [expanded, setExpanded] = useState(null);

  const refresh = () => setSignals(loadSignals());

  useEffect(() => {
    refresh();
    window.addEventListener('signals-updated', refresh);
    return () => window.removeEventListener('signals-updated', refresh);
  }, []);

  const totalSignals = signals.length;
  const longs  = signals.filter(s => s.direction === 'LONG').length;
  const shorts = signals.filter(s => s.direction === 'SHORT').length;
  const avgConf = totalSignals
    ? Math.round(signals.reduce((a, s) => a + (s.confidence || 0), 0) / totalSignals)
    : 0;

  return (
    <div className="h-full overflow-y-auto bg-[hsl(222,47%,10%)] p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Link to={createPageUrl('Terminal')} className="text-slate-500 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <Brain className="w-5 h-5 text-purple-400" />
            <h1 className="text-lg font-bold text-white">Signal History</h1>
          </div>
          {totalSignals > 0 && (
            <button
              onClick={() => { if (confirm('Clear all signals?')) clearSignals(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-red-400 transition-colors"
              style={{ background: 'hsl(222,47%,13%)', border: '1px solid hsl(217,33%,22%)' }}
            >
              <Trash2 className="w-3 h-3" />
              Clear all
            </button>
          )}
        </div>

        {/* Stats bar */}
        {totalSignals > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Total Signals', value: totalSignals, color: '#c084fc' },
              { label: 'Long',          value: longs,        color: '#22c55e' },
              { label: 'Short',         value: shorts,       color: '#ef4444' },
              { label: 'Avg Confidence',value: avgConf + '%',color: '#60a5fa' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl p-3 text-center"
                style={{ background: 'hsl(222,47%,13%)', border: '1px solid hsl(217,33%,22%)' }}>
                <div className="text-[10px] text-slate-500 mb-1">{label}</div>
                <div className="text-xl font-bold font-mono" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {totalSignals === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <Brain className="w-8 h-8 text-purple-500/30" />
            </div>
            <p className="text-slate-500 text-sm">No signals yet.</p>
            <p className="text-slate-600 text-xs">Go to the Crypto page and click <span className="text-purple-400">Generate</span> in the AI Signal Engine.</p>
            <Link to={createPageUrl('Terminal')}
              className="mt-2 px-4 py-2 rounded-lg text-xs font-semibold text-purple-300 transition-all"
              style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)' }}>
              Go to Crypto Terminal →
            </Link>
          </div>
        )}

        {/* Signal cards */}
        <div className="space-y-3">
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

                {/* Main row */}
                <button
                  className="w-full text-left p-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors"
                  onClick={() => setExpanded(isOpen ? null : signal.id)}
                >
                  {/* Direction icon */}
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                    <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                  </div>

                  {/* Symbol + direction */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-bold text-white">{signal.symbol?.replace('USDT', '/USDT')}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: cfg.bg, color: cfg.color }}>
                        {signal.direction}
                      </span>
                      <span className="text-[10px] text-slate-500">{signal.confidence}% conf.</span>
                    </div>
                    {/* Confidence bar */}
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

                  {/* TP / SL quick view */}
                  <div className="hidden sm:flex items-center gap-4 text-xs font-mono flex-shrink-0">
                    <div className="text-center">
                      <div className="text-[9px] text-slate-600 mb-0.5">Entry</div>
                      <div className="text-slate-300">{fmtPrice(signal.entry_price)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[9px] text-emerald-600 mb-0.5">Target</div>
                      <div className="text-emerald-400">{fmtPrice(signal.target_price)}</div>
                      <div className="text-[9px] text-emerald-600">+{Math.abs(tpPct).toFixed(1)}%</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[9px] text-red-600 mb-0.5">Stop</div>
                      <div className="text-red-400">{fmtPrice(signal.stop_loss)}</div>
                      <div className="text-[9px] text-red-600">-{Math.abs(slPct).toFixed(1)}%</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[9px] text-slate-600 mb-0.5">R:R</div>
                      <div className="font-bold" style={{ color: (signal.risk_reward_ratio || 0) >= 2 ? '#22c55e' : '#eab308' }}>
                        1:{signal.risk_reward_ratio?.toFixed(1) || '—'}
                      </div>
                    </div>
                  </div>

                  {/* Expand chevron */}
                  <div className="text-slate-600 transition-transform flex-shrink-0"
                    style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                    ›
                  </div>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: 'hsl(217,33%,20%)' }}>

                    {/* Indicators */}
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

                    {/* Reasoning */}
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
