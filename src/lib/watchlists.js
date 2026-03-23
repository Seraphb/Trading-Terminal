import { getActiveUserId, PROFILE_CHANGE_EVENT } from '@/lib/profileStore';

const WATCHLIST_EVENT = 'app-watchlist-updated';

const STOCK_DEFAULTS = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JPM'];
const TERMINAL_DEFAULTS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT'];

function getScopedKey(baseKey, userId = getActiveUserId()) {
  return `${baseKey}:${userId}`;
}

function emitWatchlistUpdate(key, symbols, userId = getActiveUserId()) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WATCHLIST_EVENT, { detail: { key, symbols, userId } }));
}

function getStoredSymbols(key, defaults, userId = getActiveUserId()) {
  try {
    const raw = localStorage.getItem(getScopedKey(key, userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return defaults;
}

function saveSymbols(key, symbols, userId = getActiveUserId()) {
  try {
    localStorage.setItem(getScopedKey(key, userId), JSON.stringify(symbols));
  } catch {}
  emitWatchlistUpdate(key, symbols, userId);
  return symbols;
}

function subscribe(key, callback, defaults) {
  const handleWatchlistUpdate = (event) => {
    if (event.detail?.key === key && event.detail?.userId === getActiveUserId()) {
      callback(event.detail.symbols);
    }
  };

  const handleProfileChange = () => {
    callback(getStoredSymbols(key, defaults));
  };

  window.addEventListener(WATCHLIST_EVENT, handleWatchlistUpdate);
  window.addEventListener(PROFILE_CHANGE_EVENT, handleProfileChange);
  callback(getStoredSymbols(key, defaults));

  return () => {
    window.removeEventListener(WATCHLIST_EVENT, handleWatchlistUpdate);
    window.removeEventListener(PROFILE_CHANGE_EVENT, handleProfileChange);
  };
}

function normalizeStockSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function normalizeTerminalSymbol(symbol) {
  const clean = String(symbol || '').trim().toUpperCase().replace('/', '');
  if (!clean) return '';
  return clean.includes('USDT') ? clean : `${clean}USDT`;
}

function uniqueSymbols(symbols, normalizeSymbol) {
  return Array.from(new Set(
    (Array.isArray(symbols) ? symbols : [])
      .map((symbol) => normalizeSymbol(symbol))
      .filter(Boolean)
  ));
}

function reorderSymbols(currentSymbols, symbols, normalizeSymbol) {
  const normalizedCurrent = uniqueSymbols(currentSymbols, normalizeSymbol);
  const requestedOrder = uniqueSymbols(symbols, normalizeSymbol);
  const remaining = normalizedCurrent.filter((symbol) => !requestedOrder.includes(symbol));
  return [...requestedOrder, ...remaining];
}

const STOCK_KEY = 'stocks_watchlist';
const TERMINAL_KEY = 'terminal_watchlist';

export function getStockWatchlist() {
  return getStoredSymbols(STOCK_KEY, STOCK_DEFAULTS);
}

export function subscribeStockWatchlist(callback) {
  return subscribe(STOCK_KEY, callback, STOCK_DEFAULTS);
}

export function toggleStockWatchlistSymbol(symbol) {
  const normalized = normalizeStockSymbol(symbol);
  if (!normalized) return getStockWatchlist();
  const current = getStockWatchlist();
  const next = current.includes(normalized)
    ? current.filter((item) => item !== normalized)
    : [...current, normalized];
  return saveSymbols(STOCK_KEY, next);
}

export function removeStockWatchlistSymbol(symbol) {
  const normalized = normalizeStockSymbol(symbol);
  const next = getStockWatchlist().filter((item) => item !== normalized);
  return saveSymbols(STOCK_KEY, next);
}

export function reorderStockWatchlist(symbols) {
  const next = reorderSymbols(getStockWatchlist(), symbols, normalizeStockSymbol);
  return saveSymbols(STOCK_KEY, next);
}

export function getTerminalWatchlist() {
  return getStoredSymbols(TERMINAL_KEY, TERMINAL_DEFAULTS);
}

export function subscribeTerminalWatchlist(callback) {
  return subscribe(TERMINAL_KEY, callback, TERMINAL_DEFAULTS);
}

export function toggleTerminalWatchlistSymbol(symbol) {
  const normalized = normalizeTerminalSymbol(symbol);
  if (!normalized) return getTerminalWatchlist();
  const current = getTerminalWatchlist();
  const next = current.includes(normalized)
    ? current.filter((item) => item !== normalized)
    : [...current, normalized];
  return saveSymbols(TERMINAL_KEY, next);
}

export function removeTerminalWatchlistSymbol(symbol) {
  const normalized = normalizeTerminalSymbol(symbol);
  const next = getTerminalWatchlist().filter((item) => item !== normalized);
  return saveSymbols(TERMINAL_KEY, next);
}

export function reorderTerminalWatchlist(symbols) {
  const next = reorderSymbols(getTerminalWatchlist(), symbols, normalizeTerminalSymbol);
  return saveSymbols(TERMINAL_KEY, next);
}
