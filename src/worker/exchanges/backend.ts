import Exchange from '../exchange'
import settings from '../settings'

/**
 * Backend exchange adapter
 * Connects to your custom backend WebSocket API for aggregated bar data
 * Can handle markets from ANY exchange by proxying through the backend
 */
export default class Backend extends Exchange {
  id = 'BACKEND'
  private subscriptionId = 0
  private subscriptions: Map<
    string,
    { pattern: string; originalExchange: string; originalPair?: string }
  > = new Map()
  protected maxConnectionsPerApi = 1000 // Single connection handles all symbols
  protected delayBetweenMessages = 0

  // Cache of available tickers from backend: "exchange:symbol" -> ticker data
  private availableTickers: Map<string, { symbol: string; exchange: string }> =
    new Map()
  private tickersFetched = false

  // Primary exchange for price (others contribute volume only)
  private primaryExchange = 'binance'
  // Last known price from primary exchange per symbol: "BTCUSDT" -> price
  private primaryPrices: Map<string, number> = new Map()

  protected endpoints = {
    PRODUCTS: [] // Products fetched from /api/tickers
  }

  constructor() {
    super()
  }

  /**
   * Get API key from settings (read dynamically to ensure it's configured)
   */
  private getApiKey(): string {
    return settings.backendApiKey || ''
  }

  /**
   * Fetch available tickers from backend and cache them
   */
  async fetchAvailableTickers(): Promise<void> {
    if (this.tickersFetched) return

    // Try backendUrl first, fall back to deriving from backendWsUrl
    let backendUrl = settings.backendUrl
    if (!backendUrl && settings.backendWsUrl) {
      backendUrl = settings.backendWsUrl
        .replace('wss://', 'https://')
        .replace('ws://', 'http://')
        .replace('/ws', '')
    }

    const apiKey = this.getApiKey()
    if (!backendUrl) {
      console.warn(`[${this.id}] No backend URL configured for ticker fetch`)
      return
    }

    try {
      const url = `${backendUrl}/api/tickers${apiKey ? `?token=${apiKey}` : ''}`
      console.debug(`[${this.id}] Fetching available tickers`)

      const response = await fetch(url)
      if (!response.ok) {
        console.warn(`[${this.id}] Failed to fetch tickers: ${response.status}`)
        return
      }

      const data = await response.json()
      if (data.tickers && Array.isArray(data.tickers)) {
        this.availableTickers.clear()

        for (const ticker of data.tickers) {
          const key = `${ticker.exchange}:${ticker.symbol}`.toLowerCase()
          this.availableTickers.set(key, {
            symbol: ticker.symbol,
            exchange: ticker.exchange
          })
        }

        console.debug(
          `[${this.id}] Cached ${this.availableTickers.size} available tickers`
        )
        this.tickersFetched = true
      }
    } catch (err) {
      console.error(`[${this.id}] Error fetching tickers:`, err)
    }
  }

  /**
   * Find matching backend ticker for a given exchange:pair
   * Returns { exchange, symbol } if found, null if not available
   */
  private findBackendTicker(
    exchangeId: string,
    pair: string
  ): { exchange: string; symbol: string } | null {
    const normalizedExchange = this.normalizeExchange(exchangeId)
    const normalizedPair = pair.toUpperCase()

    // Try exact match first
    const exactKey = `${normalizedExchange}:${normalizedPair}`.toLowerCase()
    if (this.availableTickers.has(exactKey)) {
      return this.availableTickers.get(exactKey)!
    }

    // Try common transformations for perpetuals
    // btcusd_perp -> BTCUSDT, btcusdt -> BTCUSDT
    const transformations = [
      normalizedPair, // BTCUSD_PERP
      normalizedPair.replace('_PERP', ''), // BTCUSD
      normalizedPair.replace('USD_PERP', 'USDT'), // BTCUSDT
      normalizedPair.replace('USD', 'USDT'), // BTCUSDT (from BTCUSD)
      normalizedPair.replace(/-/g, ''), // BTCUSD (from BTC-USD)
      normalizedPair.replace(/-PERP/g, ''), // BTC (from BTC-PERP)
      normalizedPair.split('-')[0] // BTC (from BTC-PERPETUAL)
    ]

    for (const transformed of transformations) {
      const key = `${normalizedExchange}:${transformed}`.toLowerCase()
      if (this.availableTickers.has(key)) {
        return this.availableTickers.get(key)!
      }
    }

    // For hyperliquid, symbols might just be "BTC" not "BTCUSDT"
    if (normalizedExchange === 'hyperliquid') {
      const baseAsset = normalizedPair
        .replace('USDT', '')
        .replace('USD', '')
        .replace('_PERP', '')
        .replace('-PERPETUAL', '')
      const key = `hyperliquid:${baseAsset}`.toLowerCase()
      if (this.availableTickers.has(key)) {
        return this.availableTickers.get(key)!
      }
    }

    return null
  }

