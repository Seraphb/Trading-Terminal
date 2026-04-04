/**
 * pumpDetector.js — Quantitative Pump Detection Engine
 *
 * Detects the confluence of signals that historically precede 10x-20x crypto pumps.
 * Based on analysis of PEPE, BONK, SHIB, DOGE, GBTC, PLTR pre-pump patterns.
 *
 * Four detection modules:
 *   1. Volume/OI Divergence — OI rising while price consolidates
 *   2. Funding Rate Squeeze — Negative funding → trapped shorts
 *   3. Volatility Squeeze — Bollinger Band compression
 *   4. Momentum Divergence — Hidden bullish divergence on VWRSI/RSI
 *
 * Each module scores 0-100. Combined score ≥ 70 = HIGH probability pump setup.
 */

// ════════════════════════════════════════════════════════════════════════════
// THRESHOLDS — Quantitative levels derived from historical pump analysis
// ════════════════════════════════════════════════════════════════════════════

export const THRESHOLDS = {
  // Open Interest
  oiGrowth_24h_bullish: 0.10,   // +10% in 24h
  oiGrowth_24h_extreme: 0.25,   // +25% in 24h
  oiGrowth_7d_bullish: 0.30,    // +30% in 7 days
  oiGrowth_7d_extreme: 0.80,    // +80% in 7 days
  oiPriceDivergence: 0.05,      // OI up >5% while price flat (<2%)

  // Funding Rate
  fundingNegative: -0.0001,     // ≤ -0.01% = shorts paying longs (bullish)
  fundingExtreme: -0.0005,      // ≤ -0.05% = extreme short positioning
  fundingFlip: 0.0005,          // +0.05% = squeeze triggered (longs paying)
  fundingSqueeze: 0.0010,       // +0.10% = full short squeeze

  // Volume
  volumeSpike_15m: 3.0,         // 3x average on 15m = trigger
  volumeSpike_1h: 4.0,          // 4x average on 1h = trigger
  volumeSpike_4h: 2.5,          // 2.5x average on 4h = trigger
  volumeRising_base: 2.0,       // 2x baseline during accumulation

  // Bollinger Band Squeeze
  bbSqueeze_percentile: 0.15,   // Band width < 15% of 90-day average
  bbSqueeze_extreme: 0.08,      // Band width < 8% = extreme compression

  // VWRSI / RSI Divergence
  rsiOversold: 30,              // RSI ≤ 30
  rsiRecovering: 40,            // RSI bouncing from oversold
  vwrssiHiddenBull: 5,          // Price higher low + VWRSI lower low (≥5pt gap)

  // Price Consolidation
  consolidation_14d: 0.08,      // Price range < 8% over 14 days = tight
  consolidation_30d: 0.15,      // Price range < 15% over 30 days

  // Combined Score
  scoreLow: 40,                 // Below 40 = no signal
  scoreMedium: 55,              // 55-69 = watch list (accumulation detected)
  scoreHigh: 70,                // 70-84 = HIGH probability setup
  scoreExtreme: 85,             // 85+ = imminent pump likely
};

// ════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

function sma(data, period) {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result.push(sum / period);
  }
  return result;
}

