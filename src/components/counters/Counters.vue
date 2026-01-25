<template>
  <div class="pane-counters" ref="el">
    <pane-header
      :paneId="paneId"
      :settings="() => import('@/components/counters/CountersDialog.vue')"
    />
    <div class="counters hide-scrollbar">
      <div
        v-for="(step, index) in activeSteps"
        :key="index"
        v-bind:duration="step.duration"
        class="counter"
      >
        <div
          class="counter__side -buy"
          v-bind:style="{
            width: (step.buy / (step.buy + step.sell)) * 100 + '%'
          }"
        >
          <span v-if="!countersCount">{{ formatAmountValue(step.buy) }}</span>
          <span v-else>{{ step.buy }}</span>
        </div>
        <div
          class="counter__side -sell"
          v-bind:style="{
            width: (step.sell / (step.buy + step.sell)) * 100 + '%'
          }"
        >
          <span v-if="!countersCount">{{ formatAmountValue(step.sell) }}</span>
          <span v-else>{{ step.sell }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  reactive,
  computed,
  onMounted,
  onBeforeUnmount,
  getCurrentInstance
} from 'vue'
import { useStore } from 'vuex'

import { getBucketId, getHms } from '@/utils/helpers'
import { formatAmount } from '@/services/productsService'

import aggregatorService from '@/services/aggregatorService'
import { usePane } from '@/composables/usePane'
import PaneHeader from '../panes/PaneHeader.vue'
import {
  getAppBackgroundColor,
  getLinearShade,
  joinRgba,
  splitColorCode
} from '@/utils/colors'

interface Counter {
  duration: number
  chunks: CounterChunk[]
}

interface CounterChunk {
  timestamp: number | null
  buy: number
  sell: number
}

interface CounterStep {
  duration: string
  buy: number
  sell: number
  hasData: boolean
}

const props = defineProps<{
  paneId: string
}>()

const store = useStore()
const instance = getCurrentInstance()

const { el, pane } = usePane(props.paneId)

const steps = reactive<CounterStep[]>([])

let _populateCountersInterval: number | null = null
let _activeChunk: CounterChunk = {
  timestamp: null,
  buy: 0,
  sell: 0
}
let _counters: Counter[] = []
let _feed: string | null = null
let _onStoreMutation: (() => void) | null = null

const liquidationsOnly = computed(
  () => store.state[props.paneId].liquidationsOnly
)
const countersSteps = computed(() => store.state[props.paneId].steps)
const countersCount = computed(() => store.state[props.paneId].count)
const countersGranularity = computed(
  () => store.state[props.paneId].granularity
)

const activeSteps = computed(() => steps.filter(a => a.hasData))

function onVolume(sums: any) {
  const volume = {
    buy: sums.vbuy,
    sell: sums.vsell
  }

  if (liquidationsOnly.value) {
    volume.buy = sums.lbuy
    volume.sell = sums.lsell
  } else if (countersCount.value) {
    volume.buy = sums.cbuy
    volume.sell = sums.csell
  }

  if (volume.buy || volume.sell) {
    if (!_activeChunk.timestamp) {
      _activeChunk.timestamp = sums.timestamp
    }

    _activeChunk.buy += volume.buy
    _activeChunk.sell += volume.sell

    for (let i = 0; i < steps.length; i++) {
      steps[i].buy += volume.buy
      steps[i].sell += volume.sell
    }
  }
}

function clearCounters() {
  if (_feed) {
    console.debug(`[counters/${props.paneId}] unsubscribe from feed`, _feed)
    aggregatorService.off(_feed, onVolume)
  }

  if (_counters.length) {
    _counters.splice(0, _counters.length)
    _activeChunk.timestamp = null
    _activeChunk.buy = _activeChunk.sell = 0
    steps.splice(0, steps.length)
  } else {
    _counters = []
    _activeChunk = {
      timestamp: null,
      buy: 0,
      sell: 0
    }
  }
}

function generateColors() {
  const style = getComputedStyle(document.documentElement)
  const buyColor = splitColorCode(
    style.getPropertyValue('--theme-buy-base'),
    getAppBackgroundColor()
  )
  const sellColor = splitColorCode(
    style.getPropertyValue('--theme-sell-base'),
    getAppBackgroundColor()
  )

  const rootEl = instance?.proxy?.$el as HTMLElement
  if (!rootEl) return

  for (let i = 0; i < steps.length; i++) {
    const lightenFactor = i * (0.25 / steps.length)
    rootEl.style.setProperty(
      `--buy-color-${i + 1}`,
      joinRgba(getLinearShade(buyColor, -lightenFactor, lightenFactor))
    )
    rootEl.style.setProperty(
      `--sell-color-${i + 1}`,
      joinRgba(getLinearShade(sellColor, -lightenFactor, lightenFactor))
    )
  }
}

function createCounters() {
  clearCounters()

  for (const step of countersSteps.value) {
    const counter = {
      duration: step,
      chunks: []
    }

    _counters.push(counter)

    const first = _counters.indexOf(counter) === 0

    steps.push({
      duration: getHms(counter.duration),
      buy: 0,
      sell: 0,
      hasData: first
    })
  }

  _feed = 'bucket-' + getBucketId(pane.value.markets)
  console.debug(`[counters/${props.paneId}] subscribe to feed`, _feed)

  if (_feed.length) {
    aggregatorService.on(_feed, onVolume)
  } else {
    console.debug(`[counters/${props.paneId}] error feed empty...`)
  }
}

