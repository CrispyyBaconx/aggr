import store from '@/store'
import { AggregatorPayload, Ticker } from '@/types/types'
import { randomString } from '@/utils/helpers'
import EventEmitter from 'eventemitter3'

import aggregatorWorkerInstance from '@/worker/index'
import dialogService from './dialogService'
import notificationService from './notificationService'
import {
  countDecimals,
  marketDecimals,
  getStoredProductsOrFetch,
  parseMarket,
  stripStablePair
} from './productsService'
import workspacesService from './workspacesService'

class AggregatorService extends EventEmitter {
  public worker: Worker

  /**
   * Whether to use backend as primary data source
   */
  public useBackendPrimary: boolean = true

  /**
   * Backend connection status
   */
  public backendConnected: boolean = false

  private normalizeDecimalsQueue: {
    timeout?: number
    markets: string[]
  }

  constructor() {
    super()

    this.worker = aggregatorWorkerInstance

    this.worker.addEventListener('message', event => {
      this.emit(event.data.op, event.data.data, event.data.trackingId)
    })

    this.listenUtilityEvents()
    this.listenVisibilityChange()
    this.initializeBackendConfig()
  }

  /**
   * Initialize backend configuration from environment
   */
  initializeBackendConfig() {
    const backendUrl = import.meta.env.VITE_APP_BACKEND_URL
    const backendWsUrl = import.meta.env.VITE_APP_BACKEND_WS_URL
    const backendApiKey = import.meta.env.VITE_APP_BACKEND_API_KEY

    if (backendUrl || backendWsUrl) {
      console.log('[aggregatorService] Backend API configured:', {
        url: backendUrl,
        wsUrl: backendWsUrl,
        hasApiKey: !!backendApiKey
      })

      // Send backend config to worker
      this.dispatch({
        op: 'configureAggregator',
        data: { key: 'backendUrl', value: backendUrl }
      })

      this.dispatch({
        op: 'configureAggregator',
        data: { key: 'backendWsUrl', value: backendWsUrl }
      })

      if (backendApiKey) {
        this.dispatch({
          op: 'configureAggregator',
          data: { key: 'backendApiKey', value: backendApiKey }
        })
      }

      this.dispatch({
        op: 'configureAggregator',
        data: { key: 'useBackendPrimary', value: this.useBackendPrimary }
      })
    }
  }

  /**
   * Set whether to use backend as primary data source
   */
  setUseBackendPrimary(value: boolean) {
    this.useBackendPrimary = value

    this.dispatch({
      op: 'configureAggregator',
      data: { key: 'useBackendPrimary', value }
    })
  }

  /**
   * Check if backend is configured
   */
  isBackendConfigured(): boolean {
    return !!(
      import.meta.env.VITE_APP_BACKEND_URL ||
      import.meta.env.VITE_APP_BACKEND_WS_URL
    )
  }

  listenUtilityEvents() {
    this.once('hello', () => {
      workspacesService.initialize()
    })

    // Listen for backend connection status
    this.on('backendStatus', (status: { connected: boolean }) => {
      this.backendConnected = status.connected
      console.log(
        '[aggregatorService] Backend status:',
        status.connected ? 'connected' : 'disconnected'
      )

      if (!status.connected && this.useBackendPrimary) {
        store.dispatch('app/showNotice', {
          id: 'backend-disconnected',
          type: 'warning',
          title: 'Backend disconnected, using direct exchange connections',
          timeout: 5000
        })
      }
    })

    this.on('error', async event => {
      if (
        !event.wasErrored ||
        event.wasOpened ||
        dialogService.isDialogOpened('connection-issue')
      ) {
        return
      }

      if (
        notificationService.hasDismissed(event.exchangeId + event.originalUrl)
      ) {
        return
      }

      // Don't show connection issue dialog for backend exchange
      if (event.exchangeId === 'BACKEND') {
        console.warn(
          '[aggregatorService] Backend connection failed, falling back to direct exchanges'
        )
        return
      }

      store.dispatch('app/showNotice', {
        id: `ws-error-${event.originalUrl}`,
        type: 'error',
        title: `unable to reach ${event.exchangeId} (${event.originalUrl})`,
        action: async () => {
          const payload = await dialogService.openAsPromise(
            (await import('@/components/ConnectionIssueDialog.vue')).default,
            {
              exchangeId: event.exchangeId,
              restrictedUrl: event.originalUrl
            },
            'connection-issue'
          )

          if (typeof payload === 'string') {
            store.commit('settings/SET_WS_PROXY_URL', payload)
            await store.dispatch('exchanges/disconnect', event.exchangeId)
            await store.dispatch('exchanges/connect', event.exchangeId)
          }
        }
      })
    })

    this.on('price', ({ market, price }: { market: string; price: number }) => {
      marketDecimals[market] = countDecimals(
        price < 0.000001 ? price + 1 : price
      )

      if (!this.normalizeDecimalsQueue) {
        this.normalizeDecimalsQueue = {
          markets: []
        }
      }

      const product = store.state.panes?.marketsListeners?.[market]

      if (product) {
        if (this.normalizeDecimalsQueue.timeout) {
          clearTimeout(this.normalizeDecimalsQueue.timeout)
        }

        if (this.normalizeDecimalsQueue.markets.indexOf(product.local) === -1) {
          this.normalizeDecimalsQueue.markets.push(
            stripStablePair(product.local)
          )
        }

        this.normalizeDecimalsQueue.timeout = setTimeout(
          this.normalizeDecimals.bind(this),
          1000
        ) as unknown as number
      }
    })

    this.on(
      'getExchangeProducts',
      async (
        {
          exchangeId,
          endpoints,
          forceFetch
        }: { exchangeId: string; endpoints: string[]; forceFetch?: boolean },
        trackingId: string
      ) => {
        console.debug(
          `[${exchangeId}] aggregator requested ${exchangeId}'s products (${
            forceFetch ? 'force fetch products' : 'get stored or fetch'
          })`
        )

        // For BACKEND exchange, fetch from /api/tickers
        if (exchangeId === 'BACKEND') {
          const productsData = await this.fetchBackendProducts()
          this.dispatch({
            op: 'getExchangeProducts',
            data: {
              exchangeId,
              data: productsData
            },
            trackingId
          })
          return
        }

        const productsData = await getStoredProductsOrFetch(
          exchangeId,
          endpoints,
          forceFetch
        )

        this.dispatch({
          op: 'getExchangeProducts',
          data: {
            exchangeId,
            data: productsData
          },
          trackingId
        })
      }
    )
  }

