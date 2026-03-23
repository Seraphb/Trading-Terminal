import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTheme } from '../components/ThemeContext';
import { GitCompare, Plus, X, Search, RefreshCw } from 'lucide-react';

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7'];

const QUICK_ADD = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK'];

const TIMEFRAMES = [
  { label: '1H', interval: '1m', limit: 60 },
  { label: '4H', interval: '5m', limit: 48 },
  { label: '1D', interval: '15m', limit: 96 },
  { label: '1W', interval: '1h', limit: 168 },
  { label: '1M', interval: '4h', limit: 180 },
  { label: '3M', interval: '1d', limit: 90 },
  { label: '1Y', interval: '1d', limit: 365 },
];

const DATE_RANGES = ['1H', '4H', '1D', '1W', '1M', '3M', '6M', '1Y', '3Y', 'All'];

const DATE_RANGE_MAP = {
  '1H':  { interval: '1m',  limit: 60 },
  '4H':  { interval: '5m',  limit: 48 },
  '1D':  { interval: '15m', limit: 96 },
  '1W':  { interval: '1h',  limit: 168 },
  '1M':  { interval: '4h',  limit: 180 },
  '3M':  { interval: '1d',  limit: 90 },
  '6M':  { interval: '1d',  limit: 180 },
  '1Y':  { interval: '1d',  limit: 365 },
  '3Y':  { interval: '1w',  limit: 156 },
  'All': { interval: '1w',  limit: 500 },
};

const DEFAULT_ASSETS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const MAX_ASSETS = 5;

