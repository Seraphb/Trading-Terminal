import React, { useEffect, useState } from 'react';

function StockLogo({ symbol, size = 20 }) {
  const [err, setErr] = useState(false);
  if (err) return <div style={{ width: size, height: size, borderRadius: 4, background: 'hsl(217,33%,22%)', flexShrink: 0 }} />;
  return (
    <img
      src={`https://assets.parqet.com/logos/symbol/${symbol}?format=svg`}
      alt={symbol} width={size} height={size}
      style={{ borderRadius: 4, flexShrink: 0, objectFit: 'contain' }}
      onError={() => setErr(true)}
    />
  );
}
import { GripVertical, Star, X } from 'lucide-react';
import {
  getStockWatchlist,
  removeStockWatchlistSymbol,
  reorderStockWatchlist,
  subscribeStockWatchlist,
} from '@/lib/watchlists';

export default function StocksWatchList({ activeSymbol, onSymbolChange, theme }) {
  const [symbols, setSymbols] = useState(() => getStockWatchlist());
  const [draggedSymbol, setDraggedSymbol] = useState(null);

  const bg = theme === 'light' ? '#ffffff' : 'hsl(222,47%,10%)';
  const border = theme === 'light' ? 'hsl(210,20%,82%)' : 'hsl(217,33%,18%)';
  const rowHov = theme === 'light' ? 'hover:bg-[hsl(210,20%,96%)]' : 'hover:bg-[hsl(222,47%,13%)]';
  const text = theme === 'light' ? 'text-slate-700' : 'text-slate-300';

  useEffect(() => subscribeStockWatchlist(setSymbols), []);

  const remove = (sym) => {
    const next = removeStockWatchlistSymbol(sym);
    if (activeSymbol === sym && next.length) onSymbolChange(next[0]);
  };

  const moveSymbol = (fromSymbol, toSymbol) => {
    if (!fromSymbol || !toSymbol || fromSymbol === toSymbol) return;
    const current = getStockWatchlist();
    const fromIndex = current.indexOf(fromSymbol);
    const toIndex = current.indexOf(toSymbol);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...current];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    reorderStockWatchlist(next);
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden flex-shrink-0 border-r"
      style={{ background: bg, borderColor: border, width: '161px' }}
    >
      <div
        className="flex items-center justify-between px-2 py-1.5 border-b flex-shrink-0"
        style={{ borderColor: border }}
      >
        <div className="flex items-center gap-1">
          <Star className="w-3 h-3 text-yellow-500" />
          <span className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase">Watch</span>
        </div>
        <span className="text-[9px] text-slate-500">drag</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {symbols.map((sym) => {
          const isActive = activeSymbol === sym;
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
              className={`flex items-stretch border-b group ${rowHov} ${isDragging ? 'opacity-60' : ''} ${
                isActive ? 'border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent'
              }`}
              style={{ borderBottomColor: border, background: isActive ? 'rgba(59,130,246,0.08)' : undefined }}
            >
              <div className="flex items-center px-1 text-slate-600 cursor-grab active:cursor-grabbing">
                <GripVertical className="w-3 h-3" />
              </div>
              <button
                type="button"
                onClick={() => onSymbolChange(sym)}
                className="flex-1 py-2 text-left transition-all flex items-center"
              >
                <div className="w-8 flex justify-start pl-1 flex-shrink-0">
                  <StockLogo symbol={sym} size={18} />
                </div>
                <span className={`text-[11px] font-medium truncate ${isActive ? 'text-blue-400' : text}`}>{sym}</span>
              </button>
              <button
                type="button"
                onClick={() => remove(sym)}
                className="px-1.5 text-slate-600 hover:text-red-400 transition-all flex-shrink-0"
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