  /**
   * Fetch available products from backend /api/tickers
   */
  async fetchBackendProducts(): Promise<{ products: string[] }> {
    const backendUrl = import.meta.env.VITE_APP_BACKEND_URL
    if (!backendUrl) {
      return { products: [] }
    }

    try {
      const apiKey = import.meta.env.VITE_APP_BACKEND_API_KEY
      const url = apiKey
        ? `${backendUrl}/api/tickers?token=${apiKey}`
        : `${backendUrl}/api/tickers`

      const response = await fetch(url)
      const data = await response.json()

      if (!data.tickers) {
        return { products: [] }
      }

      // Extract unique symbols from tickers
      const products: string[] = []
      for (const ticker of data.tickers) {
        const symbol = ticker.symbol?.toLowerCase()
        if (symbol && products.indexOf(symbol) === -1) {
          products.push(symbol)
        }
      }

      console.log(
        `[aggregatorService] Fetched ${products.length} products from backend`
      )

      // Store historical markets for chart backfill
      store.commit(
        'app/SET_HISTORICAL_MARKETS',
        data.tickers.map((t: any) => `BACKEND:${t.symbol?.toLowerCase()}`)
      )

      return { products }
    } catch (err) {
      console.error(
        '[aggregatorService] Failed to fetch backend products:',
        err
      )
      return { products: [] }
    }
  }

  dispatch(payload: AggregatorPayload) {
    this.worker.postMessage(payload)
  }

  dispatchAsync(payload: AggregatorPayload) {
    const trackingId = randomString(8)

    return new Promise(resolve => {
      const listener = ({ data }: { data: AggregatorPayload }) => {
        if (data.trackingId === payload.trackingId) {
          this.worker.removeEventListener('message', listener)
          resolve(data.data)
        }
      }

      this.worker.addEventListener('message', listener)

      payload.trackingId = trackingId

      this.worker.postMessage(payload)
    })
  }

  async connect(markets: string[]): Promise<any> {
    if (!markets.length) {
      return
    }

    for (let i = 0; i < markets.length; i++) {
      const [exchange] = parseMarket(markets[i])

      if (
        store.state.exchanges[exchange] &&
        store.state.exchanges[exchange].disabled
      ) {
        const panes = []
        for (const paneId in store.state.panes.panes) {
          if (
            store.state.panes.panes[paneId].markets.indexOf(markets[i]) !== -1
          ) {
            panes.push(paneId)
          }
        }

        markets.splice(i, 1)
        i--
      }
    }

    await this.dispatchAsync({
      op: 'connect',
      data: markets
    })
  }

  async disconnect(markets: string[]): Promise<any> {
    if (!markets.length) {
      return
    }

    await this.dispatchAsync({
      op: 'disconnect',
      data: markets
    })
  }

  getAllTickers(): Promise<Ticker[]> {
    return this.dispatchAsync({
      op: 'getAllTickers'
    }) as Promise<Ticker[]>
  }

  getTicker(market: string): Promise<Ticker | null> {
    return this.dispatchAsync({
      op: 'getTicker',
      data: market
    }) as Promise<Ticker | null>
  }

  normalizeDecimals() {
    this.normalizeDecimalsQueue.timeout = null

    const marketsListeners = store.state.panes?.marketsListeners
    if (!marketsListeners) {
      this.normalizeDecimalsQueue = null
      return
    }

    const decimalsByLocalMarkets: {
      [localPair: string]: { [market: string]: number }
    } = {}

    for (const market in marketDecimals) {
      if (!marketsListeners[market]) {
        continue
      }

      const localPair = stripStablePair(marketsListeners[market].local)

      if (this.normalizeDecimalsQueue.markets.indexOf(localPair) === -1) {
        continue
      }

      if (!decimalsByLocalMarkets[localPair]) {
        decimalsByLocalMarkets[localPair] = {}
      }

      decimalsByLocalMarkets[localPair][market] = marketDecimals[market]
    }

    for (const localPair in decimalsByLocalMarkets) {
      const decimals = Object.values(decimalsByLocalMarkets[localPair])
      marketDecimals[localPair] = Math.round(
        decimals.reduce((a, b) => a + b) / decimals.length
      )

      for (const market in decimalsByLocalMarkets[localPair]) {
        marketDecimals[market] = marketDecimals[localPair]
      }
    }

    this.emit('decimals', this.normalizeDecimalsQueue.markets)

    this.normalizeDecimalsQueue = null
  }

  listenVisibilityChange() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.worker.postMessage({ op: 'clearReconnectionTimeout' })
      }
    })
  }
}

export default new AggregatorService()
