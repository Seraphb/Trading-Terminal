import React from 'react';
import { RefreshCw, TrendingUp, AlertTriangle, CheckCircle, MinusCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function IntrinsicValueCard({ symbol, fundamentals, dcf, setDcf, dcfLoading, setDcfLoading }) {
  const runDCF = async () => {
    if (!symbol) return;
    setDcfLoading(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a top-tier equity analyst. Perform a rigorous DCF + relative valuation for stock ${symbol}.
${fundamentals ? `Fundamental data: ${JSON.stringify(fundamentals)}.` : 'Use internet for real fundamental data.'}

Provide:
1. DCF intrinsic value (base/bull/bear) 
2. Relative value vs peers
3. Upside/downside % vs current price
4. WACC, terminal growth, FCF growth assumptions
5. Margin of safety
6. Key risks (3-5 bullet points)
7. One-paragraph analyst summary

Return ONLY valid JSON.`,
      add_context_from_internet: !fundamentals,
      response_json_schema: {
        type: 'object',
        properties: {
          company_name: { type: 'string' },
          current_price: { type: 'number' },
          intrinsic_value_base: { type: 'number' },
          intrinsic_value_bull: { type: 'number' },
          intrinsic_value_bear: { type: 'number' },
          relative_value: { type: 'number' },
          upside_downside_pct: { type: 'number' },
          wacc: { type: 'number' },
          terminal_growth: { type: 'number' },
          fcf_growth_yr1_5: { type: 'number' },
          verdict: { type: 'string', enum: ['UNDERVALUED', 'FAIRLY_VALUED', 'OVERVALUED'] },
          margin_of_safety: { type: 'number' },
          key_risks: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string' },
        }
      }
    });
    setDcf(result);
    setDcfLoading(false);
  };

  const verdict = dcf?.verdict;
  const verdictConfig = {
    UNDERVALUED: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: CheckCircle, label: 'Undervalued', barColor: '#22c55e' },
    OVERVALUED: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: AlertTriangle, label: 'Overvalued', barColor: '#ef4444' },
    FAIRLY_VALUED: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: MinusCircle, label: 'Fairly Valued', barColor: '#eab308' },
  }[verdict] || { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30', icon: MinusCircle, label: '—', barColor: '#64748b' };
  const VIcon = verdictConfig.icon;

  // Visual gauge: intrinsic value vs price
  const price = dcf?.current_price || 0;
  const base = dcf?.intrinsic_value_base || 0;
  const bear = dcf?.intrinsic_value_bear || 0;
  const bull = dcf?.intrinsic_value_bull || 0;
  const rangeMin = Math.min(bear, price, base) * 0.92;
  const rangeMax = Math.max(bull, price, base) * 1.08;
  const toPos = v => Math.min(100, Math.max(0, ((v - rangeMin) / (rangeMax - rangeMin)) * 100));

  return (
    <div className="terminal-panel rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(217,33%,20%)]">
        <div>
          <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Intrinsic Value · AI DCF Model</div>
          {dcf && <div className="text-xs text-slate-400 mt-0.5">{dcf.company_name || symbol}</div>}
        </div>
        <button onClick={runDCF} disabled={dcfLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-all font-medium">
          {dcfLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
          {dcfLoading ? 'Analysing...' : dcf ? 'Re-run DCF' : 'Run AI DCF'}
        </button>
      </div>

      {/* Empty state */}
      {!dcf && !dcfLoading && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-500">
          <TrendingUp className="w-10 h-10 opacity-15" />
          <div className="text-sm font-medium">No valuation yet</div>
          <div className="text-xs text-slate-600">Click "Run AI DCF" to get an AI-powered intrinsic value estimate for {symbol}</div>
        </div>
      )}

      {dcfLoading && (
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
          <div className="text-sm text-slate-300 font-medium">Running AI-powered DCF model...</div>
          <div className="text-xs text-slate-500">Analysing financials, forecasting cash flows, calculating WACC</div>
        </div>
      )}

      {dcf && !dcfLoading && (
        <div className="p-4 space-y-4">
          {/* Verdict + main value */}
          <div className={`flex items-center justify-between p-3 rounded-xl border ${verdictConfig.bg} ${verdictConfig.border}`}>
            <div className="flex items-center gap-2">
              <VIcon className={`w-5 h-5 ${verdictConfig.color}`} />
              <div>
                <div className={`font-bold text-base ${verdictConfig.color}`}>{verdictConfig.label}</div>
                <div className="text-[11px] text-slate-500">
                  {Math.abs(dcf.upside_downside_pct || 0).toFixed(1)}% {dcf.upside_downside_pct >= 0 ? 'upside' : 'downside'}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Base Case</div>
              <div className="font-bold text-xl text-white">${base.toFixed(2)}</div>
              <div className="text-[10px] text-slate-500">vs ${price.toFixed(2)} market</div>
            </div>
          </div>

          {/* Visual bar: bear / intrinsic / price / bull */}
          <div>
            <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide">Valuation Range</div>
            <div className="relative h-6 bg-[hsl(217,33%,15%)] rounded-full overflow-hidden">
              {/* Bear to bull range fill */}
              <div className="absolute top-0 h-full rounded-full opacity-20"
                style={{ left: `${toPos(bear)}%`, width: `${toPos(bull) - toPos(bear)}%`, background: verdictConfig.barColor }} />
              {/* Intrinsic value marker */}
              <div className="absolute top-0 h-full w-0.5 bg-emerald-400"
                style={{ left: `${toPos(base)}%` }} />
              {/* Current price marker */}
              <div className="absolute top-0 h-full w-0.5 bg-white/60"
                style={{ left: `${toPos(price)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span className="text-red-400">Bear ${bear.toFixed(0)}</span>
              <span className="text-emerald-400">Base ${base.toFixed(0)}</span>
              <span className="text-emerald-300">Bull ${bull.toFixed(0)}</span>
            </div>
            <div className="flex gap-3 mt-1 text-[10px]">
              <span className="flex items-center gap-1 text-slate-400"><span className="w-2 h-0.5 bg-white/60 inline-block rounded"/>Market price</span>
              <span className="flex items-center gap-1 text-slate-400"><span className="w-0.5 h-2 bg-emerald-400 inline-block rounded"/>Intrinsic value</span>
            </div>
          </div>

          {/* Bull / Base / Bear cards */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Bear Case', val: bear, color: 'text-red-400', bg: 'bg-red-500/8' },
              { label: 'Base Case', val: base, color: 'text-white', bg: 'bg-blue-500/8', active: true },
              { label: 'Bull Case', val: bull, color: 'text-emerald-400', bg: 'bg-emerald-500/8' },
            ].map(({ label, val, color, bg, active }) => (
              <div key={label} className={`${bg} rounded-lg p-2.5 text-center ${active ? 'ring-1 ring-blue-500/30' : ''}`}>
                <div className="text-[9px] text-slate-500 uppercase tracking-wide mb-1">{label}</div>
                <div className={`font-bold text-sm ${color}`}>${val?.toFixed(2)}</div>
              </div>
            ))}
          </div>

          {/* Key metrics grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            {[
              ['WACC', `${((dcf.wacc || 0) * 100).toFixed(1)}%`],
              ['Terminal Growth', `${((dcf.terminal_growth || 0) * 100).toFixed(1)}%`],
              ['FCF Growth Y1-5', `${((dcf.fcf_growth_yr1_5 || 0) * 100).toFixed(1)}%`],
              ['Margin of Safety', `${(dcf.margin_of_safety || 0).toFixed(1)}%`],
              ['DCF Value', `$${base.toFixed(2)}`],
              ['Relative Value', dcf.relative_value ? `$${dcf.relative_value.toFixed(2)}` : 'N/A'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-1 border-b border-[hsl(217,33%,18%)]">
                <span className="text-slate-500">{k}</span>
                <span className="text-slate-200 font-mono">{v}</span>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="text-[11px] text-slate-400 leading-relaxed bg-[hsl(222,47%,12%)] rounded-lg p-3 border border-[hsl(217,33%,18%)]">
            {dcf.summary}
          </div>

          {/* Key risks */}
          {dcf.key_risks?.length > 0 && (
            <div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Key Risks</div>
              <div className="space-y-1">
                {dcf.key_risks.map((r, i) => (
                  <div key={i} className="flex gap-2 text-[11px] text-slate-400">
                    <span className="text-red-500 flex-shrink-0 mt-0.5">▸</span>{r}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}