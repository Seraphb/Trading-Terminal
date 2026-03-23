import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTheme } from '../components/ThemeContext';
import {
  Plus, X, Trash2, Edit3, Check, TrendingUp, TrendingDown,
  ArrowUpDown, DollarSign, BarChart3, Calendar, StickyNote,
  ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';

const STORAGE_KEY = 'portfolio_positions_v1';

const emptyPosition = () => ({
  id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
  symbol: '', type: 'crypto', side: 'long',
  entryPrice: '', quantity: '', entryDate: new Date().toISOString().slice(0, 10),
  notes: '',
});

const loadPositions = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
};
const savePositions = (p) => localStorage.setItem(STORAGE_KEY, JSON.stringify(p));

const fmt = (n, decimals = 2) => {
  if (n == null || isNaN(n)) return 'N/A';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
const fmtUsd = (n) => (n == null || isNaN(n)) ? 'N/A' : `$${fmt(n)}`;
const daysBetween = (a, b) => Math.max(0, Math.round((b - a) / 86400000));

// ── Main Component ──────────────────────────────────────────────────────────
export default function Portfolio() {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const bg       = dark ? 'hsl(222,47%,11%)' : 'hsl(216,30%,96%)';
  const cardBg   = dark ? 'hsl(222,47%,13%)' : '#ffffff';
  const border   = dark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.25)';
  const text     = dark ? '#e2e8f0' : '#1e293b';
  const muted    = dark ? '#64748b' : '#94a3b8';
  const green    = '#22c55e';
  const red      = '#ef4444';
  const orange   = '#f97316';
  const blue     = '#3b82f6';

  const [positions, setPositions] = useState(loadPositions);
  const [prices, setPrices]       = useState({});          // symbol -> { price, change24h }
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(emptyPosition);
  const [editId, setEditId]       = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [sortBy, setSortBy]       = useState('pnlPct');    // pnlPct | size | symbol | date
  const [sortDir, setSortDir]     = useState('desc');

  // persist
  useEffect(() => { savePositions(positions); }, [positions]);

  // ── Fetch live crypto prices ──────────────────────────────────────────────
  const fetchPrices = useCallback(async () => {
    const cryptoSymbols = [...new Set(
      positions.filter(p => p.type === 'crypto').map(p => p.symbol.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    )];
    if (!cryptoSymbols.length) return;

    const results = {};
    await Promise.allSettled(
      cryptoSymbols.map(async (sym) => {
        try {
          const binanceSym = sym.endsWith('USDT') ? sym : sym + 'USDT';
          const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSym}`);
          if (!res.ok) return;
          const d = await res.json();
          results[sym] = { price: parseFloat(d.lastPrice), change24h: parseFloat(d.priceChangePercent) };
        } catch { /* skip */ }
      })
    );
    setPrices(prev => ({ ...prev, ...results }));
  }, [positions]);

  useEffect(() => {
    fetchPrices();
    const iv = setInterval(fetchPrices, 30000);
    return () => clearInterval(iv);
  }, [fetchPrices]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const enriched = useMemo(() => {
    return positions.map(p => {
      const sym = p.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const entry = parseFloat(p.entryPrice) || 0;
      const qty = parseFloat(p.quantity) || 0;
      const size = entry * qty;
      let current = null;
      let pnl = null;
      let pnlPct = null;

      if (p.type === 'crypto' && prices[sym]) {
        current = prices[sym].price;
        const diff = p.side === 'long' ? current - entry : entry - current;
        pnl = diff * qty;
        pnlPct = entry ? (diff / entry) * 100 : 0;
      }

      const held = daysBetween(new Date(p.entryDate), new Date());
      return { ...p, sym, entry, qty, size, current, pnl, pnlPct, held };
    });
  }, [positions, prices]);

  const sorted = useMemo(() => {
    const arr = [...enriched];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortBy) {
        case 'pnlPct': return ((a.pnlPct ?? -Infinity) - (b.pnlPct ?? -Infinity)) * dir;
        case 'size':   return (a.size - b.size) * dir;
        case 'symbol': return a.sym.localeCompare(b.sym) * dir;
        case 'date':   return (new Date(a.entryDate) - new Date(b.entryDate)) * dir;
        default: return 0;
      }
    });
    return arr;
  }, [enriched, sortBy, sortDir]);

  const stats = useMemo(() => {
    const withPnl = enriched.filter(e => e.pnl !== null);
    const totalValue = enriched.reduce((s, e) => s + (e.current !== null ? e.current * e.qty : e.size), 0);
    const totalPnl = withPnl.reduce((s, e) => s + e.pnl, 0);
    const totalCost = enriched.reduce((s, e) => s + e.size, 0);
    const totalPnlPct = totalCost ? (totalPnl / totalCost) * 100 : 0;
    const best = withPnl.length ? withPnl.reduce((a, b) => (a.pnlPct ?? -Infinity) > (b.pnlPct ?? -Infinity) ? a : b) : null;
    const worst = withPnl.length ? withPnl.reduce((a, b) => (a.pnlPct ?? Infinity) < (b.pnlPct ?? Infinity) ? a : b) : null;
    return { totalValue, totalPnl, totalPnlPct, best, worst };
  }, [enriched]);

  // allocation for bar chart
  const allocation = useMemo(() => {
    const totalSize = enriched.reduce((s, e) => s + e.size, 0) || 1;
    return enriched.map(e => ({ sym: e.sym, type: e.type, pct: (e.size / totalSize) * 100, size: e.size }));
  }, [enriched]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!form.symbol || !form.entryPrice || !form.quantity) return;
    if (editId) {
      setPositions(prev => prev.map(p => p.id === editId ? { ...form, id: editId } : p));
      setEditId(null);
    } else {
      setPositions(prev => [...prev, { ...form, id: emptyPosition().id }]);
    }
    setForm(emptyPosition());
    setShowForm(false);
  };

  const startEdit = (p) => {
    setForm({ ...p });
    setEditId(p.id);
    setShowForm(true);
  };

  const confirmDelete = (id) => {
    setPositions(prev => prev.filter(p => p.id !== id));
    setDeleteConfirm(null);
  };

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir('desc'); }
  };

  // ── Stat Card sub-component ───────────────────────────────────────────────
  const StatCard = ({ label, value, sub, color }) => (
    <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 12, padding: '16px 20px', flex: '1 1 180px', minWidth: 160 }}>
      <div style={{ color: muted, fontSize: 12, fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div style={{ color: color || text, fontSize: 20, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ color: muted, fontSize: 12, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  // ── PnL bar ───────────────────────────────────────────────────────────────
  const PnlBar = ({ pnlPct }) => {
    if (pnlPct == null) return null;
    const clamped = Math.max(-100, Math.min(100, pnlPct));
    const isPos = clamped >= 0;
    const width = Math.abs(clamped);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: dark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.15)', position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: 0, height: '100%', borderRadius: 3,
            background: isPos ? green : red,
            left: isPos ? '50%' : `${50 - width / 2}%`,
            width: `${width / 2}%`,
            transition: 'width 0.3s',
          }} />
          <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: muted, opacity: 0.4 }} />
        </div>
      </div>
    );
  };

  // ── Sort button ───────────────────────────────────────────────────────────
  const SortBtn = ({ label, field }) => {
    const active = sortBy === field;
    return (
      <button
        onClick={() => toggleSort(field)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px',
          borderRadius: 8, border: `1px solid ${active ? blue : border}`,
          background: active ? (dark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)') : 'transparent',
          color: active ? blue : muted, fontSize: 12, fontWeight: 500, cursor: 'pointer',
        }}
      >
        {label}
        {active && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
        {!active && <ArrowUpDown size={12} />}
      </button>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: bg, height: '100%', overflowY: 'auto', color: text, padding: '24px 32px', fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Portfolio Tracker</h1>
        <button
          onClick={() => { setShowForm(!showForm); setEditId(null); setForm(emptyPosition()); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px',
            borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
            background: showForm ? red : blue, color: '#fff',
          }}
        >
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Cancel' : 'Add Position'}
        </button>
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard label="Total Value" value={fmtUsd(stats.totalValue)} />
        <StatCard label="Total P&L ($)" value={fmtUsd(stats.totalPnl)} color={stats.totalPnl >= 0 ? green : red} />
        <StatCard label="Total P&L (%)" value={`${stats.totalPnlPct >= 0 ? '+' : ''}${fmt(stats.totalPnlPct)}%`} color={stats.totalPnlPct >= 0 ? green : red} />
        <StatCard label="Best Performer" value={stats.best ? stats.best.sym : '—'} sub={stats.best ? `+${fmt(stats.best.pnlPct)}%` : ''} color={green} />
        <StatCard label="Worst Performer" value={stats.worst ? stats.worst.sym : '—'} sub={stats.worst ? `${fmt(stats.worst.pnlPct)}%` : ''} color={red} />
      </div>

      {/* ── Add / Edit form ────────────────────────────────────────────────── */}
      {showForm && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{editId ? 'Edit Position' : 'New Position'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {/* Symbol */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: muted }}>
              Symbol
              <input
                value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                placeholder="BTC, AAPL..."
                style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`, background: bg, color: text, fontSize: 14, outline: 'none' }}
              />
            </label>
            {/* Type */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: muted }}>
              Type
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`, background: bg, color: text, fontSize: 14, outline: 'none' }}>
                <option value="crypto">Crypto</option>
                <option value="stock">Stock</option>
              </select>
            </label>
            {/* Side */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: muted }}>
              Side
              <select value={form.side} onChange={e => setForm(f => ({ ...f, side: e.target.value }))}
                style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`, background: bg, color: text, fontSize: 14, outline: 'none' }}>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </label>
            {/* Entry Price */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: muted }}>
              Entry Price
              <input type="number" step="any" value={form.entryPrice}
                onChange={e => setForm(f => ({ ...f, entryPrice: e.target.value }))}
                placeholder="0.00"
                style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`, background: bg, color: text, fontSize: 14, outline: 'none' }}
              />
            </label>
            {/* Quantity */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: muted }}>
              Quantity
              <input type="number" step="any" value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                placeholder="0"
                style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`, background: bg, color: text, fontSize: 14, outline: 'none' }}
              />
            </label>
            {/* Date */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: muted }}>
              Entry Date
              <input type="date" value={form.entryDate}
                onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))}
                style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`, background: bg, color: text, fontSize: 14, outline: 'none' }}
              />
            </label>
            {/* Notes */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: muted, gridColumn: 'span 2' }}>
              Notes
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes..."
                style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${border}`, background: bg, color: text, fontSize: 14, outline: 'none' }}
              />
            </label>
          </div>
          <button onClick={handleSubmit}
            style={{
              marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 24px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: green, color: '#fff', fontWeight: 600, fontSize: 14,
              opacity: (!form.symbol || !form.entryPrice || !form.quantity) ? 0.5 : 1,
            }}
          >
            <Check size={16} /> {editId ? 'Update' : 'Add'} Position
          </button>
        </div>
      )}

      {/* ── Sort controls ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: muted, marginRight: 4 }}>Sort:</span>
        <SortBtn label="P&L %" field="pnlPct" />
        <SortBtn label="Size" field="size" />
        <SortBtn label="Symbol" field="symbol" />
        <SortBtn label="Date" field="date" />
      </div>

      {/* ── Positions ──────────────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: muted }}>
          <BarChart3 size={48} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontSize: 16, fontWeight: 500 }}>No positions yet</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Click "Add Position" to get started.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map(p => {
            const isDeleting = deleteConfirm === p.id;
            return (
              <div key={p.id} style={{
                background: cardBg, border: `1px solid ${border}`, borderRadius: 14,
                padding: '16px 20px', transition: 'box-shadow 0.2s',
              }}>
                {/* Row 1: symbol, badges, prices */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  {/* Symbol */}
                  <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.5 }}>{p.sym}</span>
                  {/* Type badge */}
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                    background: p.type === 'crypto' ? `${orange}22` : `${blue}22`,
                    color: p.type === 'crypto' ? orange : blue, textTransform: 'uppercase',
                  }}>{p.type}</span>
                  {/* Side badge */}
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                    background: p.side === 'long' ? `${green}22` : `${red}22`,
                    color: p.side === 'long' ? green : red, textTransform: 'uppercase',
                  }}>
                    {p.side === 'long' ? <TrendingUp size={10} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} /> : <TrendingDown size={10} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />}
                    {p.side}
                  </span>

                  <div style={{ flex: 1 }} />

                  {/* Actions */}
                  <button onClick={() => startEdit(p)} title="Edit"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: muted, padding: 4 }}>
                    <Edit3 size={15} />
                  </button>
                  {isDeleting ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: red }}><AlertTriangle size={12} style={{ verticalAlign: 'middle', marginRight: 2 }} />Delete?</span>
                      <button onClick={() => confirmDelete(p.id)}
                        style={{ background: red, border: 'none', borderRadius: 6, color: '#fff', padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Yes</button>
                      <button onClick={() => setDeleteConfirm(null)}
                        style={{ background: 'transparent', border: `1px solid ${border}`, borderRadius: 6, color: muted, padding: '3px 10px', fontSize: 11, cursor: 'pointer' }}>No</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(p.id)} title="Delete"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: muted, padding: 4 }}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {/* Row 2: data grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, fontSize: 13 }}>
                  <div>
                    <div style={{ color: muted, fontSize: 11, marginBottom: 2 }}>Entry Price</div>
                    <div style={{ fontWeight: 600 }}>{fmtUsd(p.entry)}</div>
                  </div>
                  <div>
                    <div style={{ color: muted, fontSize: 11, marginBottom: 2 }}>Current Price</div>
                    <div style={{ fontWeight: 600 }}>{p.current !== null ? fmtUsd(p.current) : <span style={{ color: muted }}>N/A</span>}</div>
                  </div>
                  <div>
                    <div style={{ color: muted, fontSize: 11, marginBottom: 2 }}>Quantity</div>
                    <div style={{ fontWeight: 600 }}>{fmt(p.qty, 6)}</div>
                  </div>
                  <div>
                    <div style={{ color: muted, fontSize: 11, marginBottom: 2 }}>Position Size</div>
                    <div style={{ fontWeight: 600 }}>{fmtUsd(p.size)}</div>
                  </div>
                  <div>
                    <div style={{ color: muted, fontSize: 11, marginBottom: 2 }}>P&L ($)</div>
                    <div style={{ fontWeight: 700, color: p.pnl == null ? muted : p.pnl >= 0 ? green : red }}>
                      {p.pnl != null ? `${p.pnl >= 0 ? '+' : ''}${fmtUsd(p.pnl)}` : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: muted, fontSize: 11, marginBottom: 2 }}>P&L (%)</div>
                    <div style={{ fontWeight: 700, color: p.pnlPct == null ? muted : p.pnlPct >= 0 ? green : red }}>
                      {p.pnlPct != null ? `${p.pnlPct >= 0 ? '+' : ''}${fmt(p.pnlPct)}%` : 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: muted, fontSize: 11, marginBottom: 2 }}><Calendar size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />Entry Date</div>
                    <div style={{ fontWeight: 500 }}>{p.entryDate}</div>
                  </div>
                  <div>
                    <div style={{ color: muted, fontSize: 11, marginBottom: 2 }}>Days Held</div>
                    <div style={{ fontWeight: 500 }}>{p.held}d</div>
                  </div>
                </div>

                {/* P&L bar */}
                <div style={{ marginTop: 10, maxWidth: 320 }}>
                  <PnlBar pnlPct={p.pnlPct} />
                </div>

                {/* Notes */}
                {p.notes && (
                  <div style={{ marginTop: 8, fontSize: 12, color: muted, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                    <StickyNote size={12} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>{p.notes}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Allocation chart ───────────────────────────────────────────────── */}
      {allocation.length > 0 && (
        <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 14, padding: 24, marginTop: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <BarChart3 size={18} /> Allocation
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {allocation.sort((a, b) => b.pct - a.pct).map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 70, fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{a.sym}</span>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                  background: a.type === 'crypto' ? `${orange}22` : `${blue}22`,
                  color: a.type === 'crypto' ? orange : blue, textTransform: 'uppercase',
                  width: 48, textAlign: 'center',
                }}>{a.type}</span>
                <div style={{ flex: 1, height: 14, borderRadius: 4, background: dark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.12)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4, transition: 'width 0.4s',
                    width: `${Math.max(1, a.pct)}%`,
                    background: a.type === 'crypto'
                      ? `linear-gradient(90deg, ${orange}, ${orange}aa)`
                      : `linear-gradient(90deg, ${blue}, ${blue}aa)`,
                  }} />
                </div>
                <span style={{ width: 50, fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{fmt(a.pct, 1)}%</span>
                <span style={{ width: 90, fontSize: 12, color: muted, textAlign: 'right' }}>{fmtUsd(a.size)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