  /**
   * Check if a market is available on the backend
   */
  async isAvailable(exchangeId: string, pair: string): Promise<boolean> {
    await this.fetchAvailableTickers()
    return this.findBackendTicker(exchangeId, pair) !== null
  }

  async getUrl(): Promise<string> {
    return settings.backendWsUrl || ''
  }

  /**
   * Check if backend is configured and should be used as primary
   */
  isConfigured(): boolean {
    return !!settings.backendWsUrl && settings.useBackendPrimary !== false
  }

  /**
   * Override isMatching - Backend can handle any symbol when configured as primary
   */
  isMatching(pair: string): boolean {
    // Backend is permissive - it will try to handle any symbol
    // The backend server will reject unknown symbols
    return true
  }

  /**
   * Convert exchange ID to backend format
   * BINANCE_FUTURES -> binance, BYBIT -> bybit, etc.
   */
  private normalizeExchange(exchangeId: string): string {
    return exchangeId
      .toLowerCase()
      .replace('_futures', '')
      .replace('_spot', '')
      .replace('_us', '')
  }

  /**
   * Determine market type from exchange ID
   */
  private getMarketType(exchangeId: string): string {
    const id = exchangeId.toUpperCase()
    if (
      id.includes('FUTURES') ||
      id === 'BITMEX' ||
      id === 'DYDX' ||
      id === 'HYPERLIQUID'
    ) {
      return 'futures'
    }
    if (id.includes('SPOT')) {
      return 'spot'
    }
    // Default to futures for perp exchanges
    if (['BYBIT', 'BITGET', 'OKEX', 'PHEMEX', 'KUCOIN'].includes(id)) {
      return 'futures'
    }
    return 'spot'
  }

  /**
   * Format products from /api/tickers response
   */
  formatProducts(data: any): string[] {
    if (!data || !data.tickers) {
      return []
    }

    const products: string[] = []

    for (const ticker of data.tickers) {
      const symbol = ticker.symbol?.toLowerCase()
      if (symbol && products.indexOf(symbol) === -1) {
        products.push(symbol)
      }
    }

    return products
  }

