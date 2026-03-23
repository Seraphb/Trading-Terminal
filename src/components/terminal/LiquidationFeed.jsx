import React from 'react';
import { format } from 'date-fns';
import { Flame, AlertTriangle } from 'lucide-react';

export default function LiquidationFeed({ liquidations }) {
  const formatValue = (v) => {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(2)}M`;
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
  };

  return (
    <div className="terminal-panel flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[hsl(217,33%,20%)]">
        <Flame className="w-3.5 h-3.5 text-orange-500" />
        <h3 className="text-xs font-semibold text-slate-300">LIQUIDATIONS</h3>
        <div className="ml-auto flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-500 live-dot" />
          <span className="text-[10px] text-slate-500">LIVE</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {liquidations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-xs">Waiting for liquidation events...</span>
            <span className="text-[10px] text-slate-700">Futures stream active</span>
          </div>
        ) : (
          liquidations.map((liq) => (
            <div 
              key={liq.id} 
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg animate-liq-flash hover:bg-[hsl(222,47%,14%)] transition-colors"
            >
              <Flame className={`w-3 h-3 flex-shrink-0 ${liq.value > 100000 ? 'text-red-500' : 'text-orange-500'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono-data text-[11px] font-medium text-white">
                    {liq.symbol?.replace('USDT', '')}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0 rounded font-medium ${
                    liq.side === 'BUY' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {liq.side === 'BUY' ? 'SHORT LIQ' : 'LONG LIQ'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="font-mono-data text-[10px] text-slate-400">
                    {formatValue(liq.value)}
                  </span>
                  <span className="font-mono-data text-[10px] text-slate-500">
                    @ ${liq.price?.toLocaleString()}
                  </span>
                  <span className="font-mono-data text-[10px] text-slate-600 ml-auto">
                    {format(new Date(liq.time), 'HH:mm:ss')}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* Summary bar */}
      <div className="px-3 py-1.5 border-t border-[hsl(217,33%,20%)] flex items-center justify-between text-[10px] font-mono-data">
        <span className="text-slate-500">{liquidations.length} events</span>
        <span className="text-slate-500">
          Total: {formatValue(liquidations.reduce((s, l) => s + (l.value || 0), 0))}
        </span>
      </div>
    </div>
  );
}