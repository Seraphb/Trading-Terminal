import React, { Suspense, lazy, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTheme } from '../components/ThemeContext';
import { format } from 'date-fns';
import { fetchStockHistory, normalizeStockSymbol } from '@/api/stockMarketClient';
import { BarChart3, TrendingUp, Activity, BookOpen, RefreshCw } from 'lucide-react';
import StocksWatchList from '../components/stocks/StocksWatchList';
import SharedCandleChart, { PRICE_CHART_MARGIN } from '@/components/charts/SharedCandleChart';
import DrawingToolbar from '@/components/charts/DrawingToolbar';
import DrawingLayer from '@/components/charts/DrawingLayer';
import MovingAverageControls from '@/components/charts/MovingAverageControls';
import { CHART_INTERVALS, CHART_DATE_RANGES, DATE_RANGES_BY_INTERVAL, DEFAULT_DATE_RANGE_BY_INTERVAL, rangeToCount } from '@/components/charts/chartConfig';
import { createDefaultMovingAverages, enrichChartDataWithMovingAverages, getMovingAverageLineConfig } from '@/components/charts/movingAverages';
import { formatAssetPrice } from '@/lib/assetPriceFormat';

const AVAILABLE_INDICATORS = [
  { key: 'vumanchu', label: 'VuManChu Cipher B', desc: 'Momentum divergence oscillator' },
  { key: 'wyckoff',  label: 'Wyckoff Flow',      desc: 'Smart money accumulation / distribution' },
];
import StockHeader from '../components/stocks/StockHeader';

const StockVMC = lazy(() => import('../components/stocks/StockVMC'));
const WyckoffIndicator = lazy(() => import('../components/terminal/WyckoffIndicator'));
const SniperStrategyModal = lazy(() => import('../components/terminal/SniperStrategyModal'));
const IntrinsicValueCard = lazy(() => import('../components/stocks/IntrinsicValueCard'));
const FundamentalsCard = lazy(() => import('../components/stocks/FundamentalsCard'));
const StockAISignal = lazy(() => import('../components/stocks/StockAISignal'));

const ZOOM_MIN = 10, ZOOM_MAX = 500;

const klinesCache = new Map(); // symbol+interval → klines array

const TABS = [
  { id: 'summary', label: 'Summary', icon: BookOpen },
  { id: 'chart',   label: 'Chart & VMC', icon: Activity },
  { id: 'dcf',     label: 'DCF Valuation', icon: TrendingUp },
  { id: 'fundamentals', label: 'Fundamentals', icon: BarChart3 },
];

