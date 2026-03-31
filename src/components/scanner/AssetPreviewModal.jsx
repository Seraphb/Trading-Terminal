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

        {/* ── SVG definitions for pattern overlays ── */}
        <defs>
          {/* Double Bottom gradient */}
          <linearGradient id="dbGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.03" />
          </linearGradient>
          {/* Double Top gradient */}
          <linearGradient id="dtGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.03" />
          </linearGradient>
          {/* Breakout zone gradient */}
          <linearGradient id="brGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.06" />
            <stop offset="40%" stopColor="#f59e0b" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.10" />
          </linearGradient>
          {/* Trendline gradient */}
          <linearGradient id="tlGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.02" />
          </linearGradient>
          {/* Glow filters */}
          <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor="#22c55e" floodOpacity="0.6" />
            <feComposite in2="blur" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor="#ef4444" floodOpacity="0.6" />
            <feComposite in2="blur" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-amber" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor="#f59e0b" floodOpacity="0.5" />
            <feComposite in2="blur" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor="#60a5fa" floodOpacity="0.5" />
            <feComposite in2="blur" operator="in" />
            <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* Arrow markers */}
          <marker id="arrow-up-green" viewBox="0 0 10 10" refX="5" refY="10" markerWidth="8" markerHeight="8">
            <path d="M0,10 L5,0 L10,10 Z" fill="#22c55e" />
          </marker>
          <marker id="arrow-down-amber" viewBox="0 0 10 10" refX="5" refY="0" markerWidth="8" markerHeight="8">
            <path d="M0,0 L5,10 L10,0 Z" fill="#f59e0b" />
          </marker>
        </defs>

        {/* ── Pattern overlays ── */}
        {patternOverlays && Object.entries(patternOverlays).map(([timeStr, pat]) => {
          const sigTime = Number(timeStr);
          const sigIdx  = chartData.findIndex(c => c.time === sigTime);
          if (sigIdx < 0) return null;

          // ── Double Bottom — premium "W" shape ──────────────────────
          if (pat.type === 'double_bottom') {
            const i1 = chartData.findIndex(c => c.time === pat.low1Time);
            const i2 = chartData.findIndex(c => c.time === pat.low2Time);
            if (i1 < 0 || i2 < 0) return null;

            const nkY = toY(pat.neckline);
            const l1y = toY(chartData[i1].low), l2y = toY(chartData[i2].low);
            const l1x = toX(i1), l2x = toX(i2);

            // Find actual highest point between the two lows for the W hump
            let peakBetween = pat.neckline;
            for (let j = i1; j <= i2; j++) {
              if (chartData[j].high > peakBetween) peakBetween = chartData[j].high;
            }
            const midIdx = Math.round((i1 + i2) / 2);
            const midX = toX(midIdx);
            const midY = toY(peakBetween);

            // Smooth W curve using cubic bezier
            const wPath = `M ${l1x},${nkY} L ${l1x},${l1y} Q ${(l1x + midX) / 2},${l1y - 8} ${midX},${midY} Q ${(midX + l2x) / 2},${l2y - 8} ${l2x},${l2y} L ${l2x},${nkY} Z`;

            // Breakout arrow position
            const brkIdx = chartData.findIndex(c => c.time === pat.breakoutTime);
            const brkX = brkIdx >= 0 ? toX(brkIdx) : l2x;

            return (
              <g key={timeStr}>
                {/* Gradient-filled W zone */}
                <path d={wPath} fill="url(#dbGrad)" />

                {/* W outline curve — smooth, no fill */}
                <path
                  d={`M ${l1x},${l1y} Q ${(l1x + midX) / 2},${l1y - 8} ${midX},${midY} Q ${(midX + l2x) / 2},${l2y - 8} ${l2x},${l2y}`}
                  fill="none" stroke="#22c55e" strokeWidth="2" opacity="0.7"
                />

                {/* Neckline — dashed with glow */}
                <line x1={l1x - 6} x2={brkX + 12} y1={nkY} y2={nkY}
                  stroke="#22c55e" strokeWidth="1.5" strokeDasharray="6,4" opacity="0.55" />
                <line x1={l1x - 6} x2={brkX + 12} y1={nkY} y2={nkY}
                  stroke="#22c55e" strokeWidth="0.75" opacity="0.9" />

                {/* L1 marker — glowing dot + label */}
                <circle cx={l1x} cy={l1y} r="5" fill="#22c55e" opacity="0.2" filter="url(#glow-green)" />
                <circle cx={l1x} cy={l1y} r="3.5" fill="#22c55e" stroke="#fff" strokeWidth="1" />
                <text x={l1x} y={l1y + 16} textAnchor="middle" fill="#22c55e"
                  fontSize="8" fontFamily="Inter, system-ui, sans-serif" fontWeight="700" letterSpacing="0.5">L1</text>

                {/* L2 marker */}
                <circle cx={l2x} cy={l2y} r="5" fill="#22c55e" opacity="0.2" filter="url(#glow-green)" />
                <circle cx={l2x} cy={l2y} r="3.5" fill="#22c55e" stroke="#fff" strokeWidth="1" />
                <text x={l2x} y={l2y + 16} textAnchor="middle" fill="#22c55e"
                  fontSize="8" fontFamily="Inter, system-ui, sans-serif" fontWeight="700" letterSpacing="0.5">L2</text>

                {/* Breakout arrow — upward from neckline */}
                {brkIdx >= 0 && (<>
                  <line x1={brkX} y1={nkY - 2} x2={brkX} y2={nkY - 22}
                    stroke="#22c55e" strokeWidth="2" />
                  <polygon points={`${brkX},${nkY - 28} ${brkX - 5},${nkY - 19} ${brkX + 5},${nkY - 19}`}
                    fill="#22c55e" filter="url(#glow-green)" />
                </>)}

                {/* Badge */}
                <rect x={l1x - 2} y={nkY - 26} rx="4" ry="4" width="64" height="15"
                  fill="#22c55e" opacity="0.15" />
                <text x={l1x + 30} y={nkY - 15} textAnchor="middle" fill="#22c55e"
                  fontSize="8" fontFamily="Inter, system-ui, sans-serif" fontWeight="700"
                  letterSpacing="0.8">DBL BOTTOM</text>
              </g>
            );
          }

          // ── Double Top — premium "M" shape ─────────────────────────
          if (pat.type === 'double_top') {
            const i1 = chartData.findIndex(c => c.time === pat.high1Time);
            const i2 = chartData.findIndex(c => c.time === pat.high2Time);
            if (i1 < 0 || i2 < 0) return null;

            const nkY = toY(pat.neckline);
            const h1y = toY(chartData[i1].high), h2y = toY(chartData[i2].high);
            const h1x = toX(i1), h2x = toX(i2);

            // Find actual lowest point between the two highs for the M valley
            let troughBetween = pat.neckline;
            for (let j = i1; j <= i2; j++) {
              if (chartData[j].low < troughBetween) troughBetween = chartData[j].low;
            }
            const midIdx = Math.round((i1 + i2) / 2);
            const midX = toX(midIdx);
            const midY = toY(troughBetween);

            // Smooth M curve
            const mPath = `M ${h1x},${nkY} L ${h1x},${h1y} Q ${(h1x + midX) / 2},${h1y + 8} ${midX},${midY} Q ${(midX + h2x) / 2},${h2y + 8} ${h2x},${h2y} L ${h2x},${nkY} Z`;

            const brkIdx = chartData.findIndex(c => c.time === pat.breakdownTime);
            const brkX = brkIdx >= 0 ? toX(brkIdx) : h2x;

            return (
              <g key={timeStr}>
                {/* Gradient-filled M zone */}
                <path d={mPath} fill="url(#dtGrad)" />

                {/* M outline curve */}
                <path
                  d={`M ${h1x},${h1y} Q ${(h1x + midX) / 2},${h1y + 8} ${midX},${midY} Q ${(midX + h2x) / 2},${h2y + 8} ${h2x},${h2y}`}
                  fill="none" stroke="#ef4444" strokeWidth="2" opacity="0.7"
                />

                {/* Neckline */}
                <line x1={h1x - 6} x2={brkX + 12} y1={nkY} y2={nkY}
                  stroke="#ef4444" strokeWidth="1.5" strokeDasharray="6,4" opacity="0.55" />
                <line x1={h1x - 6} x2={brkX + 12} y1={nkY} y2={nkY}
                  stroke="#ef4444" strokeWidth="0.75" opacity="0.9" />

                {/* H1 marker */}
                <circle cx={h1x} cy={h1y} r="5" fill="#ef4444" opacity="0.2" filter="url(#glow-red)" />
                <circle cx={h1x} cy={h1y} r="3.5" fill="#ef4444" stroke="#fff" strokeWidth="1" />
                <text x={h1x} y={h1y - 10} textAnchor="middle" fill="#ef4444"
                  fontSize="8" fontFamily="Inter, system-ui, sans-serif" fontWeight="700" letterSpacing="0.5">H1</text>

                {/* H2 marker */}
                <circle cx={h2x} cy={h2y} r="5" fill="#ef4444" opacity="0.2" filter="url(#glow-red)" />
                <circle cx={h2x} cy={h2y} r="3.5" fill="#ef4444" stroke="#fff" strokeWidth="1" />
                <text x={h2x} y={h2y - 10} textAnchor="middle" fill="#ef4444"
                  fontSize="8" fontFamily="Inter, system-ui, sans-serif" fontWeight="700" letterSpacing="0.5">H2</text>

                {/* Breakdown arrow — downward from neckline */}
                {brkIdx >= 0 && (<>
                  <line x1={brkX} y1={nkY + 2} x2={brkX} y2={nkY + 22}
                    stroke="#ef4444" strokeWidth="2" />
                  <polygon points={`${brkX},${nkY + 28} ${brkX - 5},${nkY + 19} ${brkX + 5},${nkY + 19}`}
                    fill="#ef4444" filter="url(#glow-red)" />
                </>)}

                {/* Badge */}
                <rect x={h1x - 2} y={h1y - 10} rx="4" ry="4" width="52" height="15"
                  fill="#ef4444" opacity="0.15" />
                <text x={h1x + 24} y={h1y - 1} textAnchor="middle" fill="#ef4444"
                  fontSize="8" fontFamily="Inter, system-ui, sans-serif" fontWeight="700"
                  letterSpacing="0.8">DBL TOP</text>
              </g>
            );
          }

          // ── Breakout & Retest — resistance-to-support zone ─────────
          if (pat.type === 'breakout_retest') {
            const brkIdx  = chartData.findIndex(c => c.time === pat.breakoutTime);
            const rh1Idx  = chartData.findIndex(c => c.time === pat.rHigh1Time);
            const rh2Idx  = chartData.findIndex(c => c.time === pat.rHigh2Time);

            const resistY  = toY(pat.resistance);
            const zoneTop  = toY(pat.resistance * 1.012);
            const zoneBot  = toY(pat.resistance * 0.988);
            const zoneH    = Math.max(6, zoneBot - zoneTop);

            const xZoneStart = rh1Idx >= 0 && rh2Idx >= 0
              ? toX(Math.min(rh1Idx, rh2Idx) - 1)
              : brkIdx >= 0 ? toX(Math.max(0, brkIdx - 10)) : MARGIN.left;
            const xZoneEnd = toX(Math.min(sigIdx + 3, chartData.length - 1));

            const bx = brkIdx >= 0 ? toX(brkIdx) : toX(sigIdx - 5);
            const rx = toX(sigIdx);

            return (
              <g key={timeStr}>
                {/* Resistance zone band — gradient fill */}
                <rect x={xZoneStart} y={zoneTop} width={Math.max(0, xZoneEnd - xZoneStart)} height={zoneH}
                  fill="url(#brGrad)" rx="2" />

                {/* Zone border lines — crisp */}
                <line x1={xZoneStart} x2={xZoneEnd} y1={zoneTop} y2={zoneTop}
                  stroke="#f59e0b" strokeWidth="1" opacity="0.7" />
                <line x1={xZoneStart} x2={xZoneEnd} y1={zoneBot} y2={zoneBot}
                  stroke="#f59e0b" strokeWidth="1" opacity="0.7" />

                {/* Resistance center dashed line */}
                <line x1={xZoneStart} x2={xZoneEnd} y1={resistY} y2={resistY}
                  stroke="#f59e0b" strokeWidth="1" strokeDasharray="3,3" opacity="0.45" />

                {/* Touch-point dots on resistance (swing highs) */}
                {rh1Idx >= 0 && (
                  <circle cx={toX(rh1Idx)} cy={resistY} r="3" fill="#f59e0b" opacity="0.7" />
                )}
                {rh2Idx >= 0 && (
                  <circle cx={toX(rh2Idx)} cy={resistY} r="3" fill="#f59e0b" opacity="0.7" />
                )}

                {/* Breakout — green arrow shooting up through zone */}
                <line x1={bx} y1={resistY + 4} x2={bx} y2={zoneTop - 18}
                  stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" />
                <polygon points={`${bx},${zoneTop - 26} ${bx - 6},${zoneTop - 15} ${bx + 6},${zoneTop - 15}`}
                  fill="#22c55e" filter="url(#glow-green)" />
                <text x={bx} y={zoneTop - 30} textAnchor="middle" fill="#22c55e"
                  fontSize="7" fontFamily="Inter, system-ui, sans-serif" fontWeight="700"
                  letterSpacing="0.6">BREAK</text>

                {/* Retest — amber arrow dipping back toward zone */}
                <line x1={rx} y1={zoneTop - 4} x2={rx} y2={zoneBot + 18}
                  stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
                <polygon points={`${rx},${zoneBot + 26} ${rx - 6},${zoneBot + 15} ${rx + 6},${zoneBot + 15}`}
                  fill="#f59e0b" filter="url(#glow-amber)" />
                <text x={rx} y={zoneBot + 38} textAnchor="middle" fill="#f59e0b"
                  fontSize="7" fontFamily="Inter, system-ui, sans-serif" fontWeight="700"
                  letterSpacing="0.6">RETEST</text>

                {/* R→S flip badge */}
                <rect x={xZoneEnd + 4} y={resistY - 8} rx="3" ry="3" width="28" height="14"
                  fill="#f59e0b" opacity="0.15" />
                <text x={xZoneEnd + 18} y={resistY + 2} textAnchor="middle" fill="#f59e0b"
                  fontSize="8" fontFamily="Inter, system-ui, sans-serif" fontWeight="800">R→S</text>
              </g>
            );
          }

          // ── Trendline Breakout — descending trendline ──────────────
          if (pat.type === 'trendline_breakout') {
            const th1Idx = chartData.findIndex(c => c.time === pat.trendHigh1Time);
            const th2Idx = chartData.findIndex(c => c.time === pat.trendHigh2Time);
            const brkIdx = chartData.findIndex(c => c.time === pat.breakoutTime);
            if (th1Idx < 0 || th2Idx < 0) return null;

            const slope  = (pat.trendHigh2Price - pat.trendHigh1Price) / (th2Idx - th1Idx);
            const projAt = (idx) => pat.trendHigh1Price + slope * (idx - th1Idx);
            const extEnd = Math.min(sigIdx + 4, chartData.length - 1);

            // Shaded zone under trendline (trapezoid to breakout)
            const shadeEnd = brkIdx >= 0 ? brkIdx : sigIdx;
            const shadePts = [
              `${toX(th1Idx)},${toY(projAt(th1Idx))}`,
              `${toX(shadeEnd)},${toY(projAt(shadeEnd))}`,
              `${toX(shadeEnd)},${toY(projAt(shadeEnd)) + 40}`,
              `${toX(th1Idx)},${toY(projAt(th1Idx)) + 40}`,
            ].join(' ');

            const brkX = brkIdx >= 0 ? toX(brkIdx) : toX(sigIdx);
            const brkProjY = brkIdx >= 0 ? toY(projAt(brkIdx)) : toY(projAt(sigIdx));

            return (
              <g key={timeStr}>
                {/* Shaded pressure zone under trendline */}
                <polygon points={shadePts} fill="url(#tlGrad)" />

                {/* Main descending trendline — thick, slightly transparent */}
                <line
                  x1={toX(th1Idx)} y1={toY(projAt(th1Idx))}
                  x2={toX(extEnd)} y2={toY(projAt(extEnd))}
                  stroke="#60a5fa" strokeWidth="2.5" opacity="0.85"
                  strokeLinecap="round"
                />

                {/* Dotted projection extension beyond breakout */}
                {brkIdx >= 0 && (
                  <line
                    x1={toX(brkIdx)} y1={toY(projAt(brkIdx))}
                    x2={toX(extEnd)} y2={toY(projAt(extEnd))}
                    stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.45"
                  />
                )}

                {/* H1 anchor — glowing ring */}
                <circle cx={toX(th1Idx)} cy={toY(pat.trendHigh1Price)} r="6"
                  fill="none" stroke="#60a5fa" strokeWidth="2" opacity="0.3" filter="url(#glow-blue)" />
                <circle cx={toX(th1Idx)} cy={toY(pat.trendHigh1Price)} r="3.5"
                  fill="#60a5fa" stroke="#fff" strokeWidth="0.8" />

                {/* H2 anchor */}
                <circle cx={toX(th2Idx)} cy={toY(pat.trendHigh2Price)} r="6"
                  fill="none" stroke="#60a5fa" strokeWidth="2" opacity="0.3" filter="url(#glow-blue)" />
                <circle cx={toX(th2Idx)} cy={toY(pat.trendHigh2Price)} r="3.5"
                  fill="#60a5fa" stroke="#fff" strokeWidth="0.8" />

                {/* Breakout arrow — punching through the trendline */}
                {brkIdx >= 0 && (<>
                  <line x1={brkX} y1={brkProjY + 4} x2={brkX} y2={brkProjY - 22}
                    stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" />
                  <polygon points={`${brkX},${brkProjY - 28} ${brkX - 6},${brkProjY - 18} ${brkX + 6},${brkProjY - 18}`}
                    fill="#22c55e" filter="url(#glow-green)" />
                </>)}

                {/* Badge */}
                <rect x={toX(th1Idx) - 2} y={toY(projAt(th1Idx)) - 20} rx="4" ry="4" width="58" height="14"
                  fill="#60a5fa" opacity="0.15" />
                <text x={toX(th1Idx) + 27} y={toY(projAt(th1Idx)) - 10} textAnchor="middle" fill="#60a5fa"
                  fontSize="7.5" fontFamily="Inter, system-ui, sans-serif" fontWeight="700"
                  letterSpacing="0.7">TRENDLINE</text>
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
