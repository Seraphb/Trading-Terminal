import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const STOCK_SYMBOL_ALIASES = {
  BOOKING: 'BKNG',
}

function json(res, statusCode, body) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeStockSymbol(symbol) {
  const upper = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')

  const aliased = STOCK_SYMBOL_ALIASES[upper] || upper
  return aliased.replace(/\./g, '-')
}

function parseYahooChartData(data) {
  const result = data?.chart?.result?.[0]
  const quote = result?.indicators?.quote?.[0]
  const timestamps = result?.timestamp || []

  if (!result || !quote || !timestamps.length) return []

  const candles = []
  for (let i = 0; i < timestamps.length; i += 1) {
    const open = quote.open?.[i]
    const high = quote.high?.[i]
    const low = quote.low?.[i]
    const close = quote.close?.[i]
    const volume = quote.volume?.[i]

    if (![open, high, low, close].every(Number.isFinite)) continue

    candles.push({
      time: timestamps[i] * 1000,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    })
  }

  return candles
}

function aggregateCandles(candles, bucketSize) {
  if (!Array.isArray(candles) || bucketSize <= 1) return candles

  const aggregated = []
  for (let i = 0; i < candles.length; i += bucketSize) {
    const bucket = candles.slice(i, i + bucketSize).filter(Boolean)
    if (!bucket.length) continue

    aggregated.push({
      time: bucket[0].time,
      open: bucket[0].open,
      high: Math.max(...bucket.map((candle) => candle.high)),
      low: Math.min(...bucket.map((candle) => candle.low)),
      close: bucket[bucket.length - 1].close,
      volume: bucket.reduce((total, candle) => total + (candle.volume || 0), 0),
    })
  }

  return aggregated
}

function parseStooqCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean)
  if (!lines.length || lines[0] === 'No data') return []

  return lines
    .slice(1)
    .map((line) => {
      const [date, open, high, low, close, volume] = line.split(',')
      const [year, month, day] = (date || '').split('-').map(Number)
      const time = Date.UTC(year, (month || 1) - 1, day || 1, 12)

      return {
        time,
        open: Number.parseFloat(open),
        high: Number.parseFloat(high),
        low: Number.parseFloat(low),
        close: Number.parseFloat(close),
        volume: Number.parseFloat(volume),
      }
    })
    .filter((candle) => [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite))
}

async function fetchYahooStockHistory(symbol, interval, range) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`)
  url.searchParams.set('interval', interval)
  url.searchParams.set('range', range)
  url.searchParams.set('includePrePost', 'false')
  url.searchParams.set('events', 'div,splits')

  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      'accept': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Yahoo Finance request failed with status ${response.status}`)
  }

  const payload = await response.json()
  const error = payload?.chart?.error
  if (error) throw new Error(error.description || 'Yahoo Finance returned an error')

  return parseYahooChartData(payload)
}

async function fetchStooqStockHistory(symbol) {
  const url = new URL('https://stooq.com/q/d/l/')
  url.searchParams.set('s', `${symbol.toLowerCase()}.us`)
  url.searchParams.set('i', 'd')

  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      'accept': 'text/csv,text/plain',
    },
  })

  if (!response.ok) {
    throw new Error(`Stooq request failed with status ${response.status}`)
  }

  return parseStooqCsv(await response.text())
}

async function getStockCandles({ symbol, interval = '1d', range = '1y', bars = 365 }) {
  const normalizedSymbol = normalizeStockSymbol(symbol)
  const intervalConfig = {
    '1m': { yahooInterval: '1m', aggregate: 1 },
    '5m': { yahooInterval: '5m', aggregate: 1 },
    '15m': { yahooInterval: '15m', aggregate: 1 },
    '1h': { yahooInterval: '60m', aggregate: 1 },
    '4h': { yahooInterval: '60m', aggregate: 4 },
    '1d': { yahooInterval: '1d', aggregate: 1 },
    '1w': { yahooInterval: '1wk', aggregate: 1 },
    '1mo': { yahooInterval: '1mo', aggregate: 1 },
  }
  const { yahooInterval, aggregate } = intervalConfig[interval] || intervalConfig['1d']

  let candles = []
  try {
    candles = await fetchYahooStockHistory(normalizedSymbol, yahooInterval, range)
  } catch (error) {
    if (interval !== '1d') throw error
    candles = await fetchStooqStockHistory(normalizedSymbol)
  }

  if (!candles.length) {
    throw new Error(`No stock history found for ${normalizedSymbol}`)
  }

  const sorted = candles.sort((a, b) => a.time - b.time)
  const finalCandles = aggregate > 1 ? aggregateCandles(sorted, aggregate) : sorted
  return bars > 0 ? finalCandles.slice(-bars) : finalCandles
}

