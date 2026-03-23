/**
 * backtestEngine.js
 *
 * Runs each scanner strategy across timeframes on representative symbols
 * to determine which timeframe historically delivers the best signals.
 *
 * Scoring criteria (per signal):
 *   - Win  = price at signal bar + FORWARD_BARS > entry price
 *   - Score = winRate × (1 + avgReturn)
 *   - Min 3 valid signals required for a timeframe to be eligible
 *   - If no timeframe qualifies, fall back to '1d' (stocks) or '4h' (crypto)
 */

const BACKTEST_CACHE_KEY = 'scanner_backtest_v2';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Representative symbols — broad enough to average out idiosyncratic noise
const BT_CRYPTO_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT',
];
const BT_STOCK_SYMBOLS = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL',
  'META', 'TSLA', 'JPM', 'V', 'JNJ',
  'WMT', 'XOM', 'MA', 'PG', 'BAC',
  'KO', 'NFLX', 'AMD', 'CRM', 'COST',
];

const BT_INTERVALS = {
  crypto: ['4h', '1d', '1w'],
  stocks: ['1d', '1w'],
};

// How many bars ahead to measure the forward return
const FORWARD_BARS = 10;

// Minimum bar counts for each interval (enough history without being excessive)
const CRYPTO_BAR_COUNTS = { '4h': 800, '1d': 400, '1w': 150 };
const STOCK_CONFIGS = {
  '1d': { interval: '1d', range: '5y', bars: 400 },
  '1w': { interval: '1w', range: '5y', bars: 150 },
};

// ── Single strategy backtest on one klines array ──────────────────────────────
function runSingleBacktest(detect, klines) {
  if (!klines || klines.length < 30) return null;

  let result;
  try {
    result = detect(klines);
  } catch {
    return null;
  }

  const { goldBuys = [], greenBuys = [] } = result ?? {};
  // Deduplicate and sort signal indices
  const allSignals = [...new Set([...goldBuys, ...greenBuys])].sort((a, b) => a - b);

  // Only count signals where we have enough forward bars to measure
  const valid = allSignals.filter(i => i + FORWARD_BARS < klines.length);
  if (valid.length < 3) return null;

  let wins = 0;
  let totalReturn = 0;

  for (const i of valid) {
    const entry = klines[i].close;
    const exit  = klines[i + FORWARD_BARS].close;
    const ret   = (exit - entry) / entry;
    if (ret > 0) wins++;
    totalReturn += ret;
  }

  const signalCount = valid.length;
  const winRate     = wins / signalCount;
  const avgReturn   = totalReturn / signalCount;
  const score       = winRate * (1 + avgReturn);

  return { winRate, avgReturn, score, signalCount };
}

// ── Cache helpers ─────────────────────────────────────────────────────────────
export function loadBacktestCache() {
  try {
    const raw = localStorage.getItem(BACKTEST_CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function saveBacktestCache(data) {
  try {
    localStorage.setItem(BACKTEST_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* quota exceeded — ignore */ }
}

// ── Main backtest runner ──────────────────────────────────────────────────────
/**
 * @param {object} strategies  SCAN_STRATEGIES registry (non-multiTimeframe entries only)
 * @param {function} fetchCrypto  (symbol, interval, barCount) → Promise<klines[]>
 * @param {function} fetchStock   (symbol, config)             → Promise<klines[]>
 * @param {function} onProgress   (0..1) progress callback
 * @returns {object} { [strategyId]: { crypto: { best, scores }, stocks: { best, scores } } }
 */
export async function runFullBacktest(strategies, fetchCrypto, fetchStock, onProgress) {
  const stratList = Object.values(strategies).filter(s => !s.multiTimeframe);

  // Total steps = (crypto symbols × crypto intervals + stock symbols × stock intervals) × strategies
  const totalSteps =
    stratList.length *
    (BT_CRYPTO_SYMBOLS.length * BT_INTERVALS.crypto.length +
     BT_STOCK_SYMBOLS.length  * BT_INTERVALS.stocks.length);
  let doneSteps = 0;

  const results = {};

  for (const strategy of stratList) {
    const entry = {
      crypto: { best: '4h',  scores: {} },
      stocks: { best: '1d',  scores: {} },
    };

    // ── Crypto ───────────────────────────────────────────────────────────────
    for (const interval of BT_INTERVALS.crypto) {
      let scoreSum = 0, winRateSum = 0, signalSum = 0, count = 0;

      for (const sym of BT_CRYPTO_SYMBOLS) {
        let klines = null;
        try {
          klines = await fetchCrypto(sym, interval, CRYPTO_BAR_COUNTS[interval]);
        } catch { /* skip */ }

        if (klines?.length >= 30) {
          const bt = runSingleBacktest(strategy.detect, klines);
          if (bt) {
            scoreSum   += bt.score;
            winRateSum += bt.winRate;
            signalSum  += bt.signalCount;
            count++;
          }
        }

        doneSteps++;
        onProgress?.(doneSteps / totalSteps);
      }

      entry.crypto.scores[interval] = count > 0
        ? { score: scoreSum / count, winRate: winRateSum / count, signalCount: signalSum }
        : { score: 0, winRate: 0, signalCount: 0 };
    }

    // Pick best crypto interval (highest score, min 0 signals required — already filtered in runSingleBacktest)
    entry.crypto.best = BT_INTERVALS.crypto.reduce((best, iv) =>
      (entry.crypto.scores[iv]?.score ?? 0) > (entry.crypto.scores[best]?.score ?? 0) ? iv : best
    , BT_INTERVALS.crypto[0]);

    // ── Stocks ───────────────────────────────────────────────────────────────
    for (const interval of BT_INTERVALS.stocks) {
      let scoreSum = 0, winRateSum = 0, signalSum = 0, count = 0;

      for (const sym of BT_STOCK_SYMBOLS) {
        let klines = null;
        try {
          klines = await fetchStock(sym, STOCK_CONFIGS[interval]);
        } catch { /* skip */ }

        if (klines?.length >= 30) {
          const bt = runSingleBacktest(strategy.detect, klines);
          if (bt) {
            scoreSum   += bt.score;
            winRateSum += bt.winRate;
            signalSum  += bt.signalCount;
            count++;
          }
        }

        doneSteps++;
        onProgress?.(doneSteps / totalSteps);
      }

      entry.stocks.scores[interval] = count > 0
        ? { score: scoreSum / count, winRate: winRateSum / count, signalCount: signalSum }
        : { score: 0, winRate: 0, signalCount: 0 };
    }

    // Pick best stock interval
    entry.stocks.best = BT_INTERVALS.stocks.reduce((best, iv) =>
      (entry.stocks.scores[iv]?.score ?? 0) > (entry.stocks.scores[best]?.score ?? 0) ? iv : best
    , BT_INTERVALS.stocks[0]);

    results[strategy.id] = entry;
  }

  saveBacktestCache(results);
  return results;
}
