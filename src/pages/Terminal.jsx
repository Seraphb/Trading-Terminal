import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
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
  const [activeSymbol, setActiveSymbol] = useState(() => urlSymbol ? urlSymbol.toLowerCase() : 'btcusdt');
  const [interval, setChartInterval]   = useState('1w');
  const [dateRange, setDateRange]      = useState('3Y');
  const [visibleRange, setVisibleRange] = useState(null);
  const [watchlistSymbols, setWatchlistSymbols] = useState(() => getTerminalWatchlist());
  const { theme } = useTheme();

  // React to URL symbol changes (e.g. navigating from Memes page)
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

  return (
    <div className="flex flex-col h-full overflow-hidden" data-qt-theme={theme} style={{ background: bg }}>

      {/* Ticker bar */}
      <div className="flex-shrink-0" style={{ borderBottom: `1px solid ${borderColor}` }}>
        <TickerBar />
      </div>

      {/* Main content */}
      <div
        className="flex-1 grid gap-[2px] p-[2px] min-h-0 overflow-hidden"
        style={{ gridTemplateColumns: '170px minmax(0, 7fr) minmax(220px, 3fr)' }}
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

        {/* Right column — narrow, stacked vertically */}
        <div className="flex flex-col gap-[2px] min-h-0 overflow-hidden">

          <div className="flex-shrink-0">
            <CryptoSearch activeSymbol={activeSymbol} onSymbolChange={setActiveSymbol} tickers={tickers} />
          </div>

          {/* AI Signal — takes remaining vertical space */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <Suspense fallback={<PanelFallback title="AI SIGNAL ENGINE" />}>
              <AISignalPanel
                symbol={activeSymbol}
                klines={klines}
                ticker={currentTicker}
              />
            </Suspense>
          </div>

          <div className="flex-shrink-0">
            <Suspense fallback={<PanelFallback title="MACRO" height="120px" />}>
              <MacroIndicators tickers={tickers} />
            </Suspense>
          </div>

          <div className="flex-shrink-0" style={{ height: '120px' }}>
            <Suspense fallback={<PanelFallback title="DEPTH" height="120px" />}>
              <DepthChart depth={depth} />
            </Suspense>
          </div>


        </div>
      </div>
    </div>
  );
}