  /**
   * Create WebSocket connection with authentication
   */
  createWs(url: string, pair: string) {
    // Read API key dynamically (settings may not be configured at constructor time)
    const apiKey = this.getApiKey()

    console.debug(`[${this.id}] Creating WebSocket connection`)

    // Create WebSocket without protocol header (use message auth instead)
    const api = new WebSocket(url) as any

    api._id = Math.random().toString(36).substring(7)
    api.binaryType = 'arraybuffer'
    api._connected = []
    api._pending = []
    api._authenticated = false
    api._authCallback = null as (() => void) | null

    this.apis.push(api)

    api.onmessage = (event: MessageEvent) => {
      this.count++

      // Check for auth response before normal message handling
      try {
        const text =
          typeof event.data === 'string'
            ? event.data
            : new TextDecoder().decode(event.data)
        const json = JSON.parse(text)

        // Handle auth response
        if (json.cmd === 'auth' || (json.ok !== undefined && !json.pattern)) {
          if (json.ok) {
            console.debug(`[${this.id}] Authenticated`)
            api._authenticated = true
            if (api._authCallback) {
              api._authCallback()
              api._authCallback = null
            }
          } else {
            console.error(`[${this.id}] Authentication failed:`, json.msg)
          }
          return
        }
      } catch {
        // Not JSON or not auth response, continue with normal handling
      }

      if (this.onMessage(event, api) === true) {
        api._timestamp = Date.now()
      }
    }

    api.onopen = () => {
      api._wasOpened = true
      console.debug(`[${this.id}] Connected`)

      const authKey = this.getApiKey()
      if (authKey) {
        console.debug(`[${this.id}] Authenticating`)
        api.send(JSON.stringify({ cmd: 'auth', token: authKey }))

        // Wait for auth acknowledgment before subscribing
        api._authCallback = () => {
          this.startKeepAlive(api, JSON.stringify({ cmd: 'ping' }), 30000)
          this.subscribePendingPairs(api)
          this.emit('open', api._connected)
        }

        // Timeout fallback in case auth response is never received
        setTimeout(() => {
          if (!api._authenticated && api._authCallback) {
            console.warn(
              `[${this.id}] Auth timeout - proceeding without confirmation`
            )
            api._authCallback()
            api._authCallback = null
          }
        }, 2000)
      } else {
        this.startKeepAlive(api, JSON.stringify({ cmd: 'ping' }), 30000)
        this.subscribePendingPairs(api)
        this.emit('open', api._connected)
      }
    }

    api.onclose = (event: CloseEvent) => {
      console.debug(`[${this.id}] Disconnected:`, event.code)
      this.stopKeepAlive(api)

      const pairsToReconnect = [...api._pending, ...api._connected]
      if (pairsToReconnect.length) {
        setTimeout(() => {
          this.reconnectApi(api)
        }, this.getTimeoutDelay(api.url))
      } else {
        this.removeWs(api)
      }
    }

    api.onerror = (error: Event) => {
      console.error(`[${this.id}] WebSocket error:`, error)
      api._errored = true
      this.emit('error', error)
    }

    return api
  }

  /**
   * Subscribe to a market
   * Handles both BACKEND:SYMBOL and EXCHANGE:SYMBOL formats
   * @param api WebSocket API
   * @param pair The pair in format "symbol" (exchange prefix already stripped)
   * @param originalExchange Optional - the original exchange ID if proxying
   */
  async subscribe(
    api: any,
    pair: string,
    originalExchange?: string
  ): Promise<boolean> {
    if (!(await super.subscribe(api, pair))) {
      return false
    }

    // Build subscription pattern for ticks (individual trades)
    // Ticks pattern: ticks.{exchange}.{symbol}
    let pattern: string
    let exchange: string

    if (originalExchange && originalExchange !== 'BACKEND') {
      exchange = this.normalizeExchange(originalExchange)
      pattern = `ticks.${exchange}.${pair.toUpperCase()}`
    } else {
      // Subscribe to all exchanges for this symbol
      pattern = `ticks.*.${pair.toUpperCase()}`
      exchange = '*'
    }

    this.subscriptions.set(pair, {
      pattern,
      originalExchange: originalExchange || 'BACKEND'
    })

    api.send(
      JSON.stringify({
        cmd: 'subscribe',
        pattern
      })
    )

    console.debug(`[${this.id}] Subscribed to ${pattern} for ${pair}`)

    return true
  }

  /**
   * Unsubscribe from a pair
   */
  async unsubscribe(api: any, pair: string): Promise<boolean> {
    if (!(await super.unsubscribe(api, pair))) {
      return false
    }

    const sub = this.subscriptions.get(pair)
    if (sub) {
      api.send(
        JSON.stringify({
          cmd: 'unsubscribe',
          pattern: sub.pattern
        })
      )
      this.subscriptions.delete(pair)
      console.debug(`[${this.id}] Unsubscribed from ${sub.pattern}`)
    }

    return true
  }

