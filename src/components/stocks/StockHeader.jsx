import React, { useState } from 'react';

function StockLogoAvatar({ symbol }) {
  const [err, setErr] = useState(false);
  if (!err) return (
    <img
      src={`https://assets.parqet.com/logos/symbol/${symbol}?format=svg`}
      alt={symbol}
      className="w-9 h-9 rounded-xl flex-shrink-0 object-contain"
      onError={() => setErr(true)}
    />
  );
  return (
    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
      style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)', width: 36, height: 36 }}>
      {symbol.slice(0, 2)}
    </div>
  );
}
import { Search, RefreshCw, TrendingUp, TrendingDown, Star } from 'lucide-react';
import { getStockWatchlist, subscribeStockWatchlist, toggleStockWatchlistSymbol } from '@/lib/watchlists';

const POPULAR = ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','JPM','V','UNH'];
const STOCK_SUGGESTIONS = ['AAPL','MSFT','GOOGL','AMZN','TSLA','NVDA','META','NFLX','JPM','V','UNH','HD','JNJ','WMT','PG','MA','VISA','DIS','AXON'];

export default function StockHeader({ symbol, input, setInput, setSymbol, setPanOffset, klines, loading, theme }) {
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [watchlistSymbols, setWatchlistSymbols] = React.useState(() => getStockWatchlist());
  const lastCandle = klines[klines.length - 1];
  const prevCandle = klines[klines.length - 2];
  const priceChange = lastCandle && prevCandle ? ((lastCandle.close - prevCandle.close) / prevCandle.close * 100) : 0;
  const isUp = priceChange >= 0;

  const bg = theme === 'light' ? '#ffffff' : 'hsl(222,47%,11%)';
  const border = theme === 'light' ? 'hsl(210,20%,82%)' : 'hsl(217,33%,19%)';
  const textColor = theme === 'light' ? 'hsl(222,47%,15%)' : '#e2e8f0';
  const mutedColor = theme === 'light' ? 'hsl(215,15%,45%)' : '#64748b';
  const inputBg = theme === 'light' ? 'hsl(210,20%,96%)' : 'hsl(217,33%,15%)';

  const filteredSuggestions = input.trim()
    ? [...new Set([input.toUpperCase(), ...STOCK_SUGGESTIONS.filter(s => s.toUpperCase().includes(input.toUpperCase()))])].slice(0, 5)
    : [];
  const inWatchlist = watchlistSymbols.includes(symbol);

  React.useEffect(() => subscribeStockWatchlist(setWatchlistSymbols), []);

  return (
    <div style={{ background: bg, borderBottom: `1px solid ${border}` }} className="flex-shrink-0">
      {/* Company bar */}
      <div className="flex items-center gap-4 px-5 py-3">
        {/* Ticker avatar */}
        <StockLogoAvatar symbol={symbol} />
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg" style={{ color: textColor }}>{symbol}</span>
              <button
                type="button"
                onClick={() => toggleStockWatchlistSymbol(symbol)}
                className="transition-transform hover:scale-110"
                title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
              >
                <Star
                  className="w-4 h-4"
                  fill={inWatchlist ? '#eab308' : 'none'}
                  style={{ color: inWatchlist ? '#eab308' : mutedColor }}
                />
              </button>
            </div>
            {lastCandle?.close != null && (
              <>
                <span className={`font-mono-data font-bold text-xl ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                  ${lastCandle.close.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className={`flex items-center gap-1 text-sm font-semibold px-2 py-0.5 rounded-full ${isUp ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                  {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {isUp ? '+' : ''}{priceChange.toFixed(2)}%
                </span>
              </>
            )}
            {loading && <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />}
          </div>
        </div>

        {/* Search */}
        <form onSubmit={e => { e.preventDefault(); setSymbol(input.toUpperCase()); setPanOffset(0); setShowSuggestions(false); }}
          className="flex items-center gap-2 relative">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: mutedColor }} />
            <input value={input} onChange={e => { setInput(e.target.value.toUpperCase()); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              className="rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono w-28 focus:outline-none focus:ring-1 focus:ring-blue-500"
              style={{ background: inputBg, border: `1px solid ${border}`, color: textColor }}
              placeholder="TICKER" />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-28 bg-white border rounded-lg shadow-lg z-50"
                style={{ background: inputBg, border: `1px solid ${border}` }}>
                {filteredSuggestions.map(s => (
                  <button key={s} type="button"
                    onMouseDown={(e) => { e.preventDefault(); setSymbol(s); setInput(s); setPanOffset(0); setShowSuggestions(false); }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-blue-500/20 transition-all"
                    style={{ color: textColor }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg font-medium transition-all">
            Search
          </button>
        </form>
      </div>

      {/* Popular tickers */}
      <div className="flex items-center gap-1 px-5 pb-2 overflow-x-auto">
        {POPULAR.map(s => (
          <button key={s} onClick={() => { setSymbol(s); setInput(s); setPanOffset(0); }}
            className={`px-2.5 py-0.5 rounded-md text-[11px] transition-all font-mono flex-shrink-0 ${symbol === s
              ? 'bg-blue-600 text-white'
              : 'hover:bg-blue-500/10 hover:text-blue-400'}`}
            style={symbol !== s ? { color: mutedColor } : {}}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
