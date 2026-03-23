const DEFAULT_MOVING_AVERAGE_COLORS = ['#f59e0b', '#3b82f6', '#a855f7', '#f43f5e', '#22c55e', '#e11d48', '#06b6d4', '#f97316'];

function createId(prefix = 'ma') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function computeEMA(data, period, key = 'close') {
  const k = 2 / (period + 1);
  const out = [];
  let prev = data[0]?.[key] ?? 0;
  for (let i = 0; i < data.length; i += 1) {
    prev = (data[i]?.[key] ?? prev) * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function computeSMA(data, period, key = 'close') {
  return data.map((_, index) => {
    const slice = data.slice(Math.max(0, index - period + 1), index + 1);
    const sum = slice.reduce((total, item) => total + (item?.[key] ?? 0), 0);
    return sum / Math.max(slice.length, 1);
  });
}

export function createMovingAverage(type, period, color, visible = true) {
  const normalizedType = String(type).toUpperCase() === 'SMA' ? 'SMA' : 'EMA';
  const normalizedPeriod = Math.max(1, Number.parseInt(String(period), 10) || 9);
  return {
    id: createId(normalizedType.toLowerCase()),
    type: normalizedType,
    period: normalizedPeriod,
    color: color || DEFAULT_MOVING_AVERAGE_COLORS[0],
    visible,
  };
}

export function createDefaultMovingAverages() {
  return [
    createMovingAverage('EMA', 9, DEFAULT_MOVING_AVERAGE_COLORS[0]),
    createMovingAverage('EMA', 21, DEFAULT_MOVING_AVERAGE_COLORS[1]),
    createMovingAverage('EMA', 50, DEFAULT_MOVING_AVERAGE_COLORS[2]),
    createMovingAverage('EMA', 200, DEFAULT_MOVING_AVERAGE_COLORS[3]),
  ];
}

export function getMovingAverageSeriesKey(average) {
  return `${average.type.toLowerCase()}_${average.period}`;
}

export function getMovingAverageLabel(average) {
  return `${average.type}${average.period}`;
}

export function buildMovingAverageSeries(data, averages, key = 'close') {
  const series = new Map();

  averages.forEach((average) => {
    const seriesKey = getMovingAverageSeriesKey(average);
    if (series.has(seriesKey)) return;
    const computed = average.type === 'SMA'
      ? computeSMA(data, average.period, key)
      : computeEMA(data, average.period, key);
    series.set(seriesKey, computed);
  });

  return series;
}

export function enrichChartDataWithMovingAverages({ slice, fullData, startIdx, averages, key = 'close' }) {
  const series = buildMovingAverageSeries(fullData, averages, key);
  return slice.map((candle, localIndex) => {
    const globalIndex = startIdx + localIndex;
    const next = { ...candle };
    averages.forEach((average) => {
      next[getMovingAverageSeriesKey(average)] = series.get(getMovingAverageSeriesKey(average))?.[globalIndex];
    });
    return next;
  });
}

export function getMovingAverageLineConfig(averages) {
  return averages.map((average) => ({
    key: average.id,
    dataKey: getMovingAverageSeriesKey(average),
    show: average.visible,
    color: average.color,
    strokeWidth: average.period >= 100 ? 1.6 : 1.4,
    strokeDasharray: average.type === 'SMA' ? '5,3' : undefined,
    opacity: average.visible ? 0.85 : 0.25,
  }));
}

export function nextMovingAverageColor(existing) {
  const used = new Set(existing.map((average) => average.color));
  return DEFAULT_MOVING_AVERAGE_COLORS.find((color) => !used.has(color)) || DEFAULT_MOVING_AVERAGE_COLORS[existing.length % DEFAULT_MOVING_AVERAGE_COLORS.length];
}
