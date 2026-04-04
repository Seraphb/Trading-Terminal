import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Globe, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';

// ── Yahoo Finance proxy (/api/stocks/quotes) for market data ─────────────────
const MARKET_SYMBOLS = [
  // Equity indices
  { sym: '^GSPC',     label: 'S&P 500',   group: 'equity' },
  { sym: '^IXIC',     label: 'NASDAQ',    group: 'equity' },
  { sym: '^DJI',      label: 'Dow Jones', group: 'equity' },
  { sym: '^VIX',      label: 'VIX',       group: 'vix'    },
  // Treasuries
  { sym: '^IRX',      label: '3M',        group: 'bonds'  },
  { sym: '^FVX',      label: '5Y',        group: 'bonds'  },
  { sym: '^TNX',      label: '10Y',       group: 'bonds'  },
  { sym: '^TYX',      label: '30Y',       group: 'bonds'  },
  // Commodities
  { sym: 'GC=F',      label: 'Gold',      group: 'comm'   },
  { sym: 'CL=F',      label: 'WTI Oil',   group: 'comm'   },
  { sym: 'SI=F',      label: 'Silver',    group: 'comm'   },
  { sym: 'NG=F',      label: 'Nat Gas',   group: 'comm'   },
  // Dollar
  { sym: 'DX-Y.NYB',  label: 'DXY',       group: 'fx'     },
  { sym: 'EURUSD=X',  label: 'EUR/USD',   group: 'fx'     },
  { sym: 'JPY=X',     label: 'USD/JPY',   group: 'fx'     },
];

function pct(v) {
  if (v == null || isNaN(v)) return null;
  return v;
}

function fmtPrice(p, decimals = 2) {
  if (p == null || isNaN(p)) return '—';
  if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (p >= 1000)  return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (p >= 10)    return p.toFixed(decimals);
  return p.toFixed(4);
}

