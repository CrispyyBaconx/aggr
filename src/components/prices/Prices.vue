<template>
  <div
    class="pane-prices"
    ref="el"
    @mouseenter="toggleSort(false)"
    @mouseleave="toggleSort(true)"
  >
    <pane-header
      :paneId="paneId"
      :settings="() => import('@/components/prices/PricesDialog.vue')"
    >
      <hr />
      <prices-sort-dropdown :pane-id="paneId" class="pane-overlay -text" />
    </pane-header>
    <div class="markets-bar__wrapper hide-scrollbar">
      <component
        :is="animateSort ? 'transition-group' : 'div'"
        :name="transitionGroupName"
        tag="div"
        class="markets-bar hide-scrollbar pane"
        :class="[mode === 'horizontal' && '-horizontal']"
      >
        <div
          v-for="market in filteredMarkets"
          :key="market.id"
          class="market"
          :class="market.status"
          :title="market.id"
          :data-market="market.id"
          v-draggable-market
        >
          <div
            class="market__exchange"
            :class="market.exchange"
            :style="
              showCryptosLogos && {
                backgroundImage: `url(${VITE_APP_BASE_PATH}img/logos/${market.base}.svg)`
              }
            "
          ></div>
          <div v-if="showPairs" class="market__pair">
            {{ market.local }}
          </div>
          <div class="market__price" v-if="showPrice">{{ market.price }}</div>
          <div class="market__change" v-if="showChange">
            {{
              (market.avgChange >= 0 ? '+' : '') + market.avgChange.toFixed(2)
            }}%
          </div>
          <div v-if="showVolume" class="market__volume">
            {{ formatAmountValue(market.avgVolume) }}
          </div>
          <div v-if="showVolumeDelta" class="market__volume">
            {{ market.avgVolumeDelta }}%
          </div>
        </div>
      </component>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useStore } from 'vuex'
import PricesSortDropdown from '@/components/prices/PricesSortDropdown.vue'

import aggregatorService from '@/services/aggregatorService'
import { usePane } from '@/composables/usePane'
import PaneHeader from '../panes/PaneHeader.vue'
import { Market, Ticker } from '@/types/types'
import {
  formatAmount,
  formatMarketPrice,
  parseMarket,
  getMarketProduct
} from '@/services/productsService'

type TickerStatus = '-pending' | '-up' | '-down' | '-neutral'
type WatchlistMarket = Market & {
  local: string
  base: string
  price: string | null
  change: number
  avgChange: number
  volume: number
  avgVolume: number
  volumeDelta: number
  avgVolumeDelta: number
  status: TickerStatus
}

const props = defineProps<{
  paneId: string
}>()

const store = useStore()

const { el, pane } = usePane(props.paneId, onResize)

const mode = ref('vertical')
const pauseSort = ref(false)
const showCryptosLogos = ref(false)
const filteredMarkets = ref<WatchlistMarket[]>([])
const VITE_APP_BASE_PATH = import.meta.env.VITE_APP_BASE_PATH

// cache sort function
let sortFunction: ((a: WatchlistMarket, b: WatchlistMarket) => number) | null =
  null

// markets storage
let markets: WatchlistMarket[] = []

// prices event contain cumulative data
// keep track of last period ticker's volume & change
let lastResetTimestamp: number | null = null
let lastPeriodTickers: {
  [id: string]: Ticker & {
    change: number
  }
} = {}
let periodMs: number = 0

let resetTimeout: number | null = null