function ema(data, period) {
  if (!data.length || data.length < period) return [];
  const k = 2 / (period + 1);
  const result = [];
  let prev = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < period - 1; i++) result.push(null);
  result.push(prev);
  for (let i = period; i < data.length; i++) {
    prev = data[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

function stdDev(data) {
  if (data.length < 2) return 0;
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const sq = data.map(v => (v - mean) ** 2);
  return Math.sqrt(sq.reduce((a, b) => a + b, 0) / (data.length - 1));
}

function percentileRank(value, data) {
  const count = data.filter(d => d != null && d < value).length;
  const valid = data.filter(d => d != null).length;
  return valid > 0 ? count / valid : 0.5;
}

// ════════════════════════════════════════════════════════════════════════════
// DETECTION MODULE 1: Volume/OI Divergence
// ════════════════════════════════════════════════════════════════════════════
/**
 * Detects when Open Interest is rising while price consolidates.
 * This means leverage is building + spot is being absorbed without price discovery.
 *
 * Historical pattern: BONK +150% OI in 6 weeks while price ranged $0.000008-$0.000012
 * before 12x breakout.
 */
export function detectVolumeOIDivergence(klines, oiData) {
  if (!klines?.length || !oiData?.length) return { score: 0, details: {} };

  const closes = klines.map(k => k.close);
  const volumes = klines.map(k => k.volume);
  const times = klines.map(k => k.time);

  // Volume analysis
  const volSma20 = sma(volumes, Math.min(20, volumes.length));
  const currentVol = volumes[volumes.length - 1];
  const avgVol = volSma20[volSma20.length - 1] || 1;
  const volumeRatio = currentVol / avgVol;

  // Check if volume is rising above baseline
  let volumeScore = 0;
  if (volumeRatio >= THRESHOLDS.volumeRising_base) volumeScore = 40;
  if (volumeRatio >= THRESHOLDS.volumeSpike_4h) volumeScore = 60;
  if (volumeRatio >= THRESHOLDS.volumeSpike_1h) volumeScore = 75;
  if (volumeRatio >= THRESHOLDS.volumeSpike_15m) volumeScore = 90;

  // OI analysis
  const sortedOI = [...oiData].sort((a, b) => a.time - b.time);
  const recentOI = sortedOI.filter(o => o.time >= times[times.length - 1] - 7 * 86400000);
  const oiFirst = recentOI[0]?.oi ?? 0;
  const oiLast = recentOI[recentOI.length - 1]?.oi ?? 0;
  const oiChange7d = oiFirst > 0 ? (oiLast - oiFirst) / oiFirst : 0;

  // 24h OI change
  const oi24h = sortedOI.filter(o => o.time >= times[times.length - 1] - 86400000);
  const oiFirst24 = oi24h[0]?.oi ?? 0;
  const oiLast24 = oi24h[oi24h.length - 1]?.oi ?? 0;
  const oiChange24h = oiFirst24 > 0 ? (oiLast24 - oiFirst24) / oiFirst24 : 0;

  let oiScore = 0;
  if (oiChange24h >= THRESHOLDS.oiGrowth_24h_bullish) oiScore += 30;
  if (oiChange24h >= THRESHOLDS.oiGrowth_24h_extreme) oiScore += 20;
  if (oiChange7d >= THRESHOLDS.oiGrowth_7d_bullish) oiScore += 30;
  if (oiChange7d >= THRESHOLDS.oiGrowth_7d_extreme) oiScore += 20;

  // Price consolidation check
  const recentCloses = closes.slice(-Math.min(14 * 24 * 4, closes.length)); // ~14 days on 15m
  const priceHigh = Math.max(...recentCloses);
  const priceLow = Math.min(...recentCloses);
  const priceRange = (priceHigh - priceLow) / priceLow;

  let consolidationScore = 0;
  if (priceRange <= THRESHOLDS.consolidation_14d) consolidationScore = 50;
  if (priceRange <= THRESHOLDS.consolidation_30d) consolidationScore = 30;

  // Divergence: OI up + price flat = absorption
  let divergenceBonus = 0;
  if (oiChange7d > 0.15 && priceRange < 0.10) divergenceBonus = 20;
  if (oiChange7d > 0.30 && priceRange < 0.08) divergenceBonus = 30;

  const totalScore = Math.min(100, volumeScore * 0.3 + oiScore * 0.4 + consolidationScore * 0.15 + divergenceBonus);

  return {
    score: Math.round(totalScore),
    volumeRatio: Math.round(volumeRatio * 100) / 100,
    oiChange24h: Math.round(oiChange24h * 10000) / 100,
    oiChange7d: Math.round(oiChange7d * 10000) / 100,
    priceRange14d: Math.round(priceRange * 10000) / 100,
    details: {
      volume: `${volumeRatio.toFixed(1)}x avg`,
      oi7d: `${(oiChange7d * 100).toFixed(1)}%`,
      oi24h: `${(oiChange24h * 100).toFixed(1)}%`,
      consolidation: `${(priceRange * 100).toFixed(1)}% range`,
    }
  };
}

// ════════════════════════════════════════════════════════════════════════════
// DETECTION MODULE 2: Funding Rate Squeeze
// ════════════════════════════════════════════════════════════════════════════
/**
 * Detects when funding rate goes negative (shorts paying longs) then flips
 * positive, triggering a short squeeze cascade.
 *
 * Historical pattern: PEPE funding dropped to -0.02% during consolidation,
 * then spiked to +0.12% as shorts were squeezed → 15x in 9 days.
 */
export function detectFundingSqueeze(fundingData) {
  if (!fundingData?.length || fundingData.length < 8) {
    return { score: 0, details: {} };
  }

  const sorted = [...fundingData].sort((a, b) => a.time - b.time);
  const rates = sorted.map(d => d.rate);
  const recent = rates.slice(-20); // Last ~7 days (8h funding)

  // Check for negative funding (bullish setup)
  const negativeCount = recent.filter(r => r <= THRESHOLDS.fundingNegative).length;
  const negativeRatio = negativeCount / recent.length;

  let setupScore = 0;
  if (negativeRatio > 0.3) setupScore = 30;   // 30%+ negative = shorts positioning
  if (negativeRatio > 0.5) setupScore = 50;   // 50%+ = heavy short buildup
  if (negativeRatio > 0.7) setupScore = 70;   // 70%+ = extreme short trap

  // Check for extreme negative
  const minRate = Math.min(...recent);
  let extremeScore = 0;
  if (minRate <= THRESHOLDS.fundingNegative) extremeScore = 20;
  if (minRate <= THRESHOLDS.fundingExtreme) extremeScore = 30;

  // Check for recent flip to positive (squeeze trigger)
  const last3 = rates.slice(-3);
  const hasFlip = last3.some(r => r > THRESHOLDS.fundingFlip);
  const hasSqueeze = last3.some(r => r > THRESHOLDS.fundingSqueeze);

  let triggerScore = 0;
  if (hasFlip && negativeRatio > 0.3) triggerScore = 40;
  if (hasSqueeze) triggerScore = 60;

  const currentRate = rates[rates.length - 1];
  const totalScore = Math.min(100, setupScore * 0.4 + extremeScore * 0.2 + triggerScore * 0.4);

  return {
    score: Math.round(totalScore),
    currentRate: Math.round(currentRate * 1000000) / 10000,
    minRate: Math.round(minRate * 1000000) / 10000,
    negativeRatio: Math.round(negativeRatio * 100),
    isFlipping: hasFlip && negativeRatio > 0.3,
    isSqueezing: hasSqueeze,
    details: {
      current: `${(currentRate * 100).toFixed(4)}%`,
      min: `${(minRate * 100).toFixed(4)}%`,
      negativePct: `${Math.round(negativeRatio * 100)}%`,
      trigger: hasFlip ? '⚡ FLIP detected' : hasSqueeze ? '🔥 SQUEEZE active' : 'Waiting...',
    }
  };
}

// ════════════════════════════════════════════════════════════════════════════
// DETECTION MODULE 3: Bollinger Band Squeeze
// ════════════════════════════════════════════════════════════════════════════
/**
 * Detects volatility compression — when Bollinger Bands squeeze to <15% of
 * historical average. This always precedes explosive moves.
 *
 * Historical pattern: All extreme pumps show BB squeeze <10% before breakout.
 */
export function detectBollingerSqueeze(klines) {
  if (!klines?.length || klines.length < 50) {
    return { score: 0, details: {} };
  }

  const closes = klines.map(k => k.close);
  const period = 20;

  // Calculate BB width for each candle
  const bbWidths = [];
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const sd = stdDev(slice);
    const width = (2 * 2 * sd) / mean; // 2 std dev upper - lower, normalized
    bbWidths.push(width);
  }

  if (bbWidths.length < 20) return { score: 0, details: {} };

  // Current width vs historical
  const currentWidth = bbWidths[bbWidths.length - 1];
  const avgWidth = bbWidths.reduce((a, b) => a + b, 0) / bbWidths.length;
  const widthPercentile = percentileRank(currentWidth, bbWidths);

  // Squeeze detection
  const ratio = currentWidth / avgWidth;
  let squeezeScore = 0;
  if (ratio <= THRESHOLDS.bbSqueeze_percentile) squeezeScore = 60;
  if (ratio <= THRESHOLDS.bbSqueeze_extreme) squeezeScore = 85;
  if (ratio <= 0.05) squeezeScore = 95; // Extreme compression

  // Bonus: how long has the squeeze been building
  const recentWidths = bbWidths.slice(-10);
  const isCompressing = recentWidths.every(w => w < avgWidth * 0.5);
  if (isCompressing) squeezeScore = Math.min(100, squeezeScore + 15);

  return {
    score: Math.round(squeezeScore),
    currentWidth: Math.round(currentWidth * 10000) / 100,
    avgWidth: Math.round(avgWidth * 10000) / 100,
    ratio: Math.round(ratio * 100) / 100,
    percentile: Math.round(widthPercentile * 100),
    details: {
      width: `${(currentWidth * 100).toFixed(2)}%`,
      avg: `${(avgWidth * 100).toFixed(2)}%`,
      ratio: `${(ratio * 100).toFixed(1)}% of avg`,
      percentile: `${Math.round(widthPercentile * 100)}th`,
      status: ratio <= 0.08 ? '🔴 Extreme squeeze' : ratio <= 0.15 ? '🟡 Squeeze building' : 'Normal',
    }
  };
}

// ════════════════════════════════════════════════════════════════════════════
// DETECTION MODULE 4: Momentum Divergence (VWRSI/RSI)
// ════════════════════════════════════════════════════════════════════════════
/**
 * Detects hidden bullish divergence — price makes higher low while RSI/VWRSI
 * makes lower low. This confirms underlying momentum shift despite flat price.
 *
 * Historical pattern: PEPE Apr 2023 showed daily MACD hidden divergence
 * while RSI held 45-55 before parabolic expansion.
 */
export function detectMomentumDivergence(klines) {
  if (!klines?.length || klines.length < 40) {
    return { score: 0, details: {} };
  }

  const closes = klines.map(k => k.close);
  const volumes = klines.map(k => k.volume ?? 1);
  const period = 14;

  // Compute VWRSI
  const volSma = [];
  for (let i = 0; i < volumes.length; i++) {
    if (i < period - 1) { volSma.push(volumes[i]); continue; }
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += volumes[j];
    volSma.push(s / period);
  }
  const relVol = volumes.map((v, i) => volSma[i] > 0 ? v / volSma[i] : 1);

  const gains = [], losses = [];
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change * relVol[i] : 0);
    losses.push(change < 0 ? -change * relVol[i] : 0);
  }

  const k = 1 / period;
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const vwrsi = [];
  for (let i = 0; i < period - 1; i++) vwrsi.push(null);
  vwrsi.push(avgLoss > 0 ? 100 - 100 / (1 + avgGain / avgLoss) : 100);

  for (let i = period; i < gains.length; i++) {
    avgGain = avgGain * (1 - k) + gains[i] * k;
    avgLoss = avgLoss * (1 - k) + losses[i] * k;
    const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
    vwrsi.push(100 - 100 / (1 + rs));
  }

  // Also compute standard RSI for comparison
  const gainsRsi = [], lossesRsi = [];
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gainsRsi.push(change > 0 ? change : 0);
    lossesRsi.push(change < 0 ? -change : 0);
  }
  let avgGainRsi = gainsRsi.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLossRsi = lossesRsi.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const rsi = [];
  for (let i = 0; i < period - 1; i++) rsi.push(null);
  rsi.push(avgLossRsi > 0 ? 100 - 100 / (1 + avgGainRsi / avgLossRsi) : 100);
  for (let i = period; i < gainsRsi.length; i++) {
    avgGainRsi = avgGainRsi * (1 - k) + gainsRsi[i] * k;
    avgLossRsi = avgLossRsi * (1 - k) + lossesRsi[i] * k;
    const rs = avgLossRsi > 0 ? avgGainRsi / avgLossRsi : 100;
    rsi.push(100 - 100 / (1 + rs));
  }

  // Current values
  const currentVwrsi = vwrsi[vwrsi.length - 1];
  const currentRsi = rsi[rsi.length - 1];

  // Hidden bullish divergence: recent price higher low but VWRSI/RSI lower low
  const lookback = Math.min(30, closes.length);
  const recentCloses = closes.slice(-lookback);
  const recentVwrsi = vwrsi.slice(-lookback).filter(v => v != null);
  const recentRsi = rsi.slice(-lookback).filter(v => v != null);

  if (recentVwrsi.length < 5 || recentRsi.length < 5) {
    return { score: 0, details: {} };
  }

  // Find price lows and VWRSI lows
  const priceLow = Math.min(...recentCloses);
  const priceLowIdx = recentCloses.indexOf(priceLow);
  const vwrLow = Math.min(...recentVwrsi);
  const rsiLow = Math.min(...recentRsi);

  // Hidden bullish div: price making higher low while momentum makes lower low
  // (we detect by checking if current VWRSI/RSI is near recent lows but price isn't)
  const firstHalfVwrsi = recentVwrsi.slice(0, Math.floor(recentVwrsi.length / 2));
  const secondHalfVwrsi = recentVwrsi.slice(Math.floor(recentVwrsi.length / 2));
  const firstHalfPrice = recentCloses.slice(0, Math.floor(recentCloses.length / 2));
  const secondHalfPrice = recentCloses.slice(Math.floor(recentCloses.length / 2));

  const priceLow1 = Math.min(...firstHalfPrice);
  const priceLow2 = Math.min(...secondHalfPrice);
  const vwrLow1 = Math.min(...firstHalfVwrsi);
  const vwrLow2 = Math.min(...secondHalfVwrsi);

  let divScore = 0;
  // Hidden bull div: price higher low (low2 > low1) but VWRSI lower low (vwrLow2 < vwrLow1)
  if (priceLow2 > priceLow1 && vwrLow2 < vwrLow1) {
    divScore = 70;
    const gap = vwrLow1 - vwrLow2;
    if (gap >= THRESHOLDS.vwrssiHiddenBull) divScore = 85;
  }

  // Regular bull div: price lower low but VWRSI higher low (reversal signal)
  if (priceLow2 < priceLow1 && vwrLow2 > vwrLow1) {
    divScore = 60;
    const gap = vwrLow2 - vwrLow1;
    if (gap >= THRESHOLDS.vwrssiHiddenBull) divScore = 80;
  }

  // Oversold recovery bonus
  let oversoldBonus = 0;
  if (currentVwrsi <= THRESHOLDS.rsiOversold) oversoldBonus = 15;
  if (currentVwrsi <= THRESHOLDS.rsiRecovering && currentVwrsi > THRESHOLDS.rsiOversold) {
    // Check if we recently came from oversold
    const wasOversold = recentVwrsi.some((v, i) => v <= THRESHOLDS.rsiOversold && i < recentVwrsi.length - 3);
    if (wasOversold) oversoldBonus = 20;
  }

  const totalScore = Math.min(100, divScore + oversoldBonus);

  return {
    score: Math.round(totalScore),
    currentVwrsi: Math.round(currentVwrsi * 100) / 100,
    currentRsi: Math.round(currentRsi * 100) / 100,
    vwrLow: Math.round(vwrLow * 100) / 100,
    rsiLow: Math.round(rsiLow * 100) / 100,
    isHiddenBullDiv: priceLow2 > priceLow1 && vwrLow2 < vwrLow1,
    isRegularBullDiv: priceLow2 < priceLow1 && vwrLow2 > vwrLow1,
    details: {
      vwrsi: currentVwrsi.toFixed(1),
      rsi: currentRsi.toFixed(1),
      div: priceLow2 > priceLow1 && vwrLow2 < vwrLow1 ? '🟡 Hidden Bull Div' :
           priceLow2 < priceLow1 && vwrLow2 > vwrLow1 ? '🟢 Regular Bull Div' : 'None',
      status: currentVwrsi <= 30 ? 'Oversold' : currentVwrsi >= 70 ? 'Overbought' : 'Neutral',
    }
  };
}

