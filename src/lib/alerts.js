// ── Price Alerts Store ────────────────────────────────────────────────────────
// Persisted to localStorage, cross-tab via custom events.
// Each alert: { id, symbol, condition: 'above'|'below', price, createdAt, triggered }

const KEY = 'price_alerts_v1';
const EVENT = 'price_alerts_changed';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

function persist(alerts) {
  localStorage.setItem(KEY, JSON.stringify(alerts));
  window.dispatchEvent(new Event(EVENT));
}

export function getAlerts() { return load(); }

export function addAlert({ symbol, condition, price }) {
  const alerts = load();
  alerts.push({ id: Date.now(), symbol: symbol.toUpperCase(), condition, price: parseFloat(price), createdAt: Date.now(), triggered: false });
  persist(alerts);
}

export function removeAlert(id) {
  persist(load().filter(a => a.id !== id));
}

export function markTriggered(id) {
  persist(load().map(a => a.id === id ? { ...a, triggered: true } : a));
}

export function subscribeAlerts(cb) {
  const handler = () => cb(load());
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

// Check live prices against all untriggered alerts. Returns array of fired alerts.
export function checkAlerts(tickers) {
  const alerts = load();
  const fired = [];
  for (const alert of alerts) {
    if (alert.triggered) continue;
    const ticker = tickers[alert.symbol] || tickers[alert.symbol.replace('USDT','').toLowerCase() + 'usdt'];
    if (!ticker) continue;
    const price = parseFloat(ticker.price ?? ticker.c ?? 0);
    if (!price) continue;
    const hit = alert.condition === 'above' ? price >= alert.price : price <= alert.price;
    if (hit) fired.push(alert);
  }
  if (fired.length) fired.forEach(a => markTriggered(a.id));
  return fired;
}
