import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellRing, Plus, Trash2, X, TrendingUp, TrendingDown } from 'lucide-react';
import { getAlerts, addAlert, removeAlert, subscribeAlerts, checkAlerts } from '@/lib/alerts';
import { formatAssetPrice } from '@/lib/assetPriceFormat';

// ── Toast notification ────────────────────────────────────────────────────────
function AlertToast({ alerts, onDismiss }) {
  if (!alerts.length) return null;
  return (
    <div className="fixed top-14 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {alerts.map(a => (
        <div key={a.id}
          className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-2xl border animate-in"
          style={{ background: 'hsl(222,47%,13%)', borderColor: a.condition === 'above' ? '#10b981' : '#ef4444', minWidth: 260 }}>
          <BellRing className="w-4 h-4 flex-shrink-0" style={{ color: a.condition === 'above' ? '#10b981' : '#ef4444' }} />
          <div className="flex-1 text-xs">
            <div className="font-semibold text-white">{a.symbol} Alert Triggered</div>
            <div className="text-slate-400">
              Price {a.condition === 'above' ? '≥' : '≤'} ${formatAssetPrice(a.price)}
            </div>
          </div>
          <button onClick={() => onDismiss(a.id)} className="text-slate-600 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────
export default function AlertsWidget({ tickers = {}, symbol = '' }) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState(() => getAlerts());
  const [toasts, setToasts] = useState([]);
  const [form, setForm] = useState({ condition: 'above', price: '' });
  const panelRef = useRef(null);

  // Subscribe to alert store changes
  useEffect(() => subscribeAlerts(setAlerts), []);

  // Check prices every 2s
  useEffect(() => {
    const id = setInterval(() => {
      const fired = checkAlerts(tickers);
      if (fired.length) setToasts(prev => [...prev, ...fired]);
    }, 2000);
    return () => clearInterval(id);
  }, [tickers]);

  // Auto-dismiss toasts after 8s
  useEffect(() => {
    if (!toasts.length) return;
    const id = setTimeout(() => setToasts(prev => prev.slice(1)), 8000);
    return () => clearTimeout(id);
  }, [toasts]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const untriggered = alerts.filter(a => !a.triggered);
  const hasActive = untriggered.length > 0;

  const handleAdd = (e) => {
    e.preventDefault();
    if (!form.price || isNaN(form.price)) return;
    addAlert({ symbol: symbol || 'BTCUSDT', condition: form.condition, price: form.price });
    setForm(f => ({ ...f, price: '' }));
  };

  return (
    <>
      <AlertToast alerts={toasts} onDismiss={(id) => setToasts(prev => prev.filter(t => t.id !== id))} />

      <div className="relative" ref={panelRef}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className={`relative px-2 py-0.5 rounded transition-all text-xs ${open ? 'bg-yellow-500/15 text-yellow-400' : 'text-slate-400 hover:text-yellow-400 hover:bg-yellow-500/10'}`}
          title="Price Alerts"
        >
          {hasActive ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
          {hasActive && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-yellow-400" />
          )}
        </button>

        {open && (
          <div
            className="absolute right-0 top-full mt-2 z-[100] rounded-xl shadow-2xl border overflow-hidden"
            style={{ background: 'hsl(222,47%,11%)', borderColor: 'hsl(217,33%,22%)', width: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[hsl(217,33%,20%)]">
              <div className="flex items-center gap-2">
                <Bell className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-xs font-semibold text-white">Price Alerts</span>
                {hasActive && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400">{untriggered.length}</span>}
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-600 hover:text-white"><X className="w-3.5 h-3.5" /></button>
            </div>

            {/* Add form */}
            <form onSubmit={handleAdd} className="px-4 py-3 border-b border-[hsl(217,33%,18%)]">
              <div className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider">New alert for {(symbol || 'BTCUSDT').replace('USDT','/USDT').toUpperCase()}</div>
              <div className="flex gap-2">
                <select
                  value={form.condition}
                  onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}
                  className="text-xs bg-[hsl(217,33%,16%)] border border-[hsl(217,33%,25%)] rounded px-2 py-1 text-slate-300 outline-none"
                >
                  <option value="above">Above ↑</option>
                  <option value="below">Below ↓</option>
                </select>
                <input
                  type="number"
                  step="any"
                  placeholder="Price…"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  className="flex-1 text-xs bg-[hsl(217,33%,16%)] border border-[hsl(217,33%,25%)] rounded px-2 py-1 text-white outline-none focus:border-yellow-500/50 font-mono-data"
                />
                <button type="submit"
                  className="px-2 py-1 rounded bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-all"
                  title="Add alert">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>

            {/* Alert list */}
            <div className="max-h-52 overflow-y-auto">
              {alerts.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-slate-600">No alerts set</div>
              )}
              {alerts.map(a => (
                <div key={a.id}
                  className={`flex items-center gap-2 px-4 py-2 border-b border-[hsl(217,33%,16%)] ${a.triggered ? 'opacity-40' : ''}`}>
                  {a.condition === 'above'
                    ? <TrendingUp className="w-3 h-3 flex-shrink-0 text-emerald-400" />
                    : <TrendingDown className="w-3 h-3 flex-shrink-0 text-red-400" />
                  }
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-mono-data text-white">{a.symbol}</span>
                    <span className="text-[10px] text-slate-500 ml-1">{a.condition === 'above' ? '≥' : '≤'}</span>
                    <span className="text-[10px] font-mono-data text-yellow-300 ml-1">${formatAssetPrice(a.price)}</span>
                    {a.triggered && <span className="ml-2 text-[9px] text-emerald-500">✓ fired</span>}
                  </div>
                  <button onClick={() => removeAlert(a.id)} className="text-slate-700 hover:text-red-400 transition-all">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
