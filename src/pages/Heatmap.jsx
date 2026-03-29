import React, { useEffect, useState, useCallback, useMemo, useRef, Suspense, lazy } from 'react';
import { useTheme } from '../components/ThemeContext';
import {
  TrendingUp, TrendingDown, BarChart3, RefreshCw, ArrowUpDown,
  Clock, Flame, Layers, Gamepad2, Dog, Cpu, Filter, ChevronDown,
  Coins, LineChart, Zap, Building2, Pill, Droplets, ShoppingCart, Factory,
} from 'lucide-react';

const SymbolTerminalModal = lazy(() => import('../components/scanner/SymbolTerminalModal'));

// ── Crypto config ─────────────────────────────────────────────────────────────
const CRYPTO_CATEGORIES = {
  All: null,
  'Top 20': ['BTC','ETH','BNB','SOL','XRP','ADA','DOGE','AVAX','DOT','LINK','NEAR','UNI','ATOM','LTC','ETC','APT','SHIB','ARB','OP','INJ'],
  DeFi: ['UNI','AAVE','CRV','MKR','SUSHI','COMP','SNX','YFI','DYDX','BAL','KNC','ZRX','1INCH','CVX','PENDLE','GMX'],
  'Layer 1': ['BTC','ETH','SOL','ADA','AVAX','DOT','NEAR','ATOM','APT','SUI','SEI','INJ','FTM','ALGO'],
  Meme: ['DOGE','SHIB','PEPE','BONK','WIF','FLOKI','TURBO','NOT','MEME','PEOPLE','LUNC','1000SATS'],
  Gaming: ['MANA','SAND','GALA','AXS','ENJ','CHZ','APA','MAGIC','IMX'],
};

const CRYPTO_CATEGORY_ICONS = {
  All: Layers, 'Top 20': Flame, DeFi: BarChart3, 'Layer 1': Cpu, Meme: Dog, Gaming: Gamepad2,
};

// ── Stocks config ─────────────────────────────────────────────────────────────
const STOCK_UNIVERSE = [
  // Tech
  'AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AVGO','ORCL','AMD',
  'INTC','QCOM','TXN','NOW','CRM','ADBE','INTU','UBER','PLTR','SNOW',
  'NFLX','SHOP','SQ','PYPL','COIN','RBLX','SPOT','PINS','SNAP','LYFT',
  // Financials
  'JPM','BAC','WFC','GS','MS','V','MA','AXP','BLK','SCHW','C','USB','TFC','COF',
  // Healthcare
  'UNH','LLY','JNJ','ABBV','MRK','PFE','TMO','ABT','DHR','BMY','AMGN','GILD',
  // Energy
  'XOM','CVX','COP','EOG','SLB','PSX','VLO','MPC','OXY','HAL',
  // Consumer
  'COST','WMT','HD','MCD','NKE','SBUX','TGT','LOW','KO','PEP','MO','PM',
  // Industrials
  'BA','CAT','HON','UPS','FDX','DE','RTX','LMT','GE','MMM','NOC','GD',
];

const STOCK_CATEGORIES = {
  All: null,
  Tech: ['AAPL','MSFT','NVDA','GOOGL','META','AMZN','TSLA','AVGO','ORCL','AMD','INTC','QCOM','TXN','NOW','CRM','ADBE','INTU','UBER','PLTR','SNOW','NFLX'],
  Financials: ['JPM','BAC','WFC','GS','MS','V','MA','AXP','BLK','SCHW','C','USB','TFC','COF'],
  Healthcare: ['UNH','LLY','JNJ','ABBV','MRK','PFE','TMO','ABT','DHR','BMY','AMGN','GILD'],
  Energy: ['XOM','CVX','COP','EOG','SLB','PSX','VLO','MPC','OXY','HAL'],
  Consumer: ['COST','WMT','HD','MCD','NKE','SBUX','TGT','LOW','KO','PEP'],
  Industrials: ['BA','CAT','HON','UPS','FDX','DE','RTX','LMT','GE','MMM','NOC','GD'],
};

