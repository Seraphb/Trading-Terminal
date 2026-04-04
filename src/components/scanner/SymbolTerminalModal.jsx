import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTheme } from '../ThemeContext';
import PriceChart from '../terminal/PriceChart';
import { useBinanceKlines } from '../terminal/useBinanceWS';
import { fetchStockHistory } from '@/api/stockMarketClient';

// ── Crypto view — live via Binance WebSocket ───────────────────────────────
function CryptoView({ symbol, goldSignalTime, goldSignalPrice, signals, scanTimeframe, highlightMA }) {
  const sym = symbol.toLowerCase();
  const initInterval = scanTimeframe === '4h' ? '4h' : scanTimeframe === '1d' ? '1d' : '1w';
  const initRange = scanTimeframe === '4h' ? '3M' : scanTimeframe === '1d' ? '1Y' : '3Y';
  const [interval, setInterval]       = useState(initInterval);
  const [dateRange, setDateRange]     = useState(initRange);
  const [visibleRange, setVisibleRange] = useState(null);
  const { klines, loading }           = useBinanceKlines(sym, interval);

  return (
    <div className="h-full">
      <PriceChart
        klines={klines}
        loading={loading}
        symbol={sym}
        interval={interval}
        dateRange={dateRange}
        onIntervalChange={setInterval}
        onDateRangeChange={setDateRange}
        onVisibleRangeChange={setVisibleRange}
        goldSignalTime={goldSignalTime}
        goldSignalPrice={goldSignalPrice}
        signals={signals}
        highlightMA={highlightMA}
      />
    </div>
  );
}

// ── Stock view — fetches historical data ──────────────────────────────────
function StockView({ symbol, goldSignalTime, goldSignalPrice, signals, scanTimeframe, highlightMA }) {
  const initInterval = scanTimeframe === '1d' ? '1d' : '1w';
  const initRange = scanTimeframe === '1d' ? '1Y' : '3Y';
  const [interval, setChartInterval]   = useState(initInterval);
  const [dateRange, setDateRange]       = useState(initRange);
  const [visibleRange, setVisibleRange] = useState(null);
  const [klines, setKlines]             = useState([]);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setKlines([]);
    const cfg = interval === '1d'
      ? { interval: '1d', range: '5y', bars: 1300 }
      : { interval: '1w', range: '5y', bars: 260 };
    fetchStockHistory(symbol, cfg)
      .then((data) => {
        if (!cancelled && data) setKlines(data);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, interval]);

  return (
    <div className="h-full">
      <PriceChart
        klines={klines}
        loading={loading}
        symbol={symbol.toLowerCase()}
        interval={interval}
        dateRange={dateRange}
        onIntervalChange={setChartInterval}
        onDateRangeChange={setDateRange}
        onVisibleRangeChange={setVisibleRange}
        goldSignalTime={goldSignalTime}
        goldSignalPrice={goldSignalPrice}
        signals={signals}
        highlightMA={highlightMA}
      />
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────
export default function SymbolTerminalModal({ result, onClose }) {
  const { theme } = useTheme();
  const bg          = theme === 'light' ? 'hsl(210,20%,93%)' : 'hsl(222,47%,10%)';
  const cardBg      = theme === 'light' ? '#ffffff'           : 'hsl(222,47%,12%)';
  const borderColor = theme === 'light' ? 'hsl(210,20%,82%)' : 'hsl(217,33%,20%)';
  const textColor   = theme === 'light' ? 'hsl(240,15%,15%)' : '#e2e8f0';
  const mutedColor  = theme === 'light' ? 'hsl(240,8%,45%)'  : 'hsl(215,20%,55%)';

  // Close on backdrop click
  const onBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ background: 'rgba(0,0,0,0.80)' }}
      onClick={onBackdrop}
    >
      <div
        className="relative flex flex-col overflow-hidden rounded-xl"
        style={{
          width: '92vw',
          height: '88vh',
          background: bg,
          border: `1px solid ${borderColor}`,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-2.5 flex-shrink-0"
          style={{ borderBottom: `1px solid ${borderColor}`, background: cardBg }}
        >
          <div className="flex items-center gap-3">
            <span className="font-bold text-base" style={{ color: textColor }}>
              {result.symbol}
            </span>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
              style={{
                background: result.isCrypto ? 'rgba(251,191,36,0.12)' : 'rgba(59,130,246,0.12)',
                color:      result.isCrypto ? '#f59e0b'                : '#3b82f6',
              }}
            >
              {result.isCrypto ? 'Crypto' : 'Stock'}
            </span>
            <span className="text-xs font-mono" style={{ color: mutedColor }}>
              ${result.price.toLocaleString(undefined, { maximumFractionDigits: 6 })}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:opacity-70"
            style={{ color: textColor }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Chart area */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {result.isCrypto
            ? <CryptoView symbol={result.symbol} goldSignalTime={result.goldSignalTime} goldSignalPrice={result.goldSignalPrice} signals={result.signals} scanTimeframe={result.scanTimeframe} highlightMA={result.highlightMA} />
            : <StockView  symbol={result.symbol} goldSignalTime={result.goldSignalTime} goldSignalPrice={result.goldSignalPrice} signals={result.signals} scanTimeframe={result.scanTimeframe} highlightMA={result.highlightMA} />
          }
        </div>
      </div>
    </div>
  );
}
