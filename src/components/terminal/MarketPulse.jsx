import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Activity } from 'lucide-react';
import { useTheme } from '../ThemeContext';

/* ── colour helpers ─────────────────────────────────────────── */
function fgColor(v) {
  if (v <= 25) return '#dc2626';   // Extreme Fear – deep red
  if (v <= 45) return '#f97316';   // Fear – orange
  if (v <= 55) return '#eab308';   // Neutral – yellow
  if (v <= 75) return '#4ade80';   // Greed – light green
  return '#16a34a';                // Extreme Greed – deep green
}

function timeAgo(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60)   return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/* ── semicircle gauge (SVG) ─────────────────────────────────── */
function Gauge({ value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const color = fgColor(v);
  // Arc from -180 to 0 deg (left to right), radius 50, center 60,58
  const r = 44, cx = 60, cy = 58;
  const stops = [
    { pct: 0, c: '#dc2626' }, { pct: 25, c: '#f97316' },
    { pct: 45, c: '#eab308' }, { pct: 55, c: '#eab308' },
    { pct: 75, c: '#4ade80' }, { pct: 100, c: '#16a34a' },
  ];
  // Needle angle: value 0 = -180deg, value 100 = 0deg
  const angle = -180 + (v / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const nx = cx + (r - 6) * Math.cos(rad);
  const ny = cy + (r - 6) * Math.sin(rad);

  return (
    <svg viewBox="0 0 120 68" width="120" height="68">
      <defs>
        <linearGradient id="gauge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          {stops.map((s, i) => (
            <stop key={i} offset={`${s.pct}%`} stopColor={s.c} />
          ))}
        </linearGradient>
      </defs>
      {/* track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="rgba(100,116,139,0.18)" strokeWidth="7" strokeLinecap="round"
      />
      {/* coloured arc */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="url(#gauge-grad)" strokeWidth="7" strokeLinecap="round"
      />
      {/* needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="3" fill={color} />
    </svg>
  );
}

/* ── main component ─────────────────────────────────────────── */
export default function MarketPulse() {
  const { theme } = useTheme();
  const dark = theme !== 'light';

  const [fng, setFng]       = useState(null);
  const [whales, setWhales] = useState([]);
  const [error, setError]   = useState(null);

  /* fetch Fear & Greed */
  const fetchFng = useCallback(async () => {
    try {
      const res = await fetch('https://api.alternative.me/fng/?limit=1');
      const json = await res.json();
      if (json?.data?.[0]) setFng(json.data[0]);
    } catch { /* silent */ }
  }, []);

  /* fetch whale trades */
  const fetchWhales = useCallback(async () => {
    try {
      const res = await fetch('https://api.binance.com/api/v3/trades?symbol=BTCUSDT&limit=50');
      const json = await res.json();
      if (!Array.isArray(json)) return;
      const big = json
        .filter((t) => parseFloat(t.quoteQty) > 50000)
        .sort((a, b) => b.time - a.time)
        .slice(0, 8);
      setWhales(big);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchFng();
    fetchWhales();
    const i1 = setInterval(fetchFng, 300000);   // 5 min
    const i2 = setInterval(fetchWhales, 30000);  // 30 s
    return () => { clearInterval(i1); clearInterval(i2); };
  }, [fetchFng, fetchWhales]);

  /* ── derived ──────────────────────────────────────────────── */
  const fngValue = fng ? parseInt(fng.value, 10) : null;
  const fngLabel = fng?.value_classification || '—';
  const fngCol   = fngValue != null ? fgColor(fngValue) : '#94a3b8';

  /* ── styles ───────────────────────────────────────────────── */
  const panelBg    = dark ? 'hsl(222,47%,13%)' : '#ffffff';
  const headerBg   = dark ? 'hsl(222,47%,11%)' : 'hsl(210,20%,96%)';
  const borderCol  = dark ? 'hsl(217,33%,20%)' : 'hsl(210,20%,85%)';
  const textPri    = dark ? '#e2e8f0' : '#1e293b';
  const textSec    = dark ? '#94a3b8' : '#64748b';
  const textMuted  = dark ? '#64748b' : '#94a3b8';
  const rowHover   = dark ? 'rgba(51,65,85,0.25)' : 'rgba(0,0,0,0.03)';

  return (
    <div
      style={{
        background: panelBg,
        border: `1px solid ${borderCol}`,
        borderRadius: 6,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        height: '100%',
        fontSize: 11,
        color: textPri,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px',
          background: headerBg,
          borderBottom: `1px solid ${borderCol}`,
          fontSize: 11, fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: textSec,
        }}
      >
        <Activity size={13} />
        Market Pulse
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>

        {/* ── Fear & Greed ────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: textMuted, marginBottom: 2, letterSpacing: '0.08em' }}>
            FEAR &amp; GREED INDEX
          </div>
          <Gauge value={fngValue ?? 50} />
          <div style={{ marginTop: -2 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: fngCol }}>
              {fngValue ?? '—'}
            </span>
            <span style={{ fontSize: 10, marginLeft: 6, color: fngCol, fontWeight: 600 }}>
              {fngLabel}
            </span>
          </div>
        </div>

        {/* divider */}
        <div style={{ height: 1, background: borderCol, margin: '6px 0' }} />

        {/* ── Whale Alerts ────────────────────────────────────── */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 10, color: textMuted, marginBottom: 4, letterSpacing: '0.08em' }}>
            WHALE ALERTS — BTC/USDT &gt;$50K
          </div>

          {whales.length === 0 && (
            <div style={{ fontSize: 10, color: textMuted, padding: '6px 0', textAlign: 'center' }}>
              No whale trades detected
            </div>
          )}

          {whales.map((t) => {
            const isBuy  = !t.isBuyerMaker;
            const btcAmt = parseFloat(t.qty);
            const usdAmt = parseFloat(t.quoteQty);
            const col    = isBuy ? '#4ade80' : '#f87171';
            return (
              <div
                key={t.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '3px 4px', borderRadius: 3, marginBottom: 1,
                  fontSize: 10, lineHeight: '16px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = rowHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ color: col, fontWeight: 700, width: 30, flexShrink: 0 }}>
                  {isBuy ? 'BUY' : 'SELL'}
                </span>
                <span style={{ flex: 1, color: textPri, fontVariantNumeric: 'tabular-nums' }}>
                  {btcAmt.toFixed(4)} BTC
                </span>
                <span style={{ color: textSec, minWidth: 62, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  ${usdAmt >= 1e6 ? (usdAmt / 1e6).toFixed(2) + 'M' : (usdAmt / 1e3).toFixed(1) + 'K'}
                </span>
                <span style={{ color: textMuted, minWidth: 42, textAlign: 'right' }}>
                  {timeAgo(t.time)}
                </span>
              </div>
            );
          })}
        </div>

        {/* divider */}
        <div style={{ height: 1, background: borderCol, margin: '6px 0' }} />

        {/* ── BTC Dominance indicator ─────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 }}>
          <span style={{ color: textMuted, letterSpacing: '0.08em' }}>BTC DOMINANCE</span>
          <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 12 }}>~58%</span>
        </div>
      </div>
    </div>
  );
}
