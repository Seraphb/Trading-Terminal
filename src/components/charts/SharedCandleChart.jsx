import React, { useRef, useCallback, useMemo, memo } from 'react';
import { formatAssetPrice } from '@/lib/assetPriceFormat';
import { niceYTicks } from '@/lib/niceScale';

export const PRICE_CHART_MARGIN = { top: 12, right: 72, bottom: 24, left: 0 };

export function formatPriceTwoDecimals(value) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatChartAxisPrice(value) {
  return formatAssetPrice(value);
}

// ── Crosshair layer: uses refs + direct DOM manipulation ──────────────────
// Zero React re-renders on mouse move — only the SVG attributes are updated.
function CrosshairLayer({ plotW, plotH, marginTop, crosshairStroke, crosshairBadgeFill, crosshairBadgeStroke, crosshairTextColor }) {
  return (
    <g style={{ pointerEvents: 'none', visibility: 'hidden' }} data-crosshair-root="">
      <line data-ch="hline" x1={0} x2={plotW} y1={0} y2={0} stroke={crosshairStroke} strokeWidth={1} strokeDasharray="4,4" />
      <line data-ch="vline" x1={0} y1={marginTop} x2={0} y2={marginTop + plotH} stroke={crosshairStroke} strokeWidth={1} strokeDasharray="4,4" />
      <rect data-ch="price-bg" x={0} y={0} width={74} height={22} fill={crosshairBadgeFill} stroke={crosshairBadgeStroke} strokeWidth={1} rx={3} opacity={0.95} />
      <text data-ch="price-text" x={0} y={0} textAnchor="middle" fill={crosshairTextColor} fontSize={11} fontFamily="'JetBrains Mono', monospace" fontWeight="700" />
      <rect data-ch="time-bg" x={0} y={marginTop + plotH + 4} width={64} height={18} fill={crosshairBadgeFill} stroke={crosshairBadgeStroke} strokeWidth={1} rx={2} opacity={0.95} />
      <text data-ch="time-text" x={0} y={marginTop + plotH + 15} textAnchor="middle" fill={crosshairTextColor} fontSize={10} fontFamily="'JetBrains Mono', monospace" fontWeight="600" />
    </g>
  );
}

// ── Measure layer: long-press 1.5s to activate, shows % with green/red shading ──
function MeasureLayer({ plotW, plotH, marginTop }) {
  return (
    <g style={{ pointerEvents: 'none', visibility: 'hidden' }} data-measure-root="">
      {/* Shaded area between anchor and cursor */}
      <rect data-m="shade" x={0} y={0} width={0} height={0} opacity={0.12} />
      {/* Horizontal anchor line */}
      <line data-m="anchor-line" x1={0} x2={0} y1={0} y2={0} stroke="#3b82f6" strokeWidth={1} strokeDasharray="2,2" opacity={0.5} />
      {/* Percentage badge */}
      <rect data-m="pct-bg" x={0} y={0} width={90} height={24} rx={4} fill="#1e293b" stroke="#3b82f6" strokeWidth={1} opacity={0.95} />
      <text data-m="pct-text" x={0} y={0} textAnchor="middle" fontSize={12} fontFamily="'JetBrains Mono', monospace" fontWeight="700" fill="#60a5fa" />
      {/* Anchor dot */}
      <circle data-m="anchor-dot" cx={0} cy={0} r={4} fill="#3b82f6" stroke="#fff" strokeWidth={1.5} />
    </g>
  );
}