const exchanges = computed(() => store.state.exchanges)
const disableAnimations = computed(() => store.state.settings.disableAnimations)
const showPairs = computed(() => store.state[props.paneId].showPairs)
const showChange = computed(() => store.state[props.paneId].showChange)
const showPrice = computed(() => store.state[props.paneId].showPrice)
const showVolume = computed(() => store.state[props.paneId].showVolume)
const showVolumeDelta = computed(
  () => store.state[props.paneId].showVolumeDelta
)
const animateSort = computed(() => store.state[props.paneId].animateSort)
const sortType = computed(() => store.state[props.paneId].sortType)
const sortOrder = computed(() => store.state[props.paneId].sortOrder)
const period = computed(() => store.state[props.paneId].period)
const shortSymbols = computed(() => store.state[props.paneId].shortSymbols)
const avgPeriods = computed(() => store.state[props.paneId].avgPeriods)
const volumeThreshold = computed(
  () => store.state[props.paneId].volumeThreshold
)

const transitionGroupName = computed(() => {
  if (animateSort.value) {
    return 'flip-list'
  } else {
    return null
  }
})

watch(
  () => pane.value.markets,
  (currentMarket, previousMarkets) => {
    for (const id of previousMarkets) {
      if (currentMarket.indexOf(id) === -1) {
        removeMarketFromList(id)
      }
    }

    for (const id of currentMarket) {
      if (previousMarkets.indexOf(id) === -1) {
        const [exchange, pair] = parseMarket(id)

        addMarketToList({
          id,
          exchange,
          pair
        })
      }
    }

    showCryptosLogos.value = hasMultipleLocals()
  }
)

watch(
  period,
  newPeriod => {
    if (newPeriod > 0) {
      periodReset()
    } else {
      clearPeriodReset()
    }
  },
  { immediate: true }
)

watch(volumeThreshold, value => {
  toggleSort(true)

  if (!value) {
    filteredMarkets.value = markets
  } else {
    filterMarkets()
  }
})

watch(shortSymbols, value => {
  for (const market of markets) {
    if (value) {
      const product = getMarketProduct(market.exchange, market.pair)

      if (product) {
        market.local = getSymbol(product)
        continue
      }
    }

    market.local = market.pair
  }
})

watch(sortOrder, () => {
  cacheSortFunction()
})

watch(sortType, () => {
  cacheSortFunction()
})

function refreshMarkets() {
  // non reactive storages
  markets = []
  lastPeriodTickers = {}

  // active normalized pairs
  const locals: string[] = []

  for (const market of pane.value.markets) {
    const [exchange, pair] = parseMarket(market)

    const product = addMarketToList({
      id: market,
      pair,
      exchange
    })

    if (product && locals.indexOf(product.local) === -1) {
      locals.push(product.local)
    }
  }

  showCryptosLogos.value = hasMultipleLocals()

  filterMarkets()
}

function updateMarkets(tickers: { [id: string]: Ticker }) {
  // cache setting getters
  const showChangeVal = showChange.value
  const avgPeriodsVal = avgPeriods.value
  const periodWeight = getPeriodWeight(avgPeriodsVal)

  for (const market of markets) {
    const ticker = tickers[market.id]

    if (!ticker) {
      continue
    }

    const oldData = lastPeriodTickers[market.id]

    if (!oldData.price) {
      oldData.price = ticker.price
    }

    market.price = formatMarketPrice(ticker.price, market.id)

    market.volume += ticker.volume
    market.volumeDelta += ticker.volumeDelta

    if (avgPeriodsVal) {
      market.avgVolume =
        market.volume * periodWeight + oldData.volume * (1 - periodWeight)
      market.avgVolumeDelta = Math.round(
        ((market.volumeDelta * periodWeight +
          oldData.volumeDelta * (1 - periodWeight)) /
          market.avgVolume) *
          100
      )
    } else {
      market.avgVolume = market.volume
      market.avgVolumeDelta = Math.round(
        (market.volumeDelta / market.volume) * 100
      )
    }

    if (showChangeVal && ticker.price) {
      // colorize using price change accross period
      const change = ticker.price - lastPeriodTickers[market.id].price

      market.change = (change / lastPeriodTickers[market.id].price) * 100

      if (avgPeriodsVal) {
        market.avgChange =
          market.change * periodWeight + oldData.change * (1 - periodWeight)
      } else {
        market.avgChange = market.change
      }

      market.status = market.avgChange > 0 ? '-up' : '-down'
    } else {
      // colorize using now vs last value only
      if (ticker.price === null) {
        market.status = '-pending'
      } else if ((market.price as any) > ticker.price) {
        market.status = '-down'
      } else if ((market.price as any) < ticker.price) {
        market.status = '-up'
      } else {
        market.status = '-neutral'
      }
    }
  }

  if (!pauseSort.value && sortFunction !== null) {
    filteredMarkets.value = filteredMarkets.value.sort(sortFunction)
  }
}

