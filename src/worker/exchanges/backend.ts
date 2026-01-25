import Exchange from '../exchange'
import settings from '../settings'

/**
 * Backend exchange adapter
 * Connects to your custom backend WebSocket API for aggregated bar data
 * Acts as a "meta-exchange" that receives pre-aggregated data
 */
export default class Backend extends Exchange {
  id = 'BACKEND'
  private subscriptionId = 0
  private subscriptions: Map<string, number> = new Map()
  private apiKey: string
  protected maxConnectionsPerApi = 1000 // Single connection handles all symbols
  protected delayBetweenMessages = 0

  protected endpoints = {
    PRODUCTS: [] // Products fetched from /api/tickers
  }

  constructor() {
    super()
    this.apiKey = settings.backendApiKey || ''
  }

  async getUrl(): Promise<string> {
    return settings.backendWsUrl || ''
  }

  /**
   * Check if backend is configured
   */
  isConfigured(): boolean {
    return !!settings.backendWsUrl
  }

  /**
   * Override isMatching to be more permissive
   * Backend can handle any symbol that exists in the backend
   */
  isMatching(pair: string): boolean {
    // If products are loaded, check against them
    if (this.products && this.products.length > 0) {
      return this.products.indexOf(pair.toLowerCase()) !== -1
    }

    // If no products loaded yet, assume it can match
    // The backend will reject unknown symbols
    return true
  }

  /**
   * Format products from /api/tickers response
   */
  formatProducts(data: any): string[] {
    if (!data || !data.tickers) {
      return []
    }

    // Extract unique symbols from tickers
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
    // Override to use Sec-WebSocket-Protocol for auth
    const protocols = this.apiKey ? [this.apiKey] : undefined
    const api = new WebSocket(url, protocols) as any

    api._id = Math.random().toString(36).substring(7)
    api.binaryType = 'arraybuffer'
    api._connected = []
    api._pending = []

    this.apis.push(api)

    api.onmessage = (event: MessageEvent) => {
      this.count++
      if (this.onMessage(event, api) === true) {
        api._timestamp = Date.now()
      }
    }

    api.onopen = () => {
      api._wasOpened = true
      console.log(`[${this.id}] Connected to backend WebSocket`)

      // Start keepalive ping
      this.startKeepAlive(api, { cmd: 'ping' }, 30000)

      // Subscribe to pending pairs
      this.subscribePendingPairs(api)

      this.emit('open', api._connected)
    }

    api.onclose = (event: CloseEvent) => {
      console.log(`[${this.id}] WebSocket closed:`, event.code, event.reason)
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
   * Subscribe to a pair
   */
  async subscribe(api: any, pair: string): Promise<boolean> {
    if (!(await super.subscribe(api, pair))) {
      return false
    }

    const subId = ++this.subscriptionId
    this.subscriptions.set(pair, subId)

    // Subscribe to 1-second bars for this symbol
    // Format: bars.{exchange}.{market_type}.{symbol}
    // We'll subscribe to futures by default, can be made configurable
    const pattern = `bars.*.futures.${pair}`

    api.send(
      JSON.stringify({
        cmd: 'subscribe',
        pattern
      })
    )

    console.debug(`[${this.id}] Subscribed to ${pattern}`)

    return true
  }

  /**
   * Unsubscribe from a pair
   */
  async unsubscribe(api: any, pair: string): Promise<boolean> {
    if (!(await super.unsubscribe(api, pair))) {
      return false
    }

    const pattern = `bars.*.futures.${pair}`

    api.send(
      JSON.stringify({
        cmd: 'unsubscribe',
        pattern
      })
    )

    this.subscriptions.delete(pair)

    console.debug(`[${this.id}] Unsubscribed from ${pattern}`)

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
        // Handle binary data if needed
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

    // Parse subject to determine message type
    const subject = json.subject as string
    const data = json.data

    if (subject.startsWith('bars.')) {
      return this.handleBarMessage(subject, data, api)
    }

    return false
  }

  /**
   * Handle bar message from backend
   * Converts bar data to trade events for the aggregator
   */
  private handleBarMessage(subject: string, data: any, api: any): boolean {
    if (!data) return false

    const symbol = data.symbol?.toLowerCase()
    if (!symbol) return false

    // Check if we're subscribed to this symbol
    if (!this.subscriptions.has(symbol) && api._connected.indexOf(symbol) === -1) {
      return false
    }

    const timestamp = typeof data.timestamp === 'string'
      ? new Date(data.timestamp).getTime()
      : data.timestamp

    // Convert bar data to trades
    // The backend provides aggregated data, so we emit synthetic trades
    const trades = []

    // Emit buy volume as a buy trade
    if (data.buy_volume > 0) {
      trades.push({
        exchange: this.id,
        pair: symbol,
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
        exchange: this.id,
        pair: symbol,
        timestamp,
        price: data.close,
        size: data.sell_volume,
        side: 'sell',
        count: Math.floor(data.trade_count / 2) || 1
      })
    }

    // If no buy/sell breakdown, emit total volume
    if (trades.length === 0 && data.volume > 0) {
      const delta = data.delta || 0
      const buyVol = (data.volume + delta) / 2
      const sellVol = (data.volume - delta) / 2

      if (buyVol > 0) {
        trades.push({
          exchange: this.id,
          pair: symbol,
          timestamp,
          price: data.close,
          size: buyVol,
          side: 'buy',
          count: 1
        })
      }

      if (sellVol > 0) {
        trades.push({
          exchange: this.id,
          pair: symbol,
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
        exchange: this.id,
        pair: symbol,
        timestamp,
        price: data.close,
        size: data.liq_long,
        side: 'sell', // Long liquidations are sells
        liquidation: true
      })
    }

    if (data.liq_short && data.liq_short > 0) {
      liquidations.push({
        exchange: this.id,
        pair: symbol,
        timestamp,
        price: data.close,
        size: data.liq_short,
        side: 'buy', // Short liquidations are buys
        liquidation: true
      })
    }

    if (liquidations.length > 0) {
      this.emitLiquidations(api._id, liquidations)
    }

    return true
  }
}
