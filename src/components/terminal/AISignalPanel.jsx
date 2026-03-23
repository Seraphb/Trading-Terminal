import React, { useState, useCallback } from 'react';
import { Brain, Loader2, TrendingUp, TrendingDown, Minus, RefreshCw,
         Zap, Target, Shield, ChevronRight, Clock, BarChart2 } from 'lucide-react';
import { saveSignal } from '@/lib/signalStore';

const DEEPSEEK_API_KEY = 'sk-54b1762e290440d59d8ed192c1336cc3';

export default function AISignalPanel({ symbol, klines, ticker }) {
  const [signal, setSignal] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateSignal = useCallback(async () => {
    setLoading(true);
    setSignal(null);
    try {
      const recentKlines = klines.slice(-50);
      const priceData = recentKlines.map(k => ({
        t: new Date(k.time).toISOString(),
        o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume,
      }));
      const currentPrice = ticker?.price || recentKlines[recentKlines.length - 1]?.close || 0;

      const prompt = `You are an expert quantitative crypto analyst. Analyze this ${symbol.toUpperCase()} market data and provide a precise trading signal.

Current price: $${currentPrice}
24h Change: ${ticker?.changePercent?.toFixed(2)}%
24h Volume: $${(ticker?.quoteVolume / 1_000_000)?.toFixed(2)}M
24h High: $${ticker?.high}
24h Low: $${ticker?.low}

Recent OHLCV data (last 20 candles):
${JSON.stringify(priceData.slice(-20))}

Analyze: trend direction, momentum, key support/resistance, volatility, optimal risk/reward.

Respond ONLY with valid JSON:
{
  "direction": "LONG" | "SHORT" | "NEUTRAL",
  "confidence": <0-100>,
  "entry_price": <number>,
  "target_price": <number>,
  "stop_loss": <number>,
  "risk_reward_ratio": <number>,
  "reasoning": "<2-3 sentence analysis>",
  "key_levels": { "resistance": <number>, "support": <number> },
  "indicators_summary": {
    "trend": "bullish" | "bearish" | "neutral",
    "momentum": "strong" | "moderate" | "weak",
    "volatility": "high" | "medium" | "low"
  }
}`;

      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 512,
        }),
      });

      if (!res.ok) throw new Error(`DeepSeek error: ${res.status}`);
      const data = await res.json();
      const result = JSON.parse(data.choices[0].message.content);

      // Save to localStorage so Signals page can show it
      saveSignal({
        symbol: symbol.toUpperCase(),
        direction: result.direction,
        confidence: result.confidence,
        entry_price: result.entry_price,
        target_price: result.target_price,
        stop_loss: result.stop_loss,
        risk_reward_ratio: result.risk_reward_ratio,
        reasoning: result.reasoning,
        key_levels: result.key_levels,
        indicators_summary: result.indicators_summary,
        timeframe: '15m',
        status: 'active',
      });

      setSignal(result);
    } catch (err) {
      console.error('AI Signal error:', err);
      setSignal({ error: err.message });
    } finally {
      setLoading(false);
    }
  }, [symbol, klines, ticker]);

  /* ── helpers ── */
  const fmtPrice = (n) => {
    if (!n) return '—';
    if (n >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (n >= 1) return '$' + n.toFixed(4);
    return '$' + n.toFixed(6);
  };

  const dirCfg = {
    LONG:    { icon: TrendingUp,   color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)',  label: 'LONG'    },
    SHORT:   { icon: TrendingDown, color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  label: 'SHORT'   },
    NEUTRAL: { icon: Minus,        color: '#eab308', bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.3)',  label: 'NEUTRAL' },
  };

  const indicatorColor = {
    bullish: '#22c55e', bearish: '#ef4444', neutral: '#94a3b8',
    strong:  '#22c55e', moderate: '#eab308', weak: '#ef4444',
    high:    '#f97316', medium:   '#eab308', low:  '#60a5fa',
  };

  return (
    <div className="terminal-panel flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(217,33%,20%)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-purple-400" />
          <h3 className="text-xs font-semibold text-slate-300 tracking-wider">AI SIGNAL ENGINE</h3>
        </div>
        <button
          onClick={generateSignal}
          disabled={loading || !klines.length}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all disabled:opacity-40"
          style={{
            background: loading ? 'rgba(168,85,247,0.1)' : 'rgba(168,85,247,0.2)',
            border: '1px solid rgba(168,85,247,0.35)',
            color: '#c084fc',
          }}
        >
          {loading
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <RefreshCw className="w-3 h-3" />}
          {loading ? 'Analyzing…' : 'Generate'}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">

        {/* Error */}
        {signal?.error && (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-3">
            <Brain className="w-6 h-6 text-red-500/40" />
            <p className="text-[10px] text-red-400 text-center">{signal.error}</p>
            <button onClick={generateSignal} className="text-[10px] text-purple-400 hover:text-purple-300 underline">Retry</button>
          </div>
        )}

        {/* Empty */}
        {!signal && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-3">
            <div className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <Brain className="w-7 h-7 text-purple-500/40" />
            </div>
            <p className="text-[11px] text-slate-500 text-center leading-relaxed">
              Click <span className="text-purple-400 font-semibold">Generate</span> to run<br />
              DeepSeek AI analysis on<br />
              <span className="text-slate-300 font-mono">{symbol.toUpperCase().replace('USDT', '/USDT')}</span>
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-3">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full animate-ping"
                style={{ background: 'rgba(168,85,247,0.15)' }} />
              <div className="relative w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)' }}>
                <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">Analyzing market data…</p>
            <div className="flex gap-1.5">
              {['Trend', 'Momentum', 'Levels', 'Risk'].map((s, i) => (
                <span key={s} className="text-[9px] px-2 py-0.5 rounded-full animate-pulse"
                  style={{ background: 'hsl(217,33%,20%)', color: '#64748b', animationDelay: `${i * 0.18}s` }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Signal result */}
        {signal && !signal.error && !loading && (() => {
          const cfg = dirCfg[signal.direction] || dirCfg.NEUTRAL;
          const Icon = cfg.icon;

          // Calculate TP / SL percentages from entry
          const entry = signal.entry_price || 0;
          const tpPct = entry ? (((signal.target_price - entry) / entry) * 100) : 0;
          const slPct = entry ? (((signal.entry_price - signal.stop_loss) / entry) * 100) : 0;

          return (
            <div className="p-2.5 space-y-2">

              {/* Direction + Confidence */}
              <div className="rounded-xl p-3 flex items-center gap-3"
                style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${cfg.color}22`, border: `1px solid ${cfg.color}44` }}>
                  <Icon className="w-5 h-5" style={{ color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold tracking-wide" style={{ color: cfg.color }}>
                      {cfg.label}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {symbol.toUpperCase().replace('USDT', '/USDT')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {/* Confidence bar */}
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: `${signal.confidence}%`,
                          background: signal.confidence >= 70 ? '#22c55e' : signal.confidence >= 45 ? '#eab308' : '#ef4444',
                        }} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-300 tabular-nums flex-shrink-0">
                      {signal.confidence}%
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <Clock className="w-3 h-3 text-slate-600 mb-0.5" />
                  <span className="text-[9px] text-slate-600">
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Entry / Target / Stop — vertical layout */}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid hsl(217,33%,22%)' }}>
                {/* Entry */}
                <div className="flex items-center gap-2.5 px-3 py-2 border-b"
                  style={{ borderColor: 'hsl(217,33%,20%)', background: 'hsl(222,47%,12%)' }}>
                  <Zap className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-[10px] text-slate-500 w-12 flex-shrink-0">Entry</span>
                  <span className="font-mono text-xs font-bold text-white ml-auto">{fmtPrice(signal.entry_price)}</span>
                </div>
                {/* Target */}
                <div className="flex items-center gap-2.5 px-3 py-2 border-b"
                  style={{ borderColor: 'hsl(217,33%,20%)', background: 'rgba(34,197,94,0.05)' }}>
                  <Target className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  <span className="text-[10px] text-slate-500 w-12 flex-shrink-0">Target</span>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[10px] font-semibold"
                      style={{ color: '#22c55e' }}>
                      +{Math.abs(tpPct).toFixed(2)}%
                    </span>
                    <span className="font-mono text-xs font-bold text-emerald-400">{fmtPrice(signal.target_price)}</span>
                  </div>
                </div>
                {/* Stop Loss */}
                <div className="flex items-center gap-2.5 px-3 py-2"
                  style={{ background: 'rgba(239,68,68,0.05)' }}>
                  <Shield className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  <span className="text-[10px] text-slate-500 w-12 flex-shrink-0">Stop</span>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-red-400">
                      -{Math.abs(slPct).toFixed(2)}%
                    </span>
                    <span className="font-mono text-xs font-bold text-red-400">{fmtPrice(signal.stop_loss)}</span>
                  </div>
                </div>
              </div>

              {/* R:R ratio + key levels */}
              <div className="grid grid-cols-3 gap-1.5">
                <div className="rounded-lg px-2.5 py-2 text-center"
                  style={{ background: 'hsl(222,47%,12%)', border: '1px solid hsl(217,33%,22%)' }}>
                  <div className="text-[9px] text-slate-500 mb-0.5">R:R Ratio</div>
                  <div className="text-xs font-bold font-mono"
                    style={{ color: signal.risk_reward_ratio >= 2 ? '#22c55e' : '#eab308' }}>
                    1:{signal.risk_reward_ratio?.toFixed(1) || '—'}
                  </div>
                </div>
                <div className="rounded-lg px-2.5 py-2 text-center"
                  style={{ background: 'hsl(222,47%,12%)', border: '1px solid hsl(217,33%,22%)' }}>
                  <div className="text-[9px] text-slate-500 mb-0.5">Resistance</div>
                  <div className="text-[11px] font-bold font-mono text-red-400">
                    {fmtPrice(signal.key_levels?.resistance)}
                  </div>
                </div>
                <div className="rounded-lg px-2.5 py-2 text-center"
                  style={{ background: 'hsl(222,47%,12%)', border: '1px solid hsl(217,33%,22%)' }}>
                  <div className="text-[9px] text-slate-500 mb-0.5">Support</div>
                  <div className="text-[11px] font-bold font-mono text-emerald-400">
                    {fmtPrice(signal.key_levels?.support)}
                  </div>
                </div>
              </div>

              {/* Indicators */}
              {signal.indicators_summary && (
                <div className="grid grid-cols-3 gap-1.5">
                  {Object.entries(signal.indicators_summary).map(([key, val]) => (
                    <div key={key} className="rounded-lg px-2 py-1.5"
                      style={{ background: 'hsl(222,47%,12%)', border: '1px solid hsl(217,33%,22%)' }}>
                      <div className="text-[9px] text-slate-600 capitalize mb-0.5">{key}</div>
                      <div className="text-[10px] font-semibold capitalize"
                        style={{ color: indicatorColor[val] || '#94a3b8' }}>
                        {val}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Reasoning */}
              {signal.reasoning && (
                <div className="rounded-xl p-2.5"
                  style={{ background: 'hsl(222,47%,12%)', border: '1px solid hsl(217,33%,22%)' }}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <BarChart2 className="w-3 h-3 text-purple-400" />
                    <span className="text-[9px] font-semibold text-slate-500 tracking-wider uppercase">AI Reasoning</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{signal.reasoning}</p>
                </div>
              )}

            </div>
          );
        })()}
      </div>
    </div>
  );
}