function ChangeTag({ change }) {
  if (change == null || isNaN(change)) return <span className="text-slate-500 text-[10px]">—</span>;
  const pos = change >= 0;
  return (
    <span className={`text-[10px] font-mono ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
      {pos ? '+' : ''}{change.toFixed(2)}%
    </span>
  );
}

function MarketRow({ label, price, change, decimals = 2, unit = '' }) {
  const pos = change > 0, neg = change < 0;
  return (
    <div className="flex items-center justify-between py-1 px-2 rounded hover:bg-[hsl(217,33%,15%)] transition-colors">
      <span className="text-[10px] text-slate-400 font-medium w-16 shrink-0">{label}</span>
      <div className="flex items-center gap-2 ml-auto">
        <span className="font-mono text-[11px] text-slate-200">
          {fmtPrice(price, decimals)}{unit}
        </span>
        <ChangeTag change={change} />
      </div>
    </div>
  );
}

function SectionHeader({ title, icon }) {
  return (
    <div className="flex items-center gap-1.5 px-2 pt-2 pb-0.5">
      <span className="text-[9px] font-bold tracking-widest text-slate-500 uppercase">{icon} {title}</span>
    </div>
  );
}

function YieldCurveBar({ y3m, y5, y10, y30 }) {
  // Higher yield = steeper curve; show simple visualization
  const max = Math.max(y3m ?? 0, y5 ?? 0, y10 ?? 0, y30 ?? 0, 1);
  const items = [
    { l: '3M',  v: y3m },
    { l: '5Y',  v: y5  },
    { l: '10Y', v: y10 },
    { l: '30Y', v: y30 },
  ];
  const inverted = (y10 ?? 0) < (y3m ?? 0);

  return (
    <div className="px-2 pb-1">
      <div className="flex items-end gap-1 h-8 mb-0.5">
        {items.map(({ l, v }) => (
          <div key={l} className="flex flex-col items-center flex-1">
            <div
              className="w-full rounded-t transition-all"
              style={{
                height: v ? `${Math.max(4, (v / max) * 28)}px` : '4px',
                background: inverted
                  ? 'linear-gradient(to top, #ef4444, #f97316)'
                  : 'linear-gradient(to top, #3b82f6, #06b6d4)',
              }}
            />
            <span className="text-[8px] text-slate-600 mt-0.5">{l}</span>
          </div>
        ))}
      </div>
      <div className="text-[9px] text-center" style={{ color: inverted ? '#f97316' : '#6b7280' }}>
        {inverted ? '⚠ Inverted yield curve' : 'Normal slope'}
        {y10 != null && y3m != null
          ? ` · spread ${(y10 - y3m) >= 0 ? '+' : ''}${(y10 - y3m).toFixed(2)}%`
          : ''}
      </div>
    </div>
  );
}

export default function MacroIndicators({ tickers }) {
  const [macroData, setMacroData]   = useState(null);
  const [marketData, setMarketData] = useState({});
  const [loading, setLoading]       = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Parallel: CoinGecko + Fear&Greed + Yahoo quotes
      const syms = MARKET_SYMBOLS.map(s => s.sym).join(',');
      const [fngRes, cgRes, quotesRes] = await Promise.all([
        fetch('https://api.alternative.me/fng/?limit=1').catch(() => null),
        fetch('https://api.coingecko.com/api/v3/global').catch(() => null),
        fetch(`/api/stocks/quotes?symbols=${encodeURIComponent(syms)}`).catch(() => null),
      ]);

      // Fear & Greed + CoinGecko
      if (fngRes?.ok && cgRes?.ok) {
        const fngJson = await fngRes.json();
        const cgJson  = await cgRes.json();
        const fgIndex = parseInt(fngJson?.data?.[0]?.value ?? 50);
        const fgLabel = fngJson?.data?.[0]?.value_classification ?? '';
        const btcDom  = cgJson?.data?.market_cap_percentage?.btc?.toFixed(1) ?? '—';
        const totalMc = cgJson?.data?.total_market_cap?.usd;
        setMacroData({
          fear_greed_index: fgIndex,
          fear_greed_label: fgLabel,
          btc_dominance: parseFloat(btcDom),
          total_market_cap: totalMc
            ? (totalMc >= 1e12 ? '$' + (totalMc / 1e12).toFixed(2) + 'T' : '$' + (totalMc / 1e9).toFixed(0) + 'B')
            : '—',
        });
      }

      // Market quotes (Yahoo Finance proxy)
      if (quotesRes?.ok) {
        const data = await quotesRes.json();
        const map = {};
        for (const q of (data.quotes ?? [])) map[q.symbol] = q;
        setMarketData(map);
      }

      setLastUpdated(new Date());
    } catch (e) {
      console.error('Macro fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 300_000); // 5-min refresh
    return () => clearInterval(id);
  }, [fetchAll]);

  const ethBtcRatio = useMemo(() => {
    const ethbtc = tickers?.['ETHBTC'];
    if (ethbtc?.price) return parseFloat(ethbtc.price);
    const eth = tickers?.['ETHUSDT']?.price;
    const btc = tickers?.['BTCUSDT']?.price;
    if (eth && btc) return parseFloat(eth) / parseFloat(btc);
    return null;
  }, [tickers]);

  const btcTicker = tickers?.['BTCUSDT'];

  const fgColor = useMemo(() => {
    if (!macroData) return 'text-slate-400';
    const fg = macroData.fear_greed_index;
    if (fg >= 75) return 'text-emerald-400';
    if (fg >= 50) return 'text-yellow-400';
    if (fg >= 25) return 'text-orange-400';
    return 'text-red-400';
  }, [macroData]);

  const q = (sym) => marketData[sym] ?? {};

  const vixVal   = q('^VIX').price;
  const vixColor = vixVal == null ? 'text-slate-400' : vixVal >= 30 ? 'text-red-400' : vixVal >= 20 ? 'text-orange-400' : 'text-emerald-400';

  const y3m  = q('^IRX').price;
  const y5   = q('^FVX').price;
  const y10  = q('^TNX').price;
  const y30  = q('^TYX').price;

  const timeStr = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="terminal-panel flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(217,33%,20%)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-blue-400" />
          <h3 className="text-xs font-semibold text-slate-300">MACRO</h3>
          {timeStr && <span className="text-[9px] text-slate-600">{timeStr}</span>}
        </div>
        <button onClick={fetchAll} disabled={loading} className="text-slate-500 hover:text-slate-300 transition-colors">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0 pb-2">

        {/* ── Crypto Sentiment ───────────────────────────────────────────── */}
        <SectionHeader title="Crypto" icon="₿" />
        {macroData ? (
          <div className="px-2 space-y-1 mt-0.5">
            {/* Fear & Greed */}
            <div className="bg-[hsl(222,47%,13%)] rounded-lg p-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">Fear & Greed</span>
                <span className={`font-mono text-sm font-bold ${fgColor}`}>{macroData.fear_greed_index}</span>
              </div>
              <div className="w-full h-1.5 bg-[hsl(217,33%,20%)] rounded-full mt-1 overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${macroData.fear_greed_index}%`, background: 'linear-gradient(to right, #ef4444, #f59e0b, #22c55e)' }} />
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5">{macroData.fear_greed_label}</div>
            </div>
            <div className="flex gap-1">
              <div className="flex-1 bg-[hsl(222,47%,13%)] rounded-lg p-1.5 text-center">
                <div className="text-[9px] text-slate-500">BTC Dom.</div>
                <div className="font-mono text-[11px] text-orange-400">{macroData.btc_dominance}%</div>
              </div>
              <div className="flex-1 bg-[hsl(222,47%,13%)] rounded-lg p-1.5 text-center">
                <div className="text-[9px] text-slate-500">Mkt Cap</div>
                <div className="font-mono text-[11px] text-blue-400">{macroData.total_market_cap}</div>
              </div>
              <div className="flex-1 bg-[hsl(222,47%,13%)] rounded-lg p-1.5 text-center">
                <div className="text-[9px] text-slate-500">ETH/BTC</div>
                <div className="font-mono text-[11px] text-purple-400">
                  {ethBtcRatio != null ? ethBtcRatio.toFixed(5) : '—'}
                </div>
              </div>
            </div>
            {btcTicker && (
              <div className="flex items-center justify-between bg-[hsl(222,47%,13%)] rounded-lg px-2 py-1.5 font-mono text-[10px] gap-2 flex-wrap">
                <span className="text-slate-600">BTC</span>
                <span className="text-slate-300">${(btcTicker.quoteVolume / 1e9).toFixed(1)}B vol</span>
                <span className={btcTicker.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {btcTicker.changePercent >= 0 ? '+' : ''}{btcTicker.changePercent?.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="px-2 space-y-1 mt-1">
            {[1,2,3].map(i => <div key={i} className="h-8 bg-[hsl(217,33%,17%)] rounded animate-pulse" />)}
          </div>
        )}

        {/* ── Equity Indices ─────────────────────────────────────────────── */}
        <SectionHeader title="Equity Indices" icon="📈" />
        <div className="mt-0.5">
          <MarketRow label="S&P 500"   price={q('^GSPC').price}  change={q('^GSPC').change}  decimals={2} />
          <MarketRow label="NASDAQ"    price={q('^IXIC').price}  change={q('^IXIC').change}  decimals={2} />
          <MarketRow label="Dow Jones" price={q('^DJI').price}   change={q('^DJI').change}   decimals={0} />
        </div>

        {/* VIX */}
        <div className="px-2 mt-1">
          <div className="bg-[hsl(222,47%,13%)] rounded-lg p-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-slate-500">VIX — Volatility Index</div>
                <div className="text-[9px] text-slate-600 mt-0.5">
                  {vixVal == null ? '' : vixVal >= 30 ? 'Extreme fear / high vol' : vixVal >= 20 ? 'Elevated volatility' : 'Low volatility / complacency'}
                </div>
              </div>
              <span className={`font-mono text-base font-bold ${vixColor}`}>
                {vixVal != null ? vixVal.toFixed(2) : '—'}
              </span>
            </div>
            {vixVal != null && (
              <div className="w-full h-1.5 bg-[hsl(217,33%,20%)] rounded-full mt-1.5 overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (vixVal / 80) * 100)}%`,
                    background: vixVal >= 30 ? '#ef4444' : vixVal >= 20 ? '#f59e0b' : '#22c55e',
                  }} />
              </div>
            )}
            {q('^VIX').change != null && (
              <div className="mt-0.5 text-right"><ChangeTag change={q('^VIX').change} /></div>
            )}
          </div>
        </div>

        {/* ── Treasury Yields ────────────────────────────────────────────── */}
        <SectionHeader title="Treasury Yields" icon="🏛" />
        <div className="mt-0.5">
          <MarketRow label="3M T-Bill" price={y3m}  change={q('^IRX').change} decimals={3} unit="%" />
          <MarketRow label="5Y Note"   price={y5}   change={q('^FVX').change} decimals={3} unit="%" />
          <MarketRow label="10Y Note"  price={y10}  change={q('^TNX').change} decimals={3} unit="%" />
          <MarketRow label="30Y Bond"  price={y30}  change={q('^TYX').change} decimals={3} unit="%" />
        </div>
        {(y3m || y5 || y10 || y30) && (
          <YieldCurveBar y3m={y3m} y5={y5} y10={y10} y30={y30} />
        )}

        {/* ── Commodities ────────────────────────────────────────────────── */}
        <SectionHeader title="Commodities" icon="🛢" />
        <div className="mt-0.5">
          <MarketRow label="Gold"     price={q('GC=F').price}  change={q('GC=F').change}  decimals={2} />
          <MarketRow label="WTI Oil"  price={q('CL=F').price}  change={q('CL=F').change}  decimals={2} />
          <MarketRow label="Silver"   price={q('SI=F').price}  change={q('SI=F').change}  decimals={3} />
          <MarketRow label="Nat Gas"  price={q('NG=F').price}  change={q('NG=F').change}  decimals={3} />
        </div>

        {/* ── FX / Dollar ────────────────────────────────────────────────── */}
        <SectionHeader title="FX / Dollar" icon="💱" />
        <div className="mt-0.5">
          <MarketRow label="DXY"      price={q('DX-Y.NYB').price}  change={q('DX-Y.NYB').change}  decimals={3} />
          <MarketRow label="EUR/USD"  price={q('EURUSD=X').price}  change={q('EURUSD=X').change}  decimals={4} />
          <MarketRow label="USD/JPY"  price={q('JPY=X').price}     change={q('JPY=X').change}     decimals={2} />
        </div>

      </div>
    </div>
  );
}
