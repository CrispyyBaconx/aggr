<template>
  <div class="pane-screener" ref="el">
    <pane-header
      :paneId="paneId"
      :settings="() => import('@/components/screener/ScreenerDialog.vue')"
    >
      <hr />
      <div class="screener-controls pane-overlay -text">
        <input
          type="text"
          class="screener-search form-control"
          placeholder="Search..."
          v-model="searchQuery"
          @input="onSearchInput"
        />
        <select
          class="form-control"
          :value="timeframe"
          @change="setTimeframe(($event.target as HTMLSelectElement).value)"
        >
          <option value="5m">5m</option>
          <option value="15m">15m</option>
          <option value="1h">1h</option>
          <option value="4h">4h</option>
          <option value="1d">1d</option>
        </select>
      </div>
    </pane-header>

    <div
      class="screener-table-wrapper hide-scrollbar"
      ref="scrollContainer"
      @scroll="onScroll"
    >
      <table class="screener-table">
        <thead>
          <tr>
            <th class="screener-col-symbol" @click="setSortBy('symbol')">
              Symbol
              <i v-if="sortBy === 'symbol'" :class="sortIcon"></i>
            </th>
            <th class="screener-col-ticks" @click="setSortBy('ticks')">
              Ticks 15m
              <i v-if="sortBy === 'ticks'" :class="sortIcon"></i>
            </th>
            <th class="screener-col-price" @click="setSortBy('price')">
              Price
              <i v-if="sortBy === 'price'" :class="sortIcon"></i>
            </th>
            <th class="screener-col-change" @click="setSortBy('change')">
              Chg%
              <i v-if="sortBy === 'change'" :class="sortIcon"></i>
            </th>
            <th class="screener-col-volume" @click="setSortBy('volume')">
              Vol
              <i v-if="sortBy === 'volume'" :class="sortIcon"></i>
            </th>
            <th class="screener-col-vdelta" @click="setSortBy('vdelta')">
              Δ
              <i v-if="sortBy === 'vdelta'" :class="sortIcon"></i>
            </th>
            <th class="screener-col-oi" @click="setSortBy('oi')">
              OI
              <i v-if="sortBy === 'oi'" :class="sortIcon"></i>
            </th>
            <th class="screener-col-funding" @click="setSortBy('funding')">
              Fund
              <i v-if="sortBy === 'funding'" :class="sortIcon"></i>
            </th>
          </tr>
        </thead>
      </table>
      <!-- Virtual scroll container -->
      <div
        class="screener-virtual-container"
        :style="{ height: `${totalHeight}px` }"
      >
        <table
          class="screener-table screener-virtual-table"
          :style="{ transform: `translateY(${offsetY}px)` }"
        >
          <tbody>
            <tr
              v-for="ticker in visibleTickers"
              :key="ticker.id"
              class="screener-row"
              :class="getRowClass(ticker)"
              @click="handleTickerClick($event, ticker)"
            >
              <td class="screener-col-symbol">
                <span class="screener-symbol-text">{{ ticker.baseAsset }}</span>
              </td>
              <td class="screener-col-ticks">
                {{ formatNumber(ticker.trades) }}
              </td>
              <td
                class="screener-col-price"
                :class="getPriceFlashClass(ticker.id)"
              >
                {{ formatPrice(ticker.price) }}
              </td>
              <td
                class="screener-col-change"
                :class="ticker.changePercent >= 0 ? '-up' : '-down'"
              >
                {{ formatChange(ticker.changePercent) }}
              </td>
              <td class="screener-col-volume">
                {{ formatVolume(ticker.volume) }}
              </td>
              <td
                class="screener-col-vdelta"
                :class="ticker.vdelta >= 0 ? '-up' : '-down'"
              >
                {{ formatVolume(ticker.vdelta) }}
              </td>
              <td class="screener-col-oi">
                {{ formatVolume(ticker.openInterestUsd) }}
              </td>
              <td
                class="screener-col-funding"
                :class="ticker.fundingRate >= 0 ? '-up' : '-down'"
              >
                {{ formatFunding(ticker.fundingRate) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="!isConnected" class="screener-empty">
        <p>Connecting to backend...</p>
      </div>
      <div v-else-if="!displayedTickers.length" class="screener-empty">
        <p>No tickers match your filters</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  reactive,
  watch,
  nextTick
} from 'vue'
import { useStore } from 'vuex'
import PaneHeader from '../panes/PaneHeader.vue'
import backendWsService from '@/services/backendWsService'
import { usePane } from '@/composables/usePane'
import type {
  ScreenerTimeframe,
  ScreenerSortBy
} from '@/store/panesSettings/screener'

// Virtual scroll constants
const ROW_HEIGHT = 26 // Fixed row height in pixels
const BUFFER_ROWS = 5 // Extra rows to render above/below viewport

interface BackendTicker {
  symbol: string
  exchange: string
  baseAsset: string
  tickSize?: number
  price: number
  indexPrice?: number
  markPrice?: number
  fundingRate: number
  high24h?: number
  low24h?: number
  nextFundingTime?: number
  openInterest?: number
  openInterestUsd: number
  rvol5m?: number
  rvol15m?: number
  lastUpdate?: number
  tf5m?: TimeframeMetrics
  tf15m?: TimeframeMetrics
  tf1h?: TimeframeMetrics
  tf4h?: TimeframeMetrics
  tf1d?: TimeframeMetrics
}

interface TimeframeMetrics {
  changePercent: number
  changeDollar?: number
  volume: number
  volumeChange?: number
  volumeChangeDollar?: number
  oiChange?: number
  oiChangeDollar?: number
  trades?: number
  vdelta: number
  volatility?: number
}

interface TickerSource {
  exchange: string
  symbol: string
  price: number
  volume: number
  vdelta: number
  openInterestUsd: number
  fundingRate: number
  trades: number
  changePercent: number
}

interface AggregatedTicker {
  id: string
  baseAsset: string
  price: number // Weighted average or highest OI exchange price
  changePercent: number // Weighted average
  volume: number // Sum
  vdelta: number // Sum
  openInterestUsd: number // Sum
  fundingRate: number // Weighted average
  trades: number // Sum
  exchanges: string[] // List of exchanges
  sources: TickerSource[] // Individual exchange data
}

const props = defineProps<{
  paneId: string
}>()

const store = useStore()
const { el } = usePane(props.paneId)

const tickers = ref<BackendTicker[]>([])
const isConnected = ref(false)
const searchQuery = ref('')

// Virtual scroll state
const scrollContainer = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const containerHeight = ref(400)

// Track price changes for flash effect
const previousPrices = reactive<Map<string, number>>(new Map())
const priceFlashes = reactive<Map<string, 'up' | 'down' | null>>(new Map())

// Computed store state
const sortBy = computed(() => store.state[props.paneId]?.sortBy || 'volume')
const sortOrder = computed(() => store.state[props.paneId]?.sortOrder || -1)
const timeframe = computed(() => store.state[props.paneId]?.timeframe || '1h')
const exchangeFilter = computed(
  () => store.state[props.paneId]?.exchangeFilter || []
)

const sortIcon = computed(() => {
  return sortOrder.value > 0 ? 'icon-up-thin' : 'icon-down-thin'
})

const displayedTickers = computed<AggregatedTicker[]>(() => {
  const tf = timeframe.value as ScreenerTimeframe
  const tfKey = `tf${tf}` as keyof BackendTicker

  // First, build individual ticker sources
  const tickerSources: TickerSource[] = tickers.value
    .map(ticker => {
      const metrics = ticker[tfKey] as TimeframeMetrics | undefined
      // Always use 15m timeframe for tick count
      const metrics15m = ticker.tf15m as TimeframeMetrics | undefined
      // Keep exchange uppercase for icon matching
      const exchange = ticker.exchange.toUpperCase()
      return {
        exchange,
        symbol: ticker.symbol,
        baseAsset: ticker.baseAsset || ticker.symbol.replace(/USDT?$/, ''),
        price: ticker.price || 0,
        changePercent: metrics?.changePercent || 0,
        volume: metrics?.volume || 0,
        vdelta: metrics?.vdelta || 0,
        openInterestUsd: ticker.openInterestUsd || 0,
        fundingRate: ticker.fundingRate || 0,
        trades: metrics15m?.trades || 0
      }
    })
    .filter(ticker => {
      // Search filter
      if (searchQuery.value) {
        const query = searchQuery.value.toUpperCase()
        if (
          !ticker.symbol.toUpperCase().includes(query) &&
          !ticker.baseAsset.toUpperCase().includes(query) &&
          !ticker.exchange.includes(query)
        ) {
          return false
        }
      }

      // Exchange filter
      if (exchangeFilter.value.length > 0) {
        if (
          !exchangeFilter.value.some(f => f.toUpperCase() === ticker.exchange)
        ) {
          return false
        }
      }

      return true
    })

  // Group by baseAsset (aggregate across exchanges)
  const aggregatedMap = new Map<string, AggregatedTicker>()

  for (const source of tickerSources) {
    const baseAsset = source.baseAsset

    if (!aggregatedMap.has(baseAsset)) {
      aggregatedMap.set(baseAsset, {
        id: baseAsset,
        baseAsset,
        price: 0,
        changePercent: 0,
        volume: 0,
        vdelta: 0,
        openInterestUsd: 0,
        fundingRate: 0,
        trades: 0,
        exchanges: [],
        sources: []
      })
    }

    const agg = aggregatedMap.get(baseAsset)!
    agg.sources.push(source)
    agg.exchanges.push(source.exchange)

    // Sum values
    agg.volume += source.volume
    agg.vdelta += source.vdelta
    agg.openInterestUsd += source.openInterestUsd
    agg.trades += source.trades
  }

  // Calculate weighted averages and set price from highest OI source
  for (const agg of aggregatedMap.values()) {
    // Sort sources by OI (highest first)
    agg.sources.sort((a, b) => b.openInterestUsd - a.openInterestUsd)

    // Use price from highest OI exchange
    if (agg.sources.length > 0) {
      agg.price = agg.sources[0].price
    }

    // Weighted average for change percent and funding (weight by OI)
    const totalOi = agg.openInterestUsd
    if (totalOi > 0) {
      let weightedChange = 0
      let weightedFunding = 0
      for (const src of agg.sources) {
        const weight = src.openInterestUsd / totalOi
        weightedChange += src.changePercent * weight
        weightedFunding += src.fundingRate * weight
      }
      agg.changePercent = weightedChange
      agg.fundingRate = weightedFunding
    } else if (agg.sources.length > 0) {
      // Fallback to simple average if no OI
      agg.changePercent = agg.sources[0].changePercent
      agg.fundingRate = agg.sources[0].fundingRate
    }

    // Dedupe exchanges list
    agg.exchanges = [...new Set(agg.exchanges)]
  }

  // Convert to array and sort
  let filtered = Array.from(aggregatedMap.values())

  const by = sortBy.value as ScreenerSortBy
  const order = sortOrder.value

  filtered.sort((a, b) => {
    let comparison = 0
    switch (by) {
      case 'symbol':
        comparison = a.baseAsset.localeCompare(b.baseAsset)
        break
      case 'price':
        comparison = a.price - b.price
        break
      case 'change':
        comparison = a.changePercent - b.changePercent
        break
      case 'volume':
        comparison = a.volume - b.volume
        break
      case 'vdelta':
        comparison = a.vdelta - b.vdelta
        break
      case 'oi':
        comparison = a.openInterestUsd - b.openInterestUsd
        break
      case 'funding':
        comparison = a.fundingRate - b.fundingRate
        break
      case 'ticks':
        comparison = a.trades - b.trades
        break
    }
    return comparison * order
  })

  return filtered
})

// Virtual scroll computations
const totalHeight = computed(() => displayedTickers.value.length * ROW_HEIGHT)

const startIndex = computed(() => {
  const start = Math.floor(scrollTop.value / ROW_HEIGHT) - BUFFER_ROWS
  return Math.max(0, start)
})

const endIndex = computed(() => {
  const visibleCount = Math.ceil(containerHeight.value / ROW_HEIGHT)
  const end = startIndex.value + visibleCount + BUFFER_ROWS * 2
  return Math.min(displayedTickers.value.length, end)
})

const offsetY = computed(() => startIndex.value * ROW_HEIGHT)

const visibleTickers = computed(() => {
  return displayedTickers.value.slice(startIndex.value, endIndex.value)
})

function onScroll() {
  if (scrollContainer.value) {
    scrollTop.value = scrollContainer.value.scrollTop
  }
}

function updateContainerHeight() {
  if (scrollContainer.value) {
    containerHeight.value = scrollContainer.value.clientHeight
  }
}

function onSearchInput(event: Event) {
  searchQuery.value = (event.target as HTMLInputElement).value
}

function setSortBy(column: ScreenerSortBy | 'ticks') {
  if (sortBy.value === column) {
    store.commit(`${props.paneId}/TOGGLE_SORT_ORDER`)
  } else {
    store.commit(`${props.paneId}/SET_SORT_BY`, column)
  }
}

function setTimeframe(tf: string) {
  store.commit(`${props.paneId}/SET_TIMEFRAME`, tf)
}

function handleTickerClick(event: MouseEvent, ticker: AggregatedTicker) {
  // Always use the highest OI exchange (sources are already sorted by OI)
  if (ticker.sources.length > 0) {
    selectExchangeSource(ticker.sources[0])
  }
}

function selectExchangeSource(source: TickerSource) {
  // Exchange is already uppercase, symbol should be uppercase too
  const market = `${source.exchange}:${source.symbol.toUpperCase()}`
  store.dispatch('panes/setMarketsForAll', [market])
}

function formatPrice(price: number): string {
  if (!price) return '-'
  if (price >= 1000)
    return price.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (price >= 1)
    return price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  if (price >= 0.01)
    return price.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    })
  return price.toLocaleString(undefined, {
    minimumFractionDigits: 6,
    maximumFractionDigits: 8
  })
}

