import React, { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Brain, Loader2, TrendingUp, TrendingDown, Minus, RefreshCw, Zap, Target, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function StockAISignal({ symbol, klines, lastCandle, theme }) {
  const [signal, setSignal] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateSignal = useCallback(async () => {
    setLoading(true);
    
    const recentKlines = klines.slice(-60);
    const priceData = recentKlines.map(k => ({
      t: new Date(k.time).toISOString(),
      o: k.open,
      h: k.high,
      l: k.low,
      c: k.close,
      v: k.volume
    }));
    
    const currentPrice = lastCandle?.close || recentKlines[recentKlines.length - 1]?.close || 0;
    const high24 = Math.max(...recentKlines.map(k => k.high));
    const low24 = Math.min(...recentKlines.map(k => k.low));
    const volume24 = recentKlines.reduce((sum, k) => sum + k.volume, 0);
    const changePercent = ((currentPrice - recentKlines[0]?.open) / recentKlines[0]?.open * 100).toFixed(2);
    
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an expert equity analyst specializing in quantitative trading. Analyze this ${symbol.toUpperCase()} stock data and provide a professional trading signal for institutions.

Current price: $${currentPrice.toFixed(2)}
Period change: ${changePercent}%
Period High: $${high24.toFixed(2)}
Period Low: $${low24.toFixed(2)}
Period Volume: ${(volume24 / 1000000).toFixed(2)}M shares

Recent OHLCV data (last 20 candles):
${JSON.stringify(priceData.slice(-20), null, 2)}

Analyze:
1. Trend direction and momentum (moving averages, price action)
2. Technical confluence levels (support/resistance clusters)
3. Volume profile and strength analysis
4. Volatility assessment and risk metrics
5. Institutional-grade risk/reward setup
6. Key price levels for entries/exits

Provide actionable, precise price levels suitable for algorithmic execution.`,
      response_json_schema: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["LONG", "SHORT", "NEUTRAL"] },
          confidence: { type: "number", description: "0-100 confidence score" },
          entry_price: { type: "number" },
          target_price: { type: "number" },
          stop_loss: { type: "number" },
          risk_reward_ratio: { type: "number" },
          position_size_pct: { type: "number", description: "% of portfolio" },
          reasoning: { type: "string", description: "detailed reasoning" },
          key_levels: {
            type: "object",
            properties: {
              resistance: { type: "number" },
              support: { type: "number" },
              pivot: { type: "number" }
            }
          },
          indicators_summary: {
            type: "object",
            properties: {
              trend: { type: "string", enum: ["bullish", "bearish", "neutral"] },
              momentum: { type: "string", enum: ["strong", "moderate", "weak"] },
              volatility: { type: "string", enum: ["high", "medium", "low"] }
            }
          }
        }
      }
    });
    
    setSignal(result);
    setLoading(false);
  }, [symbol, klines, lastCandle]);

  const directionConfig = {
    LONG: { icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'LONG' },
    SHORT: { icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/20', label: 'SHORT' },
    NEUTRAL: { icon: Minus, color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'NEUTRAL' },
  };

  const bg = theme === 'light' ? '#ffffff' : 'hsl(222,47%,12%)';
  const borderColor = theme === 'light' ? 'hsl(240,20%,88%)' : 'hsl(217,33%,20%)';
  const textColor = theme === 'light' ? 'hsl(240,15%,15%)' : '#e2e8f0';
  const mutedColor = theme === 'light' ? 'hsl(240,8%,45%)' : 'hsl(215,20%,55%)';
  const bgAccent = theme === 'light' ? 'hsl(240,30%,95%)' : 'hsl(222,47%,13%)';

  return (
    <div className="terminal-panel flex flex-col h-full" style={{ background: bg }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${borderColor}` }}>
        <div className="flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-purple-400" />
          <h3 className="text-xs font-semibold" style={{ color: textColor }}>AI SIGNAL ENGINE</h3>
        </div>
        <Button 
          size="sm" 
          variant="ghost"
          onClick={generateSignal} 
          disabled={loading || !klines.length}
          className="h-6 px-2 text-[10px]"
          style={{ color: mutedColor }}
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          <span className="ml-1">{loading ? 'Analyzing...' : 'Generate'}</span>
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3">
        {!signal && !loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Brain className="w-6 h-6 text-purple-500/50" />
            </div>
            <span className="text-xs text-center" style={{ color: mutedColor }}>
              Click Generate to run AI analysis on {symbol.toUpperCase()}
            </span>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            <span className="text-xs" style={{ color: mutedColor }}>Analyzing technicals...</span>
            <div className="flex gap-1">
              {['Trend', 'Support', 'Resistance', 'Risk'].map((s, i) => (
                <span key={s} className="text-[10px] px-2 py-0.5 rounded animate-pulse"
                  style={{ background: bgAccent, color: mutedColor, animationDelay: `${i * 0.2}s` }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        ) : signal && (
          <div className="space-y-3">
            {/* Direction badge */}
            {(() => {
              const cfg = directionConfig[signal.direction] || directionConfig.NEUTRAL;
              const Icon = cfg.icon;
              return (
                <div className={`flex items-center gap-2 p-2 rounded-lg ${cfg.bg}`}>
                  <Icon className={`w-5 h-5 ${cfg.color}`} />
                  <div>
                    <div className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</div>
                    <div className="text-[10px]" style={{ color: mutedColor }}>Confidence: {signal.confidence}%</div>
                  </div>
                  <div className="ml-auto">
                    <div className="w-10 h-10 relative">
                      <svg className="w-10 h-10 -rotate-90">
                        <circle cx="20" cy="20" r="16" fill="none" stroke={bgAccent} strokeWidth="3" />
                        <circle cx="20" cy="20" r="16" fill="none" stroke={signal.confidence > 70 ? '#22c55e' : signal.confidence > 40 ? '#f59e0b' : '#ef4444'} 
                          strokeWidth="3" strokeDasharray={`${signal.confidence} ${100 - signal.confidence}`} strokeLinecap="round" />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold" style={{ color: textColor }}>
                        {signal.confidence}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}
            
            {/* Price levels */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg p-2" style={{ background: bgAccent }}>
                <div className="flex items-center gap-1 text-[10px] mb-1" style={{ color: mutedColor }}>
                  <Zap className="w-2.5 h-2.5" /> Entry
                </div>
                <div className="font-mono-data text-xs" style={{ color: textColor }}>${signal.entry_price?.toFixed(2)}</div>
              </div>
              <div className="rounded-lg p-2" style={{ background: bgAccent }}>
                <div className="flex items-center gap-1 text-[10px] text-emerald-500 mb-1">
                  <Target className="w-2.5 h-2.5" /> Target
                </div>
                <div className="font-mono-data text-xs text-emerald-400">${signal.target_price?.toFixed(2)}</div>
              </div>
              <div className="rounded-lg p-2" style={{ background: bgAccent }}>
                <div className="flex items-center gap-1 text-[10px] text-red-500 mb-1">
                  <Shield className="w-2.5 h-2.5" /> Stop
                </div>
                <div className="font-mono-data text-xs text-red-400">${signal.stop_loss?.toFixed(2)}</div>
              </div>
            </div>
            
            {/* Indicators */}
            {signal.indicators_summary && (
              <div className="flex gap-2">
                {Object.entries(signal.indicators_summary).map(([key, val]) => {
                  const colors = {
                    bullish: 'text-emerald-400 bg-emerald-500/10',
                    bearish: 'text-red-400 bg-red-500/10',
                    strong: 'text-emerald-400 bg-emerald-500/10',
                    moderate: 'text-yellow-400 bg-yellow-500/10',
                    weak: 'text-red-400 bg-red-500/10',
                    high: 'text-orange-400 bg-orange-500/10',
                    medium: 'text-yellow-400 bg-yellow-500/10',
                    low: 'text-blue-400 bg-blue-500/10',
                    neutral: 'text-slate-400 bg-slate-500/10',
                  };
                  const c = colors[val] || 'text-slate-400 bg-slate-500/10';
                  return (
                    <div key={key} className={`flex-1 rounded-lg px-2 py-1.5 ${c.split(' ')[1]}`}>
                      <div className="text-[10px]" style={{ color: mutedColor }}>
                        {key === 'trend' ? 'Trend' : key === 'momentum' ? 'Momentum' : 'Volatility'}
                      </div>
                      <div className={`text-xs font-medium capitalize ${c.split(' ')[0]}`}>{val}</div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* R:R Ratio */}
            {signal.risk_reward_ratio && (
              <div className="flex items-center gap-2 text-[11px]">
                <span style={{ color: mutedColor }}>Risk/Reward:</span>
                <span className={`font-mono-data font-medium ${signal.risk_reward_ratio >= 2 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                  1:{signal.risk_reward_ratio?.toFixed(1)}
                </span>
              </div>
            )}

            {/* Position size */}
            {signal.position_size_pct && (
              <div className="flex items-center gap-2 text-[11px]">
                <span style={{ color: mutedColor }}>Position Size:</span>
                <span className="font-mono-data font-medium text-blue-400">{signal.position_size_pct?.toFixed(1)}%</span>
              </div>
            )}
            
            {/* Reasoning */}
            <div className="rounded-lg p-2.5" style={{ background: bgAccent }}>
              <div className="text-[10px] mb-1" style={{ color: mutedColor }}>AI REASONING</div>
              <p className="text-[11px] leading-relaxed" style={{ color: textColor }}>{signal.reasoning}</p>
            </div>
            
            {/* Key levels */}
            {signal.key_levels && (
              <div className="flex flex-col gap-1 text-[10px] font-mono-data">
                {signal.key_levels.resistance && <span style={{ color: mutedColor }}>Resistance: <span className="text-red-400">${signal.key_levels.resistance?.toFixed(2)}</span></span>}
                {signal.key_levels.pivot && <span style={{ color: mutedColor }}>Pivot: <span className="text-yellow-400">${signal.key_levels.pivot?.toFixed(2)}</span></span>}
                {signal.key_levels.support && <span style={{ color: mutedColor }}>Support: <span className="text-emerald-400">${signal.key_levels.support?.toFixed(2)}</span></span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}