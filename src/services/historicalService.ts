import { Bar } from '@/components/chart/chart.d'
import {
  floorTimestampToTimeframe,
  getApiUrl,
  handleFetchError,
  isOddTimeframe
} from '@/utils/helpers'
import EventEmitter from 'eventemitter3'

import store from '../store'
import { parseMarket } from './productsService'

export type InitialPrices = { [market: string]: number }

export interface HistoricalResponse {
  from: number
  to: number
  data: Bar[]
  initialPrices: InitialPrices
}

// TradingView UDF format from backend /api/bars
interface BackendBarsResponse {
  s: 'ok' | 'no_data' | 'error'
  errmsg?: string
  t: number[] // timestamps (Unix seconds)
  o: number[] // open
  h: number[] // high
  l: number[] // low
  c: number[] // close
  v: number[] // volume
  d: number[] // delta (buy_volume - sell_volume)
  oi: number[] // open interest
}

// Supported resolutions by backend /api/bars
// From API docs: 1s, 1m, 5m, 15m, 30m, 1h, 4h, 1d
const SUPPORTED_RESOLUTIONS = [1, 60, 300, 900, 1800, 3600, 14400, 86400]

class HistoricalService extends EventEmitter {
  url: string
  backendUrl: string
  promisesOfData: { [keyword: string]: Promise<HistoricalResponse> } = {}

  // Cache of backend tickers for market mapping
  private backendTickers: Map<string, { exchange: string; symbol: string }> =
    new Map()
  private tickersFetched = false

  constructor() {
    super()

    this.url = getApiUrl('historical')
    this.backendUrl = import.meta.env.VITE_APP_BACKEND_URL || ''
  }

  /**
   * Fetch and cache available tickers from backend
   */
  async fetchBackendTickers(): Promise<void> {
    if (this.tickersFetched || !this.backendUrl) return

    try {
      const apiKey = import.meta.env.VITE_APP_BACKEND_API_KEY
      const url = apiKey
        ? `${this.backendUrl}/api/tickers?token=${apiKey}`
        : `${this.backendUrl}/api/tickers`

      const response = await fetch(url)
      const data = await response.json()

      if (data.tickers && Array.isArray(data.tickers)) {
        this.backendTickers.clear()

        for (const ticker of data.tickers) {
          // Store as "exchange:symbol" -> { exchange, symbol }
          const key = `${ticker.exchange}:${ticker.symbol}`.toLowerCase()
          this.backendTickers.set(key, {
            symbol: ticker.symbol,
            exchange: ticker.exchange
          })
        }

        console.debug(
          `[historicalService] Cached ${this.backendTickers.size} backend tickers`
        )
        this.tickersFetched = true
      }
    } catch (err) {
      console.error('[historicalService] Failed to fetch backend tickers:', err)
    }
  }

  /**
   * Find matching backend ticker for an aggr market
   * e.g., BINANCE_FUTURES:btcusd_perp -> { exchange: "binance", symbol: "BTCUSDT" }
   */
  findBackendTicker(
    market: string
  ): { exchange: string; symbol: string } | null {
    const [exchangeId, pair] = parseMarket(market)
    if (!exchangeId || !pair) return null

    // Normalize exchange name (BINANCE_FUTURES -> binance)
    const normalizedExchange = exchangeId
      .toLowerCase()
      .replace('_futures', '')
      .replace('_spot', '')
      .replace('_us', '')

    // Extract base asset for hyperliquid-style symbols (just "BTC", "ETH", etc.)
    const hyperliquidSymbol = pair
      .toUpperCase()
      .replace(/USD.*$/i, '')
      .replace(/_PERP$/i, '')
      .replace(/-PERPETUAL$/i, '')

    // Try common symbol transformations
    const symbolVariants = [
      pair.toUpperCase(),
      pair.toUpperCase().replace('USD_PERP', 'USDT'),
      pair.toUpperCase().replace('_PERP', ''),
      pair.toUpperCase().replace('-', ''),
      pair.toUpperCase() + 'T', // btcusd -> BTCUSDT
      hyperliquidSymbol // For hyperliquid which just uses BTC, ETH, etc.
    ]

    for (const symbol of symbolVariants) {
      const key = `${normalizedExchange}:${symbol}`.toLowerCase()
      const ticker = this.backendTickers.get(key)
      if (ticker) {
        return ticker
      }
    }

    // Try matching just by base asset
    const baseAsset = pair.replace(/usd.*$/i, '').toUpperCase()
    for (const [key, ticker] of this.backendTickers) {
      if (
        key.startsWith(normalizedExchange + ':') &&
        ticker.symbol.startsWith(baseAsset)
      ) {
        return ticker
      }
    }

    return null
  }

  filterOutUnavailableMarkets(markets: string[]) {
    // If backend is configured, all markets are available for historical data
    if (this.backendUrl) {
      return markets
    }

    return markets.filter(
      market => store.state.app.historicalMarkets.indexOf(market) !== -1
    )
  }

  /**
   * Convert timeframe in seconds to resolution string for backend API
   * e.g., 60 -> '1m', 300 -> '5m', 3600 -> '1h'
   */
  timeframeToResolution(timeframe: number): string {
    if (timeframe < 60) {
      return `${timeframe}s`
    } else if (timeframe < 3600) {
      return `${timeframe / 60}m`
    } else if (timeframe < 86400) {
      return `${timeframe / 3600}h`
    } else {
      return `${timeframe / 86400}d`
    }
  }

  /**
   * Find the best resolution to fetch from backend for a given timeframe
   * Returns { fetchResolution, needsAggregation }
   */
  getBestResolution(timeframe: number): {
    fetchResolution: number
    needsAggregation: boolean
  } {
    // If the exact resolution is supported, use it
    if (SUPPORTED_RESOLUTIONS.includes(timeframe)) {
      return { fetchResolution: timeframe, needsAggregation: false }
    }

    // Find the largest supported resolution that divides evenly into the requested timeframe
    // or use 1s if nothing divides evenly
    for (let i = SUPPORTED_RESOLUTIONS.length - 1; i >= 0; i--) {
      const res = SUPPORTED_RESOLUTIONS[i]
      if (res < timeframe && timeframe % res === 0) {
        return { fetchResolution: res, needsAggregation: true }
      }
    }

    // Default to 1s and aggregate
    return { fetchResolution: 1, needsAggregation: true }
  }

  /**
   * Check if a timeframe can be fetched (directly or via aggregation)
   * Returns true if backend is configured (can aggregate from 1s) or if using legacy API with a supported timeframe
   */
  isTimeframeFetchable(timeframe: number): boolean {
    // With backend, any timeframe can be built by aggregating from 1s bars
    if (this.backendUrl) {
      return true
    }
    // Without backend, only directly supported timeframes work
    return SUPPORTED_RESOLUTIONS.includes(timeframe)
  }

  /**
   * Build backend API URL for /api/bars endpoint
   * Uses ticker mapping to convert aggr market format to backend format
   */
  getBackendApiUrl(
    from: number,
    to: number,
    resolution: number,
    market: string
  ): string | null {
    const [exchange, symbol] = parseMarket(market)
    const resolutionStr = this.timeframeToResolution(resolution)

    // Try to find the mapped backend ticker
    const backendTicker = this.findBackendTicker(market)

    let backendExchange: string
    let backendSymbol: string
    let marketType: string

    if (backendTicker) {
      // Use mapped values
      backendExchange = backendTicker.exchange
      backendSymbol = backendTicker.symbol
      // Determine market type based on original exchange name
      const exchangeLower = exchange.toLowerCase()
      if (
        exchangeLower.includes('_futures') ||
        exchangeLower.includes('futures')
      ) {
        marketType = 'futures'
      } else if (
        exchangeLower.includes('_spot') ||
        exchangeLower.includes('spot')
      ) {
        marketType = 'spot'
      } else if (
        // Known perpetual/futures-only exchanges
        [
          'bitmex',
          'dydx',
          'hyperliquid',
          'bybit',
          'bitget',
          'okex',
          'phemex'
        ].includes(exchangeLower)
      ) {
        marketType = 'futures'
      } else {
        // Default to spot for exchanges without suffix (BINANCE, COINBASE, etc.)
        marketType = 'spot'
      }
    } else {
      // Fallback to basic normalization
      const exchangeLower = exchange.toLowerCase()
      backendExchange = exchangeLower
        .replace('_futures', '')
        .replace('_spot', '')
        .replace('_us', '')
      backendSymbol = symbol.toUpperCase()

      // Determine market type
      if (exchangeLower.includes('spot')) {
        marketType = 'spot'
      } else if (
        exchangeLower.includes('futures') ||
        ['bitmex', 'dydx', 'hyperliquid', 'bybit', 'bitget', 'okex'].includes(
          backendExchange
        )
      ) {
        marketType = 'futures'
      } else {
        marketType = 'spot'
      }
    }

    const params = new URLSearchParams({
      symbol: backendSymbol,
      exchange: backendExchange,
      market_type: marketType,
      resolution: resolutionStr,
      from: Math.floor(from / 1000).toString(),
      to: Math.floor(to / 1000).toString()
    })

    const apiKey = import.meta.env.VITE_APP_BACKEND_API_KEY
    if (apiKey) {
      params.set('token', apiKey)
    }

    return `${this.backendUrl}/api/bars?${params.toString()}`
  }

  /**
   * Aggregate bars from a smaller timeframe to a larger one
   */
  aggregateBars(bars: Bar[], targetTimeframe: number): Bar[] {
    if (bars.length === 0) return []

    const aggregated: Bar[] = []
    const isOdd = isOddTimeframe(targetTimeframe)

    let currentBar: Bar | null = null
    let currentBucketTime: number | null = null

    for (const bar of bars) {
      // bar.time is in seconds, same as floorTimestampToTimeframe expects
      const bucketTime = floorTimestampToTimeframe(
        bar.time,
        targetTimeframe,
        isOdd
      )

      if (currentBucketTime !== bucketTime) {
        // Save previous bar
        if (currentBar) {
          aggregated.push(currentBar)
        }

        // Start new bar
        currentBucketTime = bucketTime
        currentBar = {
          time: bucketTime,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          vbuy: bar.vbuy || 0,
          vsell: bar.vsell || 0,
          cbuy: bar.cbuy || 0,
          csell: bar.csell || 0,
          lbuy: bar.lbuy || 0,
          lsell: bar.lsell || 0,
          exchange: bar.exchange,
          pair: bar.pair
        }
      } else if (currentBar) {
        // Aggregate into current bar
        currentBar.high = Math.max(currentBar.high, bar.high)
        currentBar.low = Math.min(currentBar.low, bar.low)
        currentBar.close = bar.close
        currentBar.vbuy += bar.vbuy || 0
        currentBar.vsell += bar.vsell || 0
        currentBar.cbuy += bar.cbuy || 0
        currentBar.csell += bar.csell || 0
        currentBar.lbuy += bar.lbuy || 0
        currentBar.lsell += bar.lsell || 0
      }
    }

    // Don't forget the last bar
    if (currentBar) {
      aggregated.push(currentBar)
    }

    return aggregated
  }

  /**
   * Fetch historical data from backend /api/bars endpoint
   */
  async fetchFromBackend(
    from: number,
    to: number,
    timeframe: number,
    markets: string[]
  ): Promise<HistoricalResponse> {
    // Ensure we have backend tickers for proper market mapping
    await this.fetchBackendTickers()

    const { fetchResolution, needsAggregation } =
      this.getBestResolution(timeframe)

    console.debug(
      `[historicalService] Fetching ${this.timeframeToResolution(fetchResolution)} bars` +
        (needsAggregation
          ? ` (will aggregate to ${this.timeframeToResolution(timeframe)})`
          : '')
    )

    const allBars: Bar[] = []
    const initialPrices: InitialPrices = {}
    const preferQuoteCurrencySize = store.state.settings.preferQuoteCurrencySize

    // Fetch data for each market in parallel
    const fetchPromises = markets.map(async market => {
      const url = this.getBackendApiUrl(from, to, fetchResolution, market)
      const [exchange, pair] = parseMarket(market)

      try {
        const response = await fetch(url)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const json: BackendBarsResponse = await response.json()

        if (json.s === 'error') {
          // Don't throw - just warn and skip this market
          console.warn(
            `[historicalService] Backend error for ${market}: ${json.errmsg}`
          )
          return []
        }

        if (json.s === 'no_data' || !json.t || json.t.length === 0) {
          console.warn(`[historicalService] No data from backend for ${market}`)
          return []
        }

        // Transform TradingView UDF arrays to Bar objects
        const bars: Bar[] = []
        for (let i = 0; i < json.t.length; i++) {
          const volume = json.v?.[i] || 0
          const delta = json.d?.[i] || 0

          // Derive buy/sell volumes from total volume and delta
          let vbuy = (volume + delta) / 2
          let vsell = (volume - delta) / 2

          const close = json.c[i]

          // Backend returns volumes in BASE currency (e.g., BTC)
          // Convert to quote currency (e.g., USD) if preferQuoteCurrencySize is true
          if (preferQuoteCurrencySize && close) {
            vbuy = vbuy * close
            vsell = vsell * close
          }

          const bar: Bar = {
            time: json.t[i], // Keep in seconds - chart expects seconds
            open: json.o[i],
            high: json.h[i],
            low: json.l[i],
            close: close,
            vbuy,
            vsell,
            cbuy: 0,
            csell: 0,
            lbuy: 0,
            lsell: 0,
            exchange,
            pair
          }

          // Store initial price for this market
          if (i === 0) {
            initialPrices[market] = bar.close
          }

          bars.push(bar)
        }

        // Aggregate if needed
        if (needsAggregation && bars.length > 0) {
          return this.aggregateBars(bars, timeframe)
        }

        return bars
      } catch (err) {
        console.warn(
          `[historicalService] Failed to fetch ${market} from backend:`,
          err
        )
        return []
      }
    })

    const results = await Promise.all(fetchPromises)
    results.forEach(bars => allBars.push(...bars))

    // Sort bars by time
    allBars.sort((a, b) => a.time - b.time)

    if (allBars.length === 0) {
      throw new Error('No more data')
    }

    return {
      data: allBars,
      from: allBars[0].time,
      to: allBars[allBars.length - 1].time,
      initialPrices
    }
  }

  getApiUrl(from, to, timeframe, markets) {
    const params = [from, to, (timeframe * 1000).toString()]

    if (markets && markets.length) {
      params.push(encodeURIComponent(markets.join('+')))
    }

    return `${this.url}/${params.join('/')}`
  }

  fetch(
    from: number,
    to: number,
    timeframe: number,
    markets: string[]
  ): Promise<HistoricalResponse> {
    // Use backend API if configured
    if (this.backendUrl) {
      const cacheKey = `backend:${from}:${to}:${timeframe}:${markets.join(',')}`

      if (this.promisesOfData[cacheKey]) {
        return this.promisesOfData[cacheKey]
      }

      this.promisesOfData[cacheKey] = this.fetchFromBackend(
        from,
        to,
        timeframe,
        markets
      )
        .catch(err => {
          // Fallback to legacy API on backend failure
          console.warn(
            '[historicalService] Backend fetch failed, trying legacy API:',
            err
          )
          return this.fetchLegacy(from, to, timeframe, markets)
        })
        .then(data => {
          store.commit('app/TOGGLE_LOADING', false)
          delete this.promisesOfData[cacheKey]
          return data
        })

      return this.promisesOfData[cacheKey]
    }

    // Fallback to legacy API
    return this.fetchLegacy(from, to, timeframe, markets)
  }

  /**
   * Legacy fetch method using the old aggr-server format
   */
  fetchLegacy(
    from: number,
    to: number,
    timeframe: number,
    markets: string[]
  ): Promise<HistoricalResponse> {
    const url = this.getApiUrl(from, to, timeframe, markets)

    if (this.promisesOfData[url]) {
      return this.promisesOfData[url]
    }

    this.promisesOfData[url] = fetch(url)
      .then(async response => {
        const contentType = response.headers.get('content-type')
        let json

        if (contentType && contentType.indexOf('application/json') !== -1) {
          json = await response.json()
        } else {
          throw new Error(await response.text())
        }

        json.status = response.status
        return json
      })
      .then(json => {
        if (!json || json.error) {
          throw new Error(json && json.error ? json.error : 'empty-response')
        }

        if (json.format !== 'point') {
          throw new Error('Bad data')
        }

        if (!json.results.length) {
          throw new Error('No more data')
        }

        return this.normalizePoints(
          json.results,
          json.columns,
          timeframe,
          markets
        )
      })
      .catch(err => {
        handleFetchError(err)
        throw err
      })
      .then(data => {
        store.commit('app/TOGGLE_LOADING', false)
        delete this.promisesOfData[url]
        return data
      })

    return this.promisesOfData[url]
  }

