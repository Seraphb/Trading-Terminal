import React, { useEffect, useRef, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatAssetPrice } from '@/lib/assetPriceFormat';

const SYMBOLS = [
  'BTC','ETH','BNB','SOL','XRP','ADA','DOGE','AVAX','DOT','MATIC',
  'LINK','UNI','ATOM','LTC','ETC','XLM','ALGO','NEAR','FIL','SAND',
  'MANA','AXS','FTM','VET','TRX','SHIB','APE','OP','ARB','INJ',
  'SUI','WLD','PEPE','FLOKI','TON',
];

const STREAMS = SYMBOLS.map(s => `${s.toLowerCase()}usdt@miniTicker`).join('/');
const WS_URL = `wss://stream.binance.com:9443/stream?streams=${STREAMS}`;

const STYLE = `
@keyframes ticker-loop {
  0%   { transform: translate3d(0, 0, 0); }
  100% { transform: translate3d(-33.333%, 0, 0); }
}
.ticker-inner {
  animation: ticker-loop 110s linear infinite;
  display: flex;
  align-items: center;
  gap: 2rem;
  white-space: nowrap;
  padding: 0 1rem;
  will-change: transform;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
`;

export default function TickerBar() {
  const [snapshot, setSnapshot] = useState(null);
  const dataRef = useRef({});
  const timerRef = useRef(null);

  useEffect(() => {
    let ws, dead = false;
    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        const d = msg.data;
        if (!d) return;
        const close = parseFloat(d.c);
        const open = parseFloat(d.o);
        dataRef.current[d.s] = {
          symbol: d.s,
          base: d.s.replace('USDT', ''),
          price: close,
          changePercent: open > 0 ? ((close - open) / open) * 100 : 0,
        };
        // Throttle React state updates to every 3s to avoid jitter
        if (!timerRef.current) {
          timerRef.current = setTimeout(() => {
            timerRef.current = null;
            setSnapshot({ ...dataRef.current });
          }, 3000);
        }
      };
      ws.onclose = () => { if (!dead) setTimeout(connect, 2000); };
    };
    connect();
    // Initial snapshot after 2s
    const init = setTimeout(() => setSnapshot({ ...dataRef.current }), 2000);
    return () => { dead = true; ws?.close(); clearTimeout(init); clearTimeout(timerRef.current); };
  }, []);

  const list = snapshot ? SYMBOLS.map(s => snapshot[`${s}USDT`]).filter(Boolean) : [];
  if (list.length === 0) return <div className="w-full h-8 bg-[hsl(222,47%,9%)] border-b border-[hsl(217,33%,17%)]" />;

  const items = [...list, ...list, ...list];

  return (
    <>
      <style>{STYLE}</style>
      <div className="w-full overflow-hidden bg-[hsl(222,47%,9%)] border-b border-[hsl(217,33%,17%)] h-8 flex items-center">
        <div className="ticker-inner">
          {items.map((t, i) => (
            <div key={`${t.symbol}-${i}`} className="flex items-center gap-2 font-mono-data text-xs flex-shrink-0">
              <span className="text-slate-400 font-medium">{t.base}/USDT</span>
              <span className={t.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                ${formatAssetPrice(t.price)}
              </span>
              <span className={`flex items-center gap-0.5 ${t.changePercent >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {t.changePercent >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {t.changePercent >= 0 ? '+' : ''}{t.changePercent.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