function anthropicProxyPlugin(apiKey) {
  const middleware = async (req, res) => {
    if (req.method !== 'POST') {
      json(res, 405, { message: 'Method not allowed' })
      return
    }

    if (!apiKey) {
      json(res, 500, { message: 'Missing ANTHROPIC_API_KEY server environment variable' })
      return
    }

    try {
      const body = await readJsonBody(req)
      const {
        add_context_from_internet,
        system,
        ...anthropicBody
      } = body

      const systemPrompt = add_context_from_internet
        ? `${system}\nIf live or web-sourced facts are uncertain, say so and return null for unknown fields instead of inventing data.`
        : system

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          ...anthropicBody,
          system: systemPrompt,
        }),
      })

      const responseText = await response.text()
      res.statusCode = response.status
      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json')
      res.end(responseText)
    } catch (error) {
      json(res, 500, {
        message: error instanceof Error ? error.message : 'Unexpected Anthropic proxy error',
      })
    }
  }

  return {
    name: 'anthropic-proxy',
    configureServer(server) {
      server.middlewares.use('/api/anthropic', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/anthropic', middleware)
    },
  }
}

function stockSearchPlugin() {
  const searchMiddleware = async (req, res) => {
    if (req.method !== 'GET') { json(res, 405, { message: 'Method not allowed' }); return }
    try {
      const url = new URL(req.url, 'http://localhost')
      const query = url.searchParams.get('q')
      if (!query || query.length < 1) { json(res, 200, { results: [] }); return }

      const yahooUrl = new URL('https://query2.finance.yahoo.com/v1/finance/search')
      yahooUrl.searchParams.set('q', query)
      yahooUrl.searchParams.set('quotesCount', '8')
      yahooUrl.searchParams.set('newsCount', '0')
      yahooUrl.searchParams.set('listsCount', '0')
      yahooUrl.searchParams.set('enableFuzzyQuery', 'true')

      const response = await fetch(yahooUrl, {
        headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
      })
      if (!response.ok) { json(res, 200, { results: [] }); return }

      const data = await response.json()
      const results = (data?.quotes || [])
        .filter(q => q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
        .map(q => ({ symbol: q.symbol, name: q.shortname || q.longname || '', exchange: q.exchDisp || '' }))
      json(res, 200, { results })
    } catch {
      json(res, 200, { results: [] })
    }
  }

  return {
    name: 'stock-search-proxy',
    configureServer(server) { server.middlewares.use('/api/stocks/search', searchMiddleware) },
    configurePreviewServer(server) { server.middlewares.use('/api/stocks/search', searchMiddleware) },
  }
}

function stockDataProxyPlugin() {
  const middleware = async (req, res) => {
    if (req.method !== 'GET') {
      json(res, 405, { message: 'Method not allowed' })
      return
    }

    try {
      const url = new URL(req.url, 'http://localhost')
      const symbol = url.searchParams.get('symbol')
      const interval = url.searchParams.get('interval') || '1d'
      const range = url.searchParams.get('range') || '1y'
      const bars = parseInteger(url.searchParams.get('bars'), 365)

      if (!symbol) {
        json(res, 400, { message: 'Missing symbol query parameter' })
        return
      }

      const candles = await getStockCandles({ symbol, interval, range, bars })
      json(res, 200, {
        symbol: normalizeStockSymbol(symbol),
        interval,
        range,
        candles,
      })
    } catch (error) {
      json(res, 502, {
        message: error instanceof Error ? error.message : 'Unexpected stock data proxy error',
      })
    }
  }

  return {
    name: 'stock-data-proxy',
    configureServer(server) {
      server.middlewares.use('/api/stocks/history', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/stocks/history', middleware)
    },
  }
}

// ── SEC EDGAR helpers ──────────────────────────────────────────────────────────
let _edgarTickerCache = null
const _edgarConceptCache = new Map()
const EDGAR_UA = 'TradingDashboard/1.0 contact@localhost'

async function getCIK(symbol) {
  if (!_edgarTickerCache) {
    const r = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'user-agent': EDGAR_UA, accept: 'application/json' },
    })
    const raw = await r.json()
    _edgarTickerCache = {}
    for (const entry of Object.values(raw)) {
      _edgarTickerCache[entry.ticker.toUpperCase()] = String(entry.cik_str).padStart(10, '0')
    }
  }
  return _edgarTickerCache[symbol.toUpperCase()] || null
}

