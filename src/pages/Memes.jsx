import React, { Suspense, lazy, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTheme } from '../components/ThemeContext';

const SymbolTerminalModal = lazy(() => import('../components/scanner/SymbolTerminalModal'));
import {
  Search, RefreshCw, TrendingUp, TrendingDown, Shield, ShieldAlert, ShieldCheck, ShieldX,
  Flame, Clock, Droplets, BarChart3, ExternalLink, Filter, Zap, Skull, Rocket,
  AlertTriangle, ArrowUpDown, Eye, Star, StarOff, ChevronDown, ChevronUp, Globe,
  Activity, Users, DollarSign, Volume2, Timer, Sparkles, Crown, Target,
  Copy, Check, Bell, BellOff, ShoppingCart, Layers, Radio
} from 'lucide-react';

/* ──────────────────────────── constants ──────────────────────────── */

const DEX_API = 'https://api.dexscreener.com';

const CHAINS = [
  { id: 'all',       label: 'All Chains',  icon: Globe,    color: '#94a3b8' },
  { id: 'solana',    label: 'Solana',       icon: Zap,      color: '#9945FF' },
  { id: 'ethereum',  label: 'Ethereum',     icon: Activity, color: '#627EEA' },
  { id: 'bsc',       label: 'BSC',          icon: DollarSign, color: '#F3BA2F' },
  { id: 'base',      label: 'Base',         icon: Target,   color: '#0052FF' },
  { id: 'arbitrum',  label: 'Arbitrum',     icon: Activity, color: '#28A0F0' },
  { id: 'polygon',   label: 'Polygon',      icon: Activity, color: '#8247E5' },
  { id: 'avalanche', label: 'Avalanche',    icon: Activity, color: '#E84142' },
  { id: 'optimism',  label: 'Optimism',     icon: Activity, color: '#FF0420' },
];

const AGE_FILTERS = [
  { id: 'all',   label: 'Any Age' },
  { id: '1h',    label: '< 1 hour',   maxMs: 3600_000 },
  { id: '6h',    label: '< 6 hours',  maxMs: 21600_000 },
  { id: '24h',   label: '< 24 hours', maxMs: 86400_000 },
  { id: '7d',    label: '< 7 days',   maxMs: 604800_000 },
  { id: '30d',   label: '< 30 days',  maxMs: 2592000_000 },
];

const SORT_OPTIONS = [
  { id: 'score',      label: 'Score (Best)' },
  { id: 'volume',     label: 'Volume 24h' },
  { id: 'liquidity',  label: 'Liquidity' },
  { id: 'age_new',    label: 'Newest First' },
  { id: 'change_24h', label: 'Price Change 24h' },
  { id: 'buys',       label: 'Buy Pressure' },
  { id: 'mcap',       label: 'Market Cap' },
];

const RISK_LEVELS = [
  { id: 'all',    label: 'All',       color: '#94a3b8' },
  { id: 'safe',   label: 'Safe',      color: '#22c55e', min: 70 },
  { id: 'medium', label: 'Medium',    color: '#eab308', min: 40, max: 70 },
  { id: 'risky',  label: 'Risky',     color: '#f97316', min: 20, max: 40 },
  { id: 'degen',  label: 'Degen',     color: '#ef4444', max: 20 },
];

// Meme-focused discovery queries (use live search for any other token)
const DISCOVERY_QUERIES = [
  // OG memes
  'pepe', 'doge', 'shib', 'bonk', 'wif', 'floki', 'brett',
  // culture & politics
  'trump', 'elon', 'chad', 'wojak', 'maga',
  // animal memes
  'cat', 'frog', 'inu', 'baby', 'pup', 'bear',
  // degen meta
  'meme', 'moon', 'pump', 'gm', 'wagmi', 'based',
  // AI memes
  'ai', 'gpt', 'bot',
  // trending meme coins
  'popcat', 'mog', 'neiro', 'turbo', 'myro', 'bome',
];

/* ──────────────────────────── scoring engine ──────────────────────────── */

function computeRiskScore(pair) {
  let score = 0;
  const now = Date.now();

  // 1. LIQUIDITY (0-25 pts) — more liquidity = safer
  const liq = pair.liquidity?.usd || 0;
  if (liq >= 500_000)     score += 25;
  else if (liq >= 200_000) score += 22;
  else if (liq >= 100_000) score += 19;
  else if (liq >= 50_000)  score += 16;
  else if (liq >= 20_000)  score += 12;
  else if (liq >= 10_000)  score += 8;
  else if (liq >= 5_000)   score += 4;
  else if (liq >= 1_000)   score += 2;

  // 2. AGE (0-20 pts) — sweet spot is 1h-7d
  const ageMs = pair.pairCreatedAt ? (now - pair.pairCreatedAt) : 0;
  const ageHours = ageMs / 3600_000;
  if (ageHours >= 24 && ageHours <= 168)      score += 20; // 1-7 days = perfect
  else if (ageHours >= 6 && ageHours < 24)    score += 17; // 6-24h = good
  else if (ageHours >= 1 && ageHours < 6)     score += 12; // 1-6h = early but ok
  else if (ageHours >= 168 && ageHours < 720) score += 14; // 7-30d = established
  else if (ageHours >= 720)                   score += 8;  // 30d+ = old
  else if (ageHours >= 0.25)                  score += 5;  // 15min-1h = very early
  // < 15min = 0 pts (too new, likely rug)

  // 3. VOLUME HEALTH (0-20 pts) — vol/liq ratio
  const vol24 = pair.volume?.h24 || 0;
  if (liq > 0) {
    const volLiqRatio = vol24 / liq;
    if (volLiqRatio >= 0.5 && volLiqRatio <= 3)      score += 20; // healthy
    else if (volLiqRatio >= 0.2 && volLiqRatio < 0.5) score += 14;
    else if (volLiqRatio > 3 && volLiqRatio <= 8)     score += 12; // active
    else if (volLiqRatio > 8)                         score += 6;  // suspicious pump
    else if (volLiqRatio > 0)                         score += 4;  // low activity
  }

  // 4. BUY PRESSURE (0-20 pts) — buys vs sells ratio
  const buys24 = pair.txns?.h24?.buys || 0;
  const sells24 = pair.txns?.h24?.sells || 0;
  const totalTxns = buys24 + sells24;
  if (totalTxns > 0) {
    const buyRatio = buys24 / totalTxns;
    if (buyRatio >= 0.55 && buyRatio <= 0.75)     score += 20; // healthy buy dominance
    else if (buyRatio >= 0.50 && buyRatio < 0.55) score += 16; // balanced
    else if (buyRatio >= 0.75)                    score += 10; // too much buying (fomo?)
    else if (buyRatio >= 0.40)                    score += 8;  // slight sell pressure
    else                                          score += 2;  // heavy selling
  }

  // 5. TRANSACTION COUNT (0-15 pts) — more txns = more real
  if (totalTxns >= 1000)     score += 15;
  else if (totalTxns >= 500) score += 13;
  else if (totalTxns >= 200) score += 10;
  else if (totalTxns >= 50)  score += 7;
  else if (totalTxns >= 10)  score += 3;

  return Math.min(100, score);
}

function getScoreLabel(score) {
  if (score >= 70) return { label: 'SAFE',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  icon: ShieldCheck };
  if (score >= 40) return { label: 'MEDIUM', color: '#eab308', bg: 'rgba(234,179,8,0.12)',  icon: Shield };
  if (score >= 20) return { label: 'RISKY',  color: '#f97316', bg: 'rgba(249,115,22,0.12)', icon: ShieldAlert };
  return               { label: 'DEGEN',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  icon: ShieldX };
}