  normalizePoints(data, columns, timeframe, markets: string[]) {
    const lastClosedBars = {}
    const initialPrices = {}

    markets = markets.slice()

    if (!data || !data.length) {
      return data
    }

    let firstBarTimestamp: number

    if (Array.isArray(data[0])) {
      firstBarTimestamp = data[0][0]
    } else {
      firstBarTimestamp = +new Date(data[0].time) / 1000
    }

    markets = [...markets]

    const isOdd = isOddTimeframe(timeframe)
    const preferQuoteCurrencySize = store.state.settings.preferQuoteCurrencySize

    for (let i = 0; i < data.length; i++) {
      if (!data[i].time && data[i][0]) {
        data[i] = {
          time:
            typeof columns['time'] !== 'undefined'
              ? data[i][columns['time']]
              : 0,
          cbuy:
            typeof columns['cbuy'] !== 'undefined'
              ? data[i][columns['cbuy']]
              : 0,
          close:
            typeof columns['close'] !== 'undefined'
              ? data[i][columns['close']]
              : 0,
          csell:
            typeof columns['csell'] !== 'undefined'
              ? data[i][columns['csell']]
              : 0,
          high:
            typeof columns['high'] !== 'undefined'
              ? data[i][columns['high']]
              : 0,
          lbuy:
            typeof columns['lbuy'] !== 'undefined'
              ? data[i][columns['lbuy']]
              : 0,
          low:
            typeof columns['low'] !== 'undefined' ? data[i][columns['low']] : 0,
          lsell:
            typeof columns['lsell'] !== 'undefined'
              ? data[i][columns['lsell']]
              : 0,
          market:
            typeof columns['market'] !== 'undefined'
              ? data[i][columns['market']]
              : 0,
          open:
            typeof columns['open'] !== 'undefined'
              ? data[i][columns['open']]
              : 0,
          vbuy:
            typeof columns['vbuy'] !== 'undefined'
              ? data[i][columns['vbuy']]
              : 0,
          vsell:
            typeof columns['vsell'] !== 'undefined'
              ? data[i][columns['vsell']]
              : 0
        }
      } else {
        if (!lastClosedBars[data[i].market]) {
          for (let j = i - 1; j >= 0; j--) {
            if (data[j].market === data[i].market) {
              lastClosedBars[data[i].market] = data[j]
              break
            }
          }
        }

        data[i].time = floorTimestampToTimeframe(
          data[i].time / 1000,
          timeframe,
          isOdd
        )

        if (
          !preferQuoteCurrencySize &&
          (data[i].vbuy || data[i].vsell) &&
          data[i].close
        ) {
          data[i].vbuy = data[i].vbuy / data[i].close
          data[i].vsell = data[i].vsell / data[i].close
        }

        if (
          !lastClosedBars[data[i].market] ||
          lastClosedBars[data[i].market].time < data[i].time
        ) {
          lastClosedBars[data[i].market] = data[i]
        } else if (lastClosedBars[data[i].market] !== data[i]) {
          lastClosedBars[data[i].market].vbuy += data[i].vbuy
          lastClosedBars[data[i].market].vsell += data[i].vsell
          lastClosedBars[data[i].market].cbuy += data[i].cbuy
          lastClosedBars[data[i].market].csell += data[i].csell
          lastClosedBars[data[i].market].lbuy += data[i].lbuy
          lastClosedBars[data[i].market].lsell += data[i].lsell
          lastClosedBars[data[i].market].high = Math.max(
            data[i].high,
            lastClosedBars[data[i].market].high
          )
          lastClosedBars[data[i].market].low = Math.min(
            data[i].low,
            lastClosedBars[data[i].market].low
          )
          lastClosedBars[data[i].market].close = data[i].close

          data.splice(i, 1)
          i--
          continue
        }
      }

      if (!initialPrices[data[i].market]) {
        initialPrices[data[i].market] = data[i].close
      }

      if (
        !preferQuoteCurrencySize &&
        (data[i].vbuy || data[i].vsell) &&
        data[i].close
      ) {
        data[i].vbuy = data[i].vbuy / data[i].close
        data[i].vsell = data[i].vsell / data[i].close
      }

      if (data[i].time === firstBarTimestamp) {
        const marketIndex = markets.indexOf(data[i].market)
        markets.splice(marketIndex, 1)
      }

      const [exchange, pair] = parseMarket(data[i].market)
      data[i].exchange = exchange
      data[i].pair = pair
    }

    return {
      data,
      markets,
      from: data[0].time,
      to: data[data.length - 1].time,
      initialPrices
    }
  }
}

export default new HistoricalService()
