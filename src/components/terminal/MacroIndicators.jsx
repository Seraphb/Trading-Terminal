import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Globe, Activity, BarChart3, RefreshCw } from 'lucide-react';

// All free public APIs — no key required
// 1. Fear & Greed: https://api.alternative.me/fng/
// 2. BTC Dominance + Total Mkt Cap: https://api.coingecko.com/api/v3/global
// 3. ETH/BTC ratio: derived from Binance tickers (passed as prop)

export default function MacroIndicators({ tickers }) {
  const [macroData, setMacroData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchMacro = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // Fetch Fear & Greed + CoinGecko global in parallel
      const [fngRes, cgRes] = await Promise.all([
        fetch('https://api.alternative.me/fng/?limit=1'),
        fetch('https://api.coingecko.com/api/v3/global'),
      ]);

      const fngJson = await fngRes.json();
      const cgJson  = await cgRes.json();

      const fgIndex = parseInt(fngJson?.data?.[0]?.value ?? 50);
      const fgLabel = fngJson?.data?.[0]?.value_classification ?? '';

      const btcDom  = cgJson?.data?.market_cap_percentage?.btc?.toFixed(1) ?? '—';
      const totalMc = cgJson?.data?.total_market_cap?.usd;
      const totalMcStr = totalMc
        ? totalMc >= 1e12
          ? '$' + (totalMc / 1e12).toFixed(2) + 'T'
          : '$' + (totalMc / 1e9).toFixed(0) + 'B'
        : '—';

      setMacroData({
        fear_greed_index: fgIndex,
        fear_greed_label: fgLabel,
        btc_dominance: parseFloat(btcDom),
        total_market_cap: totalMcStr,
      });
    } catch (err) {
      console.error('Failed to fetch macro data:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMacro();
    const interval = setInterval(fetchMacro, 300_000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [fetchMacro]);

  // ETH/BTC from live Binance tickers (free, already streaming)
  const ethBtcRatio = useMemo(() => {
    // prefer direct ETHBTC pair, fallback to ETHUSDT/BTCUSDT
    const ethbtc = tickers?.['ETHBTC'];
    if (ethbtc?.price) return parseFloat(ethbtc.price);
    const eth = tickers?.['ETHUSDT']?.price;
    const btc = tickers?.['BTCUSDT']?.price;
    if (eth && btc) return (parseFloat(eth) / parseFloat(btc));
    return null;
  }, [tickers]);

  const btcTicker = tickers?.['BTCUSDT'];

  const fgColor = useMemo(() => {
    if (!macroData) return 'text-slate-400';
    const fg = macroData.fear_greed_index;
    if (fg >= 75) return 'text-emerald-400';
    if (fg >= 50) return 'text-yellow-400';
    if (fg >= 25) return 'text-orange-400';
    return 'text-red-400';
  }, [macroData]);

  return (
    <div className="terminal-panel flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(217,33%,20%)]">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-blue-400" />
          <h3 className="text-xs font-semibold text-slate-300">MACRO</h3>
        </div>
        <button onClick={fetchMacro} disabled={loading} className="text-slate-500 hover:text-slate-300 transition-colors">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 p-2 space-y-1.5 overflow-hidden">
        {loading && !macroData && (
          <div className="space-y-2 p-1">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-8 bg-[hsl(217,33%,17%)] rounded animate-pulse" />
            ))}
          </div>
        )}

        {error && !macroData && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-2">
            <Globe className="w-6 h-6 text-slate-600" />
            <p className="text-[10px] text-slate-500">Could not load macro data</p>
            <button onClick={fetchMacro} className="text-[10px] text-blue-400 hover:text-blue-300 underline">
              Retry
            </button>
          </div>
        )}

        {macroData && (
          <>
            {/* Fear & Greed */}
            <div className="bg-[hsl(222,47%,13%)] rounded-lg p-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500">Fear & Greed</span>
                <span className={`font-mono-data text-sm font-bold ${fgColor}`}>
                  {macroData.fear_greed_index}
                </span>
              </div>
              <div className="w-full h-1.5 bg-[hsl(217,33%,20%)] rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${macroData.fear_greed_index || 0}%`,
                    background: 'linear-gradient(to right, #ef4444, #f59e0b, #22c55e)',
                  }}
                />
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5">{macroData.fear_greed_label}</div>
            </div>

            {/* BTC Dominance */}
            <div className="flex items-center justify-between bg-[hsl(222,47%,13%)] rounded-lg p-2">
              <div className="flex items-center gap-1.5">
                <BarChart3 className="w-3 h-3 text-orange-500" />
                <span className="text-[10px] text-slate-500">BTC Dom.</span>
              </div>
              <span className="font-mono-data text-xs text-orange-400">{macroData.btc_dominance}%</span>
            </div>

            {/* Total Market Cap */}
            <div className="flex items-center justify-between bg-[hsl(222,47%,13%)] rounded-lg p-2">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-blue-500" />
                <span className="text-[10px] text-slate-500">Mkt Cap</span>
              </div>
              <span className="font-mono-data text-xs text-blue-400">{macroData.total_market_cap}</span>
            </div>

            {/* ETH/BTC — live from Binance WebSocket */}
            <div className="flex items-center justify-between bg-[hsl(222,47%,13%)] rounded-lg p-2">
              <span className="text-[10px] text-slate-500">ETH/BTC</span>
              <span className="font-mono-data text-xs text-purple-400">
                {ethBtcRatio != null ? ethBtcRatio.toFixed(5) : '—'}
              </span>
            </div>

            {/* BTC 24h stats — compact single row */}
            {btcTicker && (
              <div className="flex items-center justify-between bg-[hsl(222,47%,13%)] rounded-lg px-2 py-1.5 font-mono-data text-[10px] gap-2 flex-wrap">
                <span className="text-slate-600">BTC</span>
                <span className="text-slate-300">${(btcTicker.quoteVolume / 1e9).toFixed(1)}B</span>
                <span className="text-emerald-400">H ${btcTicker.high?.toLocaleString()}</span>
                <span className="text-red-400">L ${btcTicker.low?.toLocaleString()}</span>
                <span className={btcTicker.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}>{btcTicker.changePercent >= 0 ? '+' : ''}{btcTicker.changePercent?.toFixed(2)}%</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
