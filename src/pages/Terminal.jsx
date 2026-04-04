import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBinanceTicker, useBinanceKlines, useBinanceDepth, useBinanceTrades } from '../components/terminal/useBinanceWS';
import TickerBar from '../components/terminal/TickerBar';
import PriceChart from '../components/terminal/PriceChart';
import WatchList from '../components/terminal/WatchList';
import CryptoSearch from '../components/terminal/CryptoSearch';
import { useTheme } from '../components/ThemeContext';
import { getTerminalWatchlist, subscribeTerminalWatchlist } from '@/lib/watchlists';

const OrderBookHeatmap = lazy(() => import('../components/terminal/OrderBookHeatmap'));
const TradesFeed = lazy(() => import('../components/terminal/TradesFeed'));
const AISignalPanel = lazy(() => import('../components/terminal/AISignalPanel'));
const MacroIndicators = lazy(() => import('../components/terminal/MacroIndicators'));
const DepthChart = lazy(() => import('../components/terminal/DepthChart'));

function PanelFallback({ title, height = '100%' }) {
  return (
    <div className="terminal-panel flex h-full min-h-0 animate-pulse flex-col overflow-hidden" style={{ height }}>
      <div className="border-b border-[hsl(217,33%,20%)] px-3 py-2 text-[11px] font-semibold tracking-[0.18em] text-slate-600">
        {title}
      </div>
      <div className="flex-1 bg-[linear-gradient(90deg,rgba(30,41,59,0.25),rgba(51,65,85,0.35),rgba(30,41,59,0.25))]" />
    </div>
  );
}

