<template>
  <div class="trades-placeholder hide-scrollbar">
    <p class="trades-placeholder__dimmed">{{ filterRecap }}</p>
    <p v-if="!exchangesReady">...</p>
    <template v-else>
      <pre v-if="showMore" v-text="paneMarketStringified"></pre>
      <div v-else class="pl16 pr16">
        <button
          class="btn mx4 -small"
          v-for="(pair, index) of pairs"
          :key="index"
          disabled
        >
          {{ pair }}
        </button>
      </div>
      <button
        v-if="paneMarkets.length"
        class="mt8 btn -text trades-placeholder__dimmed -cases"
        @click="toggleShowMore"
      >
        {{ showMore ? 'Show less' : 'Show more' }}
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStore } from 'vuex'
import { Threshold } from '@/store/panesSettings/trades'
import { formatAmount, stripStablePair } from '@/services/productsService'

const props = defineProps<{
  paneId: string
}>()

const store = useStore()
const showMore = ref(false)

const exchangesReady = computed(() => store.state.app.isExchangesReady)

const paneMarkets = computed(() => store.state.panes.panes[props.paneId].markets)

const paneMarketStringified = computed(() => paneMarkets.value.join('\n'))

const pairs = computed(() => {
  const mergeUsdt = store.state.settings.searchTypes.mergeUsdt

  return paneMarkets.value.reduce((pairs: string[], marketKey: string) => {
    const market = store.state.panes.marketsListeners[marketKey]

    let localPair = market ? market.local : marketKey

    if (mergeUsdt) {
      localPair = stripStablePair(localPair)
    }

    if (pairs.indexOf(localPair) === -1) {
      pairs.push(localPair)
    }

    return pairs
  }, [])
})

const tradesThresholds = computed<Threshold[]>(() => store.state[props.paneId].thresholds)

const liquidationsThresholds = computed<Threshold[]>(() => store.state[props.paneId].liquidations)

const showTrades = computed(() => store.state[props.paneId].showTrades)

const showLiquidations = computed(() => store.state[props.paneId].showLiquidations)

const filterRecap = computed(() => {
  const minimumTradeAmount = tradesThresholds.value[0].amount
  const minimumLiquidationAmount = liquidationsThresholds.value[0].amount

  if (showTrades.value && showLiquidations.value) {
    return `Waiting for trades > ${formatAmount(
      minimumTradeAmount
    )} or liquidations > ${formatAmount(minimumLiquidationAmount)}`
  } else if (showTrades.value) {
    return `Waiting for trades > ${formatAmount(minimumTradeAmount)}`
  } else if (showLiquidations.value) {
    return `Waiting for liquidations > ${formatAmount(
      minimumLiquidationAmount
    )}`
  } else {
    return 'Nothing to show, see settings'
  }
})

function toggleShowMore() {
  showMore.value = !showMore.value

  const focusedElement = document.activeElement as HTMLElement

  if (focusedElement) {
    focusedElement.blur()
  }
}
</script>

<style lang="scss">
.trades-placeholder {
  padding: 2em;
  margin: auto;

  p {
    margin-top: 0;
  }

  .trades-placeholder__dimmed {
    opacity: 0.5;
  }

  pre {
    font-size: 0.75em;
    pointer-events: all;
    user-select: text;
    font-family: $font-monospace;
  }
}
</style>