  /**
   * Handle incoming WebSocket message
   */
  onMessage(event: MessageEvent, api: any): boolean {
    let json: any

    try {
      if (typeof event.data === 'string') {
        json = JSON.parse(event.data)
      } else {
        const text = new TextDecoder().decode(event.data)
        json = JSON.parse(text)
      }
    } catch (err) {
      console.error(`[${this.id}] Failed to parse message:`, err)
      return false
    }

    if (!json || !json.subject) {
      return false
    }

    const subject = json.subject as string
    const data = json.data

    // Handle tick messages (individual trades)
    if (subject.startsWith('ticks.')) {
      return this.handleTickMessage(subject, data, api)
    }

    // Handle bar messages (1-second aggregates, fallback)
    if (subject.startsWith('bars.')) {
      return this.handleBarMessage(subject, data, api)
    }

    return false
  }

  /**
   * Handle tick message from backend - individual trade
   * Format: ticks.{exchange}.{symbol}
   * Data: { timestamp, exchange, market_type, symbol, price, quantity, side, is_liquidation }
   */
  private handleTickMessage(subject: string, data: any, api: any): boolean {
    if (!data) return false

    // Extract from subject: ticks.{exchange}.{symbol}
    const parts = subject.split('.')
    if (parts.length < 3) return false

    const exchange = parts[1]
    const symbol = parts[2]
    const trackingKey = `${exchange}:${symbol}`.toLowerCase()

    // Find the subscription for this symbol
    let sub = this.subscriptions.get(trackingKey)
    if (!sub) {
      sub = this.subscriptions.get(symbol.toLowerCase())
      if (!sub && api._connected.indexOf(trackingKey) === -1) {
        // Debug: show what we're looking for
        console.debug(
          `[${this.id}] No subscription for tick: trackingKey=${trackingKey}, ` +
            `subscriptions=[${Array.from(this.subscriptions.keys()).join(', ')}], ` +
            `connected=[${api._connected.join(', ')}]`
        )
        return false
      }
    }

    // Parse timestamp
    let timestamp: number
    if (typeof data.timestamp === 'number') {
      timestamp =
        data.timestamp < 10000000000 ? data.timestamp * 1000 : data.timestamp
    } else if (typeof data.timestamp === 'string') {
      timestamp = new Date(data.timestamp).getTime()
    } else {
      timestamp = Date.now()
    }

    // Determine exchange to report as (use original if proxying)
    const reportExchange = sub?.originalExchange || this.id
    const reportPair = sub?.originalPair || symbol

    // Primary exchange price handling:
    // - Primary exchange (binance) ticks update the reference price AND use their own price
    // - Other exchanges use the primary price for OHLC but contribute their own volume
    const isPrimaryExchange = exchange.toLowerCase() === this.primaryExchange
    const symbolKey = symbol.toUpperCase()
    let priceForOHLC = data.price

    if (isPrimaryExchange) {
      // Update primary price reference
      this.primaryPrices.set(symbolKey, data.price)
    } else {
      // Use primary exchange price if available, otherwise use own price
      const primaryPrice = this.primaryPrices.get(symbolKey)
      if (primaryPrice !== undefined) {
        priceForOHLC = primaryPrice
      }
    }

    // Handle liquidation
    if (data.is_liquidation) {
      this.emitLiquidations(api._id, [
        {
          exchange: reportExchange,
          pair: reportPair,
          timestamp,
          price: priceForOHLC,
          size: data.quantity,
          side: data.side,
          liquidation: true
        }
      ])
      return true
    }

    // Emit as individual trade
    // Price uses primary exchange for consistent OHLC, volume uses actual trade size
    this.emitTrades(api._id, [
      {
        exchange: reportExchange,
        pair: reportPair,
        timestamp,
        price: priceForOHLC,
        size: data.quantity,
        side: data.side
      }
    ])

    return true
  }

  /**
   * Handle bar message from backend
   * Converts bar data to trade events for the aggregator
   */
  private handleBarMessage(subject: string, data: any, api: any): boolean {
    if (!data) return false

    // Extract symbol from subject: bars.{exchange}.{market_type}.{symbol}
    // e.g. bars.binance.futures.BTCUSDT -> BTCUSDT
    const parts = subject.split('.')
    const symbol =
      parts.length >= 4 ? parts[3].toLowerCase() : data.symbol?.toLowerCase()
    if (!symbol) return false

    // Build tracking key from exchange and symbol (how we stored subscriptions)
    const exchange = data.exchange || parts[1]
    const trackingKey = `${exchange}:${symbol}`.toLowerCase()

    // Find the subscription for this symbol (using tracking key format)
    let sub = this.subscriptions.get(trackingKey)
    if (!sub) {
      // Also try with just the symbol
      sub = this.subscriptions.get(symbol)
      if (!sub && api._connected.indexOf(trackingKey) === -1) {
        console.debug(`[${this.id}] No subscription found for ${trackingKey}`)
        return false
      }
    }

    // Get timestamp
    let timestamp: number
    if (typeof data.timestamp === 'number') {
      // If it's a Unix timestamp in seconds, convert to milliseconds
      timestamp =
        data.timestamp < 10000000000 ? data.timestamp * 1000 : data.timestamp
    } else if (typeof data.timestamp === 'string') {
      timestamp = new Date(data.timestamp).getTime()
    } else {
      timestamp = Date.now()
    }

    // Determine the exchange to report as
    // Use the original exchange if we're proxying, otherwise use BACKEND
    const reportExchange = sub?.originalExchange || this.id

    // Use original pair if available, otherwise use the symbol from the message
    // IMPORTANT: Keep original case as the aggregator tracks markets with exact case
    const reportPair = sub?.originalPair || symbol

    const trades = []

    // Emit buy volume as a buy trade
    if (data.buy_volume > 0) {
      trades.push({
        exchange: reportExchange,
        pair: reportPair,
        timestamp,
        price: data.close,
        size: data.buy_volume,
        side: 'buy',
        count: Math.ceil(data.trade_count / 2) || 1
      })
    }

    // Emit sell volume as a sell trade
    if (data.sell_volume > 0) {
      trades.push({
        exchange: reportExchange,
        pair: reportPair,
        timestamp,
        price: data.close,
        size: data.sell_volume,
        side: 'sell',
        count: Math.floor(data.trade_count / 2) || 1
      })
    }

    // If no buy/sell breakdown, derive from volume and delta
    if (trades.length === 0 && data.volume > 0) {
      const delta = data.delta || 0
      const buyVol = (data.volume + delta) / 2
      const sellVol = (data.volume - delta) / 2

      if (buyVol > 0) {
        trades.push({
          exchange: reportExchange,
          pair: reportPair,
          timestamp,
          price: data.close,
          size: buyVol,
          side: 'buy',
          count: 1
        })
      }

      if (sellVol > 0) {
        trades.push({
          exchange: reportExchange,
          pair: reportPair,
          timestamp,
          price: data.close,
          size: sellVol,
          side: 'sell',
          count: 1
        })
      }
    }

    if (trades.length > 0) {
      this.emitTrades(api._id, trades)
    }

    // Handle liquidations
    const liquidations = []

    if (data.liq_long && data.liq_long > 0) {
      liquidations.push({
        exchange: reportExchange,
        pair: reportPair,
        timestamp,
        price: data.close,
        size: data.liq_long,
        side: 'sell',
        liquidation: true
      })
    }

    if (data.liq_short && data.liq_short > 0) {
      liquidations.push({
        exchange: reportExchange,
        pair: reportPair,
        timestamp,
        price: data.close,
        size: data.liq_short,
        side: 'buy',
        liquidation: true
      })
    }

    if (liquidations.length > 0) {
      this.emitLiquidations(api._id, liquidations)
    }

    return true
  }

  // Singleton connection for backend
  private sharedApi: any = null
  private connectionPromise: Promise<any> | null = null

