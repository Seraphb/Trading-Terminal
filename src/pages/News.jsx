import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, RefreshCw, Filter, ChevronDown, ChevronUp, ExternalLink,
  Clock, Zap, LayoutList, LayoutGrid, CheckSquare, Square, Loader2,
} from 'lucide-react';
import { useTheme } from '../components/ThemeContext';

const RSS_FEEDS = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', color: '#0052FF' },
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss', color: '#22c55e' },
  { name: 'TheBlock', url: 'https://www.theblock.co/rss.xml', color: '#f59e0b' },
];

const CRYPTO_TICKERS = [
  'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'DOT', 'MATIC',
  'LINK', 'UNI', 'AAVE', 'LTC', 'BNB', 'SHIB', 'ARB', 'OP', 'APT',
];

const REFRESH_MS = 120_000;

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function isBreaking(dateStr) {
  return Date.now() - new Date(dateStr).getTime() < 30 * 60 * 1000;
}

function extractTickers(text) {
  if (!text) return [];
  const upper = text.toUpperCase();
  return CRYPTO_TICKERS.filter((t) => {
    const re = new RegExp(`\\b${t}\\b`);
    return re.test(upper);
  });
}

function truncate(str, len = 200) {
  if (!str) return '';
  const clean = str.replace(/<[^>]*>/g, '').trim();
  return clean.length > len ? clean.slice(0, len) + '...' : clean;
}

async function fetchFeed(feed) {
  const res = await fetch(
    `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`
  );
  const data = await res.json();
  return (data.items || []).map((item) => ({
    ...item,
    source: feed.name,
    sourceColor: feed.color,
    tickers: extractTickers((item.title || '') + ' ' + (item.description || '')),
    image: item.enclosure?.link || item.thumbnail || null,
  }));
}

export default function News() {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [enabledSources, setEnabledSources] = useState(
    () => new Set(RSS_FEEDS.map((f) => f.name))
  );
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [compact, setCompact] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const timerRef = useRef(null);

  const loadNews = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const results = await Promise.allSettled(RSS_FEEDS.map(fetchFeed));
      const all = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      all.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
      setArticles(all);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNews();
  }, [loadNews]);

  useEffect(() => {
    if (autoRefresh) {
      timerRef.current = setInterval(loadNews, REFRESH_MS);
      return () => clearInterval(timerRef.current);
    }
    clearInterval(timerRef.current);
  }, [autoRefresh, loadNews]);

  const toggleSource = (name) => {
    setEnabledSources((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return articles.filter((a) => {
      if (!enabledSources.has(a.source)) return false;
      if (q && !(a.title || '').toLowerCase().includes(q) &&
          !(a.description || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [articles, enabledSources, search]);

  /* ---- colours ---- */
  const bg = dark ? 'hsl(222,47%,11%)' : 'hsl(216,30%,96%)';
  const cardBg = dark ? 'hsl(222,47%,13%)' : '#ffffff';
  const border = dark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.25)';
  const textPrimary = dark ? '#e2e8f0' : '#1e293b';
  const textSecondary = dark ? '#94a3b8' : '#64748b';
  const inputBg = dark ? 'hsl(222,47%,15%)' : '#ffffff';

  return (
    <div style={{ display: 'flex', height: '100%', background: bg, color: textPrimary, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Sidebar */}
      {sidebarOpen && (
        <aside style={{
          width: 280, minWidth: 280, borderRight: `1px solid ${border}`,
          padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
          background: cardBg, overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>News Sources</h2>
            <button onClick={() => setSidebarOpen(false)} style={iconBtn(dark)} title="Collapse sidebar">
              <ChevronDown size={16} />
            </button>
          </div>

          {RSS_FEEDS.map((feed) => {
            const on = enabledSources.has(feed.name);
            return (
              <label key={feed.name}
                style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}
                onClick={() => toggleSource(feed.name)}
              >
                {on ? <CheckSquare size={16} color={feed.color} /> : <Square size={16} color={textSecondary} />}
                <span style={{ color: on ? textPrimary : textSecondary }}>{feed.name}</span>
                <span style={{
                  marginLeft: 'auto', width: 10, height: 10, borderRadius: '50%',
                  background: feed.color, opacity: on ? 1 : 0.3,
                }} />
              </label>
            );
          })}

          <hr style={{ border: 'none', borderTop: `1px solid ${border}`, margin: '4px 0' }} />

          <button onClick={loadNews} style={actionBtn(dark)} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh Now'}
          </button>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: textSecondary, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={() => setAutoRefresh((v) => !v)}
              style={{ accentColor: '#3b82f6' }} />
            Auto-refresh (2 min)
          </label>

          <hr style={{ border: 'none', borderTop: `1px solid ${border}`, margin: '4px 0' }} />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: textSecondary, cursor: 'pointer' }}>
            {compact ? <LayoutList size={14} /> : <LayoutGrid size={14} />}
            <span>{compact ? 'Compact view' : 'Expanded view'}</span>
            <input type="checkbox" checked={compact} onChange={() => setCompact((v) => !v)}
              style={{ marginLeft: 'auto', accentColor: '#3b82f6' }} />
          </label>

          <div style={{ marginTop: 'auto', fontSize: 12, color: textSecondary }}>
            {articles.length} articles loaded
          </div>
        </aside>
      )}

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar */}
        <div style={{
          padding: '12px 20px', borderBottom: `1px solid ${border}`,
          display: 'flex', alignItems: 'center', gap: 12, background: cardBg,
        }}>
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} style={iconBtn(dark)} title="Open sidebar">
              <Filter size={16} />
            </button>
          )}

          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
            background: inputBg, border: `1px solid ${border}`, borderRadius: 8, padding: '6px 12px',
          }}>
            <Search size={15} color={textSecondary} />
            <input
              type="text" placeholder="Search news..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: textPrimary, fontSize: 14,
              }}
            />
          </div>

          <span style={{ fontSize: 13, color: textSecondary, whiteSpace: 'nowrap' }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </span>

          {loading && <Loader2 size={16} color={textSecondary} style={{ animation: 'spin 1s linear infinite' }} />}
        </div>

        {/* Feed */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {error && (
            <div style={{
              padding: 16, borderRadius: 8, background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', marginBottom: 16, fontSize: 14,
            }}>
              Failed to load news: {error}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: textSecondary }}>
              <Search size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
              <p style={{ fontSize: 15 }}>No articles match your filters.</p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 16, maxWidth: 800, margin: '0 auto' }}>
            {filtered.map((item) => (
              <NewsCard key={`${item.source}-${item.guid || item.link}`} item={item}
                compact={compact} dark={dark} cardBg={cardBg} border={border}
                textPrimary={textPrimary} textSecondary={textSecondary} />
            ))}
          </div>
        </div>
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