function removeMarketFromList(market: string) {
  if (lastPeriodTickers[market]) {
    delete lastPeriodTickers[market]
  }

  const index = markets.indexOf(markets.find(m => m.id === market)!)

  if (index !== -1) {
    markets.splice(index, 1)
  } else {
    console.warn(
      `[prices] unable to remove market from list after panes.markets change: market doesn't exists in list (${market})`
    )
  }
}

function addMarketToList(market: Market) {
  lastPeriodTickers[market.id] = {
    price: 0,
    change: 0,
    volume: 0,
    volumeDelta: 0
  }

  const product = getMarketProduct(market.exchange, market.pair)

  if (product) {
    markets.push({
      ...market,
      local: getSymbol(product),
      base: product.base.replace(/^1000+/, '').toLowerCase(),
      status: '-pending',
      price: null,
      change: 0,
      avgChange: 0,
      volume: 0,
      avgVolume: 0,
      volumeDelta: 0,
      avgVolumeDelta: 0
    })

    return product
  }
}

function cacheSortFunction() {
  const order =
    mode.value === 'horizontal'
      ? sortOrder.value > 0
        ? -1
        : 1
      : sortOrder.value
  const by = sortType.value

  if (!by || by === 'none') {
    sortFunction = null
    return
  }

  if (by === 'price') {
    if (order === 1) {
      sortFunction = (a, b) => (a as any).price - (b as any).price
    } else {
      sortFunction = (a, b) => (b as any).price - (a as any).price
    }
  } else if (by === 'change') {
    if (order === 1) {
      sortFunction = (a, b) => a.avgChange - b.avgChange
    } else {
      sortFunction = (a, b) => b.avgChange - a.avgChange
    }
  } else if (by === 'volume') {
    if (order === 1) {
      sortFunction = (a, b) => a.avgVolume - b.avgVolume
    } else {
      sortFunction = (a, b) => b.avgVolume - a.avgVolume
    }
  } else if (by === 'delta') {
    if (order === 1) {
      sortFunction = (a, b) => a.avgVolumeDelta - b.avgVolumeDelta
    } else {
      sortFunction = (a, b) => b.avgVolumeDelta - a.avgVolumeDelta
    }
  }

  filteredMarkets.value = filteredMarkets.value.sort(sortFunction!)
}

function formatAmountValue(amount: number) {
  return formatAmount(amount, 0)
}

function onResize(width: number, height: number) {
  mode.value = width > height * 3 ? 'horizontal' : 'vertical'
}

function getTimeToNextReset() {
  const now = Date.now()
  const periodMsVal = period.value * 1000 * 60
  const timeOfReset = Math.ceil((now + 10000) / periodMsVal) * periodMsVal

  return timeOfReset - now
}

function scheduleNextPeriodReset() {
  if (resetTimeout) {
    clearTimeout(resetTimeout)
  }

  resetTimeout = setTimeout(
    periodReset,
    getTimeToNextReset()
  ) as unknown as number
}

function periodReset() {
  if (period.value) {
    periodMs = period.value * 1000 * 60
    lastResetTimestamp = resetTimeout ? Date.now() : null

    if (markets) {
      for (const market of markets) {
        lastPeriodTickers[market.id].price = +(market.price || 0)
        lastPeriodTickers[market.id].change = +market.change
        lastPeriodTickers[market.id].volume = +market.volume
        lastPeriodTickers[market.id].volumeDelta = +market.volumeDelta

        market.volume = 0
        market.volumeDelta = 0
      }
    }

    scheduleNextPeriodReset()
  }
}

