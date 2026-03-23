import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Brain, Loader2, X } from 'lucide-react';
import { useTheme } from '@/components/ThemeContext';
import { fetchStockHistory } from '@/api/stockMarketClient';
import VuManChu from '@/components/terminal/VuManChu';
import { formatAssetPrice } from '@/lib/assetPriceFormat';

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

function PreviewCandleChart({ chartData, goldSignalTime }) {
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

  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const price = priceMin + (range * index) / 4;
    return { price, y: toY(price) };
  });

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
              {price >= 1000
                ? price.toLocaleString(undefined, { maximumFractionDigits: 0 })
                : price.toFixed(2)}
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
                <PreviewCandleChart chartData={prepared} goldSignalTime={result.goldSignalTime} />
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