/* ---- NewsCard ---- */
function NewsCard({ item, compact, dark, cardBg, border, textPrimary, textSecondary }) {
  const breaking = isBreaking(item.pubDate);

  return (
    <article style={{
      background: cardBg, border: `1px solid ${border}`, borderRadius: 10,
      padding: compact ? '12px 16px' : 16,
      display: 'flex', gap: compact ? 12 : 16, transition: 'border-color 0.15s',
      ...(breaking ? { borderLeft: '3px solid #ef4444' } : {}),
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = dark ? 'rgba(148,163,184,0.25)' : 'rgba(148,163,184,0.5)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = border; if (breaking) e.currentTarget.style.borderLeftColor = '#ef4444'; }}
    >
      {/* Thumbnail */}
      {!compact && item.image && (
        <div style={{
          width: 120, minWidth: 120, height: 80, borderRadius: 8, overflow: 'hidden',
          background: dark ? 'hsl(222,47%,16%)' : '#f1f5f9', flexShrink: 0,
        }}>
          <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { e.target.style.display = 'none'; }} />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: compact ? 4 : 6, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
            background: item.sourceColor + '22', color: item.sourceColor, textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {item.source}
          </span>

          {breaking && (
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
              background: 'rgba(239,68,68,0.15)', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Zap size={10} /> BREAKING
            </span>
          )}

          <span style={{ fontSize: 12, color: textSecondary, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            <Clock size={12} /> {timeAgo(item.pubDate)}
          </span>
        </div>

        {/* Title */}
        <a href={item.link} target="_blank" rel="noopener noreferrer"
          style={{
            fontSize: compact ? 14 : 15, fontWeight: 600, color: textPrimary,
            textDecoration: 'none', lineHeight: 1.4, display: 'block',
          }}
          onMouseEnter={(e) => { e.target.style.color = '#3b82f6'; }}
          onMouseLeave={(e) => { e.target.style.color = textPrimary; }}
        >
          {item.title}
          <ExternalLink size={12} style={{ marginLeft: 6, opacity: 0.4, verticalAlign: 'middle' }} />
        </a>

        {/* Description */}
        {!compact && item.description && (
          <p style={{ fontSize: 13, color: textSecondary, margin: '6px 0 0', lineHeight: 1.5 }}>
            {truncate(item.description)}
          </p>
        )}

        {/* Ticker badges */}
        {item.tickers.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: compact ? 4 : 8 }}>
            {item.tickers.map((t) => (
              <span key={t} style={{
                fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                background: dark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.08)',
                color: '#60a5fa', letterSpacing: '0.03em',
              }}>
                ${t}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/* ---- shared button styles ---- */
function iconBtn(dark) {
  return {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: dark ? '#94a3b8' : '#64748b', padding: 4, borderRadius: 6,
    display: 'flex', alignItems: 'center',
  };
}

function actionBtn(dark) {
  return {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
    borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    background: dark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.08)',
    color: '#3b82f6',
  };
}