function PanelFallback({ height = '100%' }) {
  return (
    <div
      className="w-full animate-pulse rounded-md bg-[linear-gradient(90deg,rgba(30,41,59,0.18),rgba(51,65,85,0.30),rgba(30,41,59,0.18))]"
      style={{ height }}
    />
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Stocks() {
  const { theme } = useTheme();
  const [symbol, setSymbol] = useState('AAPL');
  const [input, setInput] = useState('AAPL');
  const [interval, setInterval_] = useState('1w');
  const [klines, setKlines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(80);
  const [panOffset, setPanOffset] = useState(0);
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });
  const [priceAxisPan, setPriceAxisPan] = useState(0);
  const [priceZoom, setPriceZoom] = useState(1);
  const [movingAverages, setMovingAverages] = useState(() => createDefaultMovingAverages());
  const [fundamentals, setFundamentals] = useState(null);
  const [visibleRange, setVisibleRange] = useState([0, 0]);
  const [activeTab, setActiveTab] = useState('summary');
  const [dcf, setDcf] = useState(null);
  const [dcfLoading, setDcfLoading] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState(['vumanchu']);
  const [showIndMenu, setShowIndMenu]           = useState(false);
  const [showStrategy, setShowStrategy]         = useState(false);
  const [indSearch, setIndSearch]               = useState('');
  const [dateRange, setDateRange] = useState(DEFAULT_DATE_RANGE_BY_INTERVAL['1w']);
  const [inspectionGuide, setInspectionGuide] = useState(null);
  const [drawingTool, setDrawingTool] = useState('cursor');
  const [drawings, setDrawings] = useState([]);

  // ── Interaction refs ──────────────────────────────────────────────────────
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartOffset = useRef(0);
  const dragStartY = useRef(0);
  const dragStartPriceAxisPan = useRef(0);
  const dragStartVisibleCount = useRef(80);
  const dragStartPriceZoom = useRef(1);
  const containerRef = useRef(null);
  const dragAxisRef = useRef(null);
  // Stable value refs — keep in sync so callbacks never go stale
  const visibleCountRef = useRef(visibleCount);
  const klineLengthRef = useRef(0);
  const priceMaxRef = useRef(0);
  const priceMinRef = useRef(0);
  const priceZoomRef = useRef(priceZoom);
  const panOffsetRef = useRef(0);
  const priceAxisPanRef = useRef(0);
  const svgSizeRef = useRef({ width: 0, height: 0 });
  // Pinch-to-zoom
  const pinchStartDist = useRef(0);
  const pinchStartVC = useRef(80);

  const fetchKlines = async (sym, iv) => {
    const cacheKey = `${sym}:${iv}`;
    if (klinesCache.has(cacheKey)) {
      setKlines(klinesCache.get(cacheKey));
      return;
    }
    setLoading(true);
    try {
      const historyConfig = {
        '1m': { interval: '1m', range: '7d', bars: 10080 },
        '5m': { interval: '5m', range: '60d', bars: 2016 },
        '15m': { interval: '15m', range: '60d', bars: 672 },
        '1h': { interval: '1h', range: '730d', bars: 2160 },
        '4h': { interval: '4h', range: '730d', bars: 2190 },
        '1d': { interval: '1d', range: '5y', bars: 1825 },
        '1w': { interval: '1w', range: '5y', bars: 260 },
      }[iv] || { interval: '1d', range: '5y', bars: 1825 };

      const res = await fetchStockHistory(sym, historyConfig);
      const sorted = res.sort((a, b) => a.time - b.time);
      klinesCache.set(cacheKey, sorted);
      setKlines(sorted);
    } catch (err) {
      console.error('Failed to fetch stock history:', err);
      setKlines([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchKlines(symbol, interval); }, [symbol, interval]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextSymbol = params.get('symbol');
    if (!nextSymbol) return;
    const normalized = normalizeStockSymbol(nextSymbol);
    setSymbol(normalized);
    setInput(normalized);
  }, []);
  // Reset DCF when symbol changes
  useEffect(() => { setDcf(null); setFundamentals(null); }, [symbol]);

  // ── Sync value refs (so interaction callbacks never go stale) ────────────
  useEffect(() => { visibleCountRef.current = visibleCount; }, [visibleCount]);
  useEffect(() => { klineLengthRef.current = klines.length; }, [klines.length]);
  useEffect(() => { priceZoomRef.current = priceZoom; }, [priceZoom]);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);
  useEffect(() => { priceAxisPanRef.current = priceAxisPan; }, [priceAxisPan]);

  useEffect(() => {
    const allowedRanges = DATE_RANGES_BY_INTERVAL[interval] || CHART_DATE_RANGES;
    if (!allowedRanges.includes(dateRange)) {
      setDateRange(DEFAULT_DATE_RANGE_BY_INTERVAL[interval] || allowedRanges[0] || 'All');
    }
    setPanOffset(0);
    setPriceAxisPan(0);
    setPriceZoom(1);
  }, [symbol, interval, dateRange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const s = { width: el.offsetWidth, height: el.offsetHeight };
      setSvgSize(s);
      svgSizeRef.current = s;
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeTab]);

  const { chartData, priceMin, priceMax, startIdx, endIdx, rightPad } = useMemo(() => {
    if (!klines.length) return { chartData: [], priceMin: 0, priceMax: 0, startIdx: 0, endIdx: 0 };
    const totalLen         = klines.length;
    // rightPad: blank slots on the right when panned past the last candle
    const rightPad         = panOffset < 0 ? Math.min(-panOffset, Math.floor(visibleCount / 2)) : 0;
    const dataSlotsVisible = visibleCount - rightPad;
    const clampedPan       = panOffset >= 0
      ? Math.min(panOffset, Math.max(0, totalLen - dataSlotsVisible))
      : 0;
    const endIdx   = totalLen - clampedPan;
    const startIdx = Math.max(0, endIdx - dataSlotsVisible);
    const slice    = klines.slice(startIdx, endIdx);
    const timeFmt = ['1d', '1w'].includes(interval) ? 'MMM dd yy' : interval === '4h' ? 'MM/dd HH:mm' : 'HH:mm';
    const axisFmt = ['1d', '1w'].includes(interval) ? 'MMM yy' : interval === '4h' ? 'MM/dd HH:mm' : 'HH:mm';
    const baseChartData = slice.map((k) => ({
      ...k,
      timeStr: format(new Date(k.time), timeFmt),
      axisTimeStr: format(new Date(k.time), axisFmt),
    }));
    const enriched = enrichChartDataWithMovingAverages({
      slice: baseChartData,
      fullData: klines,
      startIdx,
      averages: movingAverages,
    });
    // Append blank placeholder slots so the chart allocates space on the right
    const blanks    = Array.from({ length: rightPad }, () => ({ isBlank: true }));
    const chartData = [...enriched, ...blanks];
    let pMin = slice[0].low, pMax = slice[0].high;
    for (let i = 1; i < slice.length; i++) {
      if (slice[i].low  < pMin) pMin = slice[i].low;
      if (slice[i].high > pMax) pMax = slice[i].high;
    }
    pMin *= 0.9992; pMax *= 1.0008;
    return { chartData, priceMin: pMin, priceMax: pMax, startIdx, endIdx, rightPad };
  }, [klines, visibleCount, panOffset, interval, movingAverages]);

  useEffect(() => setVisibleRange([startIdx, endIdx]), [startIdx, endIdx]);
  useEffect(() => {
    if (!klines.length) return;
    const count = rangeToCount(dateRange, interval, klines.length) ?? Math.min(80, klines.length);
    setVisibleCount(count);
    setPanOffset(0);
  }, [dateRange, interval, klines.length]);
  useEffect(() => { setInspectionGuide(null); }, [symbol, interval, dateRange, startIdx, endIdx]);
  // Keep price range refs in sync (written inline — runs every render, harmless)
  priceMaxRef.current = priceMax;
  priceMinRef.current = priceMin;

  // ── Mouse interaction handlers ────────────────────────────────────────────
  const onMouseDown = useCallback((e) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    dragStartOffset.current = panOffsetRef.current;
    dragStartPriceAxisPan.current = priceAxisPanRef.current;
    dragStartVisibleCount.current = visibleCountRef.current;
    dragStartPriceZoom.current = priceZoomRef.current;
    dragAxisRef.current = null;
    e.preventDefault();
  }, []);

  const onMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    const { width: sw, height: sh } = svgSizeRef.current;
    const plotW = (sw || 600) - PRICE_CHART_MARGIN.right;
    const plotH = (sh || 400) - PRICE_CHART_MARGIN.top - PRICE_CHART_MARGIN.bottom;
    const containerRect = containerRef.current?.getBoundingClientRect();
    const inPlotArea = containerRect &&
      e.clientX >= containerRect.left + PRICE_CHART_MARGIN.left &&
      e.clientX <= containerRect.left + PRICE_CHART_MARGIN.left + plotW &&
      e.clientY >= containerRect.top + PRICE_CHART_MARGIN.top &&
      e.clientY <= containerRect.top + PRICE_CHART_MARGIN.top + plotH;

    // pixelDeltaX: positive = dragged left, negative = dragged right
    const pixelDeltaX = dragStartX.current - e.clientX;
    const pixelDeltaY = e.clientY - dragStartY.current;

    if (!dragAxisRef.current) {
      const absX = Math.abs(pixelDeltaX), absY = Math.abs(pixelDeltaY);
      if (absX > 4 && absX > absY)      dragAxisRef.current = inPlotArea ? 'plot-x' : 'x';
      else if (absY > 4 && absY > absX) dragAxisRef.current = inPlotArea ? 'plot-y' : 'y';
      else return;
    }

    const startVC  = dragStartVisibleCount.current;
    const startPZ  = dragStartPriceZoom.current;
    const kl       = klineLengthRef.current;
    const pMax     = priceMaxRef.current;
    const pMin     = priceMinRef.current;

    if (dragAxisRef.current === 'plot-x') {
      // Pan: drag right = chart moves right (older data); drag left = newer / blank space on right
      const candleW     = plotW / startVC;
      const delta       = Math.round(-pixelDeltaX / candleW);
      const maxRightPad = Math.floor(startVC / 2);
      setPanOffset(Math.max(-maxRightPad, Math.min(dragStartOffset.current + delta, Math.max(0, kl - startVC))));
    }

    if (dragAxisRef.current === 'plot-y') {
      // Pan price axis vertically
      const pricePan = -(pixelDeltaY / plotH) * ((pMax - pMin) * startPZ);
      setPriceAxisPan(dragStartPriceAxisPan.current + pricePan);
    }

    if (dragAxisRef.current === 'x') {
      // TradingView date-axis zoom: exponential so there's zero drift
      // drag left  (pixelDeltaX > 0) → zoom out (more candles)
      // drag right (pixelDeltaX < 0) → zoom in  (fewer candles)
      const newVC = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX,
        Math.round(startVC * Math.exp(-pixelDeltaX / plotW * 2))));
      const countDelta = startVC - newVC;
      const newOffset  = Math.max(0, Math.min(
        dragStartOffset.current + Math.round(countDelta / 2),
        Math.max(0, kl - newVC)));
      setPanOffset(newOffset);
      setVisibleCount(newVC);
    }

    if (dragAxisRef.current === 'y') {
      // Price-axis zoom: drag up = stretch (zoom in), drag down = compact (zoom out)
      const newPZ = Math.max(0.3, Math.min(8,
        startPZ * Math.exp(pixelDeltaY / plotH * 2)));
      const centerRange = (pMax - pMin) * startPZ / 2;
      setPriceAxisPan(dragStartPriceAxisPan.current - (newPZ - startPZ) * centerRange / 2);
      setPriceZoom(newPZ);
    }
  }, []);

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
    dragAxisRef.current = null;
  }, []);

  // ── Touch / pinch-to-zoom ─────────────────────────────────────────────────
  const onTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist.current = Math.sqrt(dx * dx + dy * dy);
      pinchStartVC.current   = visibleCountRef.current;
    }
  }, []);

  const onTouchMove = useCallback((e) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    const dx   = e.touches[0].clientX - e.touches[1].clientX;
    const dy   = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (pinchStartDist.current > 0) {
      // pinch in  (dist shrinks) → zoom out (more candles)
      // pinch out (dist grows)   → zoom in  (fewer candles)
      const newVC = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX,
        Math.round(pinchStartVC.current * (pinchStartDist.current / dist))));
      setVisibleCount(newVC);
    }
  }, []);

  const onTouchEnd = useCallback(() => { pinchStartDist.current = 0; }, []);

  // ── Wheel zoom (scroll anywhere on chart) ─────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.08 : 0.92;
      setVisibleCount(prev => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(prev * factor))));
    };
    const pinchBlocker = (e) => { if (e.touches.length === 2) e.preventDefault(); };
    el.addEventListener('wheel', handler, { passive: false });
    el.addEventListener('touchstart', pinchBlocker, { passive: false });
    return () => {
      el.removeEventListener('wheel', handler);
      el.removeEventListener('touchstart', pinchBlocker);
    };
  }, [activeTab]);

  const lastCandle = klines[klines.length - 1];
  const prevCandle = klines[klines.length - 2];
  const priceChange = lastCandle && prevCandle ? ((lastCandle.close - prevCandle.close) / prevCandle.close * 100) : 0;
  const isUp = priceChange >= 0;
  const movingAverageLines = useMemo(() => getMovingAverageLineConfig(movingAverages), [movingAverages]);
  const resetChartView = useCallback(() => {
    const count = rangeToCount(dateRange, interval, klines.length) ?? Math.min(80, klines.length || 1);
    setVisibleCount(count);
    setPanOffset(0);
    setPriceAxisPan(0);
    setPriceZoom(1);
    setInspectionGuide(null);
  }, [dateRange, interval, klines.length]);

  const bg = theme === 'light' ? 'hsl(210,20%,94%)' : 'hsl(222,47%,9%)';
  const tabBg = theme === 'light' ? '#ffffff' : 'hsl(222,47%,11%)';
  const tabBorder = theme === 'light' ? 'hsl(210,20%,82%)' : 'hsl(217,33%,18%)';

  // ── Chart panel (shared between summary + chart tab) ─────────────────────
  const ChartPanel = (
    <div className="terminal-panel flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[hsl(217,33%,20%)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-white">{symbol}</span>
          {lastCandle?.close != null && (
            <>
              <span className={`font-mono-data text-base font-bold ${isUp ? 'text-emerald-400 glow-green' : 'text-red-400 glow-red'}`}>
                ${formatAssetPrice(lastCandle.close)}
              </span>
              <span className={`text-xs font-mono-data ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
                {isUp ? '+' : ''}{priceChange.toFixed(2)}%
              </span>
            </>
          )}
          {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />}
        </div>
        <div className="flex items-center gap-1">
          <MovingAverageControls averages={movingAverages} setAverages={setMovingAverages} />
          <div className="w-px h-4 bg-[hsl(217,33%,25%)] mx-1" />
          <button
            type="button"
            onClick={() => setShowStrategy(true)}
            className="px-2 py-0.5 text-xs rounded font-mono-data transition-all text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 border border-yellow-500/30 hover:border-yellow-400/50"
            title="Open Sniper Strategy — Multi-Timeframe Analysis"
          >
            ⚡ Strategy
          </button>
          <div className="w-px h-4 bg-[hsl(217,33%,25%)] mx-1" />
          {CHART_INTERVALS.map(iv => (
            <button key={iv}
              onClick={() => {
                setInterval_(iv);
                setPanOffset(0);
                const count = rangeToCount(dateRange, iv, klines.length);
                setVisibleCount(count);
              }}
              className={`px-2 py-0.5 text-xs rounded font-mono-data transition-all ${interval === iv ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-[hsl(217,33%,25%)]'}`}>
              {iv}
            </button>
          ))}
        </div>
      </div>

      {/* Chart canvas */}
      <div className="flex-1 min-h-0 flex" style={{ flex: '1.2 0 0%' }}>
        <DrawingToolbar
          activeTool={drawingTool}
          onToolChange={setDrawingTool}
          onClearAll={() => setDrawings([])}
          theme={theme}
        />
        <div ref={containerRef} className="flex-1 min-h-0 select-none overflow-hidden relative"
          onMouseDown={drawingTool === 'cursor' ? onMouseDown : undefined}
          onMouseMove={drawingTool === 'cursor' ? onMouseMove : undefined}
          onMouseUp={drawingTool === 'cursor' ? onMouseUp : undefined}
          onMouseLeave={drawingTool === 'cursor' ? onMouseUp : undefined}
          onTouchStart={drawingTool === 'cursor' ? onTouchStart : undefined}
          onTouchMove={drawingTool === 'cursor' ? onTouchMove : undefined}
          onTouchEnd={drawingTool === 'cursor' ? onTouchEnd : undefined}
          onDoubleClick={drawingTool === 'cursor' ? resetChartView : undefined}
          style={{ minHeight: 260, cursor: drawingTool !== 'cursor' ? 'crosshair' : (isDragging.current ? (dragAxisRef.current === 'x' ? 'ew-resize' : dragAxisRef.current === 'y' ? 'ns-resize' : 'grabbing') : 'crosshair'), touchAction: 'none' }}>
          {loading && !klines.length
            ? <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Loading chart…</div>
            : <SharedCandleChart chartData={chartData} priceMin={priceMin} priceMax={priceMax}
                width={svgSize.width} height={svgSize.height}
                emaLines={movingAverageLines}
                priceAxisPan={priceAxisPan}
                priceZoom={priceZoom} isDragging={isDragging.current} dragAxisRef={dragAxisRef.current}
                onCrosshairChange={setInspectionGuide}
                gridStroke={theme === 'light' ? 'hsl(217,20%,88%)' : 'hsl(217,33%,19%)'}
                gridOpacity={theme === 'light' ? 0.8 : 0.6}
                axisLabelColor={theme === 'light' ? '#64748b' : '#6b7280'}
                crosshairStroke={theme === 'light' ? 'rgba(100,116,139,0.5)' : 'rgba(148,163,184,0.4)'}
                crosshairBadgeFill={theme === 'light' ? '#1e3a5f' : '#1e293b'}
                crosshairBadgeStroke={theme === 'light' ? '#2563eb' : '#3b82f6'}
                crosshairTextColor={theme === 'light' ? '#93c5fd' : '#60a5fa'} />
          }
          <DrawingLayer
            activeTool={drawingTool}
            width={svgSize.width}
            height={svgSize.height}
            priceMin={priceMin}
            priceMax={priceMax}
            priceAxisPan={priceAxisPan}
            priceZoom={priceZoom}
            chartData={chartData}
            drawings={drawings}
            onAddDrawing={(d) => setDrawings((prev) => [...prev, d])}
            onRemoveDrawing={(id) => setDrawings((prev) => prev.filter((d) => d.id !== id))}
            theme={theme}
          />
        </div>
      </div>

      {/* TradingView-style date range selector */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-[hsl(217,33%,20%)] flex-shrink-0">
        <span className="text-[10px] text-slate-700 select-none">scroll · drag · pinch</span>
        <div className="flex items-center gap-0.5">
          {(DATE_RANGES_BY_INTERVAL[interval] || CHART_DATE_RANGES).map(r => (
            <button key={r}
              onClick={() => {
                const count = rangeToCount(r, interval, klines.length);
                setVisibleCount(count);
                setPanOffset(0);
                setDateRange(r);
              }}
              className={`px-2 py-0.5 rounded text-[10px] font-mono-data transition-all ${
                dateRange === r
                  ? 'bg-blue-600/80 text-white'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-[hsl(217,33%,23%)]'
              }`}>
              {r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const klinesWithTimeStr = useMemo(() => klines.map((k, i) => ({ ...k, timeStr: String(i) })), [klines]);

  const VMCPanel = (
    <div className="flex flex-col flex-shrink-0">
      {/* Dynamic indicator panels */}
      {activeIndicators.map(key => (
        <div key={key} className="flex-shrink-0 relative border-t border-[hsl(217,33%,18%)]"
          style={{ height: '180px' }}
          onMouseDown={e => e.stopPropagation()}
          onMouseMove={e => e.stopPropagation()}>
          <button
            onClick={() => setActiveIndicators(prev => prev.filter(k => k !== key))}
            className="absolute top-0.5 right-14 z-20 text-slate-700 hover:text-red-400 text-[11px] leading-none px-1 transition-colors"
            title="Remove indicator">✕</button>
          {key === 'vumanchu' && (
            <Suspense fallback={<PanelFallback />}>
              <StockVMC klines={klinesWithTimeStr} visibleRange={visibleRange} rightPad={rightPad} inspectionX={inspectionGuide?.plotX ?? null} />
            </Suspense>
          )}
          {key === 'wyckoff' && (
            <Suspense fallback={<PanelFallback />}>
              <WyckoffIndicator klines={klines} visibleRange={visibleRange} rightPad={rightPad} inspectionX={inspectionGuide?.plotX ?? null} />
            </Suspense>
          )}
        </div>
      ))}

      {/* Sniper Strategy Modal */}
      {showStrategy && (
        <Suspense fallback={null}>
          <SniperStrategyModal klines={klines} interval={interval} symbol={symbol} onClose={() => setShowStrategy(false)} />
        </Suspense>
      )}

      {/* Add indicator bar */}
      <div className="flex-shrink-0 relative border-t border-[hsl(217,33%,18%)]">
        <button
          onClick={() => setShowIndMenu(v => !v)}
          className="w-full py-1 text-[10px] text-slate-600 hover:text-slate-300 hover:bg-[hsl(217,33%,15%)] transition-all flex items-center justify-center gap-1 font-mono opacity-20 hover:opacity-100">
          <span className="text-sm leading-none">+</span> Add Indicator
        </button>
        {showIndMenu && (
          <div className="absolute bottom-full left-0 right-0 bg-[hsl(222,47%,12%)] border border-[hsl(217,33%,23%)] rounded-t shadow-2xl z-30 p-2">
            <input
              autoFocus
              value={indSearch}
              onChange={e => setIndSearch(e.target.value)}
              placeholder="Search indicators…"
              className="w-full bg-[hsl(217,33%,16%)] text-slate-300 text-xs px-2 py-1.5 rounded border border-[hsl(217,33%,27%)] mb-2 outline-none placeholder-slate-600"
            />
            {AVAILABLE_INDICATORS
              .filter(i => i.label.toLowerCase().includes(indSearch.toLowerCase()))
              .map(ind => (
                <button key={ind.key}
                  onClick={() => {
                    if (!activeIndicators.includes(ind.key))
                      setActiveIndicators(prev => [...prev, ind.key]);
                    setShowIndMenu(false);
                    setIndSearch('');
                  }}
                  disabled={activeIndicators.includes(ind.key)}
                  className={`w-full text-left px-2 py-1.5 rounded transition-all mb-0.5 ${
                    activeIndicators.includes(ind.key)
                      ? 'text-slate-700 cursor-default'
                      : 'text-slate-300 hover:bg-[hsl(217,33%,21%)] hover:text-white'
                  }`}>
                  <div className="text-xs font-medium">{ind.label}</div>
                  <div className="text-[10px] text-slate-600">{ind.desc}</div>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex overflow-hidden" data-qt-theme={theme} style={{ background: bg, height: '100%', minHeight: 0 }}>
      {/* Watchlist sidebar */}
      <StocksWatchList
        activeSymbol={symbol}
        onSymbolChange={(sym) => { setSymbol(sym); setInput(sym); setPanOffset(0); }}
        theme={theme}
      />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      {/* Company header */}
      <StockHeader
        symbol={symbol} input={input} setInput={setInput}
        setSymbol={setSymbol} setPanOffset={setPanOffset}
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
           <div className="h-full grid grid-cols-12 gap-[3px] p-[3px] min-h-0 overflow-hidden">
             {/* Left: chart + VMC */}
             <div className="col-span-12 lg:col-span-8 flex flex-col min-h-0 gap-[3px]">
              {ChartPanel}
              {VMCPanel}
             </div>
             {/* Right: AI Signal + DCF */}
             <div className="col-span-12 lg:col-span-4 min-h-0 flex flex-col gap-[3px] overflow-auto">
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
          <div className="h-full flex flex-col gap-[3px] p-[3px] min-h-0 overflow-hidden">
            {ChartPanel}
            {VMCPanel}
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
      </div> {/* end main content */}
    </div>
  );
}
