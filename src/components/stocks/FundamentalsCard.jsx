import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const fmt = (v, prefix = '', suffix = '', decimals = 2) =>
  v == null ? 'N/A' : `${prefix}${typeof v === 'number' ? v.toFixed(decimals) : v}${suffix}`;

export default function FundamentalsCard({ symbol, onFundamentalsLoaded }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const fetchFundamentals = async () => {
    if (!symbol) return;
    setLoading(true);
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Fetch current, accurate fundamental financial data for stock ticker ${symbol}. Use the most recent reported figures.`,
      add_context_from_internet: true,
      response_json_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          sector: { type: 'string' },
          description: { type: 'string' },
          market_cap_b: { type: 'number' },
          pe_ratio: { type: 'number' },
          forward_pe: { type: 'number' },
          ps_ratio: { type: 'number' },
          pb_ratio: { type: 'number' },
          ev_ebitda: { type: 'number' },
          revenue_b: { type: 'number' },
          revenue_growth_yoy: { type: 'number' },
          gross_margin: { type: 'number' },
          operating_margin: { type: 'number' },
          net_margin: { type: 'number' },
          fcf_b: { type: 'number' },
          debt_equity: { type: 'number' },
          current_ratio: { type: 'number' },
          roe: { type: 'number' },
          roa: { type: 'number' },
          eps_ttm: { type: 'number' },
          eps_growth_yoy: { type: 'number' },
          dividend_yield: { type: 'number' },
          payout_ratio: { type: 'number' },
          beta: { type: 'number' },
          analyst_target: { type: 'number' },
          analyst_rating: { type: 'string' },
          week_52_high: { type: 'number' },
          week_52_low: { type: 'number' },
          shares_outstanding_b: { type: 'number' },
        }
      }
    });
    setData(result);
    onFundamentalsLoaded?.(result);
    setLoading(false);
  };

  useEffect(() => { if (symbol) fetchFundamentals(); }, [symbol]);

  const sections = data ? [
    {
      title: 'Valuation',
      rows: [
        ['Market Cap', fmt(data.market_cap_b, '$', 'B')],
        ['P/E Ratio', fmt(data.pe_ratio)],
        ['Forward P/E', fmt(data.forward_pe)],
        ['P/S Ratio', fmt(data.ps_ratio)],
        ['P/B Ratio', fmt(data.pb_ratio)],
        ['EV/EBITDA', fmt(data.ev_ebitda)],
      ]
    },
    {
      title: 'Profitability',
      rows: [
        ['Revenue', fmt(data.revenue_b, '$', 'B')],
        ['Rev Growth YoY', fmt(data.revenue_growth_yoy, '', '%')],
        ['Gross Margin', fmt(data.gross_margin, '', '%')],
        ['Operating Margin', fmt(data.operating_margin, '', '%')],
        ['Net Margin', fmt(data.net_margin, '', '%')],
        ['ROE', fmt(data.roe, '', '%')],
        ['ROA', fmt(data.roa, '', '%')],
      ]
    },
    {
      title: 'Per Share',
      rows: [
        ['EPS (TTM)', fmt(data.eps_ttm, '$')],
        ['EPS Growth', fmt(data.eps_growth_yoy, '', '%')],
        ['FCF', fmt(data.fcf_b, '$', 'B')],
        ['Dividend Yield', fmt(data.dividend_yield, '', '%')],
        ['Payout Ratio', fmt(data.payout_ratio, '', '%')],
      ]
    },
    {
      title: 'Financial Health',
      rows: [
        ['Debt/Equity', fmt(data.debt_equity)],
        ['Current Ratio', fmt(data.current_ratio)],
        ['Beta', fmt(data.beta)],
        ['52W High', fmt(data.week_52_high, '$')],
        ['52W Low', fmt(data.week_52_low, '$')],
      ]
    },
    {
      title: 'Analyst Consensus',
      rows: [
        ['Price Target', fmt(data.analyst_target, '$')],
        ['Rating', data.analyst_rating || 'N/A'],
        ['Shares Out.', fmt(data.shares_outstanding_b, '', 'B')],
      ]
    },
  ] : [];

  return (
    <div className="terminal-panel rounded-xl overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(217,33%,20%)] flex-shrink-0">
        <div>
          <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Fundamentals</div>
          {data && <div className="text-xs text-slate-300 font-medium mt-0.5">{data.name} · <span className="text-slate-500">{data.sector}</span></div>}
        </div>
        <button onClick={fetchFundamentals} disabled={loading}
          className="p-1.5 rounded-lg hover:bg-[hsl(217,33%,23%)] text-slate-400 hover:text-white transition-all">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-32 text-slate-500 text-xs gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Fetching latest data...
          </div>
        )}

        {data && !loading && (
          <div className="p-3 space-y-4">
            {/* Company description */}
            {data.description && (
              <div className="text-[11px] text-slate-400 leading-relaxed bg-[hsl(222,47%,12%)] rounded-lg p-3 border border-[hsl(217,33%,18%)]">
                {data.description}
              </div>
            )}

            {sections.map(({ title, rows }) => (
              <div key={title}>
                <div className="text-[10px] text-blue-400 uppercase tracking-wider font-semibold mb-1.5">{title}</div>
                <div className="space-y-0">
                  {rows.map(([k, v]) => (
                    <div key={k} className="flex justify-between py-1 border-b border-[hsl(217,33%,16%)] text-xs">
                      <span className="text-slate-500">{k}</span>
                      <span className="text-slate-200 font-mono">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
