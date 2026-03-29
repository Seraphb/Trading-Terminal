import React from 'react';
import { RefreshCw, TrendingUp, AlertTriangle, CheckCircle, MinusCircle } from 'lucide-react';

async function fetchFundamentals(symbol) {
  const res = await fetch(`/api/stocks/fundamentals?symbol=${encodeURIComponent(symbol)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Failed: ${res.status}`);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Two-stage DCF engine (mirrors AlphaSpread methodology)
//   Stage 1: years 1-5  — base growth rate
//   Stage 2: years 6-10 — linear decay toward terminal growth
//   Terminal:             Gordon Growth Model
//   Metric:               FCF per share (accounts for buybacks)
//   WACC:                 CAPM with real beta (from SPY regression)
// ─────────────────────────────────────────────────────────────────────────────
function computeDCF(f) {
  const {
    current_price, shares_outstanding,
    fcf_history, shares_history, revenue_history,
    total_debt, total_cash, beta: rawBeta,
  } = f;

  if (!current_price || current_price <= 0) return { error: 'Could not retrieve current price.' };
  if (!shares_outstanding || shares_outstanding <= 0) return { error: 'Shares outstanding not available.' };
  if (!fcf_history?.length || !fcf_history[0]) return { error: 'No FCF data available from SEC EDGAR.' };

  // ── WACC ──────────────────────────────────────────────────────────────────
  // Mean-revert beta 30% toward 1.0 (Blume adjustment — reduces extreme values)
  const beta       = rawBeta != null ? rawBeta * 0.67 + 1.0 * 0.33 : 1.0;
  const rfRate     = 0.0425;  // 10-yr Treasury ~4.25%
  const erp        = 0.050;   // Damodaran Equity Risk Premium
  const costOfEquity = rfRate + beta * erp;
  const costOfDebt   = 0.045; // IG-grade corporate debt
  const taxRate      = 0.21;

  const marketCap    = current_price * shares_outstanding;
  const debtVal      = total_debt ?? 0;
  const totalCapital = marketCap + debtVal;
  const wE = totalCapital > 0 ? marketCap / totalCapital : 0.95;
  const wD = 1 - wE;
  const wacc = wE * costOfEquity + wD * costOfDebt * (1 - taxRate);

  // ── FCF per share (base metric) ───────────────────────────────────────────
  const fcfPS_now = fcf_history[0] / shares_outstanding;

  // ── Growth rate: FCF/share CAGR + revenue CAGR blend ─────────────────────
  function cagr(history) {
    if (!history || history.length < 2) return null;
    const oldest = history[history.length - 1];
    const newest = history[0];
    const yrs    = history.length - 1;
    if (!oldest || !newest || oldest <= 0 || newest <= 0) return null;
    return Math.pow(newest / oldest, 1 / yrs) - 1;
  }

  // FCF/share history — combine FCF and shares histories
  const fcfPsHistory = fcf_history.map((fcf, i) => {
    const sh = shares_history?.[i] ?? shares_outstanding;
    return sh > 0 ? fcf / sh : null;
  }).filter(v => v != null && v > 0);

  const fcfPsGrowth  = cagr(fcfPsHistory);
  const revGrowth    = cagr(revenue_history);

  // Blend: weight revenue CAGR 60% (captures top-line momentum) + FCF/share 40%
  let rawGrowth;
  if (fcfPsGrowth != null && revGrowth != null) {
    rawGrowth = 0.4 * fcfPsGrowth + 0.6 * revGrowth;
  } else {
    rawGrowth = fcfPsGrowth ?? revGrowth ?? 0.07;
  }

  // Cap growth: high-growth companies revert; clamp to [−5%, 40%]
  const baseGrowth = Math.max(-0.05, Math.min(rawGrowth, 0.40));
  const bearGrowth = Math.max(-0.10, baseGrowth - 0.10);
  const bullGrowth = Math.min(0.50,  baseGrowth + 0.10);

  const termGrowth = 0.03; // 3% terminal (nominal GDP)

  // ── Two-stage DCF ─────────────────────────────────────────────────────────
  function projectPV(g1) {
    let fcfPS = fcfPS_now > 0 ? fcfPS_now : Math.abs(fcfPS_now) * 0.2;
    let pv = 0;

    // Stage 1: years 1–5 at g1
    for (let yr = 1; yr <= 5; yr++) {
      fcfPS *= (1 + g1);
      pv += fcfPS / Math.pow(1 + wacc, yr);
    }

    // Stage 2: years 6–10, linearly decay from g1 → termGrowth
    for (let yr = 6; yr <= 10; yr++) {
      const t      = (yr - 5) / 5;          // 0.2 → 1.0
      const gDecay = g1 * (1 - t) + termGrowth * t;
      fcfPS *= (1 + gDecay);
      pv += fcfPS / Math.pow(1 + wacc, yr);
    }

    // Terminal value at end of year 10
    const tv = (fcfPS * (1 + termGrowth)) / (wacc - termGrowth);
    pv += tv / Math.pow(1 + wacc, 10);

    // Subtract net debt per share
    const netDebtPS = (debtVal - (total_cash ?? 0)) / shares_outstanding;
    return Math.max(0, pv - netDebtPS);
  }

  const base = projectPV(baseGrowth);
  const bear = projectPV(bearGrowth);
  const bull = projectPV(bullGrowth);

  if (base <= 0) return { error: 'DCF produced non-positive equity value (high debt or deeply negative FCF).' };

  const upside         = ((base - current_price) / current_price) * 100;
  const marginOfSafety = ((base - current_price) / base) * 100;
  const verdict        = upside > 15 ? 'UNDERVALUED' : upside < -15 ? 'OVERVALUED' : 'FAIRLY_VALUED';

  return {
    company_name:         f.company_name,
    source:               f.source,
    current_price,
    intrinsic_value_base: base,
    intrinsic_value_bear: Math.min(bear, base),
    intrinsic_value_bull: Math.max(bull, base),
    upside_downside_pct:  upside,
    margin_of_safety:     marginOfSafety,
    wacc,
    beta,
    terminal_growth:      termGrowth,
    fcf_growth_base:      baseGrowth,
    fcf_growth_bear:      bearGrowth,
    fcf_growth_bull:      bullGrowth,
    fcf_ps_now:           fcfPS_now,
    net_debt_bn:          (debtVal - (total_cash ?? 0)) / 1e9,
    verdict,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function IntrinsicValueCard({ symbol, dcf, setDcf, dcfLoading, setDcfLoading }) {
  const [error, setError] = React.useState(null);

  const runDCF = async () => {
    if (!symbol) return;
    setDcfLoading(true);
    setError(null);
    setDcf(null);
    try {
      const f      = await fetchFundamentals(symbol);
      const result = computeDCF(f);
      if (result.error) { setError(result.error); }
      else               { setDcf(result); }
    } catch (err) {
      setError(err.message || 'Failed to compute DCF.');
    } finally {
      setDcfLoading(false);
    }
  };

  const verdict = dcf?.verdict;
  const vc = {
    UNDERVALUED:   { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', Icon: CheckCircle,   label: 'Undervalued',   bar: '#22c55e' },
    OVERVALUED:    { color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     Icon: AlertTriangle, label: 'Overvalued',    bar: '#ef4444' },
    FAIRLY_VALUED: { color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30',  Icon: MinusCircle,   label: 'Fairly Valued', bar: '#eab308' },
  }[verdict] || { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/30', Icon: MinusCircle, label: '—', bar: '#64748b' };

  const price = dcf?.current_price ?? 0;
  const base  = dcf?.intrinsic_value_base ?? 0;
  const bear  = dcf?.intrinsic_value_bear ?? 0;
  const bull  = dcf?.intrinsic_value_bull ?? 0;
  const lo = Math.min(bear, price) * 0.90;
  const hi = Math.max(bull, price) * 1.10;
  const pos = v => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  const pct = n => `${((n ?? 0) * 100).toFixed(1)}%`;

  return (
    <div className="terminal-panel rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(217,33%,20%)]">
        <div>
          <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Intrinsic Value · DCF Model</div>
          {dcf && <div className="text-xs text-slate-400 mt-0.5">{dcf.company_name} · {dcf.source}</div>}
        </div>
        <button onClick={runDCF} disabled={dcfLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium transition-all">
          {dcfLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
          {dcfLoading ? 'Calculating…' : dcf ? 'Refresh' : 'Run DCF'}
        </button>
      </div>

      {!dcf && !dcfLoading && !error && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-500">
          <TrendingUp className="w-10 h-10 opacity-15" />
          <div className="text-sm font-medium">No valuation yet</div>
          <div className="text-xs text-slate-600 text-center px-6">
            Two-stage DCF · SEC EDGAR 10-K data · SPY beta regression · US stocks only
          </div>
        </div>
      )}

      {error && !dcfLoading && (
        <div className="flex items-start gap-2 m-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
        </div>
      )}

      {dcfLoading && (
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-400" />
          <div className="text-sm text-slate-300 font-medium">Fetching SEC filings + computing beta…</div>
          <div className="text-xs text-slate-500">EDGAR 10-K cash flows · revenue · SPY regression</div>
        </div>
      )}

      {dcf && !dcfLoading && (
        <div className="p-4 space-y-4">
          {/* Verdict */}
          <div className={`flex items-center justify-between p-3 rounded-xl border ${vc.bg} ${vc.border}`}>
            <div className="flex items-center gap-2">
              <vc.Icon className={`w-5 h-5 ${vc.color}`} />
              <div>
                <div className={`font-bold text-base ${vc.color}`}>{vc.label}</div>
                <div className="text-[11px] text-slate-500">
                  {Math.abs(dcf.upside_downside_pct ?? 0).toFixed(1)}%{' '}
                  {(dcf.upside_downside_pct ?? 0) >= 0 ? 'upside' : 'downside'}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-500 uppercase tracking-wide">Base Case</div>
              <div className="font-bold text-xl text-white">${base.toFixed(2)}</div>
              <div className="text-[10px] text-slate-500">vs ${price.toFixed(2)} market</div>
            </div>
          </div>

          {/* Range bar */}
          <div>
            <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide">Valuation Range</div>
            <div className="relative h-6 bg-[hsl(217,33%,15%)] rounded-full overflow-hidden">
              <div className="absolute top-0 h-full rounded-full opacity-20"
                style={{ left: `${pos(bear)}%`, width: `${Math.max(0, pos(bull) - pos(bear))}%`, background: vc.bar }} />
              <div className="absolute top-0 h-full w-0.5 bg-emerald-400" style={{ left: `${pos(base)}%` }} />
              <div className="absolute top-0 h-full w-0.5 bg-white/60"    style={{ left: `${pos(price)}%` }} />
            </div>
            <div className="flex justify-between text-[10px] mt-1">
              <span className="text-red-400">Bear ${bear.toFixed(0)}</span>
              <span className="text-emerald-400">Base ${base.toFixed(0)}</span>
              <span className="text-emerald-300">Bull ${bull.toFixed(0)}</span>
            </div>
            <div className="flex gap-3 mt-1 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-white/60 inline-block rounded"/>Market</span>
              <span className="flex items-center gap-1"><span className="w-0.5 h-2 bg-emerald-400 inline-block rounded"/>Intrinsic</span>
            </div>
          </div>

          {/* Scenario cards */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Bear', val: bear, sub: pct(dcf.fcf_growth_bear), color: 'text-red-400',     bg: 'bg-red-500/8' },
              { label: 'Base', val: base, sub: pct(dcf.fcf_growth_base), color: 'text-white',       bg: 'bg-blue-500/8', active: true },
              { label: 'Bull', val: bull, sub: pct(dcf.fcf_growth_bull), color: 'text-emerald-400', bg: 'bg-emerald-500/8' },
            ].map(({ label, val, sub, color, bg, active }) => (
              <div key={label} className={`${bg} rounded-lg p-2.5 text-center ${active ? 'ring-1 ring-blue-500/30' : ''}`}>
                <div className="text-[9px] text-slate-500 uppercase tracking-wide mb-1">{label}</div>
                <div className={`font-bold text-sm ${color}`}>${val.toFixed(2)}</div>
                <div className="text-[9px] text-slate-600 mt-0.5">Stage-1 g {sub}</div>
              </div>
            ))}
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            {[
              ['WACC',             pct(dcf.wacc)],
              ['Beta (adj)',       dcf.beta?.toFixed(2) ?? '—'],
              ['Stage-1 Growth',   pct(dcf.fcf_growth_base)],
              ['Terminal Growth',  pct(dcf.terminal_growth)],
              ['FCF/share (TTM)',  dcf.fcf_ps_now != null ? `$${dcf.fcf_ps_now.toFixed(2)}` : 'N/A'],
              ['Net Debt',        `$${(dcf.net_debt_bn ?? 0).toFixed(1)}B`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-1 border-b border-[hsl(217,33%,18%)]">
                <span className="text-slate-500">{k}</span>
                <span className="text-slate-200 font-mono">{v}</span>
              </div>
            ))}
          </div>

          <div className="text-[10px] text-slate-600 leading-relaxed">
            Two-stage DCF on FCF/share (years 1–5 stage-1, 6–10 linear decay → 3% terminal).
            Beta from 2yr weekly SPY regression, mean-reverted 30% toward 1.0.
            Data: SEC EDGAR 10-K + Yahoo Finance price.
          </div>
        </div>
      )}
    </div>
  );
}
