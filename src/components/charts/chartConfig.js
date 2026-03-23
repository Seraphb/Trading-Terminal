export const CHART_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

export const CHART_DATE_RANGES = ['1H', '4H', '1D', '1W', '1M', '3M', '6M', '1Y', '3Y', '5Y', 'All'];

export const DATE_RANGES_BY_INTERVAL = {
  '1m': ['1H', '4H', '1D', '1W', 'All'],
  '5m': ['1H', '4H', '1D', '1W', 'All'],
  '15m': ['1H', '4H', '1D', '1W', 'All'],
  '1h': ['1H', '4H', '1D', '1W', '1M', '3M', 'All'],
  '4h': ['4H', '1D', '1W', '1M', '3M', '6M', '1Y', 'All'],
  '1d': ['1D', '1W', '1M', '3M', '6M', '1Y', '3Y', '5Y', 'All'],
  '1w': ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'All'],
};

export const DEFAULT_DATE_RANGE_BY_INTERVAL = {
  '1m': '1D',
  '5m': '1D',
  '15m': '1W',
  '1h': '1M',
  '4h': '3M',
  '1d': '1Y',
  '1w': '3Y',
};

export function rangeToCount(range, interval, totalLen) {
  if (range === 'All') return totalLen;

  const map = {
    '1m': { '1H': 60, '4H': 240, '1D': 1440, '1W': 10080 },
    '5m': { '1H': 12, '4H': 48, '1D': 288, '1W': 2016 },
    '15m': { '1H': 4, '4H': 16, '1D': 96, '1W': 672 },
    '1h': { '1H': 1, '4H': 4, '1D': 24, '1W': 168, '1M': 720, '3M': 2160 },
    '4h': { '4H': 1, '1D': 6, '1W': 42, '1M': 180, '3M': 540, '6M': 1080, '1Y': 2190 },
    '1d': { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '3Y': 1095, '5Y': 1825 },
    '1w': { '1M': 4, '3M': 13, '6M': 26, '1Y': 52, '3Y': 156, '5Y': 260, 'All': totalLen },
  };

  const count = map[interval]?.[range];
  if (count == null) return null;
  return Math.min(count, totalLen || 1);
}
