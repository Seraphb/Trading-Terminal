import React, { useState, useCallback } from 'react';
import { Brain, Loader2, TrendingUp, TrendingDown, Minus, RefreshCw,
         Zap, Target, Shield, ChevronRight, Clock, BarChart2 } from 'lucide-react';
import { saveSignal } from '@/lib/signalStore';

const DEEPSEEK_API_KEY = 'sk-54b1762e290440d59d8ed192c1336cc3';

function getTgConfig() {
  try { return JSON.parse(localStorage.getItem('scanner_telegram_config') || '{}'); } catch { return {}; }
}
async function sendTelegram(token, chatId, text) {
  if (!token || !chatId) return;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    if (!r.ok) console.warn('Telegram send failed:', await r.text());
  } catch (e) { console.warn('Telegram error:', e); }
}

// ── Quant helpers ─────────────────────────────────────────────────────────────
function computeATR(klines, period = 14) {
  if (klines.length < period + 1) return 0;
  const trs = [];
  for (let i = 1; i < klines.length; i++) {
    const h = klines[i].high, l = klines[i].low, pc = klines[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function computeSwings(klines, lookback = 20) {
  const slice = klines.slice(-lookback);
  return {
    swingHigh: Math.max(...slice.map(k => k.high)),
    swingLow:  Math.min(...slice.map(k => k.low)),
  };
}

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

      // Pre-compute quant metrics for DeepSeek context
      const atr14 = computeATR(recentKlines, 14);
      const { swingHigh, swingLow } = computeSwings(recentKlines, 20);
      const swingRange = swingHigh - swingLow;
      const fib1272 = swingLow + swingRange * 1.272;
      const fib1618 = swingLow + swingRange * 1.618;
      const fib2618 = swingLow + swingRange * 2.618;

      const prompt = `You are an expert quantitative crypto analyst. Analyze ${symbol.toUpperCase()} and generate a precise trading signal with three take-profit levels using advanced quant techniques.

Current price: $${currentPrice}
24h Change: ${ticker?.changePercent?.toFixed(2)}%
24h Volume: $${(ticker?.quoteVolume / 1_000_000)?.toFixed(2)}M
24h High: $${ticker?.high}
24h Low: $${ticker?.low}

Pre-computed quant metrics (use these in your analysis):
- ATR(14): ${atr14.toFixed(6)} (average true range — volatility baseline)
- 20-bar Swing High: $${swingHigh.toFixed(6)}
- 20-bar Swing Low: $${swingLow.toFixed(6)}
- Fib 1.272 extension: $${fib1272.toFixed(6)}
- Fib 1.618 extension: $${fib1618.toFixed(6)}
- Fib 2.618 extension: $${fib2618.toFixed(6)}

Recent OHLCV data (last 20 candles):
${JSON.stringify(priceData.slice(-20))}

TP methodology to apply:
- TP1: First resistance / 1×ATR from entry / nearest supply zone (conservative, quick profit)
- TP2: Fibonacci 1.618 extension or measured move completion (swing target)
- TP3: Fibonacci 2.618 / major structural level / full measured move (maximum target)
- Stop loss: Below last swing low (LONG) or above last swing high (SHORT), minimum 0.5×ATR distance

Respond ONLY with valid JSON (no markdown):
{
  "direction": "LONG" | "SHORT" | "NEUTRAL",
  "confidence": <0-100>,
  "entry_price": <number>,
  "tp1": <number>,
  "tp2": <number>,
  "tp3": <number>,
  "stop_loss": <number>,
  "risk_reward_ratio": <number based on tp2 as primary target>,
  "tp1_method": "<brief quant rationale e.g. '1×ATR + first resistance'>",
  "tp2_method": "<brief quant rationale e.g. 'Fib 1.618 extension'>",
  "tp3_method": "<brief quant rationale e.g. 'Fib 2.618 / measured move'>",
  "reasoning": "<2-3 sentence market analysis>",
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
          max_tokens: 700,
        }),
      });

      if (!res.ok) throw new Error(`DeepSeek error: ${res.status}`);
      const data = await res.json();
      const result = JSON.parse(data.choices[0].message.content);

      saveSignal({
        symbol: symbol.toUpperCase(),
        direction: result.direction,
        confidence: result.confidence,
        entry_price: result.entry_price,
        tp1: result.tp1,
        tp2: result.tp2,
        tp3: result.tp3,
        target_price: result.tp2, // keep legacy field pointing to primary target
        stop_loss: result.stop_loss,
        risk_reward_ratio: result.risk_reward_ratio,
        reasoning: result.reasoning,
        key_levels: result.key_levels,
        indicators_summary: result.indicators_summary,
        timeframe: '15m',
        status: 'active',
      });

      setSignal(result);

      const tg = getTgConfig();
      if (tg.botToken && tg.chatId) {
        const dir = result.direction === 'LONG' ? '🟢 LONG' : result.direction === 'SHORT' ? '🔴 SHORT' : '🟡 NEUTRAL';
        const sym = symbol.toUpperCase().replace('USDT', '/USDT');
        const fmt = (n) => n ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : '—';
        const rr  = result.risk_reward_ratio ? `1:${result.risk_reward_ratio.toFixed(1)}` : '—';
        const msg = `🤖 <b>AI SIGNAL — ${sym}</b>\n${dir}  •  Confidence: <b>${result.confidence}%</b>\n\n💰 Entry: <code>${fmt(result.entry_price)}</code>\n🎯 TP1: <code>${fmt(result.tp1)}</code>  <i>${result.tp1_method || ''}</i>\n🎯 TP2: <code>${fmt(result.tp2)}</code>  <i>${result.tp2_method || ''}</i>\n🎯 TP3: <code>${fmt(result.tp3)}</code>  <i>${result.tp3_method || ''}</i>\n🛑 Stop: <code>${fmt(result.stop_loss)}</code>\n⚖️ R:R: <b>${rr}</b>\n\n📝 ${result.reasoning || ''}`;
        sendTelegram(tg.botToken, tg.chatId, msg);
      }
    } catch (err) {
      console.error('AI Signal error:', err);
      setSignal({ error: err.message });
    } finally {
      setLoading(false);
    }
  }, [symbol, klines, ticker]);

  const fmtPrice = (n) => {
    if (!n) return '—';
    if (n >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (n >= 1) return '$' + n.toFixed(4);
    return '$' + n.toFixed(6);
  };

  const pctFromEntry = (entry, target) =>
    entry && target ? ((target - entry) / entry * 100).toFixed(2) : '0.00';

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
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {loading ? 'Analyzing…' : 'Generate'}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">

        {signal?.error && (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-3">
            <Brain className="w-6 h-6 text-red-500/40" />
            <p className="text-[10px] text-red-400 text-center">{signal.error}</p>
            <button onClick={generateSignal} className="text-[10px] text-purple-400 hover:text-purple-300 underline">Retry</button>
          </div>
        )}

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

        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-3">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(168,85,247,0.15)' }} />
              <div className="relative w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)' }}>
                <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">Analyzing market data…</p>
            <div className="flex gap-1.5">
              {['ATR', 'Fib', 'Levels', 'Risk'].map((s, i) => (
                <span key={s} className="text-[9px] px-2 py-0.5 rounded-full animate-pulse"
                  style={{ background: 'hsl(217,33%,20%)', color: '#64748b', animationDelay: `${i * 0.18}s` }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {signal && !signal.error && !loading && (() => {
          const cfg = dirCfg[signal.direction] || dirCfg.NEUTRAL;
          const Icon = cfg.icon;
          const entry = signal.entry_price || 0;
          const slPct = entry ? Math.abs(((entry - signal.stop_loss) / entry) * 100) : 0;
          const isLong = signal.direction === 'LONG';

          const tpRows = [
            { label: 'TP1', price: signal.tp1, method: signal.tp1_method, color: '#34d399', bg: 'rgba(52,211,153,0.05)' },
            { label: 'TP2', price: signal.tp2, method: signal.tp2_method, color: '#22c55e', bg: 'rgba(34,197,94,0.07)' },
            { label: 'TP3', price: signal.tp3, method: signal.tp3_method, color: '#16a34a', bg: 'rgba(22,163,74,0.09)' },
          ];

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
                    <span className="text-sm font-extrabold tracking-wide" style={{ color: cfg.color }}>{cfg.label}</span>
                    <span className="text-[10px] text-slate-500">{symbol.toUpperCase().replace('USDT', '/USDT')}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: `${signal.confidence}%`,
                          background: signal.confidence >= 70 ? '#22c55e' : signal.confidence >= 45 ? '#eab308' : '#ef4444',
                        }} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-300 tabular-nums flex-shrink-0">{signal.confidence}%</span>
                  </div>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <Clock className="w-3 h-3 text-slate-600 mb-0.5" />
                  <span className="text-[9px] text-slate-600">
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Entry + TP1/TP2/TP3 + Stop */}
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid hsl(217,33%,22%)' }}>
                {/* Entry */}
                <div className="flex items-center gap-2.5 px-3 py-2 border-b"
                  style={{ borderColor: 'hsl(217,33%,20%)', background: 'hsl(222,47%,12%)' }}>
                  <Zap className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-[10px] text-slate-500 w-10 flex-shrink-0">Entry</span>
                  <span className="font-mono text-xs font-bold text-white ml-auto">{fmtPrice(entry)}</span>
                </div>

                {/* TP1 / TP2 / TP3 */}
                {tpRows.map((tp, i) => {
                  const pct = pctFromEntry(entry, tp.price);
                  const signed = isLong ? `+${Math.abs(pct)}%` : `-${Math.abs(pct)}%`;
                  return (
                    <div key={tp.label} className="flex items-center gap-2 px-3 py-1.5 border-b"
                      style={{ borderColor: 'hsl(217,33%,20%)', background: tp.bg }}>
                      <Target className="w-3 h-3 flex-shrink-0" style={{ color: tp.color }} />
                      <span className="text-[10px] font-bold flex-shrink-0" style={{ color: tp.color, width: 26 }}>{tp.label}</span>
                      {tp.method && (
                        <span className="text-[8px] text-slate-600 flex-1 truncate" title={tp.method}>{tp.method}</span>
                      )}
                      <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                        <span className="text-[9px] font-semibold" style={{ color: tp.color }}>{signed}</span>
                        <span className="font-mono text-[11px] font-bold" style={{ color: tp.color }}>{fmtPrice(tp.price)}</span>
                      </div>
                    </div>
                  );
                })}

                {/* Stop Loss */}
                <div className="flex items-center gap-2.5 px-3 py-2"
                  style={{ background: 'rgba(239,68,68,0.05)' }}>
                  <Shield className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  <span className="text-[10px] text-slate-500 w-10 flex-shrink-0">Stop</span>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-red-400">-{slPct.toFixed(2)}%</span>
                    <span className="font-mono text-xs font-bold text-red-400">{fmtPrice(signal.stop_loss)}</span>
                  </div>
                </div>
              </div>

              {/* R:R + key levels */}
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
                  <div className="text-[11px] font-bold font-mono text-red-400">{fmtPrice(signal.key_levels?.resistance)}</div>
                </div>
                <div className="rounded-lg px-2.5 py-2 text-center"
                  style={{ background: 'hsl(222,47%,12%)', border: '1px solid hsl(217,33%,22%)' }}>
                  <div className="text-[9px] text-slate-500 mb-0.5">Support</div>
                  <div className="text-[11px] font-bold font-mono text-emerald-400">{fmtPrice(signal.key_levels?.support)}</div>
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
                        style={{ color: indicatorColor[val] || '#94a3b8' }}>{val}</div>
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