  /**
   * Get or create the shared backend WebSocket connection
   */
  private async getSharedConnection(): Promise<any> {
    const url = await this.getUrl()
    if (!url) return null

    // If we already have an open connection, reuse it
    if (this.sharedApi && this.sharedApi.readyState === WebSocket.OPEN) {
      return this.sharedApi
    }

    // If connection is in progress, wait for it
    if (this.connectionPromise) {
      return this.connectionPromise
    }

    // Create new connection
    this.connectionPromise = new Promise((resolve, reject) => {
      const api = this.createWs(url, '')
      this.sharedApi = api

      // Wait for connection and auth to complete
      const waitForAuth = () => {
        if (api._authenticated) {
          this.connectionPromise = null
          resolve(api)
        } else if (api.readyState === WebSocket.CLOSED) {
          this.connectionPromise = null
          reject(new Error('WebSocket closed before auth'))
        } else {
          setTimeout(waitForAuth, 50)
        }
      }

      const onOpen = () => {
        api.removeEventListener('open', onOpen)
        api.removeEventListener('error', onError)
        // Start waiting for auth to complete
        waitForAuth()
      }

      const onError = (err: any) => {
        api.removeEventListener('open', onOpen)
        api.removeEventListener('error', onError)
        this.connectionPromise = null
        reject(err)
      }

      api.addEventListener('open', onOpen)
      api.addEventListener('error', onError)

      // Overall timeout
      setTimeout(() => {
        if (this.connectionPromise) {
          this.connectionPromise = null
          if (!api._authenticated) {
            console.warn(`[${this.id}] Connection/auth timeout`)
            // Still resolve with the api to allow fallback behavior
            resolve(api)
          }
        }
      }, 5000)
    })

    return this.connectionPromise
  }

  /**
   * Subscribe on behalf of another exchange
   * Called by aggregator when backend is primary
   * This makes the Backend appear as if it's the original exchange
   */
  async linkProxied(market: string): Promise<boolean> {
    const [originalExchange, pair] = market.split(':')
    if (!pair) return false

    // Fetch available tickers first
    await this.fetchAvailableTickers()

    // Find the matching backend ticker
    const backendTicker = this.findBackendTicker(originalExchange, pair)
    if (!backendTicker) {
      return false // Return false so aggregator falls back to direct connection
    }

    // Use the backend ticker key for tracking
    const trackingKey =
      `${backendTicker.exchange}:${backendTicker.symbol}`.toLowerCase()

    // Get or create shared connection
    const api = await this.getSharedConnection()
    if (!api) return false

    // Check if already subscribed
    if (
      api._pending.indexOf(trackingKey) !== -1 ||
      api._connected.indexOf(trackingKey) !== -1
    ) {
      return true
    }

    // Subscribe directly since connection is ready
    await this.subscribeProxied(
      api,
      trackingKey,
      originalExchange,
      pair,
      backendTicker
    )

    return true
  }

  /**
   * Subscribe to backend with original exchange context
   */
  async subscribeProxied(
    api: any,
    trackingKey: string,
    originalExchange: string,
    originalPair: string,
    backendTicker: { exchange: string; symbol: string }
  ): Promise<boolean> {
    // Move from pending to connected
    const pendingIndex = api._pending.indexOf(trackingKey)
    if (pendingIndex !== -1) {
      api._pending.splice(pendingIndex, 1)
    }

    if (api._connected.indexOf(trackingKey) === -1) {
      api._connected.push(trackingKey)
    }

    // Subscribe to ticks (individual trades) - format: ticks.{exchange}.{symbol}
    const pattern = `ticks.${backendTicker.exchange}.${backendTicker.symbol}`

    this.subscriptions.set(trackingKey, {
      pattern,
      originalExchange,
      originalPair // Store original pair for emitting back
    } as any)

    api.send(
      JSON.stringify({
        cmd: 'subscribe',
        pattern
      })
    )

    console.debug(`[${this.id}] Subscribed to ${pattern}`)

    // Emit subscribed event with ORIGINAL exchange so aggregator tracks it correctly
    this.emit(
      'subscribed',
      originalExchange,
      originalPair.toLowerCase(),
      api.url
    )

    return true
  }

  /**
   * Override subscribePendingPairs to handle proxied subscriptions
   * Note: This is mainly for direct Backend connections, not proxied ones
   */
  async subscribePendingPairs(api: any) {
    const pairsToConnect = api._pending.slice()

    for (const pair of pairsToConnect) {
      // For pending pairs, just use standard subscribe
      await this.subscribe(api, pair)
    }
  }
}