function formatChange(change: number): string {
  if (change === null || change === undefined) return '-'
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
}

function formatVolume(volume: number): string {
  if (!volume) return '-'
  const absVol = Math.abs(volume)
  const sign = volume < 0 ? '-' : ''
  if (absVol >= 1e9) return `${sign}${(absVol / 1e9).toFixed(1)}B`
  if (absVol >= 1e6) return `${sign}${(absVol / 1e6).toFixed(1)}M`
  if (absVol >= 1e3) return `${sign}${(absVol / 1e3).toFixed(1)}K`
  return `${sign}${absVol.toFixed(0)}`
}

function formatFunding(rate: number): string {
  if (rate === null || rate === undefined) return '-'
  return `${(rate * 100).toFixed(4)}%`
}

function formatNumber(num: number): string {
  if (!num) return '-'
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`
  return num.toLocaleString()
}

function getRowClass(ticker: AggregatedTicker) {
  return {
    '-positive': ticker.changePercent > 0,
    '-negative': ticker.changePercent < 0
  }
}

function getPriceFlashClass(tickerId: string): string {
  const flash = priceFlashes.get(tickerId)
  if (flash === 'up') return '-flash-up'
  if (flash === 'down') return '-flash-down'
  return ''
}

function updatePriceFlash(baseAsset: string, currentPrice: number) {
  const prevPrice = previousPrices.get(baseAsset)

  if (prevPrice !== undefined && prevPrice !== currentPrice) {
    const direction =
      currentPrice > prevPrice ? 1 : currentPrice < prevPrice ? -1 : 0

    // Trigger flash effect
    if (direction !== 0) {
      priceFlashes.set(baseAsset, direction > 0 ? 'up' : 'down')
      setTimeout(() => {
        priceFlashes.set(baseAsset, null)
      }, 300)
    }
  }

  previousPrices.set(baseAsset, currentPrice)
}

function handleTickersUpdate(data: { tickers: BackendTicker[] }) {
  if (data && data.tickers) {
    // Group by baseAsset and track price changes from highest OI source
    const assetPrices = new Map<string, { price: number; oi: number }>()

    for (const ticker of data.tickers) {
      const baseAsset = ticker.baseAsset || ticker.symbol.replace(/USDT?$/, '')
      const oi = ticker.openInterestUsd || 0
      const current = assetPrices.get(baseAsset)

      if (!current || oi > current.oi) {
        assetPrices.set(baseAsset, { price: ticker.price, oi })
      }
    }

    // Update flash state for each aggregated asset
    for (const [baseAsset, { price }] of assetPrices) {
      updatePriceFlash(baseAsset, price)
    }

    tickers.value = data.tickers
  }
}

function handleConnected() {
  isConnected.value = true
  backendWsService.subscribeTickersSummary()
}

function handleDisconnected() {
  isConnected.value = false
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  backendWsService.on('tickers', handleTickersUpdate)
  backendWsService.on('connected', handleConnected)
  backendWsService.on('disconnected', handleDisconnected)

  if (backendWsService.isConnected()) {
    isConnected.value = true
    backendWsService.subscribeTickersSummary()
  } else if (backendWsService.isConfigured()) {
    backendWsService.connect().catch(err => {
      console.warn('[Screener] Failed to connect to backend:', err)
    })
  }

  // Setup resize observer for virtual scroll
  nextTick(() => {
    updateContainerHeight()
    if (scrollContainer.value) {
      resizeObserver = new ResizeObserver(() => {
        updateContainerHeight()
      })
      resizeObserver.observe(scrollContainer.value)
    }
  })
})

onBeforeUnmount(() => {
  backendWsService.off('tickers', handleTickersUpdate)
  backendWsService.off('connected', handleConnected)
  backendWsService.off('disconnected', handleDisconnected)
  backendWsService.unsubscribeTickersSummary()

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

// Reset scroll position when filters change
watch([searchQuery, sortBy, sortOrder, timeframe], () => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 0
    scrollTop.value = 0
  }
})
</script>

<style lang="scss" scoped>
.pane-screener {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--theme-background-base);
  position: relative;
}

.screener-controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0 0.5rem;

  .screener-search {
    flex: 1;
    min-width: 0;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    background: var(--theme-background-150);
    border: 1px solid var(--theme-background-200);
    border-radius: 3px;
    color: var(--theme-color-base);

    &:focus {
      outline: none;
      border-color: var(--theme-color-o20);
    }
  }

  select {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    min-width: 3.5rem;
    background: var(--theme-background-150);
    border: 1px solid var(--theme-background-200);
    border-radius: 3px;
    color: var(--theme-color-base);
    cursor: pointer;
  }
}

.screener-table-wrapper {
  flex: 1;
  overflow: auto;
  min-height: 0;
  position: relative;
}

.screener-virtual-container {
  position: relative;
  width: 100%;
  contain: strict;
}

.screener-virtual-table {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  will-change: transform;
}

.screener-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.6875rem;
  font-family: $font-monospace;

  thead {
    position: sticky;
    top: 0;
    background: var(--theme-background-150);
    z-index: 1;
    backdrop-filter: blur(8px);

    th {
      padding: 0.5rem 0.375rem;
      text-align: right;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      user-select: none;
      color: var(--theme-color-100);
      text-transform: uppercase;
      font-size: 0.5625rem;
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--theme-background-200);

      &:hover {
        color: var(--theme-color-base);
        background: var(--theme-background-200);
      }

      i {
        margin-left: 0.25rem;
        font-size: 0.5rem;
      }
    }
  }

  tbody tr {
    cursor: pointer;
    transition: background-color 0.15s $ease-out-expo;
    position: relative;
    height: 26px; // Must match ROW_HEIGHT constant

    &:hover {
      background: var(--theme-background-100);

      .screener-symbol-text {
        color: var(--theme-color-base);
      }
    }

    &.-positive {
      background: linear-gradient(
        90deg,
        rgba(var(--theme-buy-rgb), 0.08) 0%,
        transparent 50%
      );

      .screener-col-symbol {
        border-left: 3px solid var(--theme-buy-base);
      }

      .screener-col-change {
        background: rgba(var(--theme-buy-rgb), 0.15);
        border-radius: 2px;
      }
    }

    &.-negative {
      background: linear-gradient(
        90deg,
        rgba(var(--theme-sell-rgb), 0.08) 0%,
        transparent 50%
      );

      .screener-col-symbol {
        border-left: 3px solid var(--theme-sell-base);
      }

      .screener-col-change {
        background: rgba(var(--theme-sell-rgb), 0.15);
        border-radius: 2px;
      }
    }
  }

  td {
    padding: 0.375rem;
    text-align: right;
    white-space: nowrap;
    border-bottom: 1px solid var(--theme-background-100);
    transition: background-color 0.3s $ease-out-expo;
  }

  .screener-col-symbol {
    text-align: left;
    padding-left: 0.5rem;
  }

  .screener-col-ticks {
    padding: 0.25rem 0.375rem;
    text-align: right;
    color: var(--theme-color-100);
    font-variant-numeric: tabular-nums;
  }

  .screener-col-price {
    font-weight: 600;
    color: var(--theme-color-base);

    &.-flash-up {
      animation: flash-up 0.3s $ease-out-expo;
    }

    &.-flash-down {
      animation: flash-down 0.3s $ease-out-expo;
    }
  }

  .screener-col-change {
    font-weight: 600;
    padding: 0.25rem 0.375rem;
  }

  .screener-col-volume,
  .screener-col-oi {
    color: var(--theme-color-100);
  }

  .screener-col-vdelta {
    font-weight: 500;
  }

  .screener-col-funding {
    font-size: 0.625rem;
    opacity: 0.8;
  }

  .screener-symbol-text {
    font-weight: 600;
    color: var(--theme-color-100);
    transition: color 0.15s;
  }

  .-up {
    color: var(--theme-buy-base);
  }

  .-down {
    color: var(--theme-sell-base);
  }
}

// Flash animations
@keyframes flash-up {
  0% {
    background: rgba(var(--theme-buy-rgb), 0.4);
  }
  100% {
    background: transparent;
  }
}

@keyframes flash-down {
  0% {
    background: rgba(var(--theme-sell-rgb), 0.4);
  }
  100% {
    background: transparent;
  }
}

.screener-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 100px;
  color: var(--theme-color-200);
  font-size: 0.875rem;
  flex-direction: column;
  gap: 0.5rem;

  p {
    opacity: 0.6;
  }
}
</style>