function populateCounters() {
  const now = Date.now()

  if (_activeChunk.timestamp) {
    _counters[0].chunks.push({
      timestamp: _activeChunk.timestamp,
      buy: _activeChunk.buy,
      sell: _activeChunk.sell
    })

    _activeChunk.timestamp = null
    _activeChunk.buy = 0
    _activeChunk.sell = 0
  }

  let chunksToDecrease: CounterChunk[] = []
  let decreaseBuy: number
  let decreaseSell: number

  for (let i = 0; i < _counters.length; i++) {
    if (chunksToDecrease.length) {
      Array.prototype.push.apply(
        _counters[i].chunks,
        chunksToDecrease.splice(0, chunksToDecrease.length)
      )

      if (!steps[i].hasData) {
        steps[i].hasData = true
      }
    }

    decreaseBuy = 0
    decreaseSell = 0

    let to = 0

    for (let j = 0; j < _counters[i].chunks.length; j++) {
      decreaseBuy += _counters[i].chunks[j].buy
      decreaseSell += _counters[i].chunks[j].sell
      if (
        (_counters[i].chunks[j].timestamp || 0) >=
        now - _counters[i].duration
      ) {
        to = j
        break
      }
    }

    if (to) {
      chunksToDecrease = _counters[i].chunks.splice(0, to + 1)
      steps[i].buy -= decreaseBuy
      steps[i].sell -= decreaseSell
    }
  }
}

function formatAmountValue(amount: number) {
  return formatAmount(amount)
}

// Setup store mutation subscription
_onStoreMutation = store.subscribe(mutation => {
  switch (mutation.type) {
    case 'settings/SET_BUY_COLOR':
    case 'settings/SET_SELL_COLOR':
      generateColors()
      break
    case 'panes/SET_PANE_MARKETS':
      if (mutation.payload.id === props.paneId) {
        createCounters()
      }
      break

    case props.paneId + '/REPLACE_COUNTERS':
    case props.paneId + '/TOGGLE_LIQUIDATIONS_ONLY':
    case props.paneId + '/TOGGLE_COUNT':
      createCounters()
      break
  }
})

_populateCountersInterval = setInterval(
  populateCounters,
  countersGranularity.value
) as unknown as number

onMounted(() => {
  createCounters()
  generateColors()
})

onBeforeUnmount(() => {
  if (_feed) {
    aggregatorService.off(_feed, onVolume)
  }

  if (_populateCountersInterval) {
    clearInterval(_populateCountersInterval)
  }

  if (_onStoreMutation) {
    _onStoreMutation()
  }
})
</script>

<style lang="scss">
.pane-counters.-large {
  font-weight: 500;
}

.counters {
  display: flex;
  flex-direction: column;
  list-style: none;
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: auto;
  color: white;

  font-family: $font-monospace;
}

.counter {
  display: flex;
  position: relative;
  flex-grow: 1;
  min-height: 2em;

  &:before {
    content: attr(duration);
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    border-radius: $border-radius-small;
    padding: 0.25em;
    font-size: 0.875em;
    text-align: center;
    pointer-events: none;
    line-height: 1;
    padding-top: 0.33em;
    text-shadow: 1px 1px 0 black;
  }

  &:hover:before {
    background-color: black;
    color: var(--theme-color-base);
    opacity: 1;
  }

  &:nth-child(1) .counter__side {
    &.-buy {
      background-color: var(--buy-color-1);
    }
    &.-sell {
      background-color: var(--sell-color-1);
    }
  }

  &:nth-child(2) .counter__side {
    &.-buy {
      background-color: var(--buy-color-2);
    }
    &.-sell {
      background-color: var(--sell-color-2);
    }
  }

  &:nth-child(3) .counter__side {
    &.-buy {
      background-color: var(--buy-color-3);
    }
    &.-sell {
      background-color: var(--sell-color-3);
    }
  }

  &:nth-child(4) .counter__side {
    &.-buy {
      background-color: var(--buy-color-4);
    }
    &.-sell {
      background-color: var(--sell-color-4);
    }
  }

  &:nth-child(5) .counter__side {
    &.-buy {
      background-color: var(--buy-color-5);
    }
    &.-sell {
      background-color: var(--sell-color-5);
    }
  }

  &:nth-child(6) .counter__side {
    &.-buy {
      background-color: var(--buy-color-6);
    }
    &.-sell {
      background-color: var(--sell-color-6);
    }
  }

  &:nth-child(7) .counter__side {
    &.-buy {
      background-color: var(--buy-color-7);
    }
    &.-sell {
      background-color: var(--sell-color-7);
    }
  }

  &:nth-child(8) .counter__side {
    &.-buy {
      background-color: var(--buy-color-8);
    }
    &.-sell {
      background-color: var(--sell-color-8);
    }
  }

  &__side {
    display: flex;
    align-items: center;
    flex-grow: 1;
    white-space: nowrap;

    span {
      position: relative;
      padding: 0 0.5em;
      display: block;
    }

    &.-buy {
      color: var(--theme-buy-color);
    }

    &.-sell {
      color: var(--theme-sell-color);
      justify-content: flex-end;
    }
  }
}
</style>