export default memo(function SharedCandleChart({
  chartData,
  priceMin,
  priceMax,
  width,
  height,
  emaLines = [],
  overlayElements,
  showVolume = true,
  priceAxisPan = 0,
  priceZoom = 1,
  isDragging = false,
  dragAxisRef = null,
  measureActiveRef = null,
  onCrosshairChange,
  axisPriceFormatter = formatChartAxisPrice,
  lastPriceFormatter = formatChartAxisPrice,
  crosshairPriceFormatter = formatPriceTwoDecimals,
  bullColor = '#10b981',
  bearColor = '#ef4444',
  volumeBullFill = 'rgba(16,185,129,0.25)',
  volumeBearFill = 'rgba(239,68,68,0.25)',
  gridStroke = 'hsl(217,33%,19%)',
  gridOpacity = 0.6,
  axisLabelColor = '#6b7280',
  crosshairStroke = 'rgba(148,163,184,0.4)',
  crosshairBadgeFill = '#1e293b',
  crosshairBadgeStroke = '#3b82f6',
  crosshairTextColor = '#60a5fa',
  topOverlay = null,
}) {
  const svgRef = useRef(null);
  const measureAnchorRef = useRef(null); // { price, x, y } — set after 1.5s hold
  const longPressTimerRef = useRef(null);
  const longPressStartRef = useRef(null); // { clientX, clientY } — to detect movement
  const crosshairPriceFormatterRef = useRef(crosshairPriceFormatter);
  crosshairPriceFormatterRef.current = crosshairPriceFormatter;
  const onCrosshairChangeRef = useRef(onCrosshairChange);
  onCrosshairChangeRef.current = onCrosshairChange;

  if (!chartData.length || width < 10 || height < 10) return null;

  const plotW = width - PRICE_CHART_MARGIN.left - PRICE_CHART_MARGIN.right;
  const plotH = height - PRICE_CHART_MARGIN.top - PRICE_CHART_MARGIN.bottom;

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
  const candleBodyW = Math.max(2, spacing * 0.6);
  const wickW = Math.max(0.5, spacing * 0.1);

  const maxVol = Math.max(...chartData.filter(d => !d.isBlank).map((d) => d.volume), 1);
  const volH = plotH * 0.2;

  const tickCount = Math.max(3, Math.floor(plotH / 48));
  const yTicks = niceYTicks(adjustedMin, adjustedMax, tickCount).map((price) => ({
    price,
    y: toY(price),
  }));

  const xTickEvery = Math.max(1, Math.round(80 / spacing));
  const xTicks = chartData
    .map((d, i) => ({ label: d.axisTimeStr ?? d.timeStr, x: toX(i) }))
    .filter((_, i) => i % xTickEvery === 0);

  let lastCandle = null;
  for (let i = chartData.length - 1; i >= 0; i--) {
    if (!chartData[i].isBlank) { lastCandle = chartData[i]; break; }
  }
  const lastPrice = lastCandle?.close;
  const lastPriceY = lastPrice != null ? toY(lastPrice) : null;
  const lastPriceColor = lastCandle?.close >= lastCandle?.open ? bullColor : bearColor;
  const yToPrice = (y) => adjustedMin + (1 - (y - PRICE_CHART_MARGIN.top) / plotH) * adjustedRange;

  // ── Direct DOM measure update (no React re-render) ──
  const updateMeasureDOM = (svgEl, mouseX, mouseY, curPrice) => {
    const root = svgEl.querySelector('[data-measure-root]');
    if (!root) return;
    const anchor = measureAnchorRef.current;

    if (!anchor || mouseX == null) {
      root.style.visibility = 'hidden';
      return;
    }

    root.style.visibility = 'visible';
    const pctChange = ((curPrice - anchor.price) / anchor.price) * 100;
    const isUp = pctChange >= 0;
    const pctStr = `${isUp ? '+' : ''}${pctChange.toFixed(2)}%`;
    const color = isUp ? '#10b981' : '#ef4444';

    const shade = root.querySelector('[data-m="shade"]');
    const dot = root.querySelector('[data-m="anchor-dot"]');
    const anchorLine = root.querySelector('[data-m="anchor-line"]');
    const pctBg = root.querySelector('[data-m="pct-bg"]');
    const pctText = root.querySelector('[data-m="pct-text"]');

    // Shaded area: full width, between anchor Y and cursor Y
    const shadeTop = Math.min(anchor.y, mouseY);
    const shadeH = Math.abs(mouseY - anchor.y);
    shade.setAttribute('x', PRICE_CHART_MARGIN.left);
    shade.setAttribute('y', shadeTop);
    shade.setAttribute('width', plotW);
    shade.setAttribute('height', shadeH);
    shade.setAttribute('fill', color);

    dot.setAttribute('cx', anchor.x);
    dot.setAttribute('cy', anchor.y);

    anchorLine.setAttribute('x1', PRICE_CHART_MARGIN.left);
    anchorLine.setAttribute('x2', PRICE_CHART_MARGIN.left + plotW);
    anchorLine.setAttribute('y1', anchor.y);
    anchorLine.setAttribute('y2', anchor.y);

    // Position badge near cursor
    const badgeX = mouseX + 12;
    const badgeY = mouseY - 30;
    pctBg.setAttribute('x', badgeX);
    pctBg.setAttribute('y', badgeY);
    pctBg.setAttribute('stroke', color);

    pctText.setAttribute('x', badgeX + 45);
    pctText.setAttribute('y', badgeY + 16);
    pctText.setAttribute('fill', color);
    pctText.textContent = pctStr;
  };

  const clearMeasure = () => {
    measureAnchorRef.current = null;
    if (measureActiveRef) measureActiveRef.current = false;
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    longPressStartRef.current = null;
    const svgEl = svgRef.current;
    if (svgEl) {
      const root = svgEl.querySelector('[data-measure-root]');
      if (root) root.style.visibility = 'hidden';
    }
  };

  // ── Direct DOM crosshair update (no React re-render) ──
  const updateCrosshairDOM = (svgEl, mouseX, mouseY, priceStr, timeStr) => {
    const root = svgEl.querySelector('[data-crosshair-root]');
    if (!root) return;

    if (mouseX == null) {
      root.style.visibility = 'hidden';
      return;
    }
    root.style.visibility = 'visible';

    const hline = root.querySelector('[data-ch="hline"]');
    const vline = root.querySelector('[data-ch="vline"]');
    const priceBg = root.querySelector('[data-ch="price-bg"]');
    const priceText = root.querySelector('[data-ch="price-text"]');
    const timeBg = root.querySelector('[data-ch="time-bg"]');
    const timeText = root.querySelector('[data-ch="time-text"]');

    hline.setAttribute('x1', PRICE_CHART_MARGIN.left);
    hline.setAttribute('x2', PRICE_CHART_MARGIN.left + plotW);
    hline.setAttribute('y1', mouseY);
    hline.setAttribute('y2', mouseY);

    vline.setAttribute('x1', mouseX);
    vline.setAttribute('x2', mouseX);

    priceBg.setAttribute('x', PRICE_CHART_MARGIN.left + plotW + 2);
    priceBg.setAttribute('y', mouseY - 11);
    priceText.setAttribute('x', PRICE_CHART_MARGIN.left + plotW + 39);
    priceText.setAttribute('y', mouseY + 5);
    priceText.textContent = priceStr;

    timeBg.setAttribute('x', mouseX - 32);
    timeText.setAttribute('x', mouseX);
    timeText.textContent = timeStr;
  };

  const handleMouseMove = (event) => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    // Cancel long-press if user moved more than 5px (they're dragging)
    if (longPressTimerRef.current && longPressStartRef.current) {
      const dx = event.clientX - longPressStartRef.current.clientX;
      const dy = event.clientY - longPressStartRef.current.clientY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        longPressStartRef.current = null;
      }
    }

    const rect = svgEl.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const inPlotArea =
      mouseX >= PRICE_CHART_MARGIN.left &&
      mouseX <= PRICE_CHART_MARGIN.left + plotW &&
      mouseY >= PRICE_CHART_MARGIN.top &&
      mouseY <= PRICE_CHART_MARGIN.top + plotH;

    if (!inPlotArea) {
      updateCrosshairDOM(svgEl, null);
      onCrosshairChangeRef.current?.(null);
      return;
    }

    const idx = Math.min(Math.floor((mouseX - PRICE_CHART_MARGIN.left) / spacing), candleCount - 1);
    const price = yToPrice(mouseY);
    const timeStr = chartData[idx]?.timeStr || '';
    const priceStr = crosshairPriceFormatterRef.current(price);

    updateCrosshairDOM(svgEl, mouseX, mouseY, priceStr, timeStr);
    updateMeasureDOM(svgEl, mouseX, mouseY, price);
    onCrosshairChangeRef.current?.({ x: mouseX, y: mouseY, price, time: timeStr, index: idx, plotX: mouseX });
  };

  const handleMouseLeave = () => {
    const svgEl = svgRef.current;
    if (svgEl) {
      updateCrosshairDOM(svgEl, null);
      updateMeasureDOM(svgEl, null, null, null);
    }
    onCrosshairChangeRef.current?.(null);
    // Cancel long-press if mouse leaves
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
  };

  // Long-press: hold 1.5s to activate measure mode
  const handleMeasureMouseDown = (event) => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const inPlotArea =
      mouseX >= PRICE_CHART_MARGIN.left &&
      mouseX <= PRICE_CHART_MARGIN.left + plotW &&
      mouseY >= PRICE_CHART_MARGIN.top &&
      mouseY <= PRICE_CHART_MARGIN.top + plotH;
    if (!inPlotArea) return;

    longPressStartRef.current = { clientX: event.clientX, clientY: event.clientY };
    longPressTimerRef.current = setTimeout(() => {
      // Only activate if mouse hasn't moved much (not a drag)
      const start = longPressStartRef.current;
      if (!start) return;
      const price = yToPrice(mouseY);
      measureAnchorRef.current = { price, x: mouseX, y: mouseY };
      if (measureActiveRef) measureActiveRef.current = true;
      longPressTimerRef.current = null;
    }, 850);
  };

  const handleMeasureMouseUp = () => {
    // If measure is active, clear it on release
    if (measureAnchorRef.current) {
      clearMeasure();
    }
    // Cancel pending long-press timer
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    longPressStartRef.current = null;
  };

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMeasureMouseDown}
      onMouseUp={handleMeasureMouseUp}
      style={{
        display: 'block',
        background: 'transparent',
        cursor:
          isDragging && dragAxisRef === 'x'
            ? 'ew-resize'
            : isDragging && dragAxisRef === 'y'
              ? 'ns-resize'
              : 'crosshair',
      }}
    >
      {yTicks.map(({ y, price }, i) => (
        <line
          key={i}
          x1={PRICE_CHART_MARGIN.left}
          x2={PRICE_CHART_MARGIN.left + plotW}
          y1={y}
          y2={y}
          stroke={gridStroke}
          strokeWidth={0.5}
          opacity={gridOpacity}
        />
      ))}

      {/* ── Overlay layer (behind candles) ── */}
      {overlayElements}

      {/* ── Volume + Candles: batched into <path> elements for performance ── */}
      {(() => {
        let volBullD = '', volBearD = '';
        let bullWickD = '', bearWickD = '';
        let bullBodyD = '', bearBodyD = '';
        const volBase = PRICE_CHART_MARGIN.top + plotH;
        const halfBody = candleBodyW / 2;

        for (let i = 0; i < chartData.length; i++) {
          const d = chartData[i];
          if (d.isBlank) continue;
          const x = toX(i);
          const isBull = d.close >= d.open;

          if (showVolume) {
            const barH = Math.max((d.volume / maxVol) * volH, 1);
            const vd = `M${x - halfBody},${volBase - barH}h${candleBodyW}v${barH}h${-candleBodyW}Z`;
            if (isBull) volBullD += vd; else volBearD += vd;
          }

          const highY = toY(d.high);
          const lowY = toY(d.low);
          const openY = toY(d.open);
          const closeY = toY(d.close);
          const bodyTop = Math.min(openY, closeY);
          const bodyH = Math.max(Math.max(openY, closeY) - bodyTop, 2);

          const wick = `M${x},${highY}V${lowY}`;
          const body = `M${x - halfBody},${bodyTop}h${candleBodyW}v${bodyH}h${-candleBodyW}Z`;
          if (isBull) { bullWickD += wick; bullBodyD += body; }
          else        { bearWickD += wick; bearBodyD += body; }
        }

        return (
          <>
            {showVolume && volBullD && <path d={volBullD} fill={volumeBullFill} />}
            {showVolume && volBearD && <path d={volBearD} fill={volumeBearFill} />}
            {bullWickD && <path d={bullWickD} fill="none" stroke={bullColor} strokeWidth={wickW} opacity={0.9} />}
            {bearWickD && <path d={bearWickD} fill="none" stroke={bearColor} strokeWidth={wickW} opacity={0.9} />}
            {bullBodyD && <path d={bullBodyD} fill={bullColor} stroke={bullColor} strokeWidth={1} opacity={0.85} />}
            {bearBodyD && <path d={bearBodyD} fill={bearColor} stroke={bearColor} strokeWidth={1} opacity={0.9} />}
          </>
        );
      })()}

      {emaLines
        .filter((line) => line.show)
        .map((line) => (
          <polyline
            key={line.key}
            points={chartData
              .map((datum, index) =>
                datum[line.dataKey] != null ? `${toX(index)},${toY(datum[line.dataKey])}` : null
              )
              .filter(Boolean)
              .join(' ')}
            fill="none"
            stroke={line.color}
            strokeWidth={line.strokeWidth ?? 1.5}
            strokeDasharray={line.strokeDasharray}
            opacity={line.opacity ?? 0.8}
          />
        ))}

      {/* ── Top overlay (signal markers etc.) — rendered above candles ── */}
      {topOverlay}

      {lastPriceY != null && (
        <g>
          <line
            x1={PRICE_CHART_MARGIN.left}
            x2={PRICE_CHART_MARGIN.left + plotW}
            y1={lastPriceY}
            y2={lastPriceY}
            stroke={lastPriceColor}
            strokeWidth={1}
            strokeDasharray="3,3"
            opacity={0.6}
          />
          <rect x={PRICE_CHART_MARGIN.left + plotW + 2} y={lastPriceY - 10} width={72} height={20} fill={lastPriceColor} rx={3} opacity={0.9} />
          <text
            x={PRICE_CHART_MARGIN.left + plotW + 36}
            y={lastPriceY + 5}
            textAnchor="middle"
            fill="#fff"
            fontSize={11}
            fontFamily="'JetBrains Mono', monospace"
            fontWeight="700"
          >
            {lastPriceFormatter(lastPrice)}
          </text>
        </g>
      )}

      <rect
        x={PRICE_CHART_MARGIN.left + plotW}
        y={0}
        width={72}
        height={height}
        fill="transparent"
        pointerEvents="auto"
        style={{ cursor: 'ns-resize' }}
      />

      {yTicks.map(({ y, price }, i) => (
        <text
          key={i}
          x={PRICE_CHART_MARGIN.left + plotW + 6}
          y={y + 3.5}
          fill={axisLabelColor}
          fontSize={11}
          fontFamily="'JetBrains Mono', monospace"
          fontWeight="500"
        >
          {axisPriceFormatter(price)}
        </text>
      ))}

      <rect
        x={0}
        y={PRICE_CHART_MARGIN.top + plotH}
        width={width}
        height={24}
        fill="transparent"
        pointerEvents="auto"
        style={{ cursor: 'ew-resize' }}
      />

      {xTicks.map(({ label, x }) => (
        <text
          key={`xl-${x}`}
          x={x}
          y={PRICE_CHART_MARGIN.top + plotH + 18}
          textAnchor="middle"
          fill={axisLabelColor}
          fontSize={10}
          fontFamily="'JetBrains Mono', monospace"
        >
          {label}
        </text>
      ))}

      {/* Measure: long-press % change tool */}
      <MeasureLayer plotW={plotW} plotH={plotH} marginTop={PRICE_CHART_MARGIN.top} />

      {/* Crosshair: rendered once, updated via direct DOM manipulation */}
      <CrosshairLayer
        plotW={plotW}
        plotH={plotH}
        marginTop={PRICE_CHART_MARGIN.top}
        crosshairStroke={crosshairStroke}
        crosshairBadgeFill={crosshairBadgeFill}
        crosshairBadgeStroke={crosshairBadgeStroke}
        crosshairTextColor={crosshairTextColor}
      />
    </svg>
  );
});
