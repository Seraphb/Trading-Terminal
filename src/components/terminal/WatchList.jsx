import React, { useEffect, useState, useCallback } from 'react';

function getSymbolParts(symbol) {
  const s = symbol.toUpperCase();
  if (s.endsWith('BTC')) return { base: s.replace(/BTC$/, ''), quote: 'BTC' };
  if (s.endsWith('ETH')) return { base: s.replace(/ETH$/, ''), quote: 'ETH' };
  return { base: s.replace(/USDT$/, ''), quote: 'USDT' };
}

function CryptoLogo({ symbol, size = 20 }) {
  const { base } = getSymbolParts(symbol);
  const [err, setErr] = useState(false);
  if (err) return <div style={{ width: size, height: size, borderRadius: '50%', background: 'hsl(217,33%,22%)', flexShrink: 0 }} />;
  return (
    <img
      src={`https://assets.coincap.io/assets/icons/${base.toLowerCase()}@2x.png`}
      alt={base}
      width={size} height={size}
      style={{ borderRadius: '50%', flexShrink: 0, objectFit: 'cover', width: size, height: size }}
      onError={() => setErr(true)}
    />
  );
}
import { GripVertical, Star, X } from 'lucide-react';
import {
  getTerminalWatchlist,
  removeTerminalWatchlistSymbol,
  reorderTerminalWatchlist,
  subscribeTerminalWatchlist,
} from '@/lib/watchlists';
import { formatAssetPrice } from '@/lib/assetPriceFormat';

export default function WatchList({ tickers, activeSymbol, onSymbolChange }) {
  const [symbols, setSymbols] = useState(() => getTerminalWatchlist());
  const [draggedSymbol, setDraggedSymbol] = useState(null);

  useEffect(() => subscribeTerminalWatchlist(setSymbols), []);

  const remove = (sym) => {
    const next = removeTerminalWatchlistSymbol(sym);
    if (activeSymbol?.toUpperCase() === sym && next.length) {
      onSymbolChange(next[0].toLowerCase());
    }
  };

  const moveSymbol = (fromSymbol, toSymbol) => {
    if (!fromSymbol || !toSymbol || fromSymbol === toSymbol) return;
    const current = getTerminalWatchlist();
    const fromIndex = current.indexOf(fromSymbol);
    const toIndex = current.indexOf(toSymbol);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...current];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    reorderTerminalWatchlist(next);
  };

  return (
    <div className="terminal-panel flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-[hsl(217,33%,20%)] flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Star className="w-3 h-3 text-yellow-500" />
          <h3 className="text-[10px] font-semibold text-slate-300 tracking-wider uppercase">Watchlist</h3>
        </div>
        <span className="text-[9px] text-slate-600">drag to reorder</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {symbols.map((sym) => {
          const ticker = tickers[sym];
          const isActive = activeSymbol?.toUpperCase() === sym;
          const isDragging = draggedSymbol === sym;

          return (
            <div
              key={sym}
              draggable
              onDragStart={(event) => {
                setDraggedSymbol(sym);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', sym);
              }}
              onDragEnd={() => setDraggedSymbol(null)}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(event) => {
                event.preventDefault();
                const fromSymbol = event.dataTransfer.getData('text/plain') || draggedSymbol;
                moveSymbol(fromSymbol, sym);
                setDraggedSymbol(null);
              }}
              className={`flex items-stretch border-b border-[hsl(217,33%,15%)] ${
                isDragging ? 'opacity-60' : ''
              } ${
                isActive ? 'bg-blue-600/10 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent hover:bg-[hsl(222,47%,13%)]'
              }`}
            >
              <div className="flex items-center px-1.5 text-slate-700 cursor-grab active:cursor-grabbing">
                <GripVertical className="w-3 h-3" />
              </div>

              <button
                type="button"
                onClick={() => onSymbolChange(sym.toLowerCase())}
                className="flex flex-1 items-center justify-between py-1.5 text-left transition-all"
              >
                <div className="flex items-center min-w-0">
                  <div className="w-8 flex justify-start pl-1 flex-shrink-0">
                    <CryptoLogo symbol={sym} size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-white truncate">{getSymbolParts(sym).base}</div>
                    <div className="text-[9px]" style={{ color: getSymbolParts(sym).quote === 'BTC' ? '#f7931a' : '#475569' }}>{getSymbolParts(sym).quote}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {ticker ? (
                    <div className="text-right">
                      <div className="font-mono-data text-[12px] text-white">
                        {getSymbolParts(sym).quote === 'USDT' ? '$' : ''}{formatAssetPrice(ticker.price)}
                      </div>
                      <div className={`text-[11px] font-mono-data ${ticker.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {ticker.changePercent >= 0 ? '+' : ''}{ticker.changePercent?.toFixed(2)}%
                      </div>
                    </div>
                  ) : (
                    <div className="text-[9px] text-slate-700">—</div>
                  )}
                </div>
              </button>

              <button
                type="button"
                onClick={() => remove(sym)}
                className="px-1.5 text-slate-700 hover:text-red-400 transition-all"
                title="Remove"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
