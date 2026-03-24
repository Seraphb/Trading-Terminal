// Shared signal store using localStorage
const KEY = 'ai_signals_v1';
const MAX = 100;

export function saveSignal(signal) {
  const existing = loadSignals();
  const entry = {
    ...signal,
    id: Date.now().toString(),
    created_date: new Date().toISOString(),
  };
  const updated = [entry, ...existing].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(updated));
  window.dispatchEvent(new Event('signals-updated'));
  return entry;
}

export function loadSignals() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearSignals() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('signals-updated'));
}

export function updateSignal(id, updates) {
  const signals = loadSignals();
  const idx = signals.findIndex(s => s.id === id);
  if (idx === -1) return;
  signals[idx] = { ...signals[idx], ...updates };
  localStorage.setItem(KEY, JSON.stringify(signals));
  window.dispatchEvent(new Event('signals-updated'));
}