async function fetchEDGARConcept(cik, concept) {
  const key = `${cik}/${concept}`
  if (_edgarConceptCache.has(key)) return _edgarConceptCache.get(key)
  try {
    const r = await fetch(
      `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${concept}.json`,
      { headers: { 'user-agent': EDGAR_UA, accept: 'application/json' } }
    )
    if (!r.ok) return null
    const data = await r.json()
    const result = data?.units?.USD ?? data?.units?.shares ?? null
    _edgarConceptCache.set(key, result)
    setTimeout(() => _edgarConceptCache.delete(key), 4 * 60 * 60 * 1000)
    return result
  } catch { return null }
}

// Deduplicated annual 10-K values, most recent first.
// Takes MAX value per fiscal year end to get the consolidated total (not a segment line).
function deduplicatedAnnual(units, n = 5) {
  if (!Array.isArray(units)) return []
  const byEnd = new Map()
  units
    .filter(u => (u.form === '10-K' || u.form === '10-K/A') && u.fp === 'FY' && u.val > 0)
    .forEach(u => {
      if (!byEnd.has(u.end) || Math.abs(u.val) > Math.abs(byEnd.get(u.end).val)) {
        byEnd.set(u.end, u)
      }
    })
  return [...byEnd.values()]
    .sort((a, b) => new Date(b.end) - new Date(a.end))
    .slice(0, n)
    .map(u => ({ val: u.val, end: u.end }))
}

function latestAnnual(units) {
  return deduplicatedAnnual(units, 1)[0]?.val ?? null
}

function latestShares(units) {
  if (!Array.isArray(units)) return null
  return [...units].sort((a, b) => new Date(b.end) - new Date(a.end))[0]?.val ?? null
}

// Compute beta of symbol vs SPY from weekly closes over 1 year
function computeBeta(stockCloses, spyCloses) {
  const minLen = Math.min(stockCloses.length, spyCloses.length)
  if (minLen < 10) return 1.0
  const sr = [], mr = []
  for (let i = 1; i < minLen; i++) {
    if (stockCloses[i - 1] && spyCloses[i - 1]) {
      sr.push((stockCloses[i] - stockCloses[i - 1]) / stockCloses[i - 1])
      mr.push((spyCloses[i] - spyCloses[i - 1]) / spyCloses[i - 1])
    }
  }
  if (sr.length < 5) return 1.0
  const n = sr.length
  const ms = sr.reduce((a, b) => a + b, 0) / n
  const mm = mr.reduce((a, b) => a + b, 0) / n
  let cov = 0, varM = 0
  for (let i = 0; i < n; i++) {
    cov  += (sr[i] - ms) * (mr[i] - mm)
    varM += (mr[i] - mm) ** 2
  }
  if (varM === 0) return 1.0
  return Math.max(0.3, Math.min(3.0, cov / varM))
}

