import React, { Suspense, lazy, useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../components/ThemeContext';
import { fetchStockHistory, normalizeStockSymbol } from '@/api/stockMarketClient';
import { BarChart3, TrendingUp, Activity, BookOpen } from 'lucide-react';
import StocksWatchList from '../components/stocks/StocksWatchList';
import StockHeader from '../components/stocks/StockHeader';
import PriceChart from '../components/terminal/PriceChart';
import { DEFAULT_DATE_RANGE_BY_INTERVAL } from '@/components/charts/chartConfig';

const IntrinsicValueCard = lazy(() => import('../components/stocks/IntrinsicValueCard'));
const FundamentalsCard   = lazy(() => import('../components/stocks/FundamentalsCard'));
const StockAISignal      = lazy(() => import('../components/stocks/StockAISignal'));

const klinesCache = new Map();

const TABS = [
  { id: 'summary',      label: 'Summary',       icon: BookOpen   },
  { id: 'chart',        label: 'Chart & VMC',   icon: Activity   },
  { id: 'dcf',          label: 'DCF Valuation', icon: TrendingUp },
  { id: 'fundamentals', label: 'Fundamentals',  icon: BarChart3  },
];

function PanelFallback({ height = '100%' }) {
  return (
    <div
      className="w-full animate-pulse rounded-md bg-[linear-gradient(90deg,rgba(30,41,59,0.18),rgba(51,65,85,0.30),rgba(30,41,59,0.18))]"
      style={{ height }}
    />
  );
}

export default function Stocks() {
  const { theme } = useTheme();
  const [symbol, setSymbol]   = useState(() => {
    const stored = localStorage.getItem('stockSymbol');
    if (stored) { localStorage.removeItem('stockSymbol'); return stored; }
    return 'AAPL';
  });
  const [input, setInput]     = useState(symbol);
  const [interval, setInterval_] = useState('1w');
  const [dateRange, setDateRange] = useState(DEFAULT_DATE_RANGE_BY_INTERVAL['1w']);
  const [klines, setKlines]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [fundamentals, setFundamentals] = useState(null);
  const [dcf, setDcf]               = useState(null);
  const [dcfLoading, setDcfLoading] = useState(false);

  // ── Resizable right column ───────────────────────────────────────────────
  const [rightColWidth, setRightColWidth] = useState(320);
  const dividerDragStartX = useRef(null);
  const dividerDragStartW = useRef(null);

  const onDividerMouseDown = useCallback((e) => {
    e.preventDefault();
    dividerDragStartX.current = e.clientX;
    dividerDragStartW.current = rightColWidth;
    const onMove = (ev) => {
      const delta = dividerDragStartX.current - ev.clientX;
      setRightColWidth(Math.max(220, Math.min(560, dividerDragStartW.current + delta)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [rightColWidth]);

  // ── Data fetching ────────────────────────────────────────────────────────
  const fetchKlines = async (sym, iv) => {
    const cacheKey = `${sym}:${iv}`;
    if (klinesCache.has(cacheKey)) { setKlines(klinesCache.get(cacheKey)); return; }
    setLoading(true);
    setKlines([]);
    setFetchError(null);
    try {
      const historyConfig = {
        '1m':  { interval: '1m',  range: '7d',   bars: 10080 },
        '5m':  { interval: '5m',  range: '60d',  bars: 2016  },
        '15m': { interval: '15m', range: '60d',  bars: 672   },
        '1h':  { interval: '1h',  range: '730d', bars: 2160  },
        '4h':  { interval: '4h',  range: '730d', bars: 2190  },
        '1d':  { interval: '1d',  range: '5y',   bars: 1825  },
        '1w':  { interval: '1w',  range: '5y',   bars: 260   },
      }[iv] || { interval: '1d', range: '5y', bars: 1825 };
      const res = await fetchStockHistory(sym, historyConfig);
      const sorted = res.sort((a, b) => a.time - b.time);
      if (sorted.length) klinesCache.set(cacheKey, sorted);
      setKlines(sorted);
    } catch (err) {
      console.error('Failed to fetch stock history:', err);
      setFetchError(`Could not load data for "${sym}". Check the ticker symbol is valid.`);
      setKlines([]);
    }
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchKlines(symbol, interval); }, [symbol, interval]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextSymbol = params.get('symbol');
    if (!nextSymbol) return;
    const normalized = normalizeStockSymbol(nextSymbol);
    setSymbol(normalized);
    setInput(normalized);
  }, []);

  useEffect(() => { setDcf(null); setFundamentals(null); }, [symbol]);

  const lastCandle = klines[klines.length - 1];

  const bg     = theme === 'light' ? 'hsl(210,20%,94%)'     : 'hsl(222,47%,9%)';
  const tabBg  = theme === 'light' ? '#ffffff'               : 'hsl(222,47%,11%)';
  const tabBorder = theme === 'light' ? 'hsl(210,20%,82%)' : 'hsl(217,33%,18%)';

  // ── Shared chart+indicator panel ─────────────────────────────────────────
  const ChartColumn = (
    <div className="relative h-full">
      <PriceChart
        mode="stock"
        klines={klines}
        loading={loading}
        symbol={symbol}
        interval={interval}
        dateRange={dateRange}
        onIntervalChange={(iv) => setInterval_(iv)}
        onDateRangeChange={(r) => setDateRange(r)}
      />
      {fetchError && !loading && !klines.length && (
        <div className="absolute inset-0 flex items-center justify-center z-20" style={{ background: 'rgba(10,15,28,0.85)' }}>
          <div className="text-center px-6 py-4 rounded-lg border border-red-500/30 bg-red-500/10 max-w-xs">
            <p className="text-red-400 text-sm font-medium mb-1">Failed to load chart</p>
            <p className="text-slate-400 text-xs">{fetchError}</p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex overflow-hidden" data-qt-theme={theme} style={{ background: bg, height: '100%', minHeight: 0 }}>
      {/* Watchlist sidebar */}
      <StocksWatchList
        activeSymbol={symbol}
        onSymbolChange={(sym) => { setSymbol(sym); setInput(sym); }}
        theme={theme}
      />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Company header */}
        <StockHeader
          symbol={symbol} input={input} setInput={setInput}
          setSymbol={setSymbol} setPanOffset={() => {}}
          klines={klines} loading={loading} theme={theme}
        />

        {/* Tab bar */}
        <div className="flex items-center gap-1 px-4 flex-shrink-0 overflow-x-auto"
          style={{ background: tabBg, borderBottom: `1px solid ${tabBorder}` }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-all flex-shrink-0 ${
                activeTab === id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-hidden">

          {/* ── SUMMARY tab ── */}
          {activeTab === 'summary' && (
            <div className="h-full flex p-[3px] min-h-0 overflow-hidden" style={{ gap: 0 }}>
              {/* Left: chart + indicators */}
              <div className="flex-1 min-w-0 min-h-0">
                {ChartColumn}
              </div>

              {/* Drag divider */}
              <div
                onMouseDown={onDividerMouseDown}
                style={{ width: 5, cursor: 'col-resize', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}
              >
                <div
                  style={{ width: 2, height: '100%', background: 'hsl(217,33%,22%)', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#3b82f6'}
                  onMouseLeave={e => e.currentTarget.style.background = 'hsl(217,33%,22%)'}
                />
              </div>

              {/* Right: AI Signal + DCF */}
              <div style={{ width: rightColWidth, flexShrink: 0 }} className="min-h-0 flex flex-col gap-[3px] overflow-auto">
                <div className="flex-1 min-h-0 overflow-auto">
                  <Suspense fallback={<PanelFallback />}>
                    <StockAISignal symbol={symbol} klines={klines} lastCandle={lastCandle} theme={theme} />
                  </Suspense>
                </div>
                <div className="flex-1 min-h-0 overflow-auto">
                  <Suspense fallback={<PanelFallback />}>
                    <IntrinsicValueCard
                      symbol={symbol} fundamentals={fundamentals}
                      dcf={dcf} setDcf={setDcf}
                      dcfLoading={dcfLoading} setDcfLoading={setDcfLoading}
                    />
                  </Suspense>
                </div>
              </div>
            </div>
          )}

          {/* ── CHART tab ── */}
          {activeTab === 'chart' && (
            <div className="h-full flex flex-col p-[3px] min-h-0 overflow-hidden">
              {ChartColumn}
            </div>
          )}

          {/* ── DCF tab ── */}
          {activeTab === 'dcf' && (
            <div className="h-full overflow-auto p-3">
              <div className="max-w-3xl mx-auto">
                <Suspense fallback={<PanelFallback height="420px" />}>
                  <IntrinsicValueCard
                    symbol={symbol} fundamentals={fundamentals}
                    dcf={dcf} setDcf={setDcf}
                    dcfLoading={dcfLoading} setDcfLoading={setDcfLoading}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {/* ── FUNDAMENTALS tab ── */}
          {activeTab === 'fundamentals' && (
            <div className="h-full overflow-auto p-3">
              <div className="max-w-3xl mx-auto h-full">
                <Suspense fallback={<PanelFallback height="420px" />}>
                  <FundamentalsCard symbol={symbol} onFundamentalsLoaded={setFundamentals} />
                </Suspense>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
