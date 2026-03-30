import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Brain, Loader2, X } from 'lucide-react';
import { useTheme } from '@/components/ThemeContext';
import { fetchStockHistory } from '@/api/stockMarketClient';
import VuManChu from '@/components/terminal/VuManChu';
import { formatAssetPrice } from '@/lib/assetPriceFormat';
import { niceYTicks } from '@/lib/niceScale';

const MARGIN = { top: 12, right: 72, bottom: 24, left: 0 };
const SCAN_TIMEFRAME_BARS_PER_WEEK = {
  '4h': 42,
  '1d': 7,
  '1w': 1,
};

function computeEMA(data, period, key = 'close') {
  const k = 2 / (period + 1);
  const out = [];
  let prev = data[0]?.[key] ?? 0;
  for (let i = 0; i < data.length; i += 1) {
    prev = (data[i][key] ?? prev) * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function formatDaysAgo(daysAgo) {
  if (daysAgo < 0.2) return 'today';
  if (daysAgo < 1) return `${daysAgo.toFixed(1)}d ago`;
  return `${Math.round(daysAgo)}d ago`;
}

function PreviewCandleChart({ chartData, goldSignalTime, patternOverlays }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const update = () => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const chartWidth = size.width || 960;
  const chartHeight = size.height || 360;

  const priceMin = useMemo(
    () => Math.min(...chartData.map((candle) => candle.low)) * 0.995,
    [chartData]
  );
  const priceMax = useMemo(
    () => Math.max(...chartData.map((candle) => candle.high)) * 1.005,
    [chartData]
  );

  if (!chartData.length) {
    return <div ref={containerRef} className="h-full w-full" />;
  }

  const plotW = chartWidth - MARGIN.left - MARGIN.right;
  const plotH = chartHeight - MARGIN.top - MARGIN.bottom;
  const range = priceMax - priceMin || 1;
  const toY = (price) => MARGIN.top + plotH * (1 - (price - priceMin) / range);
  const toX = (index) => MARGIN.left + (index + 0.5) * (plotW / chartData.length);
  const candleW = Math.max(2, (plotW / chartData.length) * 0.6);
  const maxVol = Math.max(...chartData.map((candle) => candle.volume), 1);
  const volH = plotH * 0.16;
  const xTickEvery = Math.max(1, Math.round(chartData.length / 6));
  const goldIndex = chartData.findIndex((candle) => candle.time === goldSignalTime);

  const yTicks = niceYTicks(priceMin, priceMax, 5).map((price) => ({
    price,
    y: toY(price),
  }));

  return (
    <div ref={containerRef} className="h-full w-full">
      <svg width={chartWidth} height={chartHeight} className="block">
        {yTicks.map(({ price, y }) => (
          <g key={price}>
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + plotW}
              y1={y}
              y2={y}
              stroke="rgba(100,116,139,0.2)"
              strokeWidth="1"
            />
            <text
              x={MARGIN.left + plotW + 4}
              y={y + 4}
              fill="#64748b"
              fontSize="10"
              fontFamily="monospace"
            >
              {formatAssetPrice(price)}
            </text>
          </g>
        ))}

        {chartData.map((candle, index) => {
          const x = toX(index);
          const bull = candle.close >= candle.open;
          return (
            <rect
              key={`vol-${candle.time}`}
              x={x - candleW / 2}
              y={MARGIN.top + plotH - (candle.volume / maxVol) * volH}
              width={candleW}
              height={Math.max((candle.volume / maxVol) * volH, 1)}
              fill={bull ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)'}
            />
          );
        })}

        <polyline
          points={chartData.map((candle, index) => `${toX(index)},${toY(candle.ema21)}`).join(' ')}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="1.25"
          opacity="0.9"
        />
        <polyline
          points={chartData.map((candle, index) => `${toX(index)},${toY(candle.ema50)}`).join(' ')}
          fill="none"
          stroke="#a855f7"
          strokeWidth="1.25"
          opacity="0.85"
          strokeDasharray="4,3"
        />

        {chartData.map((candle, index) => {
          const x = toX(index);
          const bull = candle.close >= candle.open;
          const color = bull ? '#22c55e' : '#ef4444';
          const bodyTop = toY(Math.max(candle.open, candle.close));
          const bodyBottom = toY(Math.min(candle.open, candle.close));
          return (
            <g key={candle.time}>
              <line
                x1={x}
                x2={x}
                y1={toY(candle.high)}
                y2={toY(candle.low)}
                stroke={color}
                strokeWidth="1"
              />
              <rect
                x={x - candleW / 2}
                y={bodyTop}
                width={candleW}
                height={Math.max(bodyBottom - bodyTop, 1.5)}
                fill={bull ? 'rgba(34,197,94,0.14)' : color}
                stroke={color}
                strokeWidth="1"
              />
            </g>
          );
        })}

        {goldIndex >= 0 && (
          <g>
            <line
              x1={toX(goldIndex)}
              x2={toX(goldIndex)}
              y1={MARGIN.top}
              y2={MARGIN.top + plotH}
              stroke="#eab308"
              strokeWidth="1"
              strokeDasharray="4,4"
              opacity="0.8"
            />
            <circle cx={toX(goldIndex)} cy={toY(chartData[goldIndex].close)} r="5" fill="#eab308" />
          </g>
        )}

        {/* ── Pattern overlays (Double Bottom / Top / Breakout-Retest) ── */}
        {patternOverlays && Object.entries(patternOverlays).map(([timeStr, pat]) => {
          const sigTime = Number(timeStr);
          const sigIdx  = chartData.findIndex(c => c.time === sigTime);
          if (sigIdx < 0) return null;

          // ── Double Bottom — "W" shape ──────────────────────────────────
          if (pat.type === 'double_bottom') {
            const i1  = chartData.findIndex(c => c.time === pat.low1Time);
            const i2  = chartData.findIndex(c => c.time === pat.low2Time);
            if (i1 < 0 || i2 < 0) return null;
            const nkY  = toY(pat.neckline);
            const l1y  = toY(chartData[i1].low);
            const l2y  = toY(chartData[i2].low);
            const l1x  = toX(i1), l2x = toX(i2);
            const capW = Math.max(8, candleW * 2.5);
            // mid-point for the W valley hump (highest close between the two lows)
            const midIdx = Math.round((i1 + i2) / 2);
            const midX   = toX(midIdx);
            const midY   = toY(pat.neckline * 0.92); // approx hump
            // shaded W zone polygon
            const zonePts = [
              `${l1x},${nkY}`,
              `${l1x},${l1y}`,
              `${midX},${midY}`,
              `${l2x},${l2y}`,
              `${l2x},${nkY}`,
            ].join(' ');
            return (
              <g key={timeStr}>
                {/* shaded W zone */}
                <polygon points={zonePts} fill="#22c55e" opacity="0.10" />
                {/* neckline — solid green */}
                <line x1={l1x} x2={toX(sigIdx)} y1={nkY} y2={nkY}
                  stroke="#22c55e" strokeWidth="2" />
                <text x={toX(sigIdx) + 4} y={nkY - 4} fill="#22c55e" fontSize="9"
                  fontFamily="monospace" fontWeight="bold">neck</text>
                {/* L1 horizontal cap bar */}
                <line x1={l1x - capW} x2={l1x + capW} y1={l1y + 6} y2={l1y + 6}
                  stroke="#22c55e" strokeWidth="4" strokeLinecap="round" />
                <text x={l1x} y={l1y + 20} textAnchor="middle" fill="#22c55e"
                  fontSize="9" fontFamily="monospace" fontWeight="bold">L1</text>
                {/* L2 horizontal cap bar */}
                <line x1={l2x - capW} x2={l2x + capW} y1={l2y + 6} y2={l2y + 6}
                  stroke="#22c55e" strokeWidth="4" strokeLinecap="round" />
                <text x={l2x} y={l2y + 20} textAnchor="middle" fill="#22c55e"
                  fontSize="9" fontFamily="monospace" fontWeight="bold">L2</text>
              </g>
            );
          }

          // ── Double Top — "M" shape ──────────────────────────────────
          if (pat.type === 'double_top') {
            const i1  = chartData.findIndex(c => c.time === pat.high1Time);
            const i2  = chartData.findIndex(c => c.time === pat.high2Time);
            if (i1 < 0 || i2 < 0) return null;
            const nkY  = toY(pat.neckline);
            const h1y  = toY(chartData[i1].high);
            const h2y  = toY(chartData[i2].high);
            const h1x  = toX(i1), h2x = toX(i2);
            const capW = Math.max(8, candleW * 2.5);
            const midIdx = Math.round((i1 + i2) / 2);
            const midX   = toX(midIdx);
            const midY   = toY(pat.neckline * 1.08); // approx M valley
            const zonePts = [
              `${h1x},${nkY}`,
              `${h1x},${h1y}`,
              `${midX},${midY}`,
              `${h2x},${h2y}`,
              `${h2x},${nkY}`,
            ].join(' ');
            return (
              <g key={timeStr}>
                {/* shaded M zone */}
                <polygon points={zonePts} fill="#ef4444" opacity="0.10" />
                {/* neckline — solid red */}
                <line x1={h1x} x2={toX(sigIdx)} y1={nkY} y2={nkY}
                  stroke="#ef4444" strokeWidth="2" />
                <text x={toX(sigIdx) + 4} y={nkY - 4} fill="#ef4444" fontSize="9"
                  fontFamily="monospace" fontWeight="bold">neck</text>
                {/* H1 horizontal cap bar */}
                <line x1={h1x - capW} x2={h1x + capW} y1={h1y - 6} y2={h1y - 6}
                  stroke="#ef4444" strokeWidth="4" strokeLinecap="round" />
                <text x={h1x} y={h1y - 12} textAnchor="middle" fill="#ef4444"
                  fontSize="9" fontFamily="monospace" fontWeight="bold">H1</text>
                {/* H2 horizontal cap bar */}
                <line x1={h2x - capW} x2={h2x + capW} y1={h2y - 6} y2={h2y - 6}
                  stroke="#ef4444" strokeWidth="4" strokeLinecap="round" />
                <text x={h2x} y={h2y - 12} textAnchor="middle" fill="#ef4444"
                  fontSize="9" fontFamily="monospace" fontWeight="bold">H2</text>
              </g>
            );
          }

          // ── Breakout & Retest — horizontal zone + arrows ────────────
          if (pat.type === 'breakout_retest') {
            const brkIdx  = chartData.findIndex(c => c.time === pat.breakoutTime);
            const rh1Idx  = chartData.findIndex(c => c.time === pat.rHigh1Time);
            const rh2Idx  = chartData.findIndex(c => c.time === pat.rHigh2Time);
            const zoneTop  = toY(pat.resistance * 1.008);
            const zoneBot  = toY(pat.resistance * 0.992);
            const zoneH    = Math.max(4, zoneBot - zoneTop);
            const xZoneStart = rh1Idx >= 0 && rh2Idx >= 0
              ? toX(Math.min(rh1Idx, rh2Idx) - 2)
              : brkIdx >= 0 ? toX(Math.max(0, brkIdx - 10)) : MARGIN.left;
            const xZoneEnd = toX(sigIdx + 2);
            const bx = brkIdx >= 0 ? toX(brkIdx) : toX(sigIdx - 5);
            const rx = toX(sigIdx);
            // arrow helper: points for up/down arrow polygon centred at (cx, cy)
            const upArrow   = (cx, cy, s) => `${cx},${cy - s} ${cx - s * 0.6},${cy + s * 0.4} ${cx + s * 0.6},${cy + s * 0.4}`;
            const downArrow = (cx, cy, s) => `${cx},${cy + s} ${cx - s * 0.6},${cy - s * 0.4} ${cx + s * 0.6},${cy - s * 0.4}`;
            const resistY = toY(pat.resistance);
            return (
              <g key={timeStr}>
                {/* shaded horizontal zone */}
                <rect x={xZoneStart} y={zoneTop} width={Math.max(0, xZoneEnd - xZoneStart)} height={zoneH}
                  fill="#f59e0b" opacity="0.28" />
                {/* zone border lines */}
                <line x1={xZoneStart} x2={xZoneEnd} y1={zoneTop} y2={zoneTop}
                  stroke="#f59e0b" strokeWidth="1.5" />
                <line x1={xZoneStart} x2={xZoneEnd} y1={zoneBot} y2={zoneBot}
                  stroke="#f59e0b" strokeWidth="1.5" />
                <text x={xZoneEnd + 4} y={resistY + 4} fill="#f59e0b" fontSize="9"
                  fontFamily="monospace" fontWeight="bold">R→S</text>
                {/* ↑ breakout arrow (green) */}
                <polygon points={upArrow(bx, resistY - 18, 9)} fill="#22c55e" />
                <line x1={bx} y1={resistY - 8} x2={bx} y2={zoneTop}
                  stroke="#22c55e" strokeWidth="1.5" />
                {/* ↓ retest arrow (amber) */}
                <polygon points={downArrow(rx, resistY + 18, 9)} fill="#f59e0b" />
                <line x1={rx} y1={zoneBot} x2={rx} y2={resistY + 8}
                  stroke="#f59e0b" strokeWidth="1.5" />
              </g>
            );
          }

          // ── Trendline Breakout — descending trendline ───────────────
          if (pat.type === 'trendline_breakout') {
            const th1Idx = chartData.findIndex(c => c.time === pat.trendHigh1Time);
            const th2Idx = chartData.findIndex(c => c.time === pat.trendHigh2Time);
            const brkIdx = chartData.findIndex(c => c.time === pat.breakoutTime);
            if (th1Idx < 0 || th2Idx < 0) return null;
            // Project trendline from th1 all the way to signal bar
            const slope  = (pat.trendHigh2Price - pat.trendHigh1Price) / (th2Idx - th1Idx);
            const projAt = (idx) => pat.trendHigh1Price + slope * (idx - th1Idx);
            const extEnd = sigIdx + 3; // extend a few bars past signal
            // shaded area under trendline (from th1 to breakout)
            const shadeEnd = brkIdx >= 0 ? brkIdx : sigIdx;
            const shadePts = [
              `${toX(th1Idx)},${toY(projAt(th1Idx))}`,
              `${toX(shadeEnd)},${toY(projAt(shadeEnd))}`,
              `${toX(shadeEnd)},${MARGIN.top + plotH}`,
              `${toX(th1Idx)},${MARGIN.top + plotH}`,
            ].join(' ');
            return (
              <g key={timeStr}>
                {/* shaded zone under trendline */}
                <polygon points={shadePts} fill="#60a5fa" opacity="0.08" />
                {/* descending trendline — solid blue, extended to signal */}
                <line
                  x1={toX(th1Idx)} y1={toY(projAt(th1Idx))}
                  x2={toX(Math.min(extEnd, chartData.length - 1))} y2={toY(projAt(Math.min(extEnd, chartData.length - 1)))}
                  stroke="#60a5fa" strokeWidth="2.5" />
                {/* H1 dot on trendline */}
                <circle cx={toX(th1Idx)} cy={toY(pat.trendHigh1Price)} r="4"
                  fill="#60a5fa" />
                {/* H2 dot on trendline */}
                <circle cx={toX(th2Idx)} cy={toY(pat.trendHigh2Price)} r="4"
                  fill="#60a5fa" />
                {/* breakout candle highlight */}
                {brkIdx >= 0 && (
                  <rect x={toX(brkIdx) - candleW} y={MARGIN.top}
                    width={candleW * 2} height={plotH}
                    fill="#60a5fa" opacity="0.12" />
                )}
                <text x={toX(sigIdx) + 4} y={toY(projAt(sigIdx)) - 6}
                  fill="#60a5fa" fontSize="9" fontFamily="monospace" fontWeight="bold">BRK</text>
              </g>
            );
          }

          return null;
        })}

        {chartData
          .filter((_, index) => index % xTickEvery === 0)
          .map((candle, index) => (
            <text
              key={`x-${candle.time}`}
              x={toX(index * xTickEvery)}
              y={MARGIN.top + plotH + 16}
              textAnchor="middle"
              fill="#64748b"
              fontSize="10"
              fontFamily="monospace"
            >
              {candle.timeStr}
            </text>
          ))}
      </svg>
    </div>
  );
}

async function fetchCryptoPreviewWindow(symbol, interval, totalBars) {
  const pageSize = 1000;
  let endTime = null;
  let klines = [];

  while (klines.length < totalBars) {
    const params = new URLSearchParams({
      symbol,
      interval,
      limit: String(Math.min(pageSize, totalBars - klines.length)),
    });

    if (endTime != null) {
      params.set('endTime', String(endTime));
    }

    const response = await fetch(`https://api.binance.com/api/v3/klines?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Binance ${response.status}`);
    }

    const raw = await response.json();
    if (!Array.isArray(raw) || raw.length === 0) {
      break;
    }

    const mapped = raw.map((kline) => ({
      time: kline[0],
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
    }));

    klines = [...mapped, ...klines];

    const oldestOpenTime = raw[0]?.[0];
    if (!Number.isFinite(oldestOpenTime) || raw.length < pageSize) {
      break;
    }

    endTime = oldestOpenTime - 1;
  }

  return klines.sort((a, b) => a.time - b.time).slice(-totalBars);
}

