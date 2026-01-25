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

class HistoricalService extends EventEmitter {
  url: string
  backendUrl: string
  promisesOfData: { [keyword: string]: Promise<HistoricalResponse> } = {}

  constructor() {
    super()

    this.url = getApiUrl('historical')
    this.backendUrl = import.meta.env.VITE_APP_BACKEND_URL || ''
  }

  filterOutUnavailableMarkets(markets: string[]) {
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
   * Build backend API URL for /api/bars endpoint
   */
  getBackendApiUrl(
    from: number,
    to: number,
    timeframe: number,
    market: string
  ): string {
    const [exchange, symbol] = parseMarket(market)
    const resolution = this.timeframeToResolution(timeframe)

    // Determine market type based on exchange naming convention
    const marketType = exchange.toLowerCase().includes('spot')
      ? 'spot'
      : 'futures'

    const params = new URLSearchParams({
      symbol: symbol.toUpperCase(),
      exchange: exchange.toLowerCase().replace('_futures', '').replace('_spot', ''),
      market_type: marketType,
      resolution,
      from: Math.floor(from / 1000).toString(), // Convert ms to seconds
      to: Math.floor(to / 1000).toString()
    })

    const apiKey = import.meta.env.VITE_APP_BACKEND_API_KEY
    if (apiKey) {
      params.set('token', apiKey)
    }

    return `${this.backendUrl}/api/bars?${params.toString()}`
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
    const allBars: Bar[] = []
    const initialPrices: InitialPrices = {}
    const preferQuoteCurrencySize = store.state.settings.preferQuoteCurrencySize

    // Fetch data for each market in parallel
    const fetchPromises = markets.map(async market => {
      const url = this.getBackendApiUrl(from, to, timeframe, market)
      const [exchange, pair] = parseMarket(market)

      try {
        const response = await fetch(url)
        const json: BackendBarsResponse = await response.json()

        if (json.s === 'error') {
          throw new Error(json.errmsg || 'Backend API error')
        }

        if (json.s === 'no_data' || !json.t || json.t.length === 0) {
          return []
        }

        // Transform TradingView UDF arrays to Bar objects
        const bars: Bar[] = []
        for (let i = 0; i < json.t.length; i++) {
          const volume = json.v?.[i] || 0
          const delta = json.d?.[i] || 0

          // Derive buy/sell volumes from total volume and delta
          // delta = vbuy - vsell, volume = vbuy + vsell
          // Therefore: vbuy = (volume + delta) / 2, vsell = (volume - delta) / 2
          let vbuy = (volume + delta) / 2
          let vsell = (volume - delta) / 2

          const close = json.c[i]

          // Convert to base currency if not using quote currency
          if (!preferQuoteCurrencySize && close) {
            vbuy = vbuy / close
            vsell = vsell / close
          }

          const bar: Bar = {
            time: json.t[i], // Already in Unix seconds
            open: json.o[i],
            high: json.h[i],
            low: json.l[i],
            close: close,
            vbuy,
            vsell,
            cbuy: 0, // Trade counts not available from /api/bars
            csell: 0,
            lbuy: 0, // Liquidations not available from /api/bars
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

        return bars
      } catch (err) {
        console.warn(`[historicalService] Failed to fetch ${market} from backend:`, err)
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

      this.promisesOfData[cacheKey] = this.fetchFromBackend(from, to, timeframe, markets)
        .catch(err => {
          // Fallback to legacy API on backend failure
          console.warn('[historicalService] Backend fetch failed, trying legacy API:', err)
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
          // text = error
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

    // base timestamp of results
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
        // new format is array, transform into objet
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
        // pending bar was sent
        if (!lastClosedBars[data[i].market]) {
          // get latest bar for that market
          for (let j = i - 1; j >= 0; j--) {
            if (data[j].market === data[i].market) {
              lastClosedBars[data[i].market] = data[j]
              break
            }
          }
        }

        // format pending bar time floored to timeframe
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
          // store reference bar for this market (either because it didn't exist or because reference bar time is < than pending bar time)
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
