import React, { Suspense, lazy, useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useTheme } from '@/components/ThemeContext';
import { format } from 'date-fns';
import { Star } from 'lucide-react';
import { getTerminalWatchlist, subscribeTerminalWatchlist, toggleTerminalWatchlistSymbol } from '@/lib/watchlists';
import SharedCandleChart, { PRICE_CHART_MARGIN, formatPriceTwoDecimals } from '@/components/charts/SharedCandleChart';
import DrawingToolbar from '@/components/charts/DrawingToolbar';
import DrawingLayer from '@/components/charts/DrawingLayer';
import MovingAverageControls from '@/components/charts/MovingAverageControls';
import OverlayControls from '@/components/charts/OverlayControls';
import { renderFibonacciOverlay, renderOpenInterestOverlay, renderLiquidationHeatmap, renderFairValueGaps, renderMACDOverlay, renderVolumeProfile } from '@/components/charts/chartOverlays';
import { CHART_INTERVALS, CHART_DATE_RANGES, DATE_RANGES_BY_INTERVAL, DEFAULT_DATE_RANGE_BY_INTERVAL, rangeToCount } from '@/components/charts/chartConfig';
import { createDefaultMovingAverages, createMovingAverage, enrichChartDataWithMovingAverages, getMovingAverageLineConfig } from '@/components/charts/movingAverages';
import { formatAssetPrice } from '@/lib/assetPriceFormat';
import { useOpenInterest, useFundingRate } from './useBinanceWS';

import AlertsWidget from './AlertsWidget';

const VuManChu = lazy(() => import('./VuManChu'));
const StockVMC = lazy(() => import('../stocks/StockVMC'));
const WyckoffIndicator = lazy(() => import('./WyckoffIndicator'));
const FundingRatePanel = lazy(() => import('./FundingRatePanel'));
const SniperStrategyModal = lazy(() => import('./SniperStrategyModal'));

const AVAILABLE_INDICATORS = [
  { key: 'vumanchu',     label: 'VuManChu Cipher B', desc: 'Momentum divergence oscillator' },
  { key: 'wyckoff',      label: 'Wyckoff Flow',       desc: 'Smart money accumulation / distribution' },
  { key: 'fundingRate',  label: 'Funding Rate',       desc: 'Perp futures 8h funding — green = negative (bullish), red = positive (bearish). Crypto only.', cryptoOnly: true },
];

function IndicatorFallback() {
  return <div className="h-full w-full animate-pulse bg-[linear-gradient(90deg,rgba(30,41,59,0.18),rgba(51,65,85,0.30),rgba(30,41,59,0.18))]" />;
}