function getPreviewBarCount(interval, lookbackWeeks) {
  const barsPerWeek = SCAN_TIMEFRAME_BARS_PER_WEEK[interval] ?? 1;
  const baseWindow = Math.ceil(lookbackWeeks * barsPerWeek);
  return Math.min(2400, Math.max(180, baseWindow + Math.max(80, barsPerWeek * 10)));
}

function getPreviewStockHistoryConfig(interval, lookbackWeeks) {
  if (interval === '1d') {
    const bars = Math.min(1825, Math.max(180, Math.ceil(lookbackWeeks * 5) + 120));
    return {
      interval: '1d',
      range: bars > 252 ? '5y' : '1y',
      bars,
    };
  }

  return {
    interval: '1w',
    range: '5y',
    bars: Math.min(260, Math.max(160, lookbackWeeks + 60)),
  };
}

function getPreviewVisibleRange(dataLength, signalIndex) {
  if (dataLength <= 0) {
    return [0, 0];
  }

  const windowSize = Math.min(dataLength, Math.max(90, Math.min(220, Math.round(dataLength * 0.45))));
  const idealStart = signalIndex >= 0
    ? signalIndex - Math.round(windowSize * 0.35)
    : dataLength - windowSize;
  const start = Math.max(0, Math.min(idealStart, dataLength - windowSize));

  return [start, Math.min(dataLength, start + windowSize)];
}