function clearPeriodReset() {
  for (const market in lastPeriodTickers) {
    lastPeriodTickers[market].price =
      lastPeriodTickers[market].volume =
      lastPeriodTickers[market].volumeDelta =
        0
  }

  if (resetTimeout) {
    clearTimeout(resetTimeout)
    resetTimeout = null
  }
}

function filterMarkets(scheduled?: boolean) {
  const threshold = volumeThreshold.value

  if (!pauseSort.value) {
    if (threshold) {
      filteredMarkets.value = markets.filter(
        market => market.avgVolume >= threshold
      )

      if (sortFunction) {
        filteredMarkets.value = filteredMarkets.value.sort(sortFunction)
      }
    } else {
      filteredMarkets.value = markets
    }
  }

  if (scheduled) {
    // schedule next filter
    setTimeout(() => {
      filterMarkets(true)
    }, Math.random() * 10000)
  }
}

function getPeriodWeight(avgPeriodsVal: number) {
  if (!avgPeriodsVal || !lastResetTimestamp) {
    return 1
  }

  return (Date.now() - lastResetTimestamp) / periodMs
}

function toggleSort(value: boolean) {
  pauseSort.value = !value
}

function getSymbol(product: any) {
  if (shortSymbols.value) {
    return product.base.replace(/^1000+/, '').slice(0, 8)
  }

  return product.pair
}

function hasMultipleLocals() {
  if (!markets.length) {
    return false
  }

  const base = markets[0].base

  for (const market of markets) {
    if (base !== market.base) {
      return true
    }
  }

  return false
}

// Initialize
cacheSortFunction()
refreshMarkets()

onMounted(() => {
  aggregatorService.on('tickers', updateMarkets)

  // start filter interval
  filterMarkets(true)
})

onBeforeUnmount(() => {
  aggregatorService.off('tickers', updateMarkets)

  if (resetTimeout) {
    // clear periodic reset timeout
    clearTimeout(resetTimeout)
  }
})

defineExpose({
  onResize
})
</script>

<style lang="scss" scoped>
.markets-bar {
  $self: &;
  display: table;
  text-align: right;

  &__wrapper {
    overflow-y: auto;
    max-height: 100%;
    padding: 0;
  }

  > div {
    display: table-row;

    > div {
      display: table-cell;
      vertical-align: middle;
    }
  }

  @each $exchange, $icon in $exchange-list {
    .market__exchange.#{$exchange} {
      background-image: url('../../assets/exchanges/#{$exchange}.svg');
    }
  }

  &.-horizontal {
    display: flex;
    flex-direction: row;
    overflow-y: hidden;
    overflow-x: auto;
    text-align: center;

    #{$self}__wrapper {
      display: block;
    }

    .market {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.25em;

      > div {
        display: block;
        padding: 0;
      }

      &__change {
        width: auto;
      }
    }
  }

  .market {
    font-size: 0.875em;
    font-family: $font-monospace;
    white-space: nowrap;

    > div {
      padding: 0 0.25em;
    }

    &.-up {
      background-color: transparent;
      color: var(--theme-buy-base);
    }

    &.-down {
      background-color: transparent;
      color: var(--theme-sell-base);
    }

    &.-neutral {
      color: var(--theme-color-o50);
    }

    &.-pending {
      opacity: 0.5;
    }

    &__change {
      padding-left: 0.25em;
    }

    &__exchange {
      padding: 0;
      background-repeat: no-repeat;
      background-size: 1em 1em;
      width: 1rem;
      align-self: stretch;
      flex-shrink: 0;
      background-position: center;
      min-width: 1em;
      padding: 0 !important;
    }

    &__pair {
      white-space: nowrap;
      margin-right: 0.5rem;
      text-align: left;
    }
  }
}
</style>
