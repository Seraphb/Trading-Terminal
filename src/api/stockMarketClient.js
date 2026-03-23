const STOCK_SYMBOL_ALIASES = {
  BOOKING: 'BKNG',
}

export function normalizeStockSymbol(symbol) {
  const upper = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')

  const aliased = STOCK_SYMBOL_ALIASES[upper] || upper
  return aliased.replace(/\./g, '-')
}

export async function fetchStockHistory(symbol, options = {}) {
  const normalizedSymbol = normalizeStockSymbol(symbol)
  const params = new URLSearchParams({ symbol: normalizedSymbol })

  if (options.interval) params.set('interval', options.interval)
  if (options.range) params.set('range', options.range)
  if (options.bars != null) params.set('bars', String(options.bars))

  const response = await fetch(`/api/stocks/history?${params.toString()}`)

  if (!response.ok) {
    let message = `Failed to load stock history for ${normalizedSymbol}`
    try {
      const error = await response.json()
      message = error?.message || message
    } catch {}
    throw new Error(message)
  }

  const payload = await response.json()
  return Array.isArray(payload?.candles) ? payload.candles : []
}