export default function AssetPreviewModal({ result, mode, onClose }) {
  const { theme } = useTheme();
  const [klines, setKlines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    const loadPreview = async () => {
      setLoading(true);
      setError('');

      try {
        const previewTimeframe = result.scanTimeframe || '1w';
        const previewLookbackWeeks = result.signalLookbackWeeks || 26;
        const raw = mode === 'crypto'
          ? await fetchCryptoPreviewWindow(
              result.symbol,
              previewTimeframe,
              getPreviewBarCount(previewTimeframe, previewLookbackWeeks)
            )
          : await fetchStockHistory(
              result.symbol,
              getPreviewStockHistoryConfig(previewTimeframe, previewLookbackWeeks)
            );

        if (!cancelled) setKlines(raw);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load preview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [mode, result.scanTimeframe, result.signalLookbackWeeks, result.symbol]);

  const prepared = useMemo(() => {
    if (!klines.length) return [];
    const previewTimeframe = result.scanTimeframe || '1w';
    const ema21 = computeEMA(klines, 21);
    const ema50 = computeEMA(klines, 50);
    const timeFormat = previewTimeframe === '4h'
      ? 'MMM dd HH:mm'
      : previewTimeframe === '1d'
        ? 'MMM dd yy'
        : 'MMM yy';
    return klines.map((candle, index) => ({
      ...candle,
      ema21: ema21[index],
      ema50: ema50[index],
      timeStr: format(new Date(candle.time), timeFormat),
    }));
  }, [klines, result.scanTimeframe]);

  const previewVisibleRange = useMemo(() => {
    const signalIndex = prepared.findIndex((candle) => candle.time === result.goldSignalTime);
    return getPreviewVisibleRange(prepared.length, signalIndex);
  }, [prepared, result.goldSignalTime]);

  const overlayBg = theme === 'light' ? 'rgba(15,23,42,0.55)' : 'rgba(2,6,23,0.78)';
  const panelBg = theme === 'light' ? '#f8fafc' : 'hsl(222,47%,12%)';
  const borderColor = theme === 'light' ? 'hsl(210,20%,84%)' : 'hsl(217,33%,20%)';
  const textColor = theme === 'light' ? 'hsl(222,47%,17%)' : '#e2e8f0';
  const mutedColor = theme === 'light' ? 'hsl(215,15%,40%)' : '#94a3b8';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: overlayBg }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl rounded-2xl border shadow-2xl overflow-hidden"
        style={{ background: panelBg, borderColor }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b" style={{ borderColor }}>
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: mutedColor }}>
              {mode === 'crypto' ? 'Terminal Preview' : 'Stock Preview'}
            </div>
            <div className="text-xl font-semibold mt-1" style={{ color: textColor }}>
              {result.symbol}
            </div>
            <div className="flex flex-wrap gap-3 text-xs mt-2" style={{ color: mutedColor }}>
              <span>Now: ${formatAssetPrice(result.price)}</span>
              <span>Gold dot price: ${formatAssetPrice(result.goldSignalPrice)}</span>
              <span>Gold dot: {formatDaysAgo(result.goldSignalDaysAgo)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-black/5"
            style={{ color: mutedColor }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="h-[620px] flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              <div className="text-sm" style={{ color: mutedColor }}>Loading chart preview...</div>
            </div>
          ) : error ? (
            <div className="h-[620px] flex flex-col items-center justify-center gap-3 text-center">
              <Brain className="w-10 h-10 text-slate-500/50" />
              <div className="text-sm" style={{ color: textColor }}>{error}</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="h-[360px] rounded-xl border overflow-hidden" style={{ borderColor }}>
                <PreviewCandleChart chartData={prepared} goldSignalTime={result.goldSignalTime} patternOverlays={result.patternData} />
              </div>
              <div className="h-[220px] rounded-xl border overflow-hidden" style={{ borderColor }}>
                <VuManChu
                  klines={prepared}
                  visibleRange={previewVisibleRange}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