export default function Terminal() {
  const [searchParams] = useSearchParams();
  const urlSymbol = searchParams.get('symbol');
  const [activeSymbol, setActiveSymbol] = useState(() => {
    if (urlSymbol) return urlSymbol.toLowerCase();
    const stored = localStorage.getItem('terminalSymbol');
    if (stored) { localStorage.removeItem('terminalSymbol'); return stored.toLowerCase(); }
    return 'btcusdt';
  });
  const [interval, setChartInterval]   = useState('1w');
  const [dateRange, setDateRange]      = useState('3Y');
  const [visibleRange, setVisibleRange] = useState(null);
  const [watchlistSymbols, setWatchlistSymbols] = useState(() => getTerminalWatchlist());
  const { theme } = useTheme();

  // React to URL symbol changes (e.g. navigating from Memes page or Pump Scanner)
  useEffect(() => {
    if (urlSymbol) setActiveSymbol(urlSymbol.toLowerCase());
  }, [urlSymbol]);

  useEffect(() => subscribeTerminalWatchlist(setWatchlistSymbols), []);

  const tickerSymbols = useMemo(() => {
    return Array.from(new Set([
      ...watchlistSymbols,
      activeSymbol?.toUpperCase(),
      'BTCUSDT',
      'ETHUSDT',
      'BNBUSDT',
      'SOLUSDT',
      'XRPUSDT',
      'DOGEUSDT',
      'ADAUSDT',
      'AVAXUSDT',
    ].filter(Boolean))).map((symbol) => symbol.toLowerCase());
  }, [activeSymbol, watchlistSymbols]);

  const tickers      = useBinanceTicker(tickerSymbols);
  const { klines, loading: klinesLoading } = useBinanceKlines(activeSymbol, interval);
  const depth        = useBinanceDepth(activeSymbol);
  const trades       = useBinanceTrades(activeSymbol);
  const currentTicker = tickers[activeSymbol.toUpperCase()];
  const lastPrice     = currentTicker?.price || klines[klines.length - 1]?.close || 0;

  const bg          = theme === 'light' ? 'hsl(210,20%,93%)' : 'hsl(222,47%,10%)';
  const borderColor = theme === 'light' ? 'hsl(210,20%,82%)' : 'hsl(217,33%,20%)';

  // ── Resizable right column ──────────────────────────────────────────────
  const [rightColWidth, setRightColWidth] = useState(280);
  const dragStartX   = useRef(null);
  const dragStartW   = useRef(null);

  const onDividerMouseDown = useCallback((e) => {
    e.preventDefault();
    dragStartX.current = e.clientX;
    dragStartW.current = rightColWidth;

    const onMove = (ev) => {
      const delta = dragStartX.current - ev.clientX; // drag left → wider right col
      const next = Math.max(200, Math.min(520, dragStartW.current + delta));
      setRightColWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [rightColWidth]);

  return (
    <div className="flex flex-col h-full overflow-hidden" data-qt-theme={theme} style={{ background: bg }}>

      {/* Ticker bar */}
      <div className="flex-shrink-0" style={{ borderBottom: `1px solid ${borderColor}` }}>
        <TickerBar />
      </div>

      {/* Main content */}
      <div
        className="flex-1 grid p-[2px] min-h-0 overflow-hidden"
        style={{ gridTemplateColumns: `170px 2px 1fr 5px ${rightColWidth}px`, gap: '2px', columnGap: 0 }}
      >

        {/* Left column — watchlist + order book */}
        <div className="flex flex-col gap-[2px] min-h-0">
          <div className="flex-1 min-h-0">
            <WatchList
              tickers={tickers}
              activeSymbol={activeSymbol}
              onSymbolChange={setActiveSymbol}
            />
          </div>
          <div className="flex-shrink-0" style={{ height: '120px' }}>
            <Suspense fallback={<PanelFallback title="ORDER BOOK" height="120px" />}>
              <OrderBookHeatmap depth={depth} lastPrice={lastPrice} />
            </Suspense>
          </div>
        </div>

        {/* Left column separator (fixed, no drag) */}
        <div style={{ width: 2, background: 'hsl(217,33%,20%)' }} />

        {/* Chart — takes all remaining horizontal space */}
        <div className="flex-1 min-w-0 min-h-0">
          <PriceChart
            klines={klines}
            loading={klinesLoading}
            symbol={activeSymbol}
            interval={interval}
            dateRange={dateRange}
            onIntervalChange={setChartInterval}
            onDateRangeChange={setDateRange}
            onVisibleRangeChange={setVisibleRange}
            tickers={tickers}
          />
        </div>

        {/* Drag divider between chart and right column */}
        <div
          onMouseDown={onDividerMouseDown}
          style={{
            width: 5,
            cursor: 'col-resize',
            background: 'transparent',
            position: 'relative',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{
            width: 2,
            height: '100%',
            background: 'hsl(217,33%,22%)',
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#3b82f6'}
            onMouseLeave={e => e.currentTarget.style.background = 'hsl(217,33%,22%)'}
          />
        </div>

        {/* Right column — narrow, stacked vertically */}
        <div className="flex flex-col gap-[2px] min-h-0 overflow-hidden">

          {/* Search stays pinned at top */}
          <div className="flex-shrink-0">
            <CryptoSearch activeSymbol={activeSymbol} onSymbolChange={setActiveSymbol} tickers={tickers} />
          </div>

          {/* Scrollable area: AI Signal → Macro → Depth */}
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[2px]">

            {/* AI Signal Engine */}
            <div style={{ minHeight: 380 }}>
              <Suspense fallback={<PanelFallback title="AI SIGNAL ENGINE" height="380px" />}>
                <AISignalPanel
                  symbol={activeSymbol}
                  klines={klines}
                  ticker={currentTicker}
                />
              </Suspense>
            </div>

            {/* Macro indicators */}
            <div>
              <Suspense fallback={<PanelFallback title="MACRO" height="120px" />}>
                <MacroIndicators tickers={tickers} />
              </Suspense>
            </div>

            {/* Depth chart */}
            <div style={{ height: 120, flexShrink: 0 }}>
              <Suspense fallback={<PanelFallback title="DEPTH" height="120px" />}>
                <DepthChart depth={depth} />
              </Suspense>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
