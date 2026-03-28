/**
 * Compute "nice" Y-axis tick values (round numbers like TradingView).
 *
 * @param {number} lo  - visible price minimum
 * @param {number} hi  - visible price maximum
 * @param {number} maxTicks - desired maximum number of ticks
 * @returns {number[]} array of tick prices (ascending)
 */
export function niceYTicks(lo, hi, maxTicks = 6) {
  const range = hi - lo;
  if (!range || !Number.isFinite(range)) return [lo];

  const rawStep = range / Math.max(maxTicks - 1, 1);

  // Round step to the nearest "nice" value: 1, 2, 5 × 10^n
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const ratio = rawStep / mag;
  let niceStep;
  if (ratio <= 1.5) niceStep = mag;
  else if (ratio <= 3.5) niceStep = 2 * mag;
  else if (ratio <= 7.5) niceStep = 5 * mag;
  else niceStep = 10 * mag;

  // Precision for rounding (avoid float drift)
  const decimals = Math.max(0, -Math.floor(Math.log10(niceStep)) + 2);
  const round = (v) => parseFloat(v.toFixed(decimals));

  const tickMin = round(Math.ceil(lo / niceStep) * niceStep);
  const ticks = [];
  for (let t = tickMin; t <= hi + niceStep * 0.001; t += niceStep) {
    ticks.push(round(t));
  }

  return ticks;
}
