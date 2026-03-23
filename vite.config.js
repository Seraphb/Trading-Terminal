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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const anthropicApiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || env.VITE_ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY

  return {
    plugins: [react(), anthropicProxyPlugin(anthropicApiKey), stockDataProxyPlugin()],
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
