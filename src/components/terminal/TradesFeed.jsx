import React from 'react';
import { format } from 'date-fns';

export default function TradesFeed({ trades }) {
  return (
    <div className="terminal-panel flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(217,33%,20%)]">
        <h3 className="text-xs font-semibold text-slate-300">RECENT TRADES</h3>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 live-dot" />
          <span className="text-[10px] text-slate-500">LIVE</span>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-0 px-3 py-1 text-[10px] text-slate-500 font-mono-data border-b border-[hsl(217,33%,17%)]">
        <span>Price</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Time</span>
      </div>
      
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {trades.map((trade) => (
          <div key={trade.id} className="grid grid-cols-3 gap-0 px-2.5 py-[3px] rounded-lg text-[11px] font-mono-data hover:bg-[hsl(222,47%,14%)] transition-colors">
            <span className={trade.isBuyerMaker ? 'text-red-400' : 'text-emerald-400'}>
              {trade.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <span className="text-right text-slate-400">
              {trade.qty?.toFixed(5)}
            </span>
            <span className="text-right text-slate-600">
              {format(new Date(trade.time), 'HH:mm:ss')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}