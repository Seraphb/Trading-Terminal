import { useState, useEffect, useRef } from 'react';

const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/ws';
const BINANCE_FUTURES_WS = 'wss://fstream.binance.com/ws';
const BINANCE_REST_BASE = 'https://api.binance.com/api/v3/klines';
const MAX_KLINES_PER_REQUEST = 1000;

const HISTORY_TARGETS = {
  '1m': 10080,
  '5m': 2016,
  '15m': 672,
  '1h': 2160,
  '4h': 2190,
  '1d': 1825,
  '1w': 260,
};

async function fetchHistoricalKlines(symbol, interval) {
  const target = HISTORY_TARGETS[interval] || 500;
  const chunks = [];
  let endTime = Date.now();
  let remaining = target;
  let attempts = 0;

  while (remaining > 0 && attempts < 20) {
    const limit = Math.min(MAX_KLINES_PER_REQUEST, remaining);
    const url = `${BINANCE_REST_BASE}?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}&endTime=${endTime}`;
    const response = await fetch(url);
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) break;

    chunks.unshift(...data);
    remaining -= data.length;
    endTime = data[0][0] - 1;
    attempts += 1;

    if (data.length < limit) break;
  }

  const seen = new Set();
  return chunks
    .map((k) => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))
    .filter((candle) => {
      if (seen.has(candle.time)) return false;
      seen.add(candle.time);
      return true;
    })
    .slice(-target);
}

export function useBinanceTicker(symbols = ['btcusdt', 'ethusdt', 'bnbusdt', 'solusdt', 'xrpusdt', 'dogeusdt', 'adausdt', 'avaxusdt']) {
  const [tickers, setTickers] = useState({});
  const wsRef = useRef(null);
  const wsFailedRef = useRef(false);
  const normalizedSymbols = Array.from(new Set(
    (Array.isArray(symbols) ? symbols : [])
      .map((symbol) => String(symbol || '').trim().toLowerCase())
      .filter(Boolean)
  ));
  const symbolKey = normalizedSymbols.join(',');

  useEffect(() => {
    if (!normalizedSymbols.length) {
      setTickers({});
      return undefined;
    }

    const fetchREST = async () => {
      try {
        const syms = normalizedSymbols.map((symbol) => `"${symbol.toUpperCase()}"`).join(',');
        const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=[${syms}]`);
        const data = await res.json();
        if (Array.isArray(data)) {
          const newTickers = {};
          data.forEach(d => {
            newTickers[d.symbol] = {
              symbol: d.symbol,
              price: parseFloat(d.lastPrice),
              change: parseFloat(d.priceChange),
              changePercent: parseFloat(d.priceChangePercent),
              high: parseFloat(d.highPrice),
              low: parseFloat(d.lowPrice),
              volume: parseFloat(d.volume),
              quoteVolume: parseFloat(d.quoteVolume),
              lastUpdate: Date.now(),
            };
          });
          setTickers(newTickers);
        }
      } catch (e) {
        console.warn('Binance REST fallback failed:', e);
      }
    };

    wsFailedRef.current = false;
    const streams = normalizedSymbols.map(symbol => `${symbol}@ticker`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    let restInterval = null;

    // Immediate REST fetch so UI loads instantly
    fetchREST();

    const connect = () => {
      wsRef.current = new WebSocket(url);

      const timeout = setTimeout(() => {
        wsFailedRef.current = true;
        fetchREST();
        if (!restInterval) restInterval = setInterval(fetchREST, 5000);
      }, 5000);

      wsRef.current.onmessage = (event) => {
        clearTimeout(timeout);
        const msg = JSON.parse(event.data);
        const d = msg.data;
        if (d && d.s) {
          setTickers(prev => ({
            ...prev,
            [d.s]: {
              symbol: d.s, price: parseFloat(d.c), change: parseFloat(d.p),
              changePercent: parseFloat(d.P), high: parseFloat(d.h),
              low: parseFloat(d.l), volume: parseFloat(d.v),
              quoteVolume: parseFloat(d.q), lastUpdate: Date.now(),
            },
          }));
        }
      };

      wsRef.current.onerror = () => {
        clearTimeout(timeout);
        wsFailedRef.current = true;
        fetchREST();
        if (!restInterval) restInterval = setInterval(fetchREST, 5000);
      };

      wsRef.current.onclose = () => {
        if (!wsFailedRef.current) setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      if (restInterval) clearInterval(restInterval);
      if (wsRef.current) wsRef.current.close();
    };
  }, [symbolKey]);

  return tickers;
}

export function useBinanceKlines(symbol = 'btcusdt', interval = '1m') {
  const [klines, setKlines] = useState([]);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef(null);
  const historyLoadedRef = useRef(false);
  const wsBufferRef = useRef([]);
  const symLower = symbol.toLowerCase();
  const historyLimit = HISTORY_TARGETS[interval] || 500;

  useEffect(() => {
    let cancelled = false;
    historyLoadedRef.current = false;
    wsBufferRef.current = [];
    setLoading(true);
    setKlines([]);

    fetchHistoricalKlines(symbol, interval)
      .then((data) => {
        if (cancelled) return;
        // Merge any buffered WS candles
        const merged = [...data];
        for (const candle of wsBufferRef.current) {
          const lastIdx = merged.length - 1;
          if (lastIdx >= 0 && merged[lastIdx].time === candle.time) {
            merged[lastIdx] = candle;
          } else {
            merged.push(candle);
            if (merged.length > historyLimit) merged.shift();
          }
        }
        wsBufferRef.current = [];
        historyLoadedRef.current = true;
        setKlines(merged);
        setLoading(false);
      })
      .catch((error) => {
        console.warn('Failed to fetch Binance klines:', error);
        if (!cancelled) {
          historyLoadedRef.current = true;
          setKlines([]);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [symbol, interval, historyLimit]);

  useEffect(() => {
    const url = `${BINANCE_WS_BASE}/${symLower}@kline_${interval}`;
    wsRef.current = new WebSocket(url);
    wsRef.current.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const k = msg.k;
      if (!k) return;
      const candle = { time: k.t, open: parseFloat(k.o), high: parseFloat(k.h), low: parseFloat(k.l), close: parseFloat(k.c), volume: parseFloat(k.v) };

      // Buffer WS candles until historical data is loaded
      if (!historyLoadedRef.current) {
        wsBufferRef.current.push(candle);
        return;
      }

      setKlines(prev => {
        const lastIdx = prev.length - 1;
        if (lastIdx >= 0 && prev[lastIdx].time === candle.time) {
          // Update last candle in-place (avoid full copy when only last candle changes)
          const updated = prev.slice();
          updated[lastIdx] = candle;
          return updated;
        }
        const next = [...prev, candle];
        if (next.length > historyLimit) next.shift();
        return next;
      });
    };
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [symLower, interval, historyLimit]);

  return { klines, loading };
}

export function useBinanceDepth(symbol = 'btcusdt') {
  const [depth, setDepth] = useState({ bids: [], asks: [] });
  const wsRef = useRef(null);
  const symLower = symbol.toLowerCase();

  useEffect(() => {
    fetch(`https://api.binance.com/api/v3/depth?symbol=${symbol.toUpperCase()}&limit=20`)
      .then(r => r.json())
      .then(data => {
        setDepth({
          bids: data.bids.map(b => [parseFloat(b[0]), parseFloat(b[1])]),
          asks: data.asks.map(a => [parseFloat(a[0]), parseFloat(a[1])]),
        });
      });
  }, [symbol]);

  useEffect(() => {
    const url = `${BINANCE_WS_BASE}/${symLower}@depth20@100ms`;
    wsRef.current = new WebSocket(url);
    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const rawBids = data.b || data.bids;
      const rawAsks = data.a || data.asks;
      if (rawBids && rawAsks) {
        setDepth({
          bids: rawBids.map(b => [parseFloat(b[0]), parseFloat(b[1])]).filter(([, q]) => q > 0).slice(0, 20),
          asks: rawAsks.map(a => [parseFloat(a[0]), parseFloat(a[1])]).filter(([, q]) => q > 0).slice(0, 20),
        });
      }
    };
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [symLower]);

  return depth;
}

export function useBinanceTrades(symbol = 'btcusdt') {
  const [trades, setTrades] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    const url = `${BINANCE_WS_BASE}/${symbol.toLowerCase()}@aggTrade`;
    wsRef.current = new WebSocket(url);
    wsRef.current.onmessage = (event) => {
      const d = JSON.parse(event.data);
      setTrades(prev => [{ id: d.a, price: parseFloat(d.p), qty: parseFloat(d.q), time: d.T, isBuyerMaker: d.m }, ...prev].slice(0, 50));
    };
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [symbol]);

  return trades;
}

const OI_PERIOD_MAP = {
  '1m': '5m', '3m': '5m', '5m': '5m',
  '15m': '15m', '30m': '30m',
  '1h': '1h', '2h': '2h', '4h': '4h',
  '6h': '6h', '12h': '12h',
  '1d': '1d', '1w': '1d',
};

export function useOpenInterest(symbol = 'btcusdt', klinesInterval = '1h', enabled = true) {
  const [oiData, setOiData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return;

    const period = OI_PERIOD_MAP[klinesInterval] || '1h';
    const sym = symbol.toUpperCase();
    let timer = null;

    const load = async () => {
      try {
        const res = await fetch(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${sym}&period=${period}&limit=500`);
        if (!res.ok) { setError('not_futures'); return; }
        const data = await res.json();
        if (!Array.isArray(data)) { setError('not_futures'); return; }
        setError(null);
        setOiData(data.map(d => ({
          time: d.timestamp,
          oi: parseFloat(d.sumOpenInterest),
          oiValue: parseFloat(d.sumOpenInterestValue),
        })));
      } catch {
        setError('failed');
      }
    };

    load();
    timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [symbol, klinesInterval, enabled]);

  return { oiData, error };
}

// ── Funding Rate (Binance Perpetual Futures) ──────────────────────────────
// Fetches full history by paginating backwards (max 1000/page, every 8h).
// Positive rate  → longs pay shorts (market over-leveraged long = bearish signal)
// Negative rate  → shorts pay longs (market over-leveraged short = bullish signal)

// Fetch ~5 years of 8-hour funding intervals (5*365*3 ≈ 5475 entries → 6 pages)
const FUNDING_HISTORY_MS = 5 * 365 * 24 * 60 * 60 * 1000;

async function fetchAllFundingRates(sym) {
  const cutoff  = Date.now() - FUNDING_HISTORY_MS;
  const chunks  = [];
  let endTime   = Date.now();
  let attempts  = 0;

  while (attempts < 10) {
    const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${sym}&limit=1000&endTime=${endTime}`;
    const res  = await fetch(url);
    if (!res.ok) break;
    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) break;

    chunks.unshift(...raw);
    const earliest = raw[0].fundingTime;
    if (earliest <= cutoff || raw.length < 1000) break;
    endTime  = earliest - 1;
    attempts += 1;
  }

  const seen = new Set();
  return chunks
    .filter((d) => {
      if (seen.has(d.fundingTime)) return false;
      seen.add(d.fundingTime);
      return true;
    })
    .map((d) => ({ time: d.fundingTime, rate: parseFloat(d.fundingRate) }))
    .sort((a, b) => a.time - b.time);
}

export function useFundingRate(symbol = 'btcusdt', enabled = true) {
  const [data, setData] = useState([]);
  const sym = symbol.toUpperCase();

  useEffect(() => {
    if (!enabled) { setData([]); return; }

    let cancelled = false;
    const load = async () => {
      try {
        const result = await fetchAllFundingRates(sym);
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setData([]);
      }
    };

    load();
    // Refresh only the latest page every minute (append new entries)
    const refresh = async () => {
      try {
        const res = await fetch(
          `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${sym}&limit=10`
        );
        if (!res.ok || cancelled) return;
        const raw = await res.json();
        if (!Array.isArray(raw) || cancelled) return;
        setData((prev) => {
          const latestKnown = prev.length ? prev[prev.length - 1].time : 0;
          const newEntries = raw
            .filter((d) => d.fundingTime > latestKnown)
            .map((d) => ({ time: d.fundingTime, rate: parseFloat(d.fundingRate) }));
          return newEntries.length ? [...prev, ...newEntries] : prev;
        });
      } catch { /* silent */ }
    };

    const timer = setInterval(refresh, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [sym, enabled]);

  return data;
}

export function useBinanceLiquidations() {
  const [liquidations, setLiquidations] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    const url = `${BINANCE_FUTURES_WS}/!forceOrder@arr`;
    wsRef.current = new WebSocket(url);
    wsRef.current.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const o = msg.o || (msg.data && msg.data.o);
      if (o) {
        setLiquidations(prev => [{
          id: Date.now() + Math.random(), symbol: o.s, side: o.S,
          price: parseFloat(o.p), qty: parseFloat(o.q),
          value: parseFloat(o.p) * parseFloat(o.q), time: o.T || Date.now(),
        }, ...prev].slice(0, 100));
      }
    };
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, []);

  return liquidations;
}
