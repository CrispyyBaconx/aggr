<template>
  <div
    class="chart-layout"
    :style="{
      left: axis.left + 'px',
      right: axis.right + 'px',
      bottom: axis.time + 'px'
    }"
    @dblclick="close"
  >
    <div class="chart-layout__controls">
      <button
        class="btn -text"
        title="Revert back to original positions"
        v-tippy="{ placement: 'bottom', boundary: 'window' }"
        @click="cancel"
      >
        <i class="icon-eraser"></i>
      </button>
      <button
        class="btn -text"
        title="Save positions"
        v-tippy="{ placement: 'bottom', boundary: 'window' }"
        @click="close"
      >
        <i class="icon-check"></i>
      </button>
    </div>
    <chart-price-scale
      v-for="(priceScale, id) of activePriceScales"
      :key="id"
      :paneId="paneId"
      :priceScaleId="id as string"
      :priceScale="priceScale"
      @update="updatePriceScaleScaleMargins(id as string, $event)"
      class="chart-layout__item"
    ></chart-price-scale>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useStore } from 'vuex'

import { ChartPaneState, PriceScaleSettings } from '@/store/panesSettings/chart'
import ChartPriceScale from './PriceScale.vue'

const props = defineProps<{
  paneId: string
  axis: {
    left: number
    right: number
    time: number
  }
  layouting: string | boolean
}>()

const store = useStore()

const activePriceScales = ref<{ [id: string]: PriceScaleSettings & { indicators: string[] } }>({})
const unsyncableMoveId = ref<string | null>(null)

let _originalActivePriceScales: { [id: string]: PriceScaleSettings } = {}
let _handleEscKey: ((event: KeyboardEvent) => void) | null = null

function getActivePriceScales() {
  const indicators = (store.state[props.paneId] as ChartPaneState).indicators

  activePriceScales.value = Object.keys(indicators).reduce(
    (priceScales, indicatorId) => {
      if (
        typeof props.layouting === 'string' &&
        indicatorId !== props.layouting
      ) {
        return priceScales
      }
      const priceScaleId = indicators[indicatorId].options.priceScaleId

      if (!priceScales[priceScaleId]) {
        priceScales[priceScaleId] = {
          ...store.state[props.paneId].priceScales[priceScaleId],
          indicators: []
        }
      }

      priceScales[priceScaleId].indicators.push(indicators[indicatorId].name)

      return priceScales
    },
    {} as { [id: string]: PriceScaleSettings & { indicators: string[] } }
  )

  _originalActivePriceScales = JSON.parse(
    JSON.stringify(activePriceScales.value)
  )
}

function updatePriceScaleScaleMargins(priceScaleId: string, event: { syncable: boolean; id: string; side: string; value: { top: number; bottom: number } }) {
  if (event.syncable && unsyncableMoveId.value !== event.id) {
    if (!syncMoveWithOthers(priceScaleId, event.side, event.value)) {
      unsyncableMoveId.value = event.id
    }
  }

  activePriceScales.value[priceScaleId].scaleMargins = event.value

  store.commit(props.paneId + '/SET_PRICE_SCALE', {
    id: priceScaleId,
    priceScale: activePriceScales.value[priceScaleId]
  })
}

function syncMoveWithOthers(priceScaleId: string, side: string, scaleMargins: { top: number; bottom: number }): boolean {
  const originalScaleMargins =
    activePriceScales.value[priceScaleId].scaleMargins

  let hasSynced = false

  for (const otherId in activePriceScales.value) {
    if (priceScaleId === otherId) {
      continue
    }

    const otherScaleMargins = activePriceScales.value[otherId].scaleMargins

    if (
      otherScaleMargins.top === originalScaleMargins.top &&
      otherScaleMargins.bottom === originalScaleMargins.bottom
    ) {
      // sync overlapping
      activePriceScales.value[otherId].scaleMargins = { ...scaleMargins }

      store.commit(props.paneId + '/SET_PRICE_SCALE', {
        id: otherId,
        priceScale: activePriceScales.value[otherId]
      })

      hasSynced = true
    }
  }

  return hasSynced
}

function cancel() {
  for (const id in _originalActivePriceScales) {
    store.commit(props.paneId + '/SET_PRICE_SCALE', {
      id,
      priceScale: _originalActivePriceScales[id]
    })
  }

  store.commit(props.paneId + '/TOGGLE_LAYOUTING')
}

function close() {
  store.commit(props.paneId + '/TOGGLE_LAYOUTING')
}

function bindEscKey() {
  if (_handleEscKey) {
    return
  }

  _handleEscKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      close()
    }
  }

  document.addEventListener('keydown', _handleEscKey)
}

// Lifecycle
getActivePriceScales()

onMounted(() => {
  document.body.classList.add('-unselectable')
  bindEscKey()
})

onBeforeUnmount(() => {
  document.body.classList.remove('-unselectable')

  if (_handleEscKey) {
    document.removeEventListener('keydown', _handleEscKey)
  }
})
</script>

<style lang="scss">
.chart-layout {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3;

  + .chart__container .tv-lightweight-charts {
    pointer-events: none;
  }

  &__controls {
    position: absolute;
    top: 0;
    border-radius: 0 0 4px 4px;
    background-color: var(--theme-background-100);
    left: 50%;
    transform: translateX(-50%);
    z-index: 4;
    box-shadow: 0 0.2rem 1rem rgba(black, 0.2);

    .btn {
      font-size: 1.25em;
    }
  }
}
</style>