function formatAge(createdAt) {
  if (!createdAt) return '??';
  const diff = Date.now() - createdAt;
  const mins = diff / 60_000;
  if (mins < 60) return `${Math.floor(mins)}m`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.floor(days)}d`;
  return `${Math.floor(days / 30)}mo`;
}

function formatNumber(n) {
  if (!n || isNaN(n)) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPrice(p) {
  if (!p) return '—';
  const n = parseFloat(p);
  if (isNaN(n)) return '—';
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  // count leading zeros after decimal
  const s = n.toFixed(20);
  const match = s.match(/^0\.0*(.*)/);
  if (match) {
    const zeros = s.match(/^0\.(0*)/)[1].length;
    const sig = match[1].slice(0, 4);
    return `$0.0{${zeros}}${sig}`;
  }
  return `$${n.toExponential(2)}`;
}

/* ──────────────────────────── rug / honeypot detection ──────────────────────────── */

function detectRugFlags(pair) {
  const flags = [];
  const liq = pair.liquidity?.usd || 0;
  const vol24 = pair.volume?.h24 || 0;
  const buys24 = pair.txns?.h24?.buys || 0;
  const sells24 = pair.txns?.h24?.sells || 0;
  const totalTxns = buys24 + sells24;
  const ageMs = pair.pairCreatedAt ? Date.now() - pair.pairCreatedAt : 0;
  const ageMin = ageMs / 60_000;
  const change24h = pair.priceChange?.h24 || 0;

  // Honeypot: very few sells compared to buys
  if (totalTxns > 20 && sells24 < buys24 * 0.1) {
    flags.push({ label: 'HONEYPOT?', color: '#ef4444', tip: 'Almost no sells — possible honeypot' });
  }
  // Rug risk: very new + low liquidity
  if (ageMin < 30 && liq < 5000) {
    flags.push({ label: 'RUG RISK', color: '#f97316', tip: 'Brand new + very low liquidity' });
  }
  // Dump: massive price drop
  if (change24h < -70) {
    flags.push({ label: 'DUMPED', color: '#ef4444', tip: `Price crashed ${change24h.toFixed(0)}% in 24h` });
  }
  // Pump & dump pattern: huge spike + sells dominate recent
  if (change24h > 500 && sells24 > buys24 * 1.5) {
    flags.push({ label: 'P&D?', color: '#f97316', tip: 'Pump pattern with heavy selling' });
  }
  // Low liquidity warning
  if (liq < 2000 && liq > 0) {
    flags.push({ label: 'LOW LIQ', color: '#eab308', tip: 'Liquidity under $2K — high slippage' });
  }
  // Wash trading: volume > 10x liquidity
  if (liq > 0 && vol24 / liq > 15) {
    flags.push({ label: 'WASH?', color: '#eab308', tip: 'Volume suspiciously high vs liquidity' });
  }
  return flags;
}

/* ──────────────────────────── DEX trade links ──────────────────────────── */

function getTradeLink(pair) {
  const chain = pair.chainId;
  const addr = pair.baseToken?.address;
  if (!addr) return null;
  switch (chain) {
    case 'solana':   return `https://jup.ag/swap/SOL-${addr}`;
    case 'ethereum': return `https://app.uniswap.org/swap?outputCurrency=${addr}&chain=mainnet`;
    case 'bsc':      return `https://pancakeswap.finance/swap?outputCurrency=${addr}`;
    case 'base':     return `https://app.uniswap.org/swap?outputCurrency=${addr}&chain=base`;
    case 'arbitrum': return `https://app.uniswap.org/swap?outputCurrency=${addr}&chain=arbitrum`;
    case 'polygon':  return `https://app.uniswap.org/swap?outputCurrency=${addr}&chain=polygon`;
    case 'avalanche':return `https://traderjoexyz.com/avalanche/trade?outputCurrency=${addr}`;
    case 'optimism': return `https://app.uniswap.org/swap?outputCurrency=${addr}&chain=optimism`;
    default:         return null;
  }
}

function getDexName(chain) {
  switch (chain) {
    case 'solana':    return 'Jupiter';
    case 'ethereum':  return 'Uniswap';
    case 'bsc':       return 'PancakeSwap';
    case 'base':      return 'Uniswap';
    case 'arbitrum':  return 'Uniswap';
    case 'polygon':   return 'Uniswap';
    case 'avalanche': return 'TraderJoe';
    case 'optimism':  return 'Uniswap';
    default:          return 'DEX';
  }
}

/* ──────────────────────────── copy helper ──────────────────────────── */

function CopyButton({ text, label, dark }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono transition-all hover:bg-white/10"
      style={{ color: copied ? '#22c55e' : '#64748b' }}
      title={`Copy ${label}`}
    >
      {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
      {text ? text.slice(0, 6) + '...' + text.slice(-4) : '—'}
    </button>
  );
}

/* ──────────────────────────── sound alert ──────────────────────────── */

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.value = 0.15;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.35);
  } catch {}
}

/* ──────────────────────────── chain badge ──────────────────────────── */

const CHAIN_COLORS = {
  solana: '#9945FF', ethereum: '#627EEA', bsc: '#F3BA2F', base: '#0052FF',
  arbitrum: '#28A0F0', polygon: '#8247E5', avalanche: '#E84142', optimism: '#FF0420',
  fantom: '#1969FF', cronos: '#002D74',
};

