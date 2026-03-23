import React, { useState, useCallback } from 'react';

const PRICE_CHART_MARGIN = { top: 12, right: 72, bottom: 24, left: 0 };

const FIB_LEVELS = [
  { pct: 0,     color: '#ef4444', label: '0%' },
  { pct: 0.236, color: '#f97316', label: '23.6%' },
  { pct: 0.382, color: '#eab308', label: '38.2%' },
  { pct: 0.5,   color: '#94a3b8', label: '50%' },
  { pct: 0.618, color: '#22c55e', label: '61.8%' },
  { pct: 0.786, color: '#06b6d4', label: '78.6%' },
  { pct: 1,     color: '#3b82f6', label: '100%' },
];

const DEFAULT_COLOR = '#3b82f6';

function getCoordHelpers(width, height, priceMin, priceMax, priceAxisPan, priceZoom, chartData) {
  const plotW = width - PRICE_CHART_MARGIN.right;
  const plotH = height - PRICE_CHART_MARGIN.top - PRICE_CHART_MARGIN.bottom;

  const adjMin = priceMin - priceAxisPan;
  const adjMax = priceMax - priceAxisPan;
  const range = (adjMax - adjMin) * priceZoom || 1;

  const priceToY = (price) => PRICE_CHART_MARGIN.top + plotH * (1 - (price - adjMin) / range);
  const yToPrice = (y) => adjMin + (1 - (y - PRICE_CHART_MARGIN.top) / plotH) * range;

  // Time-based X helpers — store timestamps so drawings follow the chart when panned/zoomed
  const candleCount = chartData.length || 1;
  const candleW = plotW / candleCount;
  const firstTime = chartData.length > 0 ? chartData[0].time : 0;
  const dt = chartData.length > 1 ? chartData[1].time - chartData[0].time : 60000;

  // Convert absolute timestamp → X pixel (extrapolates outside visible range)
  const timestampToX = (ts) => {
    const floatIdx = dt > 0 ? (ts - firstTime) / dt : 0;
    return (floatIdx + 0.5) * candleW;
  };

  // Convert X pixel → absolute timestamp
  const xToTimestamp = (x) => {
    const floatIdx = x / candleW - 0.5;
    return firstTime + floatIdx * dt;
  };

  return { plotW, plotH, priceToY, yToPrice, timestampToX, xToTimestamp };
}

function getCursorForTool(tool) {
  if (tool === 'cursor') return 'default';
  return 'crosshair';
}

function renderHline(d, helpers, activeTool, onRemove) {
  const { priceToY, plotW } = helpers;
  const y = priceToY(d.price);
  const color = d.color || DEFAULT_COLOR;
  return (
    <g
      key={d.id}
      onClick={activeTool === 'cursor' ? () => onRemove(d.id) : undefined}
      style={{ cursor: activeTool === 'cursor' ? 'pointer' : 'default' }}
    >
      <line x1={0} x2={plotW} y1={y} y2={y} stroke={color} strokeWidth={1.5} />
      <text
        x={plotW + 4} y={y + 4} fill={color} fontSize={10}
        fontFamily="'JetBrains Mono', monospace"
      >
        {d.price?.toFixed(2)}
      </text>
    </g>
  );
}

function renderTrendline(d, helpers, activeTool, onRemove, dashed) {
  const { priceToY, timestampToX } = helpers;
  const x1 = timestampToX(d.p1.ts);
  const y1 = priceToY(d.p1.price);
  const x2 = timestampToX(d.p2.ts);
  const y2 = priceToY(d.p2.price);
  const color = d.color || DEFAULT_COLOR;
  return (
    <line
      key={d.id}
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={color} strokeWidth={1.5}
      strokeDasharray={dashed ? '5,3' : undefined}
      opacity={dashed ? 0.6 : 1}
      onClick={activeTool === 'cursor' ? () => onRemove(d.id) : undefined}
      style={{ cursor: activeTool === 'cursor' ? 'pointer' : 'default' }}
    />
  );
}

function renderRay(d, helpers, activeTool, onRemove, dashed) {
  const { priceToY, timestampToX, plotW } = helpers;
  const x1 = timestampToX(d.p1.ts);
  const y1 = priceToY(d.p1.price);
  const x2 = timestampToX(d.p2.ts);
  const y2 = priceToY(d.p2.price);
  const color = d.color || DEFAULT_COLOR;

  let rx2 = x2, ry2 = y2;
  if (x2 !== x1) {
    const slope = (y2 - y1) / (x2 - x1);
    if (x2 > x1) { rx2 = plotW; ry2 = y1 + slope * (plotW - x1); }
    else          { rx2 = 0;    ry2 = y1 + slope * (0 - x1); }
  }

  return (
    <line
      key={d.id}
      x1={x1} y1={y1} x2={rx2} y2={ry2}
      stroke={color} strokeWidth={1.5}
      strokeDasharray={dashed ? '5,3' : undefined}
      opacity={dashed ? 0.6 : 1}
      onClick={activeTool === 'cursor' ? () => onRemove(d.id) : undefined}
      style={{ cursor: activeTool === 'cursor' ? 'pointer' : 'default' }}
    />
  );
}

function renderRect(d, helpers, activeTool, onRemove, dashed) {
  const { priceToY, timestampToX } = helpers;
  const x1 = timestampToX(d.p1.ts);
  const y1 = priceToY(d.p1.price);
  const x2 = timestampToX(d.p2.ts);
  const y2 = priceToY(d.p2.price);
  const color = d.color || DEFAULT_COLOR;

  const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
  const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);

  return (
    <rect
      key={d.id}
      x={rx} y={ry} width={rw} height={rh}
      stroke={color} strokeWidth={1.5}
      fill={color} fillOpacity={0.07}
      strokeDasharray={dashed ? '5,3' : undefined}
      opacity={dashed ? 0.6 : 1}
      onClick={activeTool === 'cursor' ? () => onRemove(d.id) : undefined}
      style={{ cursor: activeTool === 'cursor' ? 'pointer' : 'default' }}
    />
  );
}

