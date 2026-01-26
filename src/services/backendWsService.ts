import EventEmitter from 'eventemitter3'

/**
 * Bar data from backend WebSocket
 */
export interface BackendBar {
  timestamp: number
  exchange: string
  market_type: 'futures' | 'spot'
  symbol: string
  interval?: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  buy_volume: number
  sell_volume: number
  delta: number
  oi: number
  oi_change?: number
  trade_count: number
  liq_long?: number
  liq_short?: number
  complete?: boolean
}

/**
 * WebSocket message from backend
 */
interface BackendWsMessage {
  subject: string
  data: BackendBar | any
}

/**
 * Subscription pattern info
 */
interface Subscription {
  pattern: string
  markets: Set<string>
}

class BackendWsService extends EventEmitter {
  private ws: WebSocket | null = null
  private wsUrl: string
  private apiKey: string
  private subscriptions: Map<string, Subscription> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000
  private reconnectTimeout: number | null = null
  private pingInterval: number | null = null
  private isConnecting = false
  private messageQueue: string[] = []

  constructor() {
    super()
    this.wsUrl = import.meta.env.VITE_APP_BACKEND_WS_URL || ''
    this.apiKey = import.meta.env.VITE_APP_BACKEND_API_KEY || ''
  }

  /**
   * Check if backend WebSocket is configured
   */
  isConfigured(): boolean {
    return !!this.wsUrl
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * Connect to backend WebSocket
   */
  connect(): Promise<void> {
    if (!this.wsUrl) {
      return Promise.reject(new Error('Backend WebSocket URL not configured'))
    }

    if (this.isConnected()) {
      return Promise.resolve()
    }

    if (this.isConnecting) {
      return new Promise((resolve, reject) => {
        this.once('connected', resolve)
        this.once('error', reject)
      })
    }

    this.isConnecting = true

    return new Promise((resolve, reject) => {
      try {
        // Use Sec-WebSocket-Protocol for authentication if API key is set
        const protocols = this.apiKey ? [this.apiKey] : undefined
        this.ws = new WebSocket(this.wsUrl, protocols)

        this.ws.onopen = () => {
          console.log('[backendWsService] Connected to backend WebSocket')
          this.isConnecting = false
          this.reconnectAttempts = 0
          this.reconnectDelay = 1000

          // Start ping keepalive
          this.startPing()

          // Process queued messages
          this.flushMessageQueue()

          // Re-subscribe to all patterns
          this.resubscribeAll()

          this.emit('connected')
          resolve()
        }

        this.ws.onmessage = event => {
          this.handleMessage(event.data)
        }

        this.ws.onerror = error => {
          console.error('[backendWsService] WebSocket error:', error)
          this.emit('error', error)
          if (this.isConnecting) {
            this.isConnecting = false
            reject(error)
          }
        }

        this.ws.onclose = event => {
          console.log(
            '[backendWsService] WebSocket closed:',
            event.code,
            event.reason
          )
          this.isConnecting = false
          this.stopPing()
          this.emit('disconnected', event)
          this.scheduleReconnect()
        }
      } catch (err) {
        this.isConnecting = false
        reject(err)
      }
    })
  }

  /**
   * Disconnect from backend WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    this.stopPing()

    if (this.ws) {
      this.ws.onclose = null // Prevent reconnect on intentional close
      this.ws.close()
      this.ws = null
    }

    this.subscriptions.clear()
    this.messageQueue = []
  }

  /**
   * Subscribe to a pattern (e.g., 'bars.1m.binance.futures.BTCUSDT')
   */
  subscribe(pattern: string, market?: string): void {
    if (!this.subscriptions.has(pattern)) {
      this.subscriptions.set(pattern, {
        pattern,
        markets: new Set()
      })
    }

    if (market) {
      this.subscriptions.get(pattern)!.markets.add(market)
    }

    this.sendCommand('subscribe', pattern)
  }

  /**
   * Unsubscribe from a pattern
   */
  unsubscribe(pattern: string, market?: string): void {
    const sub = this.subscriptions.get(pattern)
    if (!sub) return

    if (market) {
      sub.markets.delete(market)
      if (sub.markets.size > 0) return // Still have other markets on this pattern
    }

    this.subscriptions.delete(pattern)
    this.sendCommand('unsubscribe', pattern)
  }

  /**
   * Subscribe to 1-second bars for a market
   */
  subscribeBars(exchange: string, marketType: string, symbol: string): void {
    const pattern = `bars.${exchange.toLowerCase()}.${marketType}.${symbol.toLowerCase()}`
    const market = `${exchange}:${symbol}`
    this.subscribe(pattern, market)
  }

  /**
   * Subscribe to aggregated bars at specific interval
   */
  subscribeIntervalBars(
    interval: string,
    exchange: string,
    marketType: string,
    symbol: string
  ): void {
    const pattern = `bars.${interval}.${exchange.toLowerCase()}.${marketType}.${symbol.toLowerCase()}`
    const market = `${exchange}:${symbol}`
    this.subscribe(pattern, market)
  }

  /**
   * Unsubscribe from bars for a market
   */
  unsubscribeBars(exchange: string, marketType: string, symbol: string): void {
    const pattern = `bars.${exchange.toLowerCase()}.${marketType}.${symbol.toLowerCase()}`
    const market = `${exchange}:${symbol}`
    this.unsubscribe(pattern, market)
  }

  /**
   * Subscribe to tickers summary (all tickers with multi-timeframe metrics)
   */
  subscribeTickersSummary(): void {
    this.subscribe('tickers.summary')
  }

  /**
   * Unsubscribe from tickers summary
   */
  unsubscribeTickersSummary(): void {
    this.unsubscribe('tickers.summary')
  }

  /**
   * Send a command to the backend
   */
  private sendCommand(cmd: string, pattern?: string): void {
    const message = JSON.stringify({ cmd, pattern })

    if (this.isConnected()) {
      this.ws!.send(message)
    } else {
      // Queue message for later
      this.messageQueue.push(message)
      // Try to connect if not already
      if (!this.isConnecting && !this.reconnectTimeout) {
        this.connect().catch(() => {})
      }
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const message: BackendWsMessage = JSON.parse(data)

      if (!message.subject) {
        return
      }

      // Emit raw message
      this.emit('message', message)

      // Parse subject to determine message type
      const parts = message.subject.split('.')

      if (parts[0] === 'bars') {
        this.handleBarMessage(message.subject, message.data as BackendBar)
      } else if (parts[0] === 'tickers') {
        this.emit('tickers', message.data)
      } else if (parts[0] === 'ticks') {
        this.emit('ticks', message.data)
      } else if (parts[0] === 'alerts') {
        this.emit('alert', message.data)
      }
    } catch (err) {
      console.error('[backendWsService] Failed to parse message:', err)
    }
  }

  /**
   * Handle bar message from backend
   */
  private handleBarMessage(subject: string, bar: BackendBar): void {
    // Convert backend bar format to aggr format
    const market = `${bar.exchange.toUpperCase()}:${bar.symbol.toUpperCase()}`

    // Emit for aggregator consumption
    this.emit('bar', {
      market,
      exchange: bar.exchange,
      symbol: bar.symbol,
      marketType: bar.market_type,
      timestamp: bar.timestamp,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      buyVolume: bar.buy_volume,
      sellVolume: bar.sell_volume,
      delta: bar.delta,
      oi: bar.oi,
      oiChange: bar.oi_change,
      tradeCount: bar.trade_count,
      liqLong: bar.liq_long,
      liqShort: bar.liq_short,
      complete: bar.complete,
      interval: bar.interval
    })

    // Also emit as trades for the chart renderer
    if (bar.trade_count > 0) {
      this.emit('trades', {
        market,
        exchange: bar.exchange,
        pair: bar.symbol,
        timestamp:
          typeof bar.timestamp === 'number'
            ? bar.timestamp
            : new Date(bar.timestamp).getTime(),
        price: bar.close,
        size: bar.buy_volume,
        side: 'buy'
      })

      if (bar.sell_volume > 0) {
        this.emit('trades', {
          market,
          exchange: bar.exchange,
          pair: bar.symbol,
          timestamp:
            typeof bar.timestamp === 'number'
              ? bar.timestamp
              : new Date(bar.timestamp).getTime(),
          price: bar.close,
          size: bar.sell_volume,
          side: 'sell'
        })
      }
    }

    // Emit liquidations if present
    if (bar.liq_long && bar.liq_long > 0) {
      this.emit('liquidations', {
        market,
        exchange: bar.exchange,
        pair: bar.symbol,
        timestamp:
          typeof bar.timestamp === 'number'
            ? bar.timestamp
            : new Date(bar.timestamp).getTime(),
        price: bar.close,
        size: bar.liq_long,
        side: 'sell', // Long liquidations are sells
        liquidation: true
      })
    }

    if (bar.liq_short && bar.liq_short > 0) {
      this.emit('liquidations', {
        market,
        exchange: bar.exchange,
        pair: bar.symbol,
        timestamp:
          typeof bar.timestamp === 'number'
            ? bar.timestamp
            : new Date(bar.timestamp).getTime(),
        price: bar.close,
        size: bar.liq_short,
        side: 'buy', // Short liquidations are buys
        liquidation: true
      })
    }
  }

  /**
   * Re-subscribe to all patterns after reconnect
   */
  private resubscribeAll(): void {
    for (const [pattern] of this.subscriptions) {
      this.sendCommand('subscribe', pattern)
    }
  }

  /**
   * Flush queued messages
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift()!
      this.ws!.send(message)
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[backendWsService] Max reconnect attempts reached')
      this.emit('maxReconnectAttemptsReached')
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 30000)

    console.log(
      `[backendWsService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    )

    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null
      this.connect().catch(() => {})
    }, delay)
  }

  /**
   * Start ping keepalive
   */
  private startPing(): void {
    this.stopPing()
    this.pingInterval = window.setInterval(() => {
      if (this.isConnected()) {
        this.ws!.send(JSON.stringify({ cmd: 'ping' }))
      }
    }, 30000)
  }

  /**
   * Stop ping keepalive
   */
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  /**
   * Get list of active subscriptions
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys())
  }
}

export default new BackendWsService()