const STOCK_CATEGORY_ICONS = {
  All: Layers, Tech: Cpu, Financials: Building2, Healthcare: Pill,
  Energy: Zap, Consumer: ShoppingCart, Industrials: Factory,
};

const SORT_OPTIONS = [
  { key: 'volume', label: 'Volume' },
  { key: 'change', label: '% Change' },
  { key: 'alpha', label: 'A-Z' },
];

function getChangeColor(pct) {
  if (pct < -5) return { bg: '#991b1b', text: '#fecaca' };
  if (pct < -2) return { bg: '#b91c1c', text: '#fecaca' };
  if (pct < 0)  return { bg: '#dc2626', text: '#fef2f2' };
  if (pct < 2)  return { bg: '#16a34a', text: '#f0fdf4' };
  if (pct < 5)  return { bg: '#15803d', text: '#dcfce7' };
  return { bg: '#166534', text: '#bbf7d0' };
}

function formatVolume(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
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

export default function Heatmap() {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const [mode, setMode] = useState('crypto'); // 'crypto' | 'stocks'
  const [tickers, setTickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState('All');
  const [sortBy, setSortBy] = useState('volume');
  const [hoveredTicker, setHoveredTicker] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);
  const sortRef = useRef(null);
  const containerRef = useRef(null);

  const isCrypto = mode === 'crypto';
  const CATEGORIES = isCrypto ? CRYPTO_CATEGORIES : STOCK_CATEGORIES;
  const CATEGORY_ICONS = isCrypto ? CRYPTO_CATEGORY_ICONS : STOCK_CATEGORY_ICONS;

  const fetchCrypto = useCallback(async () => {
    try {
      const res = await fetch('https://api.binance.com/api/v3/ticker/24hr');
      if (!res.ok) throw new Error('Failed to fetch data');
      const data = await res.json();
      const usdt = data
        .filter(t => t.symbol.endsWith('USDT') && parseFloat(t.quoteVolume) > 0)
        .map(t => ({
          symbol: t.symbol,
          name: stripSymbol(t.symbol),
          price: parseFloat(t.lastPrice),
          change: parseFloat(t.priceChangePercent),
          volume: parseFloat(t.quoteVolume),
          high: parseFloat(t.highPrice),
          low: parseFloat(t.lowPrice),
        }));
      setTickers(usdt);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStocks = useCallback(async () => {
    try {
      // Fetch in batches of 50 (Yahoo Finance limit)
      const chunks = [];
      for (let i = 0; i < STOCK_UNIVERSE.length; i += 50) {
        chunks.push(STOCK_UNIVERSE.slice(i, i + 50));
      }
      const results = await Promise.all(
        chunks.map(chunk =>
          fetch(`/api/stocks/quotes?symbols=${chunk.join(',')}`)
            .then(r => r.ok ? r.json() : { quotes: [] })
        )
      );
      const quotes = results.flatMap(r => r.quotes || []);
      setTickers(quotes);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchData = isCrypto ? fetchCrypto : fetchStocks;

  useEffect(() => {
    setLoading(true);
    setTickers([]);
    setCategory('All');
    if (isCrypto) {
      fetchCrypto();
      const iv = setInterval(fetchCrypto, 30000);
      return () => clearInterval(iv);
    } else {
      fetchStocks();
      const iv = setInterval(fetchStocks, 60000);
      return () => clearInterval(iv);
    }
  }, [mode, fetchCrypto, fetchStocks]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (sortRef.current && !sortRef.current.contains(e.target)) setSortMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const catSymbols = CATEGORIES[category];
    let items;
    if (catSymbols) {
      if (isCrypto) {
        const set = new Set(catSymbols.map(s => s + 'USDT'));
        items = tickers.filter(t => set.has(t.symbol));
      } else {
        const set = new Set(catSymbols);
        items = tickers.filter(t => set.has(t.symbol));
      }
    } else {
      items = [...tickers].sort((a, b) => b.volume - a.volume).slice(0, 100);
    }

    if (sortBy === 'volume') items.sort((a, b) => b.volume - a.volume);
    else if (sortBy === 'change') items.sort((a, b) => b.change - a.change);
    else if (sortBy === 'alpha') items.sort((a, b) => a.name.localeCompare(b.name));

    return items;
  }, [tickers, category, sortBy, isCrypto, CATEGORIES]);

  const summary = useMemo(() => {
    if (!tickers.length) return null;
    const gainers = tickers.filter(t => t.change > 0).length;
    const losers = tickers.filter(t => t.change < 0).length;
    const sorted = [...tickers].sort((a, b) => b.change - a.change);
    const topGainer = sorted[0];
    const topLoser = sorted[sorted.length - 1];
    const totalVol = tickers.reduce((s, t) => s + t.volume, 0);
    if (isCrypto) {
      const btc = tickers.find(t => t.symbol === 'BTCUSDT');
      const btcDom = btc ? ((btc.volume / totalVol) * 100).toFixed(1) : '0';
      return { gainers, losers, topGainer, topLoser, totalVol, btcDom };
    }
    return { gainers, losers, topGainer, topLoser, totalVol };
  }, [tickers, isCrypto]);

  const blockSizes = useMemo(() => {
    if (!filtered.length) return [];
    // For stocks, size by marketCap if available, else volume
    const sizeKey = !isCrypto && filtered.some(t => t.marketCap > 0) ? 'marketCap' : 'volume';
    const maxVal = Math.max(...filtered.map(t => t[sizeKey] || t.volume));
    return filtered.map(t => {
      const val = t[sizeKey] || t.volume;
      const ratio = val / maxVal;
      const size = Math.max(70, Math.min(200, Math.round(70 + ratio * 130)));
      return { ...t, size };
    });
  }, [filtered, isCrypto]);

  const handleMouseMove = useCallback((e, ticker) => {
    setHoveredTicker(ticker);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredTicker(null);
  }, []);

  const handleTileClick = useCallback((ticker) => {
    setPreviewResult({
      symbol: isCrypto ? ticker.symbol : ticker.symbol,
      isCrypto,
      price: ticker.price,
      goldSignalTime: null,
      goldSignalPrice: null,
      signals: null,
      scanTimeframe: '1d',
      highlightMA: null,
    });
  }, [isCrypto]);

  const bg = dark ? '#0f1117' : '#f8fafc';
  const cardBg = dark ? '#1a1d27' : '#ffffff';
  const border = dark ? '#2a2d3a' : '#e2e8f0';
  const textPrimary = dark ? '#e2e8f0' : '#1e293b';
  const textSecondary = dark ? '#94a3b8' : '#64748b';
  const tabBg = dark ? '#252836' : '#f1f5f9';
  const tabActiveBg = dark ? '#3b3f51' : '#ffffff';

  if (loading && !tickers.length) {
    return (
      <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <RefreshCw size={32} className="animate-spin" style={{ color: textSecondary, margin: '0 auto 12px' }} />
          <div style={{ color: textSecondary, fontSize: 14 }}>Loading {isCrypto ? 'market' : 'stock'} data...</div>
        </div>
      </div>
    );
  }

  if (error && !tickers.length) {
    return (
      <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#ef4444' }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Connection Error</div>
          <div style={{ fontSize: 13, color: textSecondary, marginBottom: 16 }}>{error}</div>
          <button onClick={fetchData} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const gainerPct = summary ? (summary.gainers / (summary.gainers + summary.losers)) * 100 : 50;

  return (
    <div style={{ background: bg, height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BarChart3 size={22} style={{ color: '#3b82f6' }} />
          <h1 style={{ color: textPrimary, fontSize: 20, fontWeight: 700, margin: 0 }}>Market Heatmap</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Crypto / Stocks toggle */}
          <div style={{ display: 'flex', background: tabBg, borderRadius: 8, padding: 3, gap: 2 }}>
            {[{ id: 'crypto', icon: Coins, label: 'Crypto' }, { id: 'stocks', icon: LineChart, label: 'Stocks' }].map(m => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: active ? (dark ? '#3b82f6' : '#3b82f6') : 'transparent',
                    color: active ? '#fff' : textSecondary,
                    fontSize: 12, fontWeight: active ? 600 : 400,
                    transition: 'all 0.15s',
                  }}
                >
                  <Icon size={13} />
                  {m.label}
                </button>
              );
            })}
          </div>

          {lastUpdated && (
            <span style={{ color: textSecondary, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={12} />
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchData}
            style={{ background: 'transparent', border: `1px solid ${border}`, borderRadius: 6, padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <RefreshCw size={14} style={{ color: textSecondary }} />
          </button>
        </div>
      </div>

      {/* Market Summary Bar */}
      {summary && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 10, padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 200 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#22c55e', fontSize: 12, fontWeight: 600 }}>
                <TrendingUp size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                {summary.gainers} Gainers
              </span>
              <span style={{ color: '#ef4444', fontSize: 12, fontWeight: 600 }}>
                {summary.losers} Losers
                <TrendingDown size={12} style={{ display: 'inline', marginLeft: 4, verticalAlign: 'middle' }} />
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: '#ef4444', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${gainerPct}%`, background: '#22c55e', borderRadius: 3, transition: 'width 0.5s' }} />
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ color: textSecondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Top Gainer</div>
            <div style={{ color: '#22c55e', fontSize: 14, fontWeight: 700 }}>
              {summary.topGainer?.name} +{summary.topGainer?.change.toFixed(2)}%
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ color: textSecondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Top Loser</div>
            <div style={{ color: '#ef4444', fontSize: 14, fontWeight: 700 }}>
              {summary.topLoser?.name} {summary.topLoser?.change.toFixed(2)}%
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ color: textSecondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>24h Volume</div>
            <div style={{ color: textPrimary, fontSize: 14, fontWeight: 700 }}>${formatVolume(summary.totalVol)}</div>
          </div>

          {isCrypto && summary.btcDom && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: textSecondary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>BTC Dom</div>
              <div style={{ color: '#f59e0b', fontSize: 14, fontWeight: 700 }}>{summary.btcDom}%</div>
            </div>
          )}
        </div>
      )}

      {/* Controls Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: 4, background: tabBg, borderRadius: 8, padding: 3, flexWrap: 'wrap' }}>
          {Object.keys(CATEGORIES).map(cat => {
            const Icon = CATEGORY_ICONS[cat];
            const active = category === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: active ? tabActiveBg : 'transparent',
                  color: active ? textPrimary : textSecondary,
                  fontSize: 12, fontWeight: active ? 600 : 400,
                  boxShadow: active ? (dark ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.1)') : 'none',
                  transition: 'all 0.15s',
                }}
              >
                <Icon size={13} />
                {cat}
              </button>
            );
          })}
        </div>

        {/* Sort Dropdown */}
        <div ref={sortRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setSortMenuOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: `1px solid ${border}`, background: cardBg, color: textPrimary, fontSize: 12, cursor: 'pointer' }}
          >
            <ArrowUpDown size={13} />
            {SORT_OPTIONS.find(s => s.key === sortBy)?.label}
            <ChevronDown size={12} />
          </button>
          {sortMenuOpen && (
            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: cardBg, border: `1px solid ${border}`, borderRadius: 8, padding: 4, zIndex: 50, minWidth: 120, boxShadow: dark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.12)' }}>
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => { setSortBy(opt.key); setSortMenuOpen(false); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', borderRadius: 4, cursor: 'pointer', background: sortBy === opt.key ? (dark ? '#3b3f51' : '#e2e8f0') : 'transparent', color: textPrimary, fontSize: 12 }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Click hint */}
      <div style={{ color: textSecondary, fontSize: 11, marginBottom: 8, opacity: 0.7 }}>
        Click any tile to preview chart
      </div>

      {/* Heatmap Grid */}
      <div
        ref={containerRef}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 3, background: cardBg, border: `1px solid ${border}`, borderRadius: 10, padding: 6, minHeight: 300 }}
      >
        {blockSizes.length === 0 && (
          <div style={{ width: '100%', textAlign: 'center', padding: 40, color: textSecondary, fontSize: 14 }}>
            No data available for this category.
          </div>
        )}
        {blockSizes.map(ticker => {
          const colors = getChangeColor(ticker.change);
          const w = ticker.size;
          const h = Math.max(40, Math.round(ticker.size * 0.65));
          const isHovered = hoveredTicker?.symbol === ticker.symbol;
          return (
            <div
              key={ticker.symbol}
              onMouseMove={(e) => handleMouseMove(e, ticker)}
              onMouseLeave={handleMouseLeave}
              onClick={() => handleTileClick(ticker)}
              style={{
                flex: `0 0 ${w}px`,
                height: h,
                background: colors.bg,
                borderRadius: 5,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                transition: 'transform 0.12s, box-shadow 0.12s',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: isHovered ? '0 0 0 2px #3b82f6, 0 4px 12px rgba(59,130,246,0.3)' : 'none',
                transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                zIndex: isHovered ? 10 : 1,
              }}
            >
              <div style={{ color: colors.text, fontSize: w >= 100 ? 13 : 11, fontWeight: 700, lineHeight: 1.1, letterSpacing: 0.3 }}>
                {ticker.name}
              </div>
              <div style={{ color: colors.text, fontSize: w >= 100 ? 12 : 10, fontWeight: 600, opacity: 0.95, marginTop: 1 }}>
                {ticker.change >= 0 ? '+' : ''}{ticker.change.toFixed(2)}%
              </div>
              {w >= 100 && (
                <div style={{ color: colors.text, fontSize: 9, opacity: 0.7, marginTop: 1 }}>
                  ${formatPrice(ticker.price)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tooltip */}
      {hoveredTicker && (
        <div
          style={{
            position: 'fixed', left: tooltipPos.x + 14, top: tooltipPos.y - 10,
            background: dark ? '#1e2130' : '#fff', border: `1px solid ${dark ? '#3b3f51' : '#d1d5db'}`,
            borderRadius: 8, padding: '10px 14px', zIndex: 1000, pointerEvents: 'none',
            boxShadow: dark ? '0 8px 24px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.15)', minWidth: 180,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, color: textPrimary, marginBottom: 6 }}>
            {hoveredTicker.name}
            <span style={{ fontWeight: 400, fontSize: 11, color: textSecondary, marginLeft: 6 }}>
              {isCrypto ? '/ USDT' : ''}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 12px', fontSize: 12 }}>
            <span style={{ color: textSecondary }}>Price</span>
            <span style={{ color: textPrimary, fontWeight: 600, textAlign: 'right' }}>${formatPrice(hoveredTicker.price)}</span>
            <span style={{ color: textSecondary }}>24h Change</span>
            <span style={{ color: hoveredTicker.change >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600, textAlign: 'right' }}>
              {hoveredTicker.change >= 0 ? '+' : ''}{hoveredTicker.change.toFixed(2)}%
            </span>
            <span style={{ color: textSecondary }}>Volume</span>
            <span style={{ color: textPrimary, fontWeight: 600, textAlign: 'right' }}>{formatVolume(hoveredTicker.volume)}</span>
            <span style={{ color: textSecondary }}>24h High</span>
            <span style={{ color: textPrimary, fontWeight: 600, textAlign: 'right' }}>${formatPrice(hoveredTicker.high)}</span>
            <span style={{ color: textSecondary }}>24h Low</span>
            <span style={{ color: textPrimary, fontWeight: 600, textAlign: 'right' }}>${formatPrice(hoveredTicker.low)}</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
        {[
          { label: '< -5%', color: '#991b1b' },
          { label: '-5% to -2%', color: '#b91c1c' },
          { label: '-2% to 0%', color: '#dc2626' },
          { label: '0% to +2%', color: '#16a34a' },
          { label: '+2% to +5%', color: '#15803d' },
          { label: '> +5%', color: '#166534' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 14, height: 10, borderRadius: 2, background: item.color }} />
            <span style={{ color: textSecondary, fontSize: 10 }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* Preview Modal */}
      {previewResult && (
        <Suspense fallback={null}>
          <SymbolTerminalModal
            result={previewResult}
            onClose={() => setPreviewResult(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
