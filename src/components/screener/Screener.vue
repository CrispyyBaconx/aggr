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

    <div class="screener-table-wrapper hide-scrollbar">
      <table class="screener-table">
        <thead>
          <tr>
            <th class="screener-col-symbol" @click="setSortBy('symbol')">
              Symbol
              <i v-if="sortBy === 'symbol'" :class="sortIcon"></i>
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
        <tbody>
          <tr
            v-for="ticker in displayedTickers"
            :key="ticker.id"
            class="screener-row"
            :class="getRowClass(ticker)"
            @click="selectTicker(ticker)"
          >
            <td class="screener-col-symbol">
              <span
                class="screener-exchange-icon"
                :class="'icon-' + ticker.exchange"
              ></span>
              <span class="screener-symbol-text">{{ ticker.baseAsset }}</span>
            </td>
            <td class="screener-col-price">{{ formatPrice(ticker.price) }}</td>
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
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useStore } from 'vuex'
import PaneHeader from '../panes/PaneHeader.vue'
import backendWsService from '@/services/backendWsService'
import { usePane } from '@/composables/usePane'
import type {
  ScreenerTimeframe,
  ScreenerSortBy
} from '@/store/panesSettings/screener'

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

interface DisplayTicker {
  id: string
  symbol: string
  exchange: string
  baseAsset: string
  price: number
  changePercent: number
  volume: number
  vdelta: number
  openInterestUsd: number
  fundingRate: number
}

const props = defineProps<{
  paneId: string
}>()

const store = useStore()
const { el } = usePane(props.paneId)

const tickers = ref<BackendTicker[]>([])
const isConnected = ref(false)
const searchQuery = ref('')

// Computed store state
const sortBy = computed(() => store.state[props.paneId]?.sortBy || 'volume')
const sortOrder = computed(() => store.state[props.paneId]?.sortOrder || -1)
const timeframe = computed(() => store.state[props.paneId]?.timeframe || '1h')
const showSpots = computed(() => store.state[props.paneId]?.showSpots ?? false)
const showPerps = computed(() => store.state[props.paneId]?.showPerps ?? true)
const exchangeFilter = computed(
  () => store.state[props.paneId]?.exchangeFilter || []
)

const sortIcon = computed(() => {
  return sortOrder.value > 0 ? 'icon-up-thin' : 'icon-down-thin'
})

const displayedTickers = computed<DisplayTicker[]>(() => {
  const tf = timeframe.value as ScreenerTimeframe
  const tfKey = `tf${tf}` as keyof BackendTicker

  let filtered = tickers.value
    .map(ticker => {
      const metrics = ticker[tfKey] as TimeframeMetrics | undefined
      return {
        id: `${ticker.exchange}:${ticker.symbol}`,
        symbol: ticker.symbol,
        exchange: ticker.exchange.toLowerCase(),
        baseAsset: ticker.baseAsset || ticker.symbol.replace(/USDT?$/, ''),
        price: ticker.price || 0,
        changePercent: metrics?.changePercent || 0,
        volume: metrics?.volume || 0,
        vdelta: metrics?.vdelta || 0,
        openInterestUsd: ticker.openInterestUsd || 0,
        fundingRate: ticker.fundingRate || 0
      }
    })
    .filter(ticker => {
      // Search filter
      if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        if (
          !ticker.symbol.toLowerCase().includes(query) &&
          !ticker.baseAsset.toLowerCase().includes(query) &&
          !ticker.exchange.toLowerCase().includes(query)
        ) {
          return false
        }
      }

      // Exchange filter
      if (exchangeFilter.value.length > 0) {
        if (!exchangeFilter.value.includes(ticker.exchange)) {
          return false
        }
      }

      return true
    })

  // Sort
  const by = sortBy.value as ScreenerSortBy
  const order = sortOrder.value

  filtered.sort((a, b) => {
    let comparison = 0
    switch (by) {
      case 'symbol':
        comparison = a.symbol.localeCompare(b.symbol)
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
    }
    return comparison * order
  })

  return filtered
})

function onSearchInput(event: Event) {
  searchQuery.value = (event.target as HTMLInputElement).value
}

function setSortBy(column: ScreenerSortBy) {
  if (sortBy.value === column) {
    store.commit(`${props.paneId}/TOGGLE_SORT_ORDER`)
  } else {
    store.commit(`${props.paneId}/SET_SORT_BY`, column)
  }
}

function setTimeframe(tf: string) {
  store.commit(`${props.paneId}/SET_TIMEFRAME`, tf)
}

function selectTicker(ticker: DisplayTicker) {
  const market = `${ticker.exchange.toUpperCase()}:${ticker.symbol.toUpperCase()}`
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

function getRowClass(ticker: DisplayTicker) {
  return {
    '-positive': ticker.changePercent > 0,
    '-negative': ticker.changePercent < 0
  }
}

function handleTickersUpdate(data: { tickers: BackendTicker[] }) {
  if (data && data.tickers) {
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
})

onBeforeUnmount(() => {
  backendWsService.off('tickers', handleTickersUpdate)
  backendWsService.off('connected', handleConnected)
  backendWsService.off('disconnected', handleDisconnected)
  backendWsService.unsubscribeTickersSummary()
})
</script>

<style lang="scss" scoped>
.pane-screener {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
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
  }

  select {
    padding: 0.25rem;
    font-size: 0.75rem;
    min-width: 3.5rem;
  }
}

.screener-table-wrapper {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.screener-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
  font-family: $font-monospace;

  thead {
    position: sticky;
    top: 0;
    background: var(--theme-background-100);
    z-index: 1;

    th {
      padding: 0.375rem 0.5rem;
      text-align: right;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      user-select: none;
      color: var(--theme-color-200);

      &:hover {
        color: var(--theme-color-base);
      }

      i {
        margin-left: 0.25rem;
        font-size: 0.625rem;
      }
    }
  }

  tbody tr {
    cursor: pointer;
    transition: background-color 0.1s;

    &:hover {
      background: var(--theme-background-100);
    }

    &.-positive {
      .screener-col-symbol {
        border-left: 2px solid var(--theme-buy-base);
      }
    }

    &.-negative {
      .screener-col-symbol {
        border-left: 2px solid var(--theme-sell-base);
      }
    }
  }

  td {
    padding: 0.375rem 0.5rem;
    text-align: right;
    white-space: nowrap;
    border-bottom: 1px solid var(--theme-background-100);
  }

  .screener-col-symbol {
    text-align: left;
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .screener-exchange-icon {
    font-size: 0.875rem;
    opacity: 0.6;
  }

  .screener-symbol-text {
    font-weight: 500;
  }

  .-up {
    color: var(--theme-buy-base);
  }

  .-down {
    color: var(--theme-sell-base);
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
}

@each $exchange, $icon in $exchange-list {
  .screener-exchange-icon.icon-#{$exchange} {
    &::before {
      content: '';
    }
    background-image: url('../../assets/exchanges/#{$exchange}.svg');
    background-size: contain;
    background-repeat: no-repeat;
    width: 1rem;
    height: 1rem;
    display: inline-block;
  }
}
</style>