async function fetchWeeklyCloses(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1wk&range=2y`
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } })
    if (!r.ok) return []
    const data = await r.json()
    return (data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(Number.isFinite)
  } catch { return [] }
}

function fundamentalsProxyPlugin() {
  const middleware = async (req, res) => {
    if (req.method !== 'GET') { json(res, 405, { message: 'Method not allowed' }); return }
    try {
      const reqUrl = new URL(req.url, 'http://localhost')
      const symbol = reqUrl.searchParams.get('symbol')
      if (!symbol) { json(res, 400, { message: 'Missing symbol' }); return }

      // 1. Resolve EDGAR CIK
      const cik = await getCIK(symbol.toUpperCase())
      if (!cik) {
        json(res, 404, { message: `No SEC EDGAR listing for ${symbol}. DCF only works for US-listed stocks.` })
        return
      }

      // 2. Fetch EDGAR concepts + beta data + company name in parallel
      const [
        ocfUnits, capexUnits,
        sharesUnits, sharesBasicUnits,
        debtUnits, cashUnits,
        revUnits, revAltUnits,
        stockCloses, spyCloses, nameData,
      ] = await Promise.all([
        fetchEDGARConcept(cik, 'NetCashProvidedByUsedInOperatingActivities'),
        fetchEDGARConcept(cik, 'PaymentsToAcquirePropertyPlantAndEquipment'),
        fetchEDGARConcept(cik, 'CommonStockSharesOutstanding'),
        fetchEDGARConcept(cik, 'WeightedAverageNumberOfSharesOutstandingBasic'),
        fetchEDGARConcept(cik, 'LongTermDebtNoncurrent'),
        fetchEDGARConcept(cik, 'CashAndCashEquivalentsAtCarryingValue'),
        fetchEDGARConcept(cik, 'Revenues'),
        fetchEDGARConcept(cik, 'RevenueFromContractWithCustomerExcludingAssessedTax'),
        fetchWeeklyCloses(symbol),
        fetchWeeklyCloses('SPY'),
        fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
          headers: { 'user-agent': EDGAR_UA },
        }).then(r => r.ok ? r.json() : null).catch(() => null),
      ])

      // 3. Current price from Yahoo chart
      let currentPrice = null
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`
        const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } })
        if (r.ok) {
          const d = await r.json()
          const closes = (d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(Number.isFinite)
          if (closes.length) currentPrice = closes[closes.length - 1]
        }
      } catch {}

      // 4. Build FCF history (most recent first)
      const ocfRows    = deduplicatedAnnual(ocfUnits,   5)
      const capexRows  = deduplicatedAnnual(capexUnits, 5)
      const fcfHistory = ocfRows.map((row, i) => row.val - Math.abs(capexRows[i]?.val ?? 0))

      // 5. Shares history (annual, most recent first) for FCF/share growth
      const sharesRows   = deduplicatedAnnual(sharesUnits ?? sharesBasicUnits, 5)
      const sharesLatest = latestShares(sharesUnits) ?? latestShares(sharesBasicUnits)
      const sharesHistory = sharesRows.map(r => r.val)

      // 6. Revenue history — merge both revenue concepts, MAX per FY end date
      const allRevUnits = [...(revUnits || []), ...(revAltUnits || [])]
      const revRows    = deduplicatedAnnual(allRevUnits, 5)
      const revHistory = revRows.map(r => r.val)

      // 7. Debt & cash
      const totalDebt = latestAnnual(debtUnits) ?? 0
      const totalCash = latestAnnual(cashUnits) ?? 0

      // 8. Beta from weekly returns vs SPY
      const beta = computeBeta(stockCloses, spyCloses)

      json(res, 200, {
        ticker:            symbol.toUpperCase(),
        company_name:      nameData?.name || symbol,
        current_price:     currentPrice,
        shares_outstanding: sharesLatest,
        shares_history:    sharesHistory,   // most recent first
        fcf_history:       fcfHistory,      // most recent first
        fcf_ttm:           fcfHistory[0] ?? null,
        revenue_history:   revHistory,      // most recent first
        total_debt:        totalDebt,
        total_cash:        totalCash,
        beta,
        source: 'SEC EDGAR',
      })
    } catch (err) {
      json(res, 502, { message: err instanceof Error ? err.message : 'Fundamentals proxy error' })
    }
  }
  return {
    name: 'fundamentals-proxy',
    configureServer(server) { server.middlewares.use('/api/stocks/fundamentals', middleware) },
    configurePreviewServer(server) { server.middlewares.use('/api/stocks/fundamentals', middleware) },
  }
}

function stockQuotesPlugin() {
  const middleware = async (req, res) => {
    if (req.method !== 'GET') { json(res, 405, { message: 'Method not allowed' }); return }
    try {
      const url = new URL(req.url, 'http://localhost')
      const symbols = url.searchParams.get('symbols')
      if (!symbols) { json(res, 400, { message: 'Missing symbols' }); return }

      const yahooUrl = new URL('https://query1.finance.yahoo.com/v7/finance/quote')
      yahooUrl.searchParams.set('symbols', symbols)
      yahooUrl.searchParams.set('fields', 'symbol,shortName,regularMarketPrice,regularMarketChangePercent,regularMarketVolume,regularMarketDayHigh,regularMarketDayLow,marketCap')

      const r = await fetch(yahooUrl, {
        headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
      })
      if (!r.ok) { json(res, 502, { message: 'Yahoo Finance error' }); return }

      const data = await r.json()
      const quotes = (data?.quoteResponse?.result || []).map(q => ({
        symbol: q.symbol,
        name: q.shortName || q.symbol,
        price: q.regularMarketPrice ?? 0,
        change: q.regularMarketChangePercent ?? 0,
        volume: q.regularMarketVolume ?? 0,
        high: q.regularMarketDayHigh ?? 0,
        low: q.regularMarketDayLow ?? 0,
        marketCap: q.marketCap ?? 0,
      }))
      json(res, 200, { quotes })
    } catch (err) {
      json(res, 502, { message: err instanceof Error ? err.message : 'Quotes proxy error' })
    }
  }
  return {
    name: 'stock-quotes-proxy',
    configureServer(server) { server.middlewares.use('/api/stocks/quotes', middleware) },
    configurePreviewServer(server) { server.middlewares.use('/api/stocks/quotes', middleware) },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const anthropicApiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || env.VITE_ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY

  return {
    plugins: [react(), anthropicProxyPlugin(anthropicApiKey), stockSearchPlugin(), stockDataProxyPlugin(), fundamentalsProxyPlugin(), stockQuotesPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(projectRoot, './src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'react-vendor'
            }
            if (id.includes('@radix-ui') || id.includes('lucide-react')) {
              return 'ui-vendor'
            }
            if (id.includes('@tanstack/react-query') || id.includes('@supabase/supabase-js')) {
              return 'data-vendor'
            }
          },
        },
      },
    },
  }
})