function formatDate(ts, interval) {
  const d = new Date(ts);
  if (['1m', '5m', '15m', '1h'].includes(interval)) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (interval === '4h') {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  if (interval === '1w') {
    return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatPrice(p) {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(6);
}

function stripSymbol(s) {
  return s.replace(/USDT$/, '');
}

export default function Compare() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [assets, setAssets] = useState(DEFAULT_ASSETS);
  const [assetData, setAssetData] = useState({});
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[4]); // 1M default
  const [dateRange, setDateRange] = useState('1M');
  const [searchInput, setSearchInput] = useState('');
  const [mousePos, setMousePos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const searchRef = useRef(null);

  // Fetch data for all assets
  const activeDateRange = DATE_RANGE_MAP[dateRange] || DATE_RANGE_MAP['1M'];
  const fetchAllData = useCallback(async () => {
    if (assets.length === 0) return;
    setLoading(true);
    setError(null);
    const results = {};
    try {
      const promises = assets.map(async (symbol) => {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${activeDateRange.interval}&limit=${activeDateRange.limit}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch ${symbol}`);
        const data = await res.json();
        return {
          symbol,
          candles: data.map(k => ({
            time: k[0],
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          })),
        };
      });
      const allResults = await Promise.all(promises);
      allResults.forEach(r => { results[r.symbol] = r.candles; });
      setAssetData(results);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [assets, activeDateRange]);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);

  const addAsset = (symbol) => {
    const sym = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : symbol.toUpperCase() + 'USDT';
    if (assets.length >= MAX_ASSETS || assets.includes(sym)) return;
    setAssets(prev => [...prev, sym]);
    setSearchInput('');
  };

  const removeAsset = (symbol) => {
    setAssets(prev => prev.filter(s => s !== symbol));
    setAssetData(prev => {
      const copy = { ...prev };
      delete copy[symbol];
      return copy;
    });
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchInput.trim()) {
      addAsset(searchInput.trim());
    }
  };

  // Normalize data: all series start at 100
  const normalizedData = useMemo(() => {
    const result = {};
    assets.forEach(symbol => {
      const candles = assetData[symbol];
      if (!candles || candles.length === 0) return;
      const firstClose = candles[0].close;
      result[symbol] = candles.map(c => ({
        time: c.time,
        normalized: (c.close / firstClose) * 100,
        close: c.close,
      }));
    });
    return result;
  }, [assets, assetData]);

  // Comparison table stats
  const comparisonStats = useMemo(() => {
    return assets.map(symbol => {
      const candles = assetData[symbol];
      if (!candles || candles.length < 2) return null;
      const closes = candles.map(c => c.close);
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      const startPrice = closes[0];
      const currentPrice = closes[closes.length - 1];
      const changePct = ((currentPrice - startPrice) / startPrice) * 100;
      const high = Math.max(...highs);
      const low = Math.min(...lows);
      return { symbol, startPrice, currentPrice, changePct, high, low };
    }).filter(Boolean);
  }, [assets, assetData]);

  // Draw chart on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = containerRef.current;
    if (!container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = 500;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 30, right: 90, bottom: 40, left: 70 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const activeSymbols = assets.filter(s => normalizedData[s] && normalizedData[s].length > 0);
    if (activeSymbols.length === 0) return;

    // Determine Y range across all assets
    let minVal = Infinity, maxVal = -Infinity;
    activeSymbols.forEach(s => {
      normalizedData[s].forEach(d => {
        if (d.normalized < minVal) minVal = d.normalized;
        if (d.normalized > maxVal) maxVal = d.normalized;
      });
    });
    const yPad = Math.max(Math.abs(maxVal - minVal) * 0.1, 2);
    minVal -= yPad;
    maxVal += yPad;

    const maxLen = Math.max(...activeSymbols.map(s => normalizedData[s].length));
    const refData = normalizedData[activeSymbols[0]];

    const xScale = (i) => padding.left + (i / (maxLen - 1)) * chartW;
    const yScale = (v) => padding.top + ((maxVal - v) / (maxVal - minVal)) * chartH;

    // Grid lines
    const gridColor = isDark ? 'rgba(148,163,184,0.08)' : 'rgba(100,116,139,0.12)';
    const textColor = isDark ? '#64748b' : '#94a3b8';
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;

    // Horizontal grid
    const yTicks = 8;
    const yStep = (maxVal - minVal) / yTicks;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = textColor;
    for (let i = 0; i <= yTicks; i++) {
      const val = maxVal - i * yStep;
      const y = yScale(val);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillText(val.toFixed(1), padding.left - 8, y + 4);
    }

    // 100 baseline
    if (minVal < 100 && maxVal > 100) {
      ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.25)' : 'rgba(100,116,139,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      const baseY = yScale(100);
      ctx.beginPath();
      ctx.moveTo(padding.left, baseY);
      ctx.lineTo(width - padding.right, baseY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    ctx.fillStyle = textColor;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    const xLabelCount = Math.min(8, maxLen);
    const xLabelStep = Math.max(1, Math.floor(maxLen / xLabelCount));
    for (let i = 0; i < maxLen; i += xLabelStep) {
      if (refData[i]) {
        const x = xScale(i);
        ctx.fillText(formatDate(refData[i].time, activeDateRange.interval), x, height - padding.bottom + 20);
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, height - padding.bottom);
        ctx.stroke();
      }
    }

    // Draw lines and fills for each asset
    activeSymbols.forEach((symbol) => {
      const data = normalizedData[symbol];
      const color = COLORS[assets.indexOf(symbol) % COLORS.length];

      // Semi-transparent fill below line
      ctx.beginPath();
      data.forEach((d, i) => {
        const x = xScale(i);
        const y = yScale(d.normalized);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(xScale(data.length - 1), height - padding.bottom);
      ctx.lineTo(xScale(0), height - padding.bottom);
      ctx.closePath();
      const hexToRgba = (hex, a) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${a})`;
      };
      ctx.fillStyle = hexToRgba(color, 0.08);
      ctx.fill();

      // Line
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      data.forEach((d, i) => {
        const x = xScale(i);
        const y = yScale(d.normalized);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Label at end of line
      const last = data[data.length - 1];
      const lx = xScale(data.length - 1);
      const ly = yScale(last.normalized);
      ctx.fillStyle = color;
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'left';
      const pctLabel = last.normalized >= 100
        ? `+${(last.normalized - 100).toFixed(1)}%`
        : `${(last.normalized - 100).toFixed(1)}%`;
      ctx.fillText(`${stripSymbol(symbol)} ${pctLabel}`, lx + 8, ly + 4);
    });

    // Legend (top-left corner)
    ctx.textAlign = 'left';
    activeSymbols.forEach((symbol, idx) => {
      const color = COLORS[assets.indexOf(symbol) % COLORS.length];
      const lx = padding.left + 10 + idx * 100;
      const ly = padding.top - 10;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.fillText(stripSymbol(symbol), lx + 8, ly + 4);
    });

    // Crosshair on hover
    if (mousePos) {
      const mx = mousePos.x;
      const my = mousePos.y;
      if (mx >= padding.left && mx <= width - padding.right && my >= padding.top && my <= height - padding.bottom) {
        const dataIdx = Math.round(((mx - padding.left) / chartW) * (maxLen - 1));
        const snapX = xScale(dataIdx);

        // Vertical crosshair
        ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.4)' : 'rgba(100,116,139,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(snapX, padding.top);
        ctx.lineTo(snapX, height - padding.bottom);
        ctx.stroke();

        // Horizontal crosshair
        ctx.beginPath();
        ctx.moveTo(padding.left, my);
        ctx.lineTo(width - padding.right, my);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tooltip
        const tooltipLines = [];
        activeSymbols.forEach(symbol => {
          const data = normalizedData[symbol];
          if (data[dataIdx]) {
            tooltipLines.push({
              symbol: stripSymbol(symbol),
              normalized: data[dataIdx].normalized,
              price: data[dataIdx].close,
              color: COLORS[assets.indexOf(symbol) % COLORS.length],
            });
          }
        });

        if (tooltipLines.length > 0) {
          const tooltipW = 210;
          const lineH = 20;
          const tooltipH = tooltipLines.length * lineH + 24;
          let tx = snapX + 15;
          let ty = my - tooltipH / 2;
          if (tx + tooltipW > width - padding.right) tx = snapX - tooltipW - 15;
          if (ty < padding.top) ty = padding.top;
          if (ty + tooltipH > height - padding.bottom) ty = height - padding.bottom - tooltipH;

          ctx.fillStyle = isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.95)';
          ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.2)' : 'rgba(100,116,139,0.2)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(tx, ty, tooltipW, tooltipH, 6);
          ctx.fill();
          ctx.stroke();

          // Date header
          const dateStr = refData[dataIdx] ? formatDate(refData[dataIdx].time, activeDateRange.interval) : '';
          ctx.fillStyle = textColor;
          ctx.font = '10px ui-monospace, monospace';
          ctx.textAlign = 'left';
          ctx.fillText(dateStr, tx + 10, ty + 14);

          tooltipLines.forEach((line, li) => {
            const rowY = ty + 26 + li * lineH;
            // Color dot
            ctx.fillStyle = line.color;
            ctx.beginPath();
            ctx.arc(tx + 14, rowY + 2, 4, 0, Math.PI * 2);
            ctx.fill();
            // Symbol
            ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b';
            ctx.font = 'bold 11px ui-monospace, monospace';
            ctx.textAlign = 'left';
            ctx.fillText(line.symbol, tx + 24, rowY + 6);
            // Price
            ctx.fillStyle = textColor;
            ctx.font = '11px ui-monospace, monospace';
            ctx.fillText('$' + formatPrice(line.price), tx + 70, rowY + 6);
            // Normalized value
            const pct = line.normalized - 100;
            ctx.fillStyle = pct >= 0 ? '#22c55e' : '#ef4444';
            ctx.textAlign = 'right';
            ctx.fillText((pct >= 0 ? '+' : '') + pct.toFixed(2) + '%', tx + tooltipW - 10, rowY + 6);
            ctx.textAlign = 'left';
          });

          // Dots on lines
          activeSymbols.forEach(symbol => {
            const data = normalizedData[symbol];
            if (data[dataIdx]) {
              const color = COLORS[assets.indexOf(symbol) % COLORS.length];
              const dy = yScale(data[dataIdx].normalized);
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(snapX, dy, 5, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = isDark ? '#0f172a' : '#ffffff';
              ctx.lineWidth = 2;
              ctx.stroke();
            }
          });
        }
      }
    }
  }, [assets, normalizedData, isDark, mousePos, timeframe, activeDateRange]);

  // Auto-resize canvas on window resize
  useEffect(() => {
    const handleResize = () => setMousePos(null);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleCanvasMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleCanvasMouseLeave = useCallback(() => {
    setMousePos(null);
  }, []);

  return (
    <div className={`h-full overflow-y-auto p-6 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}
      style={{ background: isDark ? 'hsl(222,47%,6%)' : '#f1f5f9' }}>
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <GitCompare size={28} className="text-blue-500" />
          <h1 className="text-2xl font-bold m-0"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #a855f7)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
            Multi-Asset Comparison
          </h1>
          <button
            onClick={fetchAllData}
            disabled={loading}
            className={`ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg border-none text-sm cursor-pointer
              ${isDark ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Asset Selector Panel */}
        <div className="terminal-panel mb-5 p-4">
          {/* Active asset chips */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {assets.map((symbol, idx) => (
              <div key={symbol}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold
                  ${isDark ? 'bg-slate-700/60' : 'bg-slate-100'}`}
                style={{ border: `1.5px solid ${COLORS[idx % COLORS.length]}` }}>
                <div className="w-2 h-2 rounded-full" style={{ background: COLORS[idx % COLORS.length] }} />
                {stripSymbol(symbol)}
                <button onClick={() => removeAsset(symbol)}
                  className={`bg-transparent border-none p-0 cursor-pointer flex items-center ml-0.5
                    ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                  <X size={14} />
                </button>
              </div>
            ))}

            {/* Search input */}
            {assets.length < MAX_ASSETS && (
              <div ref={searchRef} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full
                ${isDark ? 'bg-slate-700/40 border border-slate-600/30' : 'bg-white border border-slate-300/40'}`}>
                <Search size={14} className={isDark ? 'text-slate-500' : 'text-slate-400'} />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Add asset..."
                  className={`bg-transparent border-none outline-none text-sm w-24
                    ${isDark ? 'text-slate-200 placeholder:text-slate-500' : 'text-slate-800 placeholder:text-slate-400'}`}
                />
                {searchInput.trim() && (
                  <button onClick={() => addAsset(searchInput.trim())}
                    className="bg-transparent border-none p-0 cursor-pointer flex items-center text-blue-500 hover:text-blue-400">
                    <Plus size={14} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Quick-add buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Quick add:</span>
            {QUICK_ADD.map(sym => {
              const full = sym + 'USDT';
              const isAdded = assets.includes(full);
              return (
                <button
                  key={sym}
                  onClick={() => !isAdded && addAsset(sym)}
                  disabled={isAdded || assets.length >= MAX_ASSETS}
                  className={`px-2.5 py-1 rounded text-xs font-medium border-none cursor-pointer transition-colors
                    ${isAdded
                      ? (isDark ? 'bg-slate-700/30 text-slate-600 cursor-default' : 'bg-slate-100 text-slate-300 cursor-default')
                      : (isDark ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/60' : 'bg-slate-200 text-slate-600 hover:bg-slate-300')
                    }`}
                >
                  {sym}
                </button>
              );
            })}
          </div>

          {/* Date Range */}
          <div className={`mt-3 pt-3 flex items-center gap-2 flex-wrap ${isDark ? 'border-t border-slate-700/50' : 'border-t border-slate-200'}`}>
            <span className={`text-xs font-medium mr-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Range:</span>
            {DATE_RANGES.map(r => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-all border-none
                  ${dateRange === r
                    ? 'text-white'
                    : (isDark ? 'bg-slate-700/30 text-slate-500 hover:text-slate-300' : 'bg-slate-200/60 text-slate-400 hover:text-slate-600')
                  }`}
                style={dateRange === r
                  ? { background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }
                  : undefined}
              >
                {r}
              </button>
            ))}
            <span className={`ml-2 text-[10px] px-2 py-0.5 rounded ${isDark ? 'bg-slate-700/40 text-slate-500' : 'bg-slate-200 text-slate-400'}`}>
              candle: {activeDateRange.interval}
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-5 py-3 rounded-lg mb-4 text-sm"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className={`text-center py-10 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            Loading data...
          </div>
        )}

        {/* Canvas Chart */}
        <div
          ref={containerRef}
          className="terminal-panel mb-6 p-4"
        >
          <canvas
            ref={canvasRef}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={handleCanvasMouseLeave}
            style={{ display: 'block', width: '100%', height: 500, cursor: 'crosshair' }}
          />
        </div>

        {/* Comparison Table */}
        {comparisonStats.length > 0 && (
          <div className="terminal-panel p-5 overflow-x-auto">
            <h3 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
              <GitCompare size={16} className="text-blue-500" />
              Performance Comparison
            </h3>
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Symbol', 'Start Price', 'Current Price', 'Change %', 'High', 'Low'].map(h => (
                    <th key={h}
                      className={`text-xs font-semibold uppercase tracking-wider py-2.5 px-3
                        ${h === 'Symbol' ? 'text-left' : 'text-right'}
                        ${isDark ? 'text-slate-500 border-b border-slate-700/50' : 'text-slate-400 border-b border-slate-200'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonStats.map(stat => {
                  const color = COLORS[assets.indexOf(stat.symbol) % COLORS.length];
                  return (
                    <tr key={stat.symbol}
                      className={isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}>
                      <td className="py-2.5 px-3 text-sm font-bold"
                        style={{ color }}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                          {stripSymbol(stat.symbol)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-sm text-right font-mono">
                        ${formatPrice(stat.startPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-sm text-right font-mono">
                        ${formatPrice(stat.currentPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-sm text-right font-mono font-bold"
                        style={{ color: stat.changePct >= 0 ? '#22c55e' : '#ef4444' }}>
                        {stat.changePct >= 0 ? '+' : ''}{stat.changePct.toFixed(2)}%
                      </td>
                      <td className={`py-2.5 px-3 text-sm text-right font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        ${formatPrice(stat.high)}
                      </td>
                      <td className={`py-2.5 px-3 text-sm text-right font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        ${formatPrice(stat.low)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