// ── Resize handle between panels ─────────────────────────────────────────────
// Drag UP = indicator shrinks (chart gets bigger), drag DOWN = indicator grows.
// Uses capture phase for mouseup to avoid stopPropagation issues from child panels.
function ResizeHandle({ panelKey, heights, setHeights, panelRef }) {
  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = heights[panelKey] ?? 200;
    let currentH = startH;

    const onMove = (ev) => {
      ev.preventDefault();
      const delta = ev.clientY - startY;
      currentH = Math.max(80, Math.min(500, startH - delta));
      // Direct DOM mutation — zero React re-renders during drag
      if (panelRef?.current) panelRef.current.style.height = currentH + 'px';
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Sync to React state once on release
      setHeights((prev) => ({ ...prev, [panelKey]: currentH }));
    };
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
  };

  return (
    <div
      className="flex-shrink-0 relative z-10 group"
      style={{ height: 6, cursor: 'ns-resize' }}
      onMouseDown={handleMouseDown}
    >
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-[hsl(217,33%,18%)] group-hover:bg-blue-500/50 transition-colors" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-[3px] rounded-full bg-[hsl(217,33%,25%)] opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
const ZOOM_MIN = 10;
const ZOOM_MAX = 500;

function formatAxisPrice(value) {
  return formatAssetPrice(value);
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PriceChart({ klines, loading, symbol, interval, dateRange, onIntervalChange, onDateRangeChange, onVisibleRangeChange, goldSignalTime = null, goldSignalPrice = null, signals = null, tickers = {}, mode = 'crypto', highlightMA = null }) {
  const isStock = mode === 'stock';
  const { theme } = useTheme();
  const [visibleCount, setVisibleCount] = useState(100);
  const [panOffset, setPanOffset]       = useState(0);
  const [svgSize, setSvgSize]           = useState({ width: 0, height: 0 });
  const [priceAxisPan, setPriceAxisPan] = useState(0);
  const [priceZoom, setPriceZoom]       = useState(1);
  const [activeIndicators, setActiveIndicators] = useState(['vumanchu']);
  const [showMenu, setShowMenu]               = useState(false);
  const [showStrategy, setShowStrategy]       = useState(false);
  const [indSearch, setIndSearch]             = useState('');
  const [movingAverages, setMovingAverages] = useState(() => {
    const defaults = createDefaultMovingAverages();
    if (highlightMA) {
      // Check if the highlighted MA already exists in defaults
      const exists = defaults.some(ma => ma.type === highlightMA.type && ma.period === highlightMA.period);
      if (!exists) {
        // Add the screener-searched MA in gold color
        defaults.push(createMovingAverage(highlightMA.type, highlightMA.period, '#FFD700', true));
      } else {
        // It exists — change its color to gold so it stands out
        defaults.forEach(ma => {
          if (ma.type === highlightMA.type && ma.period === highlightMA.period) {
            ma.color = '#FFD700';
            ma.visible = true;
          }
        });
      }
    }
    return defaults;
  });
  const [activeOverlays, setActiveOverlays] = useState(['volume']);
  const [watchlistSymbols, setWatchlistSymbols] = useState(() => getTerminalWatchlist());
  const [inspectionGuide, setInspectionGuide] = useState(null);
  const [indicatorHeights, setIndicatorHeights] = useState({});
  const indicatorRefs = useRef({});
  const [drawingTool, setDrawingTool] = useState('cursor');
  const [drawings, setDrawings] = useState([]);

  // ── Interaction refs ────────────────────────────────────────────────────
  const isDragging           = useRef(false);
  const dragAxisRef          = useRef(null);
  const dragStartX           = useRef(0);
  const dragStartY           = useRef(0);
  const dragStartOffset      = useRef(0);
  const dragStartPriceAxisPan = useRef(0);
  const dragStartVisibleCount = useRef(100);
  const dragStartPriceZoom   = useRef(1);
  const containerRef         = useRef(null);
  // Stable value refs
  const visibleCountRef      = useRef(100);
  const klineLengthRef       = useRef(0);
  const priceMaxRef          = useRef(0);
  const priceMinRef          = useRef(0);
  const priceZoomRef         = useRef(1);
  const panOffsetRef         = useRef(0);
  const priceAxisPanRef      = useRef(0);
  const svgSizeRef           = useRef({ width: 0, height: 0 });
  // Pinch
  const pinchStartDist       = useRef(0);
  const pinchStartVC         = useRef(100);
  // rAF throttle
  const rafId                = useRef(0);

  // ── Sync refs ───────────────────────────────────────────────────────────
  useEffect(() => { visibleCountRef.current = visibleCount; },   [visibleCount]);
  useEffect(() => { klineLengthRef.current  = klines.length; },  [klines.length]);
  useEffect(() => { priceZoomRef.current    = priceZoom; },       [priceZoom]);
  useEffect(() => { panOffsetRef.current    = panOffset; },       [panOffset]);
  useEffect(() => { priceAxisPanRef.current = priceAxisPan; },    [priceAxisPan]);

  useEffect(() => {
    setPanOffset(0);
    setPriceAxisPan(0);
    setPriceZoom(1);

    const allowedRanges = DATE_RANGES_BY_INTERVAL[interval] || CHART_DATE_RANGES;
    if (!allowedRanges.includes(dateRange)) {
      onDateRangeChange(DEFAULT_DATE_RANGE_BY_INTERVAL[interval] || allowedRanges[0] || 'All');
    }
  }, [symbol, interval, dateRange, onDateRangeChange]);

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
  }, []);

  useEffect(() => subscribeTerminalWatchlist(setWatchlistSymbols), []);

  const applyDateRange = useCallback((nextRange) => {
    const count = rangeToCount(nextRange, interval, klines.length) ?? Math.min(100, klines.length || 1);
    setVisibleCount(count);
    setPanOffset(0);
    onDateRangeChange(nextRange);
  }, [interval, klines.length, onDateRangeChange]);

  const resetChartView = useCallback(() => {
    const nextCount = rangeToCount(dateRange, interval, klines.length) ?? Math.min(100, klines.length || 1);
    setVisibleCount(nextCount);
    setPanOffset(0);
    setPriceAxisPan(0);
    setPriceZoom(1);
    setInspectionGuide(null);
  }, [dateRange, interval, klines.length]);

  useEffect(() => {
    if (!klines.length) return;
    const nextCount = rangeToCount(dateRange, interval, klines.length) ?? Math.min(100, klines.length);
    setVisibleCount(nextCount);
    setPanOffset(0);
  }, [dateRange, interval, klines.length]);

  const { chartData, priceMin, priceMax, startIdx, endIdx, rightPad } = useMemo(() => {
    if (!klines.length) return { chartData: [], priceMin: 0, priceMax: 0, startIdx: 0, endIdx: 0 };
    const totalLen        = klines.length;
    // rightPad: blank candle slots appended on the right when user pans past the last candle
    const rightPad        = panOffset < 0 ? Math.min(-panOffset, Math.floor(visibleCount / 2)) : 0;
    const dataSlotsVisible = visibleCount - rightPad;
    const clampedPan      = panOffset >= 0
      ? Math.min(panOffset, Math.max(0, totalLen - dataSlotsVisible))
      : 0;
    const endIdx     = totalLen - clampedPan;
    const startIdx   = Math.max(0, endIdx - dataSlotsVisible);
    const slice      = klines.slice(startIdx, endIdx);
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
    const blanks = Array.from({ length: rightPad }, () => ({ isBlank: true }));
    const chartData = [...enriched, ...blanks];
    let pMin = slice[0].low, pMax = slice[0].high;
    for (let i = 1; i < slice.length; i++) {
      if (slice[i].low  < pMin) pMin = slice[i].low;
      if (slice[i].high > pMax) pMax = slice[i].high;
    }
    pMin *= 0.998; pMax *= 1.002;
    return { chartData, priceMin: pMin, priceMax: pMax, startIdx, endIdx, rightPad };
  }, [klines, visibleCount, panOffset, interval, movingAverages]);

  useEffect(() => {
    if (onVisibleRangeChange) onVisibleRangeChange([startIdx, endIdx]);
  }, [startIdx, endIdx, onVisibleRangeChange]);

  useEffect(() => {
    setInspectionGuide(null);
  }, [symbol, interval, dateRange, startIdx, endIdx]);

  // Keep price refs in sync (inline, runs every render)
  priceMaxRef.current = priceMax;
  priceMinRef.current = priceMin;

  // ── Mouse handlers ──────────────────────────────────────────────────────
  const onMouseDown = useCallback((e) => {
    const tag = e.target.tagName;
    if (!['svg', 'rect', 'line', 'g', 'polygon', 'polyline', 'text', 'path', 'circle'].includes(tag)) return;
    isDragging.current           = true;
    dragStartX.current           = e.clientX;
    dragStartY.current           = e.clientY;
    dragStartOffset.current      = panOffsetRef.current;
    dragStartPriceAxisPan.current = priceAxisPanRef.current;
    dragStartVisibleCount.current = visibleCountRef.current;
    dragStartPriceZoom.current   = priceZoomRef.current;
    dragAxisRef.current          = null;
    e.preventDefault();
  }, []);

  const onMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    // Snapshot values synchronously (React synthetic event is pooled)
    const cx = e.clientX, cy = e.clientY;
    if (rafId.current) return; // skip if a frame is already pending
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0;
      if (!isDragging.current) return;
      const { width: sw, height: sh } = svgSizeRef.current;
      const plotW = (sw || 600) - PRICE_CHART_MARGIN.right;
      const plotH = (sh || 400) - PRICE_CHART_MARGIN.top - PRICE_CHART_MARGIN.bottom;
      const containerRect = containerRef.current?.getBoundingClientRect();
      const inPlotArea = containerRect &&
        cx >= containerRect.left + PRICE_CHART_MARGIN.left &&
        cx <= containerRect.left + PRICE_CHART_MARGIN.left + plotW &&
        cy >= containerRect.top + PRICE_CHART_MARGIN.top &&
        cy <= containerRect.top + PRICE_CHART_MARGIN.top + plotH;

      const pixelDeltaX = dragStartX.current - cx;
      const pixelDeltaY = cy - dragStartY.current;

      if (!dragAxisRef.current) {
        const absX = Math.abs(pixelDeltaX), absY = Math.abs(pixelDeltaY);
        if (absX > 4 && absX > absY)      dragAxisRef.current = inPlotArea ? 'plot-x' : 'x';
        else if (absY > 4 && absY > absX) dragAxisRef.current = inPlotArea ? 'plot-y' : 'y';
        else return;
      }

      const startVC = dragStartVisibleCount.current;
      const startPZ = dragStartPriceZoom.current;
      const kl      = klineLengthRef.current;
      const pMax    = priceMaxRef.current;
      const pMin    = priceMinRef.current;

      if (dragAxisRef.current === 'plot-x') {
        const candleW    = plotW / startVC;
        const delta      = Math.round(-pixelDeltaX / candleW);
        const maxRightPad = Math.floor(startVC / 2);
        setPanOffset(Math.max(-maxRightPad, Math.min(dragStartOffset.current + delta, Math.max(0, kl - startVC))));
      }

      if (dragAxisRef.current === 'plot-y') {
        const pricePan = -(pixelDeltaY / plotH) * ((pMax - pMin) * startPZ);
        setPriceAxisPan(dragStartPriceAxisPan.current + pricePan);
      }

      if (dragAxisRef.current === 'x') {
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
        const newPZ = Math.max(0.3, Math.min(8,
          startPZ * Math.exp(pixelDeltaY / plotH * 2)));
        const centerRange = (pMax - pMin) * startPZ / 2;
        setPriceAxisPan(dragStartPriceAxisPan.current - (newPZ - startPZ) * centerRange / 2);
        setPriceZoom(newPZ);
      }
    });
  }, []);

  const onMouseUp = useCallback(() => {
    isDragging.current  = false;
    dragAxisRef.current = null;
    if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = 0; }
  }, []);

  // ── Touch / pinch-to-zoom ───────────────────────────────────────────────
  const onTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist.current = Math.sqrt(dx * dx + dy * dy);
      pinchStartVC.current   = visibleCountRef.current;
    } else if (e.touches.length === 1) {
      isDragging.current           = true;
      dragStartX.current           = e.touches[0].clientX;
      dragStartOffset.current      = panOffsetRef.current;
      dragStartVisibleCount.current = visibleCountRef.current;
      dragAxisRef.current          = 'plot-x';
    }
  }, []);

  const onTouchMove = useCallback((e) => {
    if (e.touches.length === 2) e.preventDefault();
    // Snapshot touch coords synchronously
    const touches = Array.from(e.touches).map(t => ({ clientX: t.clientX, clientY: t.clientY }));
    if (rafId.current) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0;
      if (touches.length === 2) {
        const dx   = touches[0].clientX - touches[1].clientX;
        const dy   = touches[0].clientY - touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (pinchStartDist.current > 0) {
          const newVC = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX,
            Math.round(pinchStartVC.current * (pinchStartDist.current / dist))));
          setVisibleCount(newVC);
        }
      } else if (touches.length === 1 && isDragging.current) {
        const { width: sw } = svgSizeRef.current;
        const plotW  = (sw || 600) - PRICE_CHART_MARGIN.right;
        const startVC = dragStartVisibleCount.current;
        const candleW = plotW / startVC;
        const delta       = Math.round((touches[0].clientX - dragStartX.current) / candleW);
        const maxRightPad = Math.floor(startVC / 2);
        setPanOffset(Math.max(-maxRightPad, Math.min(dragStartOffset.current + delta, Math.max(0, klineLengthRef.current - startVC))));
      }
    });
  }, []);

  const onTouchEnd = useCallback(() => {
    pinchStartDist.current = 0;
    isDragging.current     = false;
    dragAxisRef.current    = null;
    if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = 0; }
  }, []);

  // ── Wheel zoom (anywhere on chart) ─────────────────────────────────────
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
  }, []);

  // OI data — only fetch when overlay is active
  const isCrypto      = /usdt$/i.test(symbol ?? '');
  const oiEnabled     = activeOverlays.includes('openInterest');
  const { oiData: overlayOiData } = useOpenInterest(symbol, interval, oiEnabled);
  const fundingEnabled = activeIndicators.includes('fundingRate') && isCrypto;
  const fundingData    = useFundingRate(symbol, fundingEnabled);

  // Stable overlay key: only recompute overlays when the visible range or
  // zoom/pan actually changes — NOT on every WS price tick.
  // chartData.length changes when new candles arrive or visible range shifts.
  const overlayStableKey = `${chartData.length}|${startIdx}|${endIdx}|${priceZoom.toFixed(3)}|${priceAxisPan.toFixed(1)}|${svgSize.width}|${svgSize.height}`;

  const overlayElements = useMemo(() => {
    if (activeOverlays.length === 0 || !chartData.length || svgSize.width < 10 || svgSize.height < 10) return null;

    const plotW = svgSize.width - PRICE_CHART_MARGIN.left - PRICE_CHART_MARGIN.right;
    const plotH = svgSize.height - PRICE_CHART_MARGIN.top - PRICE_CHART_MARGIN.bottom;
    if (plotW <= 0 || plotH <= 0) return null;

    const candleCount = chartData.length;
    const scaledRange = (priceMax - priceMin) * (priceZoom || 1) || 1;
    const rangeMid = (priceMin + priceMax) / 2;
    const adjustedMin = rangeMid - scaledRange / 2 - priceAxisPan;
    const adjustedMax = rangeMid + scaledRange / 2 - priceAxisPan;
    const adjustedRange = adjustedMax - adjustedMin || 1;
    const toY = (price) => PRICE_CHART_MARGIN.top + plotH * (1 - (price - adjustedMin) / adjustedRange);
    const toX = (index) => PRICE_CHART_MARGIN.left + (index + 0.5) * (plotW / candleCount);
    const spacing = plotW / candleCount;

    const coords = { toX, toY, plotW, plotH, adjustedMin, adjustedMax, candleCount, spacing, marginTop: PRICE_CHART_MARGIN.top, marginRight: PRICE_CHART_MARGIN.right };
    const elements = [];

    if (activeOverlays.includes('liquidationHeatmap')) {
      const r = renderLiquidationHeatmap(chartData, coords);
      if (r) elements.push(<React.Fragment key="liq-heatmap">{r}</React.Fragment>);
    }
    if (activeOverlays.includes('openInterest')) {
      const r = renderOpenInterestOverlay(chartData, overlayOiData, coords);
      if (r) elements.push(<React.Fragment key="oi-overlay">{r}</React.Fragment>);
    }
    if (activeOverlays.includes('autoFib')) {
      const r = renderFibonacciOverlay(chartData, coords);
      if (r) elements.push(<React.Fragment key="fib-overlay">{r}</React.Fragment>);
    }
    if (activeOverlays.includes('fvg')) {
      const r = renderFairValueGaps(chartData, coords);
      if (r) elements.push(<React.Fragment key="fvg-overlay">{r}</React.Fragment>);
    }
    if (activeOverlays.includes('macd')) {
      const r = renderMACDOverlay(chartData, coords);
      if (r) elements.push(<React.Fragment key="macd-overlay">{r}</React.Fragment>);
    }
    if (activeOverlays.includes('vpvr')) {
      const r = renderVolumeProfile(chartData, coords);
      if (r) elements.push(<React.Fragment key="vpvr-overlay">{r}</React.Fragment>);
    }
    return elements.length > 0 ? <>{elements}</> : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayStableKey, activeOverlays, overlayOiData]);

  // ── Signal markers (all buy signals from scanner — gold + green) ──
  const signalMarkerOverlay = useMemo(() => {
    // Support both legacy single-signal props and new signals array
    const hasSignals = signals && signals.length > 0;
    const hasLegacy = goldSignalTime != null;
    if (!hasSignals && !hasLegacy) return null;
    if (!chartData.length || svgSize.width < 10 || svgSize.height < 10) return null;

    const plotW = svgSize.width  - PRICE_CHART_MARGIN.left - PRICE_CHART_MARGIN.right;
    const plotH = svgSize.height - PRICE_CHART_MARGIN.top  - PRICE_CHART_MARGIN.bottom;
    if (plotW <= 0 || plotH <= 0) return null;

    const candleCount  = chartData.length;
    const scaledRange  = (priceMax - priceMin) * (priceZoom || 1) || 1;
    const rangeMid     = (priceMin + priceMax) / 2;
    const adjMin       = rangeMid - scaledRange / 2 - priceAxisPan;
    const adjMax       = rangeMid + scaledRange / 2 - priceAxisPan;
    const adjRange     = adjMax - adjMin || 1;
    const toY  = (p) => PRICE_CHART_MARGIN.top + plotH * (1 - (p - adjMin) / adjRange);
    const toX  = (i) => PRICE_CHART_MARGIN.left + (i + 0.5) * (plotW / candleCount);

    // Build signal list: prefer new array, fall back to legacy single marker
    const signalList = hasSignals
      ? signals
      : [{ time: goldSignalTime, price: goldSignalPrice, type: 'gold' }];

    const COLORS = {
      gold:  { fill: '#eab308', stroke: 'rgba(255,255,255,0.85)', line: '#eab308', bg: 'rgba(20,14,0,0.82)', text: '#eab308', icon: '★' },
      green: { fill: '#22c55e', stroke: 'rgba(255,255,255,0.85)', line: '#22c55e', bg: 'rgba(0,20,5,0.82)',  text: '#22c55e', icon: '▲' },
    };

    // Find the chart candle closest to a signal time (handles minor timestamp differences)
    const findClosestCandle = (sigTime) => {
      let bestIdx = -1, bestDist = Infinity;
      for (let j = 0; j < chartData.length; j++) {
        if (chartData[j].isBlank) continue;
        const dist = Math.abs(chartData[j].time - sigTime);
        if (dist < bestDist) { bestDist = dist; bestIdx = j; }
      }
      // Accept if within 7 days (covers weekly candle alignment diffs)
      return bestDist <= 7 * 24 * 60 * 60 * 1000 ? bestIdx : -1;
    };

    const markers = [];
    for (const sig of signalList) {
      // Try exact match first, fall back to closest candle
      let idx = chartData.findIndex((d) => !d.isBlank && d.time === sig.time);
      if (idx < 0) idx = findClosestCandle(sig.time);
      if (idx < 0) continue;

      const c = COLORS[sig.type] || COLORS.green;
      const price = sig.price ?? chartData[idx]?.close;
      const gx = toX(idx);
      const gy = toY(price);
      const labelW = 60;
      const labelH = 16;
      const labelY = gy - 34;
      const priceLabelStr = formatAxisPrice(price);
      const isGold = sig.type === 'gold';

      markers.push(
        <g key={`signal-${sig.type}-${sig.time}`}>
          {/* Vertical dashed line */}
          <line
            x1={gx} x2={gx}
            y1={PRICE_CHART_MARGIN.top} y2={PRICE_CHART_MARGIN.top + plotH}
            stroke={c.line} strokeWidth={isGold ? 1.5 : 1} strokeDasharray="5,4" opacity={isGold ? 0.65 : 0.45}
          />
          {/* Signal circle */}
          <circle cx={gx} cy={gy} r={isGold ? 9 : 7} fill={c.fill} stroke={c.stroke} strokeWidth={1.5} opacity={0.97} />
          <text x={gx} y={gy + (isGold ? 4 : 3)} textAnchor="middle" fill="#fff" fontSize={isGold ? 10 : 8} fontWeight="bold" fontFamily="sans-serif">
            {c.icon}
          </text>
          {/* Price label above circle */}
          <rect
            x={gx - labelW / 2} y={labelY}
            width={labelW} height={labelH}
            fill={c.bg} stroke={c.fill} strokeWidth={0.8} rx={3}
          />
          <text
            x={gx} y={labelY + labelH - 3}
            textAnchor="middle" fill={c.text}
            fontSize={9} fontFamily="'JetBrains Mono', monospace" fontWeight="700"
          >
            {priceLabelStr}
          </text>
        </g>
      );
    }

    return markers.length > 0 ? <>{markers}</> : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayStableKey, goldSignalTime, goldSignalPrice, signals]);

  const lastPrice  = klines[endIdx - 1]?.close;
  const openPrice  = klines[startIdx]?.close;
  const priceChange = lastPrice && openPrice ? ((lastPrice - openPrice) / openPrice * 100) : 0;
  const isUp = priceChange >= 0;
  const normalizedSymbol = symbol?.toUpperCase();
  const inWatchlist = watchlistSymbols.includes(normalizedSymbol);
  const availableDateRanges = DATE_RANGES_BY_INTERVAL[interval] || CHART_DATE_RANGES;
  const movingAverageLines = useMemo(() => getMovingAverageLineConfig(movingAverages), [movingAverages]);
  const klinesWithTimeStr = useMemo(() => klines.map((k, i) => ({ ...k, timeStr: String(i) })), [klines]);

  return (
    <div className="terminal-panel flex flex-col h-full" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[hsl(217,33%,20%)] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {!isStock && (
              <button
                type="button"
                onClick={() => toggleTerminalWatchlistSymbol(normalizedSymbol)}
                className="transition-transform hover:scale-110"
                title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
              >
                <Star
                  className="w-3.5 h-3.5"
                  fill={inWatchlist ? '#eab308' : 'none'}
                  style={{ color: inWatchlist ? '#eab308' : '#64748b' }}
                />
              </button>
            )}
            <h2 className="text-sm font-semibold text-white">
              {isStock ? symbol?.toUpperCase() : symbol?.replace('USDT', '/USDT')?.toUpperCase()}
            </h2>
          </div>
          <span className={`font-mono-data text-base font-bold ${isUp ? 'text-emerald-400 glow-green' : 'text-red-400 glow-red'}`}>
            ${formatAssetPrice(lastPrice)}
          </span>
          <span className={`text-xs font-mono-data ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
            {isUp ? '+' : ''}{priceChange.toFixed(3)}%
          </span>
        </div>
        <div className="flex items-center gap-1">
          <MovingAverageControls averages={movingAverages} setAverages={setMovingAverages} />
          <div className="w-px h-4 bg-[hsl(217,33%,25%)] mx-0.5" />
          <OverlayControls activeOverlays={activeOverlays} setActiveOverlays={setActiveOverlays} isCrypto={isCrypto} />
          <div className="w-px h-4 bg-[hsl(217,33%,25%)] mx-0.5" />
          <button
            type="button"
            onClick={() => setShowStrategy(true)}
            className="px-2 py-0.5 text-xs rounded font-mono-data transition-all text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 border border-yellow-500/30 hover:border-yellow-400/50"
            title="Open Sniper Strategy — Multi-Timeframe Analysis"
          >
            ⚡ Strategy
          </button>
          {!isStock && <AlertsWidget tickers={tickers} symbol={symbol?.toUpperCase()} />}
          <div className="w-px h-4 bg-[hsl(217,33%,25%)] mx-0.5" />
          {CHART_INTERVALS.map(iv => (
            <button key={iv} onClick={() => {
              onIntervalChange(iv);
              setPanOffset(0);
            }}
              className={`px-2 py-0.5 text-xs rounded font-mono-data transition-all ${
                interval === iv ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-[hsl(217,33%,25%)]'
              }`}>
              {iv}
            </button>
          ))}
        </div>
      </div>

      {/* Wrapper for chart + date range + indicators — unified crosshair lives here */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {inspectionGuide && (
          <div style={{
            position: 'absolute',
            top: 0, bottom: 0,
            left: 36 + inspectionGuide.plotX,
            width: 1,
            background: 'rgba(148,163,184,0.35)',
            pointerEvents: 'none',
            zIndex: 50,
          }} />
        )}

      {/* Chart canvas */}
      <div className="flex-1 min-h-0 flex" style={{ flex: '1.2 0 0%' }}>
        <DrawingToolbar
          activeTool={drawingTool}
          onToolChange={setDrawingTool}
          onClearAll={() => setDrawings([])}
          theme={theme}
        />
        <div
          ref={containerRef}
          className="flex-1 min-h-0 select-none overflow-hidden relative"
          style={{ minHeight: 260, cursor: drawingTool !== 'cursor' ? 'crosshair' : (isDragging.current ? (dragAxisRef.current === 'x' ? 'ew-resize' : dragAxisRef.current === 'y' ? 'ns-resize' : 'grabbing') : 'crosshair'), touchAction: 'none' }}
          onMouseDown={drawingTool === 'cursor' ? onMouseDown : undefined}
          onMouseMove={drawingTool === 'cursor' ? onMouseMove : undefined}
          onMouseUp={drawingTool === 'cursor' ? onMouseUp : undefined}
          onMouseLeave={drawingTool === 'cursor' ? onMouseUp : undefined}
          onTouchStart={drawingTool === 'cursor' ? onTouchStart : undefined}
          onTouchMove={drawingTool === 'cursor' ? onTouchMove : undefined}
          onTouchEnd={drawingTool === 'cursor' ? onTouchEnd : undefined}
          onDoubleClick={drawingTool === 'cursor' ? resetChartView : undefined}
        >
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center" style={{ background: 'rgba(10,15,28,0.85)' }}>
              <div className="flex flex-col items-center gap-3">
                <svg className="animate-spin h-7 w-7 text-blue-500" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <span className="text-xs text-slate-500 font-mono">Loading chart data…</span>
              </div>
            </div>
          )}
          <SharedCandleChart
            chartData={chartData}
            priceMin={priceMin}
            priceMax={priceMax}
            width={svgSize.width}
            height={svgSize.height}
            emaLines={movingAverageLines}
            overlayElements={overlayElements}
            topOverlay={signalMarkerOverlay}
            showVolume={activeOverlays.includes('volume')}
            priceAxisPan={priceAxisPan}
            priceZoom={priceZoom}
            isDragging={isDragging.current}
            dragAxisRef={dragAxisRef.current}
            onCrosshairChange={setInspectionGuide}
            axisPriceFormatter={formatAxisPrice}
            lastPriceFormatter={formatAxisPrice}
            crosshairPriceFormatter={formatPriceTwoDecimals}
            bullColor="#10b981"
            bearColor="#ef4444"
            volumeBullFill="rgba(16,185,129,0.25)"
            volumeBearFill="rgba(239,68,68,0.25)"
            gridStroke={theme === 'light' ? 'hsl(217,20%,88%)' : 'hsl(217,33%,19%)'}
            gridOpacity={theme === 'light' ? 0.8 : 0.6}
            axisLabelColor={theme === 'light' ? '#64748b' : '#6b7280'}
            crosshairStroke={theme === 'light' ? 'rgba(100,116,139,0.5)' : 'rgba(148,163,184,0.4)'}
            crosshairBadgeFill={theme === 'light' ? '#1e3a5f' : '#1e293b'}
            crosshairBadgeStroke={theme === 'light' ? '#2563eb' : '#3b82f6'}
            crosshairTextColor={theme === 'light' ? '#93c5fd' : '#60a5fa'}
          />
          {/* Active overlay labels — top-left of chart */}
          {activeOverlays.length > 0 && !loading && chartData.length > 0 && (
            <div className="absolute top-3 left-2 z-[5] flex flex-wrap gap-x-2 gap-y-0.5 pointer-events-auto" style={{ maxWidth: '60%' }}>
              {activeOverlays.map((key) => {
                const label = { volume: 'Vol', liquidationHeatmap: 'Liq Heatmap', openInterest: 'OI', autoFib: 'Fib', fvg: 'FVG', macd: 'MACD' }[key] || key;
                const color = { volume: '#64748b', liquidationHeatmap: '#f97316', openInterest: '#a855f7', autoFib: '#facc15', fvg: '#06b6d4', macd: '#f59e0b' }[key] || '#94a3b8';
                return (
                  <span
                    key={key}
                    className="inline-flex items-center gap-0.5 text-[9px] leading-none opacity-60 hover:opacity-100 transition-opacity cursor-default group"
                    style={{ color }}
                  >
                    <span className="font-medium">{label}</span>
                    <button
                      type="button"
                      className="ml-0 text-[8px] opacity-0 group-hover:opacity-80 hover:!opacity-100 transition-opacity"
                      style={{ color }}
                      onClick={(e) => { e.stopPropagation(); setActiveOverlays((prev) => prev.filter((k) => k !== key)); }}
                      title={`Remove ${label}`}
                    >
                      ✕
                    </button>
                  </span>
                );
              })}
            </div>
          )}
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

      {/* Date range selector directly under chart */}
      <div
        className="relative z-[80] isolate pointer-events-auto flex items-center justify-between px-3 py-1 border-t border-[hsl(217,33%,20%)] flex-shrink-0"
        style={{ background: 'var(--qt-panel)' }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-dot" />
          <span className="text-[10px] text-slate-500">LIVE</span>
          <span className="text-[10px] text-slate-700 ml-1">· scroll · drag · pinch</span>
        </div>
        <div className="relative z-[81] flex items-center gap-0.5 pointer-events-auto">
          {availableDateRanges.map(r => (
            <button
              key={r}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                applyDateRange(r);
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                applyDateRange(r);
              }}
              className={`relative z-[82] pointer-events-auto px-2 py-0.5 rounded text-[10px] font-mono-data transition-all ${
                dateRange === r
                  ? 'bg-blue-600/80 text-white'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-[hsl(217,33%,23%)]'
              }`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* ── Indicator panels — scrollable so they never crush the price chart ── */}
      {/* flex-shrink:1 + min-height:0 lets this section compress and scroll    */}
      {/* instead of stealing height from the chart above.                       */}
      {activeIndicators.length > 0 && (
        <div
          style={{ flexShrink: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}
          onMouseDown={e => e.stopPropagation()}
          onMouseMove={e => e.stopPropagation()}
          onMouseUp={e => e.stopPropagation()}
        >
          {activeIndicators.map((key) => {
            const h = indicatorHeights[key] ?? 200;
            if (!indicatorRefs.current[key]) indicatorRefs.current[key] = { current: null };
            const panelRef = indicatorRefs.current[key];
            return (
              <React.Fragment key={key}>
                <ResizeHandle
                  panelKey={key}
                  heights={indicatorHeights}
                  setHeights={setIndicatorHeights}
                  panelRef={panelRef}
                />
                <div ref={el => panelRef.current = el} className="relative flex-shrink-0" style={{ height: h }}>
                  <button
                    onClick={() => setActiveIndicators(prev => prev.filter(k => k !== key))}
                    className="absolute top-0.5 right-14 z-20 text-slate-700 hover:text-red-400 text-[11px] leading-none px-1 transition-colors"
                    title="Remove indicator">✕</button>
                  {key === 'vumanchu' && (
                    <Suspense fallback={<IndicatorFallback />}>
                      {isStock
                        ? <StockVMC klines={klinesWithTimeStr} visibleRange={[startIdx, endIdx]} rightPad={rightPad} inspectionX={inspectionGuide?.plotX ?? null} />
                        : <VuManChu klines={klines} visibleRange={[startIdx, endIdx]} rightPad={rightPad} inspectionX={inspectionGuide?.plotX ?? null} />
                      }
                    </Suspense>
                  )}
                  {key === 'wyckoff' && (
                    <Suspense fallback={<IndicatorFallback />}>
                      <WyckoffIndicator klines={klines} visibleRange={[startIdx, endIdx]} rightPad={rightPad} inspectionX={inspectionGuide?.plotX ?? null} />
                    </Suspense>
                  )}
                  {key === 'fundingRate' && (
                    <Suspense fallback={<IndicatorFallback />}>
                      <FundingRatePanel fundingData={fundingData} klines={klines} visibleRange={[startIdx, endIdx]} rightPad={rightPad} />
                    </Suspense>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* ── Sniper Strategy Modal ─────────────────────────────────────── */}
      {showStrategy && (
        <Suspense fallback={null}>
          <SniperStrategyModal klines={klines} interval={interval} symbol={symbol} onClose={() => setShowStrategy(false)} />
        </Suspense>
      )}

      {/* ── Add indicator bar ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 relative border-t border-[hsl(217,33%,18%)]">
        <button
          onClick={() => setShowMenu(v => !v)}
          className="w-full py-1 text-[10px] text-slate-600 hover:text-slate-300 hover:bg-[hsl(217,33%,15%)] transition-all flex items-center justify-center gap-1 font-mono opacity-20 hover:opacity-100">
          <span className="text-sm leading-none">+</span> Add Indicator
        </button>
        {showMenu && (
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
              .map(ind => {
                const isAdded = activeIndicators.includes(ind.key);
                const isUnavailable = ind.cryptoOnly && !isCrypto;
                const isDisabled = isAdded || isUnavailable;
                return (
                  <button key={ind.key}
                    onClick={() => {
                      if (isDisabled) return;
                      setActiveIndicators(prev => [...prev, ind.key]);
                      // New panel gets 200px default. Existing panels keep their heights.
                      // The indicator section is now scrollable so the price chart is protected.
                      setIndicatorHeights(prev => ({ ...prev, [ind.key]: 200 }));
                      setShowMenu(false);
                      setIndSearch('');
                    }}
                    disabled={isDisabled}
                    title={isUnavailable ? 'Available for crypto only' : undefined}
                    className={`w-full text-left px-2 py-1.5 rounded transition-all mb-0.5 ${
                      isAdded ? 'text-slate-700 cursor-default'
                      : isUnavailable ? 'opacity-35 cursor-not-allowed text-slate-500'
                      : 'text-slate-300 hover:bg-[hsl(217,33%,21%)] hover:text-white'
                    }`}>
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                      {ind.label}
                      {ind.cryptoOnly && <span className="text-[8px] px-1 py-0.5 rounded font-semibold bg-yellow-500/15 text-yellow-500/70 leading-none">CRYPTO</span>}
                    </div>
                    <div className="text-[10px] text-slate-600">{ind.desc}</div>
                  </button>
                );
              })}
          </div>
        )}
      </div>
      </div>{/* end unified crosshair wrapper */}
    </div>
  );
}