function ChainBadge({ chainId }) {
  const color = CHAIN_COLORS[chainId] || '#64748b';
  const name = chainId ? chainId.charAt(0).toUpperCase() + chainId.slice(1) : '??';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
      style={{ background: `${color}22`, color, border: `1px solid ${color}33` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
}

/* ──────────────────────────── risk meter ──────────────────────────── */

function RiskMeter({ score }) {
  const s = getScoreLabel(score);
  const Icon = s.icon;
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-20 overflow-hidden rounded-full bg-slate-700/50">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${score}%`, background: `linear-gradient(90deg, ${s.color}88, ${s.color})` }}
        />
      </div>
      <div className="flex items-center gap-1">
        <Icon className="h-3 w-3" style={{ color: s.color }} />
        <span className="text-[10px] font-bold" style={{ color: s.color }}>{score}</span>
      </div>
    </div>
  );
}

/* ──────────────────────────── watchlist ──────────────────────────── */

const MEME_WATCHLIST_KEY = 'meme_watchlist_v1';
function getWatchlist() {
  try { return JSON.parse(localStorage.getItem(MEME_WATCHLIST_KEY) || '[]'); } catch { return []; }
}
function toggleWatchlist(pairAddress) {
  const wl = getWatchlist();
  const idx = wl.indexOf(pairAddress);
  if (idx >= 0) wl.splice(idx, 1); else wl.push(pairAddress);
  localStorage.setItem(MEME_WATCHLIST_KEY, JSON.stringify(wl));
  return wl;
}

/* ══════════════════════════════════════════════════════════════════ */
/*                          MAIN COMPONENT                           */
/* ══════════════════════════════════════════════════════════════════ */

export default function Memes() {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  /* ── state ── */
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [liveSearchQuery, setLiveSearchQuery] = useState('');
  const [liveSearchResults, setLiveSearchResults] = useState([]);
  const [liveSearching, setLiveSearching] = useState(false);
  const [showLiveResults, setShowLiveResults] = useState(false);
  const liveSearchTimerRef = useRef(null);
  const liveSearchBoxRef = useRef(null);
  const [chainFilter, setChainFilter] = useState('all');
  const [ageFilter, setAgeFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [sortBy, setSortBy] = useState('score');
  const [minLiquidity, setMinLiquidity] = useState(1000);
  const [minVolume, setMinVolume] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(60);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [watchlist, setWatchlist] = useState(getWatchlist());
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [expandedCard, setExpandedCard] = useState(null);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, query: '' });
  const [showFilters, setShowFilters] = useState(true);
  const [viewMode, setViewMode] = useState('grid'); // grid | list
  const [terminalResult, setTerminalResult] = useState(null);
  // pro features
  const [activeTab, setActiveTab] = useState('discover'); // discover | trending | new
  const [trendingTokens, setTrendingTokens] = useState([]);
  const [newPairTokens, setNewPairTokens] = useState([]);
  const [soundAlerts, setSoundAlerts] = useState(false);
  const prevTokenCountRef = useRef(0);

  const autoRefreshRef = useRef(null);
  const abortRef = useRef(null);

  /* ── theme colors ── */
  const bg = dark ? 'hsl(222,47%,11%)' : 'hsl(216,30%,96%)';
  const cardBg = dark ? 'hsl(222,47%,13%)' : '#ffffff';
  const borderColor = dark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.25)';
  const textColor = dark ? '#e2e8f0' : '#1e293b';
  const mutedColor = dark ? '#64748b' : '#94a3b8';
  const sidebarBg = dark ? 'hsl(222,47%,12%)' : 'hsl(216,28%,94%)';

  /* ── fetch from DexScreener ── */
  const fetchPairs = useCallback(async (query) => {
    const res = await fetch(`${DEX_API}/latest/dex/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();
    return data.pairs || [];
  }, []);

  const fetchBoosts = useCallback(async () => {
    try {
      const res = await fetch(`${DEX_API}/token-boosts/top/v1`);
      if (!res.ok) return [];
      const data = await res.json();
      return data || [];
    } catch { return []; }
  }, []);

  /* ── fetch trending tokens (boosted) with full pair data ── */
  const fetchTrending = useCallback(async () => {
    try {
      const [topRes, latestRes] = await Promise.all([
        fetch(`${DEX_API}/token-boosts/top/v1`).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${DEX_API}/token-boosts/latest/v1`).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      const all = [...(topRes || []), ...(latestRes || [])];
      // Dedupe by tokenAddress, take unique
      const seen = new Set();
      const unique = [];
      for (const b of all) {
        const key = `${b.chainId}_${b.tokenAddress}`;
        if (!seen.has(key) && b.tokenAddress) { seen.add(key); unique.push(b); }
      }
      // Fetch pair data for top boosted tokens (batches of 3 addresses via search)
      const pairs = [];
      for (let i = 0; i < Math.min(unique.length, 15); i += 3) {
        const batch = unique.slice(i, i + 3);
        const results = await Promise.all(
          batch.map(b => fetchPairs(b.tokenAddress).catch(() => []))
        );
        results.flat().forEach(p => {
          if (p.priceUsd && (p.liquidity?.usd || 0) >= 100) {
            p._isBoosted = true;
            p._score = computeRiskScore(p);
            p._boostAmount = unique.find(u => u.tokenAddress?.toLowerCase() === p.baseToken?.address?.toLowerCase())?.totalAmount || 0;
            pairs.push(p);
          }
        });
        if (i + 3 < unique.length) await new Promise(r => setTimeout(r, 1100));
      }
      // Dedupe by pairAddress, keep highest volume
      const pairMap = new Map();
      pairs.forEach(p => {
        const existing = pairMap.get(p.pairAddress);
        if (!existing || (p.volume?.h24 || 0) > (existing.volume?.h24 || 0)) {
          pairMap.set(p.pairAddress, p);
        }
      });
      setTrendingTokens(Array.from(pairMap.values()));
    } catch {}
  }, [fetchPairs]);

  /* ── fetch newest token profiles ── */
  const fetchNewPairs = useCallback(async () => {
    try {
      const res = await fetch(`${DEX_API}/token-profiles/latest/v1`);
      if (!res.ok) return;
      const profiles = await res.json();
      if (!Array.isArray(profiles)) return;
      // Get pair data for newest profiles
      const seen = new Set();
      const unique = [];
      for (const p of profiles) {
        const key = `${p.chainId}_${p.tokenAddress}`;
        if (!seen.has(key) && p.tokenAddress) { seen.add(key); unique.push(p); }
      }
      const pairs = [];
      for (let i = 0; i < Math.min(unique.length, 12); i += 3) {
        const batch = unique.slice(i, i + 3);
        const results = await Promise.all(
          batch.map(b => fetchPairs(b.tokenAddress).catch(() => []))
        );
        results.flat().forEach(p => {
          if (p.priceUsd && (p.liquidity?.usd || 0) >= 100) {
            p._score = computeRiskScore(p);
            p._isNew = true;
            pairs.push(p);
          }
        });
        if (i + 3 < unique.length) await new Promise(r => setTimeout(r, 1100));
      }
      const pairMap = new Map();
      pairs.forEach(p => {
        const existing = pairMap.get(p.pairAddress);
        if (!existing || (p.volume?.h24 || 0) > (existing.volume?.h24 || 0)) {
          pairMap.set(p.pairAddress, p);
        }
      });
      const newList = Array.from(pairMap.values());
      // Sound alert for new tokens
      if (soundAlerts && newList.length > prevTokenCountRef.current && prevTokenCountRef.current > 0) {
        playAlertSound();
      }
      prevTokenCountRef.current = newList.length;
      setNewPairTokens(newList);
    } catch {}
  }, [fetchPairs, soundAlerts]);

  /* ── main scan ── */
  const runDiscovery = useCallback(async (customQuery = null) => {
    if (loading) return;
    setLoading(true);
    setError(null);

    const seenPairs = new Map();
    const queries = customQuery
      ? [customQuery]
      : DISCOVERY_QUERIES.slice(0, 18); // use 18 queries for broad coverage within rate limits

    setScanProgress({ current: 0, total: queries.length, query: '' });

    try {
      // Fetch boosts first for trending tokens
      const boosts = await fetchBoosts();
      const boostAddresses = new Set();
      if (Array.isArray(boosts)) {
        boosts.forEach(b => {
          if (b.tokenAddress) boostAddresses.add(b.tokenAddress.toLowerCase());
        });
      }

      // Search in batches of 3 to respect rate limits
      for (let i = 0; i < queries.length; i += 3) {
        const batch = queries.slice(i, i + 3);
        setScanProgress({ current: i, total: queries.length, query: batch.join(', ') });

        const results = await Promise.all(
          batch.map(q => fetchPairs(q).catch(() => []))
        );

        results.flat().forEach(pair => {
          if (!pair.pairAddress || !pair.priceUsd) return;
          // skip if no liquidity at all
          if (!pair.liquidity?.usd || pair.liquidity.usd < 100) return;

          const key = pair.pairAddress.toLowerCase();
          if (!seenPairs.has(key)) {
            // Check if this token is boosted
            const baseAddr = pair.baseToken?.address?.toLowerCase() || '';
            pair._isBoosted = boostAddresses.has(baseAddr);
            pair._score = computeRiskScore(pair);
            seenPairs.set(key, pair);
          }
        });

        // Small delay between batches to respect rate limits
        if (i + 3 < queries.length) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }

      setScanProgress({ current: queries.length, total: queries.length, query: 'Done!' });

      const allTokens = Array.from(seenPairs.values());
      setTokens(allTokens);
      setLastRefresh(new Date());

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loading, fetchPairs, fetchBoosts]);

  /* ── auto-refresh ── */
  useEffect(() => {
    if (autoRefresh && !loading) {
      autoRefreshRef.current = setInterval(() => {
        runDiscovery();
      }, refreshInterval * 1000);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [autoRefresh, refreshInterval, loading]);

  /* ── initial load ── */
  useEffect(() => { runDiscovery(); }, []);
  // Load trending + new pairs on mount and when tabs change
  useEffect(() => {
    if (activeTab === 'trending' && trendingTokens.length === 0) fetchTrending();
    if (activeTab === 'new' && newPairTokens.length === 0) fetchNewPairs();
  }, [activeTab]);

  /* ── filter + sort ── */
  const filtered = useMemo(() => {
    const source = activeTab === 'trending' ? trendingTokens
                 : activeTab === 'new' ? newPairTokens
                 : tokens;
    let result = [...source];

    // Chain filter
    if (chainFilter !== 'all') {
      result = result.filter(p => p.chainId === chainFilter);
    }

    // Age filter
    const ageCfg = AGE_FILTERS.find(a => a.id === ageFilter);
    if (ageCfg?.maxMs) {
      const now = Date.now();
      result = result.filter(p => p.pairCreatedAt && (now - p.pairCreatedAt) <= ageCfg.maxMs);
    }

    // Risk filter
    const riskCfg = RISK_LEVELS.find(r => r.id === riskFilter);
    if (riskCfg && riskFilter !== 'all') {
      result = result.filter(p => {
        const s = p._score;
        if (riskCfg.min !== undefined && s < riskCfg.min) return false;
        if (riskCfg.max !== undefined && s >= riskCfg.max) return false;
        return true;
      });
    }

    // Min liquidity
    if (minLiquidity > 0) {
      result = result.filter(p => (p.liquidity?.usd || 0) >= minLiquidity);
    }

    // Min volume
    if (minVolume > 0) {
      result = result.filter(p => (p.volume?.h24 || 0) >= minVolume);
    }

    // Watchlist only
    if (watchlistOnly) {
      result = result.filter(p => watchlist.includes(p.pairAddress));
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        (p.baseToken?.symbol || '').toLowerCase().includes(q) ||
        (p.baseToken?.name || '').toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'score':      return (b._score || 0) - (a._score || 0);
        case 'volume':     return (b.volume?.h24 || 0) - (a.volume?.h24 || 0);
        case 'liquidity':  return (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0);
        case 'age_new':    return (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0);
        case 'change_24h': return (b.priceChange?.h24 || 0) - (a.priceChange?.h24 || 0);
        case 'buys': {
          const aR = (a.txns?.h24?.buys || 0) / ((a.txns?.h24?.buys || 0) + (a.txns?.h24?.sells || 1));
          const bR = (b.txns?.h24?.buys || 0) / ((b.txns?.h24?.buys || 0) + (b.txns?.h24?.sells || 1));
          return bR - aR;
        }
        case 'mcap':       return (b.marketCap || b.fdv || 0) - (a.marketCap || a.fdv || 0);
        default:           return 0;
      }
    });

    return result;
  }, [tokens, trendingTokens, newPairTokens, activeTab, chainFilter, ageFilter, riskFilter, sortBy, minLiquidity, minVolume, searchQuery, watchlistOnly, watchlist]);

  /* ── stats ── */
  const stats = useMemo(() => {
    const chains = {};
    let totalVol = 0, totalLiq = 0, safeCount = 0, degenCount = 0;
    tokens.forEach(t => {
      chains[t.chainId] = (chains[t.chainId] || 0) + 1;
      totalVol += t.volume?.h24 || 0;
      totalLiq += t.liquidity?.usd || 0;
      if (t._score >= 70) safeCount++;
      if (t._score < 20) degenCount++;
    });
    return { chains, totalVol, totalLiq, safeCount, degenCount, total: tokens.length };
  }, [tokens]);

  /* ── handle watchlist toggle ── */
  const handleWatchlistToggle = (pairAddress) => {
    const updated = toggleWatchlist(pairAddress);
    setWatchlist([...updated]);
  };

  /* ── handle custom search ── */
  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      runDiscovery(searchQuery.trim());
    }
  };

  /* ── live search with debounce ── */
  const handleLiveSearchChange = useCallback((val) => {
    setLiveSearchQuery(val);
    if (liveSearchTimerRef.current) clearTimeout(liveSearchTimerRef.current);
    if (!val.trim()) {
      setLiveSearchResults([]);
      setShowLiveResults(false);
      return;
    }
    liveSearchTimerRef.current = setTimeout(async () => {
      setLiveSearching(true);
      try {
        const res = await fetch(`${DEX_API}/latest/dex/search?q=${encodeURIComponent(val.trim())}`);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        const pairs = (data.pairs || []).filter(p => p.priceUsd && (p.liquidity?.usd || 0) >= 100);
        pairs.forEach(p => { p._score = computeRiskScore(p); });
        pairs.sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0));
        setLiveSearchResults(pairs.slice(0, 30));
        setShowLiveResults(true);
      } catch { setLiveSearchResults([]); }
      finally { setLiveSearching(false); }
    }, 400);
  }, []);

  /* close live search on outside click */
  useEffect(() => {
    const handler = (e) => {
      if (liveSearchBoxRef.current && !liveSearchBoxRef.current.contains(e.target)) {
        setShowLiveResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* add live search result to main tokens list */
  const addLiveResultToTokens = useCallback((pair) => {
    pair._score = computeRiskScore(pair);
    setTokens(prev => {
      const exists = prev.find(p => p.pairAddress === pair.pairAddress);
      if (exists) return prev;
      return [pair, ...prev];
    });
    setShowLiveResults(false);
    setLiveSearchQuery('');
  }, []);

  /* ── open terminal popup for a pair ── */
  const openTerminalForPair = useCallback((pair) => {
    const sym = (pair.baseToken?.symbol || '').toUpperCase();
    const quote = (pair.quoteToken?.symbol || '').toUpperCase();
    const binanceSymbol = ['USDT','USDC','BUSD','USD'].includes(quote)
      ? `${sym}USDT`
      : `${sym}USDT`;
    setTerminalResult({
      symbol: binanceSymbol,
      isCrypto: true,
      price: parseFloat(pair.priceUsd) || 0,
      goldSignalTime: null,
      goldSignalPrice: null,
      signals: [],
      scanTimeframe: '1d',
    });
  }, []);

  /* ──────────────────────── RENDER ──────────────────────── */
  return (
    <div className="flex h-full overflow-hidden" style={{ background: bg }}>
      {/* ═══════ LEFT SIDEBAR ═══════ */}
      <div
        className="flex flex-col gap-3 overflow-y-auto border-r p-3 flex-shrink-0"
        style={{ width: 310, background: sidebarBg, borderColor }}
      >
        {/* logo header */}
        <div className="flex items-center gap-2 rounded-xl p-3" style={{ background: dark ? 'rgba(250,204,21,0.08)' : 'rgba(250,204,21,0.12)' }}>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 shadow-lg shadow-orange-500/20">
            <Flame className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold" style={{ color: textColor }}>DEX Scanner</div>
            <div className="text-[10px]" style={{ color: mutedColor }}>All Chains · All DEXes · Live</div>
          </div>
        </div>

        {/* search */}
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: mutedColor }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search token name or symbol..."
            className="w-full rounded-lg border py-2 pl-8 pr-3 text-xs outline-none transition-all focus:ring-1 focus:ring-yellow-500/50"
            style={{ background: dark ? 'rgba(30,41,59,0.5)' : '#fff', borderColor, color: textColor }}
          />
        </form>

        {/* discovery tabs */}
        <div className="grid grid-cols-3 gap-1 rounded-lg border p-1" style={{ borderColor }}>
          {[
            { id: 'discover', icon: Search, label: 'Discover', color: '#f59e0b' },
            { id: 'trending', icon: Flame,  label: 'Trending', color: '#ef4444' },
            { id: 'new',      icon: Radio,  label: 'New Pairs', color: '#22c55e' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center justify-center gap-1 rounded-md py-1.5 text-[10px] font-bold transition-all"
              style={{
                background: activeTab === tab.id ? `${tab.color}18` : 'transparent',
                color: activeTab === tab.id ? tab.color : mutedColor,
                border: activeTab === tab.id ? `1px solid ${tab.color}33` : '1px solid transparent',
              }}
            >
              <tab.icon className="h-3 w-3" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* scan button */}
        <button
          onClick={() => {
            if (activeTab === 'trending') fetchTrending();
            else if (activeTab === 'new') fetchNewPairs();
            else runDiscovery();
          }}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all hover:brightness-110 disabled:opacity-50"
          style={{
            background: activeTab === 'trending' ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                       : activeTab === 'new' ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                       : 'linear-gradient(135deg, #f59e0b, #ef4444)',
            color: '#fff',
            boxShadow: activeTab === 'trending' ? '0 4px 15px rgba(239,68,68,0.3)'
                       : activeTab === 'new' ? '0 4px 15px rgba(34,197,94,0.3)'
                       : '0 4px 15px rgba(245,158,11,0.3)',
          }}
        >
          {loading ? (
            <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Scanning... ({scanProgress.current}/{scanProgress.total})</>
          ) : (
            <><Rocket className="h-3.5 w-3.5" /> {activeTab === 'trending' ? 'Load Trending' : activeTab === 'new' ? 'Load New Pairs' : 'Scan DEX Tokens'}</>
          )}
        </button>

        {/* sound alerts */}
        <div className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ borderColor }}>
          <div className="flex items-center gap-1.5">
            {soundAlerts ? <Bell className="h-3.5 w-3.5 text-yellow-400" /> : <BellOff className="h-3.5 w-3.5" style={{ color: mutedColor }} />}
            <span className="text-[10px] font-medium" style={{ color: soundAlerts ? '#facc15' : mutedColor }}>Sound Alerts</span>
          </div>
          <button
            onClick={() => { setSoundAlerts(!soundAlerts); if (!soundAlerts) playAlertSound(); }}
            className="relative h-5 w-9 rounded-full transition-all"
            style={{ background: soundAlerts ? '#facc15' : dark ? '#334155' : '#cbd5e1' }}
          >
            <div
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all"
              style={{ left: soundAlerts ? 18 : 2 }}
            />
          </button>
        </div>

        {/* scan progress */}
        {loading && (
          <div className="rounded-lg p-2" style={{ background: dark ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.08)' }}>
            <div className="mb-1 flex items-center justify-between text-[10px]" style={{ color: mutedColor }}>
              <span>Searching: {scanProgress.query}</span>
              <span>{Math.round((scanProgress.current / Math.max(1, scanProgress.total)) * 100)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700/30">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${(scanProgress.current / Math.max(1, scanProgress.total)) * 100}%`,
                  background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
                }}
              />
            </div>
          </div>
        )}

        {/* chain filter */}
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: mutedColor }}>Chain</div>
          <div className="grid grid-cols-3 gap-1">
            {CHAINS.map(c => {
              const Icon = c.icon;
              const active = chainFilter === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setChainFilter(c.id)}
                  className="flex items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-[10px] font-medium transition-all"
                  style={{
                    background: active ? `${c.color}18` : 'transparent',
                    borderColor: active ? `${c.color}44` : borderColor,
                    color: active ? c.color : mutedColor,
                  }}
                >
                  <Icon className="h-3 w-3" />
                  {c.label.replace('All Chains', 'All')}
                </button>
              );
            })}
          </div>
        </div>

        {/* age filter */}
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: mutedColor }}>Token Age</div>
          <div className="grid grid-cols-3 gap-1">
            {AGE_FILTERS.map(a => (
              <button
                key={a.id}
                onClick={() => setAgeFilter(a.id)}
                className="rounded-lg border px-1.5 py-1.5 text-[10px] font-medium transition-all"
                style={{
                  background: ageFilter === a.id ? 'rgba(59,130,246,0.12)' : 'transparent',
                  borderColor: ageFilter === a.id ? 'rgba(59,130,246,0.3)' : borderColor,
                  color: ageFilter === a.id ? '#60a5fa' : mutedColor,
                }}
              >
                {a.label.replace('Any Age', 'All')}
              </button>
            ))}
          </div>
        </div>

        {/* risk level filter */}
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: mutedColor }}>Risk Level</div>
          <div className="grid grid-cols-5 gap-1">
            {RISK_LEVELS.map(r => (
              <button
                key={r.id}
                onClick={() => setRiskFilter(r.id)}
                className="rounded-lg border px-1 py-1.5 text-[10px] font-medium transition-all"
                style={{
                  background: riskFilter === r.id ? `${r.color}18` : 'transparent',
                  borderColor: riskFilter === r.id ? `${r.color}44` : borderColor,
                  color: riskFilter === r.id ? r.color : mutedColor,
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* min liquidity */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: mutedColor }}>Min Liquidity</span>
            <span className="text-[10px] font-bold" style={{ color: '#60a5fa' }}>{formatNumber(minLiquidity)}</span>
          </div>
          <input
            type="range"
            min={0} max={500000} step={1000}
            value={minLiquidity}
            onChange={e => setMinLiquidity(+e.target.value)}
            className="w-full accent-blue-500"
            style={{ height: 4 }}
          />
        </div>

        {/* min volume */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: mutedColor }}>Min Volume 24h</span>
            <span className="text-[10px] font-bold" style={{ color: '#60a5fa' }}>{formatNumber(minVolume)}</span>
          </div>
          <input
            type="range"
            min={0} max={1000000} step={5000}
            value={minVolume}
            onChange={e => setMinVolume(+e.target.value)}
            className="w-full accent-blue-500"
            style={{ height: 4 }}
          />
        </div>

        {/* sort */}
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: mutedColor }}>Sort By</div>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="w-full rounded-lg border px-2 py-2 text-xs outline-none"
            style={{ background: dark ? 'rgba(30,41,59,0.5)' : '#fff', borderColor, color: textColor }}
          >
            {SORT_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        {/* auto-refresh */}
        <div className="rounded-lg border p-2.5" style={{ borderColor }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: mutedColor }}>Auto Refresh</span>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="relative h-5 w-9 rounded-full transition-all"
              style={{ background: autoRefresh ? '#22c55e' : dark ? '#334155' : '#cbd5e1' }}
            >
              <div
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all"
                style={{ left: autoRefresh ? 18 : 2 }}
              />
            </button>
          </div>
          {autoRefresh && (
            <div className="mt-2 flex items-center gap-2">
              <Timer className="h-3 w-3" style={{ color: mutedColor }} />
              <select
                value={refreshInterval}
                onChange={e => setRefreshInterval(+e.target.value)}
                className="flex-1 rounded border px-1.5 py-1 text-[10px] outline-none"
                style={{ background: dark ? 'rgba(30,41,59,0.5)' : '#fff', borderColor, color: textColor }}
              >
                <option value={30}>Every 30s</option>
                <option value={60}>Every 60s</option>
                <option value={120}>Every 2min</option>
                <option value={300}>Every 5min</option>
              </select>
            </div>
          )}
        </div>

        {/* watchlist toggle */}
        <button
          onClick={() => setWatchlistOnly(!watchlistOnly)}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all"
          style={{
            background: watchlistOnly ? 'rgba(250,204,21,0.12)' : 'transparent',
            borderColor: watchlistOnly ? 'rgba(250,204,21,0.3)' : borderColor,
            color: watchlistOnly ? '#facc15' : mutedColor,
          }}
        >
          <Star className="h-3.5 w-3.5" fill={watchlistOnly ? '#facc15' : 'none'} />
          Watchlist Only ({watchlist.length})
        </button>

        {/* stats */}
        <div className="mt-auto rounded-lg border p-2.5" style={{ borderColor, background: dark ? 'rgba(30,41,59,0.3)' : 'rgba(255,255,255,0.5)' }}>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: mutedColor }}>Discovery Stats</div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="rounded-md p-1.5" style={{ background: dark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.06)' }}>
              <div className="text-[9px]" style={{ color: mutedColor }}>Tokens Found</div>
              <div className="text-sm font-bold" style={{ color: '#60a5fa' }}>{stats.total}</div>
            </div>
            <div className="rounded-md p-1.5" style={{ background: dark ? 'rgba(34,197,94,0.08)' : 'rgba(34,197,94,0.06)' }}>
              <div className="text-[9px]" style={{ color: mutedColor }}>Safe (70+)</div>
              <div className="text-sm font-bold" style={{ color: '#22c55e' }}>{stats.safeCount}</div>
            </div>
            <div className="rounded-md p-1.5" style={{ background: dark ? 'rgba(250,204,21,0.08)' : 'rgba(250,204,21,0.06)' }}>
              <div className="text-[9px]" style={{ color: mutedColor }}>Total Volume</div>
              <div className="text-[11px] font-bold" style={{ color: '#facc15' }}>{formatNumber(stats.totalVol)}</div>
            </div>
            <div className="rounded-md p-1.5" style={{ background: dark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.06)' }}>
              <div className="text-[9px]" style={{ color: mutedColor }}>Degen (&lt;20)</div>
              <div className="text-sm font-bold" style={{ color: '#ef4444' }}>{stats.degenCount}</div>
            </div>
          </div>
          {lastRefresh && (
            <div className="mt-1.5 text-[9px] text-center" style={{ color: mutedColor }}>
              Last scan: {lastRefresh.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* ═══════ MAIN CONTENT ═══════ */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* top bar */}
        <div
          className="flex items-center gap-3 border-b px-4 py-2.5 flex-shrink-0"
          style={{ borderColor, background: dark ? 'rgba(16,24,46,0.5)' : 'rgba(255,255,255,0.7)' }}
        >
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4" style={{ color: '#f59e0b' }} />
            <span className="text-sm font-bold" style={{ color: textColor }}>
              {filtered.length} tokens
            </span>
            <span className="text-xs" style={{ color: mutedColor }}>
              {chainFilter !== 'all' && `on ${chainFilter}`}
              {ageFilter !== 'all' && ` · ${AGE_FILTERS.find(a => a.id === ageFilter)?.label}`}
            </span>
          </div>

          {/* ── LIVE SEARCH BAR ── */}
          <div className="relative flex-1 max-w-md mx-3" ref={liveSearchBoxRef}>
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 pointer-events-none" style={{ color: mutedColor }} />
            {liveSearching && (
              <RefreshCw className="absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin" style={{ color: '#f59e0b' }} />
            )}
            <input
              value={liveSearchQuery}
              onChange={e => handleLiveSearchChange(e.target.value)}
              onFocus={() => { if (liveSearchResults.length) setShowLiveResults(true); }}
              placeholder="Search any token across all DEXes..."
              className="w-full rounded-lg border py-2 pl-9 pr-9 text-xs outline-none transition-all focus:ring-1 focus:ring-yellow-500/40"
              style={{ background: dark ? 'rgba(30,41,59,0.6)' : '#fff', borderColor, color: textColor }}
            />
            {/* dropdown results */}
            {showLiveResults && liveSearchResults.length > 0 && (
              <div
                className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-[420px] overflow-y-auto rounded-xl border shadow-2xl"
                style={{ background: dark ? 'hsl(222,47%,12%)' : '#fff', borderColor }}
              >
                <div className="sticky top-0 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: mutedColor, background: dark ? 'hsl(222,47%,12%)' : '#fff', borderBottom: `1px solid ${borderColor}` }}>
                  {liveSearchResults.length} results · Click to add
                </div>
                {liveSearchResults.map(pair => {
                  const ch24 = pair.priceChange?.h24 || 0;
                  const scoreInfo = getScoreLabel(pair._score);
                  const SIcon = scoreInfo.icon;
                  return (
                    <button
                      key={pair.pairAddress}
                      onClick={() => addLiveResultToTokens(pair)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-all hover:bg-white/5"
                      style={{ borderBottom: `1px solid ${borderColor}` }}
                    >
                      {/* logo */}
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ background: dark ? 'rgba(30,41,59,0.5)' : 'rgba(241,245,249,0.8)' }}>
                        {pair.info?.imageUrl ? (
                          <img src={pair.info.imageUrl} alt="" className="h-6 w-6 rounded object-cover" onError={e => e.target.style.display = 'none'} />
                        ) : (
                          <span className="text-[10px] font-bold" style={{ color: scoreInfo.color }}>{(pair.baseToken?.symbol || '?').slice(0, 3)}</span>
                        )}
                      </div>
                      {/* info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold truncate" style={{ color: textColor }}>{pair.baseToken?.symbol}</span>
                          <ChainBadge chainId={pair.chainId} />
                          <span className="text-[9px]" style={{ color: mutedColor }}>{pair.dexId}</span>
                        </div>
                        <div className="text-[10px] truncate" style={{ color: mutedColor }}>{pair.baseToken?.name}</div>
                      </div>
                      {/* price + change */}
                      <div className="flex-shrink-0 text-right">
                        <div className="text-xs font-bold" style={{ color: textColor }}>{formatPrice(pair.priceUsd)}</div>
                        <div className={`text-[10px] font-bold ${ch24 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {ch24 >= 0 ? '+' : ''}{ch24.toFixed(1)}%
                        </div>
                      </div>
                      {/* score */}
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <SIcon className="h-3 w-3" style={{ color: scoreInfo.color }} />
                        <span className="text-[10px] font-bold" style={{ color: scoreInfo.color }}>{pair._score}</span>
                      </div>
                      {/* vol + liq */}
                      <div className="hidden flex-shrink-0 text-right lg:block">
                        <div className="text-[9px]" style={{ color: mutedColor }}>Vol {formatNumber(pair.volume?.h24)}</div>
                        <div className="text-[9px]" style={{ color: mutedColor }}>Liq {formatNumber(pair.liquidity?.usd)}</div>
                      </div>
                      {/* eye → terminal popup */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openTerminalForPair(pair);
                        }}
                        className="flex-shrink-0 rounded-md p-1 transition-all hover:bg-blue-500/20"
                        title="Open chart"
                      >
                        <Eye className="h-3.5 w-3.5" style={{ color: '#60a5fa' }} />
                      </button>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* chain quick filters */}
            <div className="hidden items-center gap-1 md:flex">
              {Object.entries(stats.chains).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([chain, count]) => (
                <button
                  key={chain}
                  onClick={() => setChainFilter(chainFilter === chain ? 'all' : chain)}
                  className="flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-all"
                  style={{
                    background: chainFilter === chain ? `${CHAIN_COLORS[chain] || '#64748b'}22` : 'transparent',
                    color: CHAIN_COLORS[chain] || '#64748b',
                    border: `1px solid ${chainFilter === chain ? `${CHAIN_COLORS[chain] || '#64748b'}44` : 'transparent'}`,
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: CHAIN_COLORS[chain] || '#64748b' }} />
                  {chain} ({count})
                </button>
              ))}
            </div>

            <button
              onClick={() => runDiscovery()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-medium transition-all hover:brightness-110 disabled:opacity-50"
              style={{ borderColor, color: mutedColor }}
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* error */}
        {error && (
          <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-400">
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        )}

        {/* token grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && tokens.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <div className="relative">
                <Flame className="h-12 w-12 animate-pulse" style={{ color: '#f59e0b' }} />
                <RefreshCw className="absolute -right-1 -top-1 h-5 w-5 animate-spin" style={{ color: '#ef4444' }} />
              </div>
              <div className="text-sm font-medium" style={{ color: textColor }}>Scanning DEX pairs...</div>
              <div className="text-xs" style={{ color: mutedColor }}>Searching {scanProgress.query}</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <Search className="h-10 w-10" style={{ color: mutedColor }} />
              <div className="text-sm" style={{ color: mutedColor }}>No tokens match your filters</div>
              <button
                onClick={() => { setChainFilter('all'); setAgeFilter('all'); setRiskFilter('all'); setMinLiquidity(0); setMinVolume(0); }}
                className="text-xs text-blue-400 hover:underline"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filtered.map((pair) => (
                <TokenCard
                  key={pair.pairAddress}
                  pair={pair}
                  dark={dark}
                  cardBg={cardBg}
                  borderColor={borderColor}
                  textColor={textColor}
                  mutedColor={mutedColor}
                  isWatchlisted={watchlist.includes(pair.pairAddress)}
                  onWatchlistToggle={handleWatchlistToggle}
                  expanded={expandedCard === pair.pairAddress}
                  onExpand={() => setExpandedCard(expandedCard === pair.pairAddress ? null : pair.pairAddress)}
                  onOpenTerminal={(pair) => openTerminalForPair(pair)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══════ TERMINAL POPUP ═══════ */}
      {terminalResult && (
        <Suspense fallback={null}>
          <SymbolTerminalModal
            result={terminalResult}
            onClose={() => setTerminalResult(null)}
          />
        </Suspense>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/*                          TOKEN CARD                               */
/* ══════════════════════════════════════════════════════════════════ */

function TokenCard({ pair, dark, cardBg, borderColor, textColor, mutedColor, isWatchlisted, onWatchlistToggle, expanded, onExpand, onOpenTerminal }) {
  const scoreInfo = getScoreLabel(pair._score);
  const ScoreIcon = scoreInfo.icon;
  const change24h = pair.priceChange?.h24 || 0;
  const change1h = pair.priceChange?.h1 || 0;
  const change5m = pair.priceChange?.m5 || 0;
  const buys24 = pair.txns?.h24?.buys || 0;
  const sells24 = pair.txns?.h24?.sells || 0;
  const totalTxns = buys24 + sells24;
  const buyPercent = totalTxns > 0 ? (buys24 / totalTxns * 100) : 50;
  const vol24 = pair.volume?.h24 || 0;
  const liq = pair.liquidity?.usd || 0;
  const mcap = pair.marketCap || pair.fdv || 0;

  const logoUrl = pair.info?.imageUrl;
  const rugFlags = useMemo(() => detectRugFlags(pair), [pair]);
  const tradeLink = getTradeLink(pair);
  const dexName = getDexName(pair.chainId);

  return (
    <div
      className="group relative flex flex-col rounded-xl border transition-all duration-200 hover:translate-y-[-2px]"
      style={{
        background: cardBg,
        borderColor: expanded ? scoreInfo.color + '44' : borderColor,
        boxShadow: expanded
          ? `0 8px 30px ${scoreInfo.color}15`
          : dark ? '0 2px 10px rgba(0,0,0,0.2)' : '0 2px 10px rgba(0,0,0,0.05)',
      }}
    >
      {/* boosted badge */}
      {pair._isBoosted && (
        <div className="absolute -top-2 right-3 flex items-center gap-1 rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 px-2 py-0.5 text-[9px] font-bold text-white shadow-lg">
          <Crown className="h-2.5 w-2.5" /> BOOSTED
        </div>
      )}

      {/* rug / honeypot warnings */}
      {rugFlags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pt-2">
          {rugFlags.map((f, i) => (
            <span key={i} className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-bold" style={{ background: `${f.color}18`, color: f.color, border: `1px solid ${f.color}33` }} title={f.tip}>
              <AlertTriangle className="h-2 w-2" /> {f.label}
            </span>
          ))}
        </div>
      )}

      {/* header */}
      <div className="flex items-start gap-2.5 p-3 pb-2">
        {/* logo */}
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl"
          style={{ background: dark ? 'rgba(30,41,59,0.5)' : 'rgba(241,245,249,0.8)' }}
        >
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
          ) : null}
          <div
            className={`${logoUrl ? 'hidden' : 'flex'} h-full w-full items-center justify-center text-sm font-bold`}
            style={{ color: scoreInfo.color, background: `linear-gradient(135deg, ${scoreInfo.color}15, ${scoreInfo.color}08)` }}
          >
            {(pair.baseToken?.symbol || '??').slice(0, 3)}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold" style={{ color: textColor }}>
              {pair.baseToken?.symbol || '??'}
            </span>
            <ChainBadge chainId={pair.chainId} />
          </div>
          <div className="truncate text-[10px]" style={{ color: mutedColor }}>
            {pair.baseToken?.name || 'Unknown'} · {pair.dexId || '??'}
          </div>
        </div>

        {/* actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onOpenTerminal(pair)}
            className="rounded-md p-1 transition-all hover:bg-blue-500/20"
            title="Open chart"
          >
            <Eye className="h-3.5 w-3.5" style={{ color: '#60a5fa' }} />
          </button>
          <button
            onClick={() => onWatchlistToggle(pair.pairAddress)}
            className="rounded-md p-1 transition-all hover:bg-white/5"
          >
            <Star
              className="h-3.5 w-3.5"
              fill={isWatchlisted ? '#facc15' : 'none'}
              style={{ color: isWatchlisted ? '#facc15' : mutedColor }}
            />
          </button>
          <a
            href={pair.url || `https://dexscreener.com/${pair.chainId}/${pair.pairAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md p-1 transition-all hover:bg-white/5"
          >
            <ExternalLink className="h-3.5 w-3.5" style={{ color: mutedColor }} />
          </a>
        </div>
      </div>

      {/* price + change */}
      <div className="flex items-end justify-between px-3 pb-2">
        <div>
          <div className="text-lg font-bold" style={{ color: textColor }}>{formatPrice(pair.priceUsd)}</div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${change5m >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              5m: {change5m >= 0 ? '+' : ''}{change5m?.toFixed(1)}%
            </span>
            <span className={`text-xs font-bold ${change1h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              1h: {change1h >= 0 ? '+' : ''}{change1h?.toFixed(1)}%
            </span>
            <span className={`text-xs font-bold ${change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              24h: {change24h >= 0 ? '+' : ''}{change24h?.toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-1 text-[10px]" style={{ color: mutedColor }}>
            <Clock className="h-3 w-3" /> {formatAge(pair.pairCreatedAt)}
          </div>
          <RiskMeter score={pair._score} />
        </div>
      </div>

      {/* metrics row */}
      <div
        className="grid grid-cols-3 gap-px border-t"
        style={{ borderColor, background: borderColor }}
      >
        <div className="flex flex-col items-center py-2" style={{ background: cardBg }}>
          <div className="flex items-center gap-1 text-[9px]" style={{ color: mutedColor }}>
            <Droplets className="h-2.5 w-2.5" /> Liquidity
          </div>
          <div className="text-[11px] font-bold" style={{ color: '#60a5fa' }}>{formatNumber(liq)}</div>
        </div>
        <div className="flex flex-col items-center py-2" style={{ background: cardBg }}>
          <div className="flex items-center gap-1 text-[9px]" style={{ color: mutedColor }}>
            <Volume2 className="h-2.5 w-2.5" /> Volume 24h
          </div>
          <div className="text-[11px] font-bold" style={{ color: '#a78bfa' }}>{formatNumber(vol24)}</div>
        </div>
        <div className="flex flex-col items-center py-2" style={{ background: cardBg }}>
          <div className="flex items-center gap-1 text-[9px]" style={{ color: mutedColor }}>
            <DollarSign className="h-2.5 w-2.5" /> MCap
          </div>
          <div className="text-[11px] font-bold" style={{ color: '#fbbf24' }}>{formatNumber(mcap)}</div>
        </div>
      </div>

      {/* buy/sell pressure bar */}
      <div className="px-3 py-2">
        <div className="mb-1 flex items-center justify-between text-[9px]" style={{ color: mutedColor }}>
          <span className="flex items-center gap-1">
            <TrendingUp className="h-2.5 w-2.5 text-emerald-400" />
            Buys: {buys24.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            Sells: {sells24.toLocaleString()}
            <TrendingDown className="h-2.5 w-2.5 text-red-400" />
          </span>
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded-full">
          <div
            className="h-full transition-all"
            style={{ width: `${buyPercent}%`, background: 'linear-gradient(90deg, #22c55e, #4ade80)' }}
          />
          <div
            className="h-full transition-all"
            style={{ width: `${100 - buyPercent}%`, background: 'linear-gradient(90deg, #f87171, #ef4444)' }}
          />
        </div>
        <div className="mt-0.5 text-center text-[9px] font-bold" style={{ color: buyPercent >= 55 ? '#22c55e' : buyPercent <= 45 ? '#ef4444' : mutedColor }}>
          {buyPercent.toFixed(0)}% Buy Pressure
        </div>
      </div>

      {/* expand button */}
      <button
        onClick={onExpand}
        className="flex items-center justify-center gap-1 border-t py-1.5 text-[10px] font-medium transition-all hover:bg-white/5"
        style={{ borderColor, color: mutedColor }}
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? 'Less' : 'Details'}
      </button>

      {/* expanded details */}
      {expanded && (
        <div className="border-t px-3 pb-3 pt-2" style={{ borderColor }}>
          {/* copy addresses */}
          <div className="mb-2 rounded-lg p-2" style={{ background: dark ? 'rgba(30,41,59,0.3)' : 'rgba(241,245,249,0.5)' }}>
            <div className="mb-1 text-[9px] font-semibold uppercase" style={{ color: mutedColor }}>Contract Addresses</div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px]" style={{ color: mutedColor }}>Token</span>
                <CopyButton text={pair.baseToken?.address} label="token address" dark={dark} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[9px]" style={{ color: mutedColor }}>Pair</span>
                <CopyButton text={pair.pairAddress} label="pair address" dark={dark} />
              </div>
            </div>
          </div>

          {/* quick buy */}
          {tradeLink && (
            <a
              href={tradeLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-2 flex items-center justify-center gap-2 rounded-lg py-2.5 text-[11px] font-bold text-white transition-all hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', boxShadow: '0 4px 12px rgba(34,197,94,0.25)' }}
            >
              <ShoppingCart className="h-3.5 w-3.5" /> Buy on {dexName}
            </a>
          )}

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <span style={{ color: mutedColor }}>DEX</span>
              <div className="font-medium" style={{ color: textColor }}>{pair.dexId || '—'}</div>
            </div>
            <div>
              <span style={{ color: mutedColor }}>Quote</span>
              <div className="font-medium" style={{ color: textColor }}>{pair.quoteToken?.symbol || '—'}</div>
            </div>
            {/* timeframe changes */}
            <div>
              <span style={{ color: mutedColor }}>Change 6h</span>
              <div className="font-bold" style={{ color: (pair.priceChange?.h6 || 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                {(pair.priceChange?.h6 || 0) >= 0 ? '+' : ''}{(pair.priceChange?.h6 || 0).toFixed(1)}%
              </div>
            </div>
            <div>
              <span style={{ color: mutedColor }}>Vol/Liq Ratio</span>
              <div className="font-bold" style={{ color: '#a78bfa' }}>
                {liq > 0 ? (vol24 / liq).toFixed(2) + 'x' : '—'}
              </div>
            </div>
            <div>
              <span style={{ color: mutedColor }}>FDV</span>
              <div className="font-bold" style={{ color: '#fbbf24' }}>{formatNumber(pair.fdv)}</div>
            </div>
            <div>
              <span style={{ color: mutedColor }}>Price Native</span>
              <div className="font-medium truncate" style={{ color: textColor }}>{pair.priceNative || '—'}</div>
            </div>
          </div>

          {/* txn breakdown */}
          <div className="mt-2 rounded-lg p-2" style={{ background: dark ? 'rgba(30,41,59,0.3)' : 'rgba(241,245,249,0.5)' }}>
            <div className="mb-1.5 text-[9px] font-semibold uppercase" style={{ color: mutedColor }}>Transaction Breakdown</div>
            <div className="grid grid-cols-4 gap-2 text-center text-[9px]">
              {['m5', 'h1', 'h6', 'h24'].map(tf => {
                const b = pair.txns?.[tf]?.buys || 0;
                const s = pair.txns?.[tf]?.sells || 0;
                return (
                  <div key={tf}>
                    <div className="font-bold uppercase" style={{ color: mutedColor }}>{tf}</div>
                    <div className="text-emerald-400">{b}B</div>
                    <div className="text-red-400">{s}S</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* links */}
          <div className="mt-2 flex gap-2">
            <a
              href={pair.url || `https://dexscreener.com/${pair.chainId}/${pair.pairAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[10px] font-bold text-white transition-all hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
            >
              <BarChart3 className="h-3 w-3" /> DexScreener
            </a>
            {pair.info?.socials?.length > 0 && pair.info.socials[0]?.url && (
              <a
                href={pair.info.socials[0].url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-[10px] font-medium transition-all hover:bg-white/5"
                style={{ borderColor, color: mutedColor }}
              >
                <Users className="h-3 w-3" /> Social
              </a>
            )}
            {pair.info?.websites?.length > 0 && pair.info.websites[0]?.url && (
              <a
                href={pair.info.websites[0].url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-[10px] font-medium transition-all hover:bg-white/5"
                style={{ borderColor, color: mutedColor }}
              >
                <Globe className="h-3 w-3" /> Website
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
