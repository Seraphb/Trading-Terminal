import React, { useState } from 'react';
import { Search } from 'lucide-react';

function CryptoLogo({ symbol }) {
  const base = symbol.replace(/USDT$/i, '').replace(/BTC$/i, '').replace(/ETH$/i, '').toLowerCase();
  const [err, setErr] = useState(false);
  if (err) return <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'hsl(217,33%,22%)', flexShrink: 0 }} />;
  return (
    <img
      src={`https://assets.coincap.io/assets/icons/${base}@2x.png`}
      alt={base} width={18} height={18}
      style={{ borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
      onError={() => setErr(true)}
    />
  );
}

const POPULAR_USDT = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT',
  'DOGEUSDT', 'SOLUSDT', 'AVAXUSDT', 'LINKUSDT', 'PEPEUSDT',
];
const POPULAR_BTC = [
  'ETHBTC', 'SOLBTC', 'BNBBTC', 'XRPBTC', 'ADABTC',
  'DOGEBTC', 'AVAXBTC', 'LINKBTC', 'DOTBTC', 'NEARBTC',
  'TAOBTC', 'INJBTC', 'APTBTC', 'SUIBTC', 'RENDERBTC',
];

export default function CryptoSearch({ activeSymbol: _activeSymbol, onSymbolChange, tickers: _tickers }) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [quote, setQuote] = useState('USDT'); // USDT or BTC

  const popular = quote === 'BTC' ? POPULAR_BTC : POPULAR_USDT;
  const filteredSuggestions = input.trim()
    ? [input.toUpperCase() + quote, ...popular.filter(s => s.includes(input.toUpperCase()))].slice(0, 6)
    : [];

  const handleSelect = (symbol) => {
    onSymbolChange(symbol.toLowerCase());
    setInput('');
    setShowSuggestions(false);
  };

  const getDisplayParts = (sym) => {
    if (sym.endsWith('BTC')) return { base: sym.replace(/BTC$/, ''), q: 'BTC' };
    if (sym.endsWith('ETH')) return { base: sym.replace(/ETH$/, ''), q: 'ETH' };
    return { base: sym.replace(/USDT$/, ''), q: 'USDT' };
  };

  return (
    <div className="border-b border-[hsl(217,33%,20%)]">
      <div className="flex items-center gap-2 px-3 py-2">
        <Search className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
        <div className="relative flex-1">
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value.toUpperCase());
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder={`Search ${quote === 'BTC' ? 'vs BTC' : 'crypto'}...`}
            className="w-full px-2 py-1 text-xs bg-[hsl(217,33%,15%)] border border-[hsl(217,33%,20%)] rounded text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[hsl(217,33%,17%)] border border-[hsl(217,33%,20%)] rounded shadow-lg z-50">
              {filteredSuggestions.map(s => {
                const { base, q } = getDisplayParts(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSelect(s)}
                    className="w-full px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-blue-500/20 transition-all flex items-center gap-2"
                  >
                    <CryptoLogo symbol={s} />
                    <span>{base}<span className="text-slate-600 text-[10px]">/{q}</span></span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {/* Quote toggle */}
        <div className="flex rounded overflow-hidden border border-[hsl(217,33%,20%)] flex-shrink-0">
          {['USDT', 'BTC'].map(q => (
            <button
              key={q}
              onClick={() => setQuote(q)}
              className="px-1.5 py-0.5 text-[9px] font-bold transition-all"
              style={{
                background: quote === q ? (q === 'BTC' ? 'rgba(247,147,26,0.2)' : 'rgba(59,130,246,0.2)') : 'transparent',
                color: quote === q ? (q === 'BTC' ? '#f7931a' : '#60a5fa') : '#475569',
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
      {/* BTC pair quick picks */}
      {quote === 'BTC' && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {['ETH','SOL','TAO','INJ','SUI','RENDER','NEAR','APT'].map(s => (
            <button
              key={s}
              onClick={() => handleSelect(s + 'BTC')}
              className="px-1.5 py-0.5 rounded text-[8px] font-bold transition-all hover:bg-orange-500/20"
              style={{ color: '#f7931a', background: 'rgba(247,147,26,0.08)', border: '1px solid rgba(247,147,26,0.15)' }}
            >
              {s}/BTC
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
