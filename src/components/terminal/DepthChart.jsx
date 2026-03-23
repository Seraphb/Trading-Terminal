import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

/**
 * @param {unknown} value
 */
function formatDepthValue(value) {
  return typeof value === 'number' ? value.toFixed(4) : String(value);
}

export default function DepthChart({ depth }) {
  const chartData = useMemo(() => {
    const { bids, asks } = depth;
    if (!bids.length || !asks.length) return [];
    
    // Build cumulative depth
    const bidData = [];
    let bidCum = 0;
    for (let i = 0; i < bids.length; i++) {
      bidCum += bids[i][1];
      bidData.push({ price: bids[i][0], bidDepth: bidCum, askDepth: 0 });
    }
    bidData.reverse();
    
    const askData = [];
    let askCum = 0;
    for (let i = 0; i < asks.length; i++) {
      askCum += asks[i][1];
      askData.push({ price: asks[i][0], bidDepth: 0, askDepth: askCum });
    }
    
    return [...bidData, ...askData];
  }, [depth]);

  if (!chartData.length) return null;

  return (
    <div className="terminal-panel h-full flex flex-col">
      <div className="flex items-center px-3 py-2 border-b border-[hsl(217,33%,20%)]">
        <h3 className="text-xs font-semibold text-slate-300">DEPTH CHART</h3>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="bidFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="askFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="price" 
              tick={{ fill: '#475569', fontSize: 9 }} 
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v.toLocaleString()}
              minTickGap={40}
            />
            <YAxis hide />
            <Tooltip 
              contentStyle={{ 
                background: 'hsl(222,47%,13%)', 
                border: '1px solid hsl(217,33%,25%)',
                borderRadius: '6px',
                fontSize: '10px',
                color: '#e2e8f0'
              }}
              formatter={(v, name) => [formatDepthValue(v), name === 'bidDepth' ? 'Bid Volume' : 'Ask Volume']}
              labelFormatter={(v) => `$${v.toLocaleString()}`}
            />
            <Area type="stepAfter" dataKey="bidDepth" stroke="#22c55e" fill="url(#bidFill)" strokeWidth={1.5} />
            <Area type="stepAfter" dataKey="askDepth" stroke="#ef4444" fill="url(#askFill)" strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