// ════════════════════════════════════════════════════════════════════════════
// COMBINED PUMP SIGNAL SCORER
// ════════════════════════════════════════════════════════════════════════════

const SIGNAL_LABELS = {
  volumeOI: 'Volume/OI Divergence',
  funding: 'Funding Squeeze',
  bbSqueeze: 'BB Squeeze',
  momentum: 'Momentum Divergence',
};

const SIGNAL_ICONS = {
  volumeOI: '📊',
  funding: '⚡',
  bbSqueeze: '🔒',
  momentum: '📈',
};

export function computePumpScore({ klines, oiData, fundingData }) {
  const volumeOI = detectVolumeOIDivergence(klines, oiData);
  const funding = detectFundingSqueeze(fundingData);
  const bbSqueeze = detectBollingerSqueeze(klines);
  const momentum = detectMomentumDivergence(klines);

  // Weighted composite: funding + volume/OI are most predictive
  const totalScore = Math.round(
    volumeOI.score * 0.30 +
    funding.score * 0.30 +
    bbSqueeze.score * 0.20 +
    momentum.score * 0.20
  );

  // Confluence: how many modules are firing (≥50)
  const activeCount = [volumeOI, funding, bbSqueeze, momentum].filter(m => m.score >= 50).length;

  // Pump Probability: adjusted by confluence
  // 0 active = near 0%, 4 active = score boosted to reflect high confidence
  let pumpProbability;
  if (activeCount === 0) pumpProbability = Math.round(totalScore * 0.2);
  else if (activeCount === 1) pumpProbability = Math.round(totalScore * 0.45);
  else if (activeCount === 2) pumpProbability = Math.round(totalScore * 0.7);
  else if (activeCount === 3) pumpProbability = Math.round(Math.min(98, totalScore * 0.9 + 5));
  else pumpProbability = Math.round(Math.min(99, totalScore * 0.95 + 5));

  // Determine signal level
  let level, levelColor, action;
  if (totalScore >= THRESHOLDS.scoreExtreme) {
    level = '🔴 IMMINENT PUMP';
    levelColor = '#ef4444';
    action = 'HIGH CONFIDENCE — Setup confirmed. Watch for volume trigger.';
  } else if (totalScore >= THRESHOLDS.scoreHigh) {
    level = '🟡 HIGH PROBABILITY';
    levelColor = '#f59e0b';
    action = 'Strong setup building. Monitor for breakout trigger.';
  } else if (totalScore >= THRESHOLDS.scoreMedium) {
    level = '🔵 ACCUMULATION';
    levelColor = '#3b82f6';
    action = 'Early accumulation detected. Add to watchlist.';
  } else {
    level = '⚪ NO SIGNAL';
    levelColor = '#64748b';
    action = 'No pump setup detected. Wait.';
  }

  // Individual signals
  const signals = {};
  for (const [key, value] of Object.entries({ volumeOI, funding, bbSqueeze, momentum })) {
    signals[key] = {
      score: value.score,
      icon: SIGNAL_ICONS[key],
      label: SIGNAL_LABELS[key],
      details: value.details,
      active: value.score >= 50,
    };
  }

  // Active signals list (for quick display)
  const activeSignals = Object.entries(signals)
    .filter(([, s]) => s.active)
    .map(([key, s]) => ({ key, ...s }));

  return {
    totalScore,
    pumpProbability,
    activeCount,
    level,
    levelColor,
    action,
    signals,
    activeSignals,
    modules: { volumeOI, funding, bbSqueeze, momentum },
  };
}