function renderFib(d, helpers, activeTool, onRemove, dashed) {
  const { priceToY, timestampToX, plotW } = helpers;
  const x1 = timestampToX(d.p1.ts);
  const x2 = timestampToX(d.p2.ts);
  const xLeft = Math.min(x1, x2);
  const xRight = Math.max(x1, x2);
  const pHigh = Math.max(d.p1.price, d.p2.price);
  const pLow  = Math.min(d.p1.price, d.p2.price);

  return (
    <g
      key={d.id}
      opacity={dashed ? 0.6 : 1}
      onClick={activeTool === 'cursor' ? () => onRemove(d.id) : undefined}
      style={{ cursor: activeTool === 'cursor' ? 'pointer' : 'default' }}
    >
      {FIB_LEVELS.map((level) => {
        const price = pLow + (pHigh - pLow) * (1 - level.pct);
        const y = priceToY(price);
        return (
          <g key={level.label}>
            <line
              x1={xLeft} x2={xRight || plotW} y1={y} y2={y}
              stroke={level.color} strokeWidth={1.5}
              strokeDasharray={dashed ? '5,3' : undefined}
            />
            <text
              x={(xRight || plotW) + 4} y={y + 4}
              fill={level.color} fontSize={9}
              fontFamily="'JetBrains Mono', monospace"
            >
              {level.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function renderText(d, helpers, activeTool, onRemove) {
  const { priceToY, timestampToX } = helpers;
  const x = timestampToX(d.ts);
  const y = priceToY(d.price);
  const color = d.color || DEFAULT_COLOR;
  return (
    <text
      key={d.id}
      x={x} y={y} fill={color} fontSize={12}
      fontFamily="'JetBrains Mono', monospace"
      onClick={activeTool === 'cursor' ? () => onRemove(d.id) : undefined}
      style={{ cursor: activeTool === 'cursor' ? 'pointer' : 'default', userSelect: 'none' }}
    >
      {d.text}
    </text>
  );
}

function renderDrawing(d, helpers, activeTool, onRemove, dashed = false) {
  switch (d.type) {
    case 'hline':     return renderHline(d, helpers, activeTool, onRemove);
    case 'trendline': return renderTrendline(d, helpers, activeTool, onRemove, dashed);
    case 'ray':       return renderRay(d, helpers, activeTool, onRemove, dashed);
    case 'rect':      return renderRect(d, helpers, activeTool, onRemove, dashed);
    case 'fib':       return renderFib(d, helpers, activeTool, onRemove, dashed);
    case 'text':      return renderText(d, helpers, activeTool, onRemove);
    default:          return null;
  }
}

export default function DrawingLayer({
  activeTool,
  width,
  height,
  priceMin,
  priceMax,
  priceAxisPan,
  priceZoom,
  chartData,
  drawings,
  onAddDrawing,
  onRemoveDrawing,
  theme,
}) {
  const [inProgress, setInProgress] = useState(null);

  const helpers = getCoordHelpers(width, height, priceMin, priceMax, priceAxisPan, priceZoom, chartData);

  const getPoint = useCallback((e) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return {
      x,
      y,
      price: helpers.yToPrice(y),
      ts: helpers.xToTimestamp(x),   // absolute timestamp — survives pan/zoom
    };
  }, [helpers]);

  const handleMouseDown = useCallback((e) => {
    if (activeTool === 'cursor') return;
    const pt = getPoint(e);

    if (activeTool === 'hline') {
      onAddDrawing({ id: String(Date.now() + Math.random()), type: 'hline', price: pt.price, color: DEFAULT_COLOR });
      return;
    }

    if (activeTool === 'text') {
      const label = window.prompt('Enter label:');
      if (label) {
        onAddDrawing({ id: String(Date.now() + Math.random()), type: 'text', price: pt.price, ts: pt.ts, text: label, color: DEFAULT_COLOR });
      }
      return;
    }

    setInProgress({
      type: activeTool,
      p1: { price: pt.price, ts: pt.ts },
      p2: { price: pt.price, ts: pt.ts },
      color: DEFAULT_COLOR,
    });
  }, [activeTool, getPoint, onAddDrawing]);

  const handleMouseMove = useCallback((e) => {
    if (!inProgress) return;
    const pt = getPoint(e);
    setInProgress((prev) => prev ? { ...prev, p2: { price: pt.price, ts: pt.ts } } : null);
  }, [inProgress, getPoint]);

  const handleMouseUp = useCallback((e) => {
    if (!inProgress) return;
    const pt = getPoint(e);
    onAddDrawing({ ...inProgress, id: String(Date.now() + Math.random()), p2: { price: pt.price, ts: pt.ts } });
    setInProgress(null);
  }, [inProgress, getPoint, onAddDrawing]);

  if (!width || !height) return null;

  const pointerEvents = activeTool === 'cursor' ? 'none' : 'all';
  const inProgressDrawing = inProgress ? { ...inProgress, id: '__in_progress__' } : null;

  return (
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents, cursor: getCursorForTool(activeTool), overflow: 'visible' }}
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {drawings.map((d) => renderDrawing(d, helpers, activeTool, onRemoveDrawing))}
      {inProgressDrawing && renderDrawing(inProgressDrawing, helpers, activeTool, () => {}, true)}
    </svg>
  );
}
