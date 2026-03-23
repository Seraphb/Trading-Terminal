import React, { useState, useCallback } from 'react';
import { Brain, Loader2, TrendingUp, TrendingDown, Minus, RefreshCw,
         Zap, Target, Shield, Clock, BarChart2 } from 'lucide-react';
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

export default function StockAISignal({ symbol, klines, lastCandle, theme }) {
  const [signal, setSignal] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateSignal = useCallback(async () => {
    setLoading(true);
    setSignal(null);
    try {
      const recentKlines = klines.slice(-60);
      const priceData = recentKlines.map(k => ({
        t: new Date(k.time).toISOString(),
        o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume,
      }));
      const currentPrice = lastCandle?.close || recentKlines[recentKlines.length - 1]?.close || 0;
      const high24 = Math.max(...recentKlines.map(k => k.high));
      const low24  = Math.min(...recentKlines.map(k => k.low));
      const volume24 = recentKlines.reduce((sum, k) => sum + k.volume, 0);
      const changePercent = ((currentPrice - recentKlines[0]?.open) / recentKlines[0]?.open * 100).toFixed(2);

      const prompt = `You are an expert equity analyst. Analyze ${symbol.toUpperCase()} stock data and provide a precise trading signal.

Current price: $${currentPrice.toFixed(2)}
Period change: ${changePercent}%
Period High: $${high24.toFixed(2)}
Period Low: $${low24.toFixed(2)}
Period Volume: ${(volume24 / 1000000).toFixed(2)}M shares

Recent OHLCV (last 20 candles):
${JSON.stringify(priceData.slice(-20))}

Analyze trend, momentum, key support/resistance, volatility, optimal risk/reward.

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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` },
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
        timeframe: '1d',
        status: 'active',
        asset_type: 'stock',
      });

      // Send to Telegram if configured
      const tg = getTgConfig();
      if (tg.botToken && tg.chatId) {
        const dir = result.direction === 'LONG' ? '🟢 LONG' : result.direction === 'SHORT' ? '🔴 SHORT' : '🟡 NEUTRAL';
        const entry = result.entry_price ? `$${result.entry_price.toFixed(2)}` : '—';
        const tp    = result.target_price ? `$${result.target_price.toFixed(2)}` : '—';
        const sl    = result.stop_loss    ? `$${result.stop_loss.toFixed(2)}` : '—';
        const rr    = result.risk_reward_ratio ? `1:${result.risk_reward_ratio.toFixed(1)}` : '—';
        const msg = `📈 <b>AI SIGNAL — ${symbol.toUpperCase()} (Stock)</b>\n${dir}  •  Confidence: <b>${result.confidence}%</b>\n\n💰 Entry: <code>${entry}</code>\n🎯 Target: <code>${tp}</code>\n🛑 Stop: <code>${sl}</code>\n⚖️ R:R: <b>${rr}</b>\n\n📝 ${result.reasoning || ''}`;
        sendTelegram(tg.botToken, tg.chatId, msg);
      }

      setSignal(result);
    } catch (err) {
      console.error('AI Signal error:', err);
      setSignal({ error: err.message });
    } finally {
      setLoading(false);
    }
  }, [symbol, klines, lastCandle]);

  const dark = theme !== 'light';
  const bg = dark ? 'hsl(222,47%,12%)' : '#ffffff';
  const borderColor = dark ? 'hsl(217,33%,20%)' : 'hsl(240,20%,88%)';
  const textColor   = dark ? '#e2e8f0' : 'hsl(240,15%,15%)';
  const mutedColor  = dark ? 'hsl(215,20%,55%)' : 'hsl(240,8%,45%)';
  const cardBg      = dark ? 'hsl(222,47%,13%)' : 'hsl(240,30%,95%)';

  const dirCfg = {
    LONG:    { icon: TrendingUp,   color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)'  },
    SHORT:   { icon: TrendingDown, color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)'  },
    NEUTRAL: { icon: Minus,        color: '#eab308', bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.3)'  },
  };
  const indicatorColor = {
    bullish: '#22c55e', bearish: '#ef4444', neutral: '#94a3b8',
    strong: '#22c55e', moderate: '#eab308', weak: '#ef4444',
    high: '#f97316', medium: '#eab308', low: '#60a5fa',
  };

  const fmtPrice = (n) => {
    if (!n) return '—';
    if (n >= 100)  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (n >= 1)    return '$' + n.toFixed(4);
    return '$' + n.toFixed(6);
  };

  return (
    <div className="terminal-panel flex flex-col h-full" style={{ background: bg }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0" style={{ borderBottom: `1px solid ${borderColor}` }}>
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-purple-400" />
          <h3 className="text-xs font-semibold tracking-wider" style={{ color: textColor }}>AI SIGNAL ENGINE</h3>
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
            <p className="text-[11px] text-center leading-relaxed" style={{ color: mutedColor }}>
              Click <span className="text-purple-400 font-semibold">Generate</span> to run<br />
              DeepSeek AI analysis on<br />
              <span className="font-mono font-semibold" style={{ color: textColor }}>{symbol.toUpperCase()}</span>
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
            <p className="text-[11px]" style={{ color: mutedColor }}>Analyzing market data…</p>
            <div className="flex gap-1.5">
              {['Trend', 'Momentum', 'Levels', 'Risk'].map((s, i) => (
                <span key={s} className="text-[9px] px-2 py-0.5 rounded-full animate-pulse"
                  style={{ background: cardBg, color: mutedColor, animationDelay: `${i * 0.18}s` }}>
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
          const tpPct = entry ? (((signal.target_price - entry) / entry) * 100) : 0;
          const slPct = entry ? (((entry - signal.stop_loss) / entry) * 100) : 0;

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
                      {signal.direction}
                    </span>
                    <span className="text-[10px]" style={{ color: mutedColor }}>{symbol.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: `${signal.confidence}%`,
                          background: signal.confidence >= 70 ? '#22c55e' : signal.confidence >= 45 ? '#eab308' : '#ef4444',
                        }} />
                    </div>
                    <span className="text-[10px] font-bold tabular-nums flex-shrink-0" style={{ color: textColor }}>
                      {signal.confidence}%
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <Clock className="w-3 h-3 mb-0.5" style={{ color: mutedColor }} />
                  <span className="text-[9px]" style={{ color: mutedColor }}>
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Entry / Target / Stop */}
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${borderColor}` }}>
                <div className="flex items-center gap-2.5 px-3 py-2 border-b"
                  style={{ borderColor, background: cardBg }}>
                  <Zap className="w-3.5 h-3.5 flex-shrink-0" style={{ color: mutedColor }} />
                  <span className="text-[10px] w-12 flex-shrink-0" style={{ color: mutedColor }}>Entry</span>
                  <span className="font-mono text-xs font-bold ml-auto" style={{ color: textColor }}>{fmtPrice(signal.entry_price)}</span>
                </div>
                <div className="flex items-center gap-2.5 px-3 py-2 border-b"
                  style={{ borderColor, background: 'rgba(34,197,94,0.05)' }}>
                  <Target className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  <span className="text-[10px] w-12 flex-shrink-0" style={{ color: mutedColor }}>Target</span>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-emerald-400">+{Math.abs(tpPct).toFixed(2)}%</span>
                    <span className="font-mono text-xs font-bold text-emerald-400">{fmtPrice(signal.target_price)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 px-3 py-2" style={{ background: 'rgba(239,68,68,0.05)' }}>
                  <Shield className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  <span className="text-[10px] w-12 flex-shrink-0" style={{ color: mutedColor }}>Stop</span>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-red-400">-{Math.abs(slPct).toFixed(2)}%</span>
                    <span className="font-mono text-xs font-bold text-red-400">{fmtPrice(signal.stop_loss)}</span>
                  </div>
                </div>
              </div>

              {/* R:R + key levels */}
              <div className="grid grid-cols-3 gap-1.5">
                <div className="rounded-lg px-2.5 py-2 text-center" style={{ background: cardBg, border: `1px solid ${borderColor}` }}>
                  <div className="text-[9px] mb-0.5" style={{ color: mutedColor }}>R:R Ratio</div>
                  <div className="text-xs font-bold font-mono"
                    style={{ color: signal.risk_reward_ratio >= 2 ? '#22c55e' : '#eab308' }}>
                    1:{signal.risk_reward_ratio?.toFixed(1) || '—'}
                  </div>
                </div>
                <div className="rounded-lg px-2.5 py-2 text-center" style={{ background: cardBg, border: `1px solid ${borderColor}` }}>
                  <div className="text-[9px] mb-0.5" style={{ color: mutedColor }}>Resistance</div>
                  <div className="text-[11px] font-bold font-mono text-red-400">{fmtPrice(signal.key_levels?.resistance)}</div>
                </div>
                <div className="rounded-lg px-2.5 py-2 text-center" style={{ background: cardBg, border: `1px solid ${borderColor}` }}>
                  <div className="text-[9px] mb-0.5" style={{ color: mutedColor }}>Support</div>
                  <div className="text-[11px] font-bold font-mono text-emerald-400">{fmtPrice(signal.key_levels?.support)}</div>
                </div>
              </div>

              {/* Indicators */}
              {signal.indicators_summary && (
                <div className="grid grid-cols-3 gap-1.5">
                  {Object.entries(signal.indicators_summary).map(([key, val]) => (
                    <div key={key} className="rounded-lg px-2 py-1.5" style={{ background: cardBg, border: `1px solid ${borderColor}` }}>
                      <div className="text-[9px] capitalize mb-0.5" style={{ color: mutedColor }}>{key}</div>
                      <div className="text-[10px] font-semibold capitalize" style={{ color: indicatorColor[val] || '#94a3b8' }}>{val}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Reasoning */}
              {signal.reasoning && (
                <div className="rounded-xl p-2.5" style={{ background: cardBg, border: `1px solid ${borderColor}` }}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <BarChart2 className="w-3 h-3 text-purple-400" />
                    <span className="text-[9px] font-semibold tracking-wider uppercase" style={{ color: mutedColor }}>AI Reasoning</span>
                  </div>
                  <p className="text-[11px] leading-relaxed" style={{ color: textColor }}>{signal.reasoning}</p>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
