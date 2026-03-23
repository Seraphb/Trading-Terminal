import React, { useMemo } from 'react';

export default function OrderBookHeatmap({ depth, lastPrice }) {
  const bids = depth?.bids ?? [];
  const asks = depth?.asks ?? [];
  
  const maxQty = useMemo(() => {
    const allQty = [...bids, ...asks].map(([_, q]) => q);
    return Math.max(...allQty, 0.001);
  }, [bids, asks]);

  const spread = asks.length && bids.length 
    ? (asks[0][0] - bids[0][0]).toFixed(2)
    : '—';
  
  const spreadPct = asks.length && bids.length && bids[0][0] > 0
    ? ((asks[0][0] - bids[0][0]) / bids[0][0] * 100).toFixed(4)
    : '—';

  const formatPrice = (p) => p?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatQty = (q) => q?.toFixed(5);

  const getHeatOpacity = (qty) => Math.max(0.1, Math.min(1, qty / maxQty));

  if (!bids.length && !asks.length) {
    return (
      <div className="terminal-panel flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(217,33%,20%)]">
          <h3 className="text-xs font-semibold text-slate-300">ORDER BOOK</h3>
          <span className="text-[10px] text-slate-600 animate-pulse">Connecting…</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-slate-600 text-xs animate-pulse">Waiting for data…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="terminal-panel flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(217,33%,20%)]">
        <h3 className="text-xs font-semibold text-slate-300">ORDER BOOK</h3>
        <div className="flex items-center gap-2 text-[10px] font-mono-data">
          <span className="text-slate-500">Spread:</span>
          <span className="text-slate-300">${spread}</span>
          <span className="text-slate-500">({spreadPct}%)</span>
        </div>
      </div>
      
      {/* Header */}
      <div className="grid grid-cols-3 gap-0 px-3 py-1 text-[10px] text-slate-500 font-mono-data border-b border-[hsl(217,33%,17%)]">
        <span>Price (USDT)</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Total</span>
      </div>
      
      {/* Asks (reversed so lowest ask is at bottom) */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto flex flex-col justify-end px-2 py-1 gap-0.5 min-h-0">
          {[...asks].slice(0, 15).reverse().map(([price, qty], i, arr) => {
            const origIdx = arr.length - 1 - i;
            const cumQty = asks.slice(0, origIdx + 1).reduce((sum, [_, q]) => sum + q, 0);
            return (
              <div key={`ask-${i}`} className="relative grid grid-cols-3 gap-0 px-1 py-[3px] text-[11px] font-mono-data heatmap-cell overflow-hidden">
                <div className="absolute inset-y-0 right-0 rounded"
                  style={{ background: `rgba(239,68,68,0.15)`, width: `${(qty / maxQty) * 100}%` }} />
                <span className="text-red-400 relative z-10">{formatPrice(price)}</span>
                <span className="text-right text-slate-400 relative z-10">{formatQty(qty)}</span>
                <span className="text-right text-slate-500 relative z-10">{cumQty.toFixed(3)}</span>
              </div>
            );
          })}
        </div>
        
        {/* Mid price */}
        <div className="px-3 py-1.5 text-center border-y border-[hsl(217,33%,20%)] bg-[hsl(222,47%,13%)]">
          <span className="font-mono-data text-sm font-bold text-white">
            ${formatPrice(lastPrice)}
          </span>
        </div>
        
        {/* Bids */}
        <div className="flex-1 overflow-y-auto px-2 py-1 gap-0.5 flex flex-col min-h-0">
          {bids.slice(0, 15).map(([price, qty], i) => {
            const cumQty = bids.slice(0, i + 1).reduce((sum, [_, q]) => sum + q, 0);
            return (
              <div key={`bid-${i}`} className="relative grid grid-cols-3 gap-0 px-1 py-[3px] text-[11px] font-mono-data heatmap-cell overflow-hidden">
                <div className="absolute inset-y-0 right-0 rounded"
                  style={{ background: `rgba(34,197,94,0.15)`, width: `${(qty / maxQty) * 100}%` }} />
                <span className="text-emerald-400 relative z-10">{formatPrice(price)}</span>
                <span className="text-right text-slate-400 relative z-10">{formatQty(qty)}</span>
                <span className="text-right text-slate-500 relative z-10">{cumQty.toFixed(3)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}