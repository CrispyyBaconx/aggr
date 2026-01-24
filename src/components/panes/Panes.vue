<template>
  <grid-layout
    ref="gridRef"
    :layout="layout"
    :col-num="cols"
    :row-height="rowHeight"
    :margin="[0, 0]"
    :is-resizable="unlocked"
    :is-draggable="unlocked"
    :use-css-transforms="true"
    :use-style-cursor="false"
    @layout-ready="layoutReady = true"
    @layout-updated="onLayoutUpdated"
  >
    <grid-item
      v-for="gridItem in layout"
      :key="gridItem.i"
      :type="gridItem.type"
      drag-allow-from=".pane-header"
      drag-ignore-from=".-no-grab"
      :x="gridItem.x"
      :y="gridItem.y"
      :w="gridItem.w"
      :h="gridItem.h"
      :i="gridItem.i"
      @container-resized="onContainerResized"
      @resized="onItemResized"
    >
      <component
        v-if="layoutReady && paneComponents[gridItem.type]"
        class="pane"
        ref="panesRef"
        :is="paneComponents[gridItem.type]"
        :paneId="gridItem.i"
      ></component>
    </grid-item>
  </grid-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, defineAsyncComponent, markRaw } from 'vue'
import { useStore } from 'vuex'

import { GridLayout, GridItem } from 'vue3-grid-layout'

import { GRID_COLS } from '@/utils/constants'
import { GridItem as GridItemType } from '@/utils/grid'

// Async component imports - need to be registered for dynamic component
const paneComponents = {
  chart: markRaw(defineAsyncComponent(() => import('@/components/chart/Chart.vue'))),
  trades: markRaw(defineAsyncComponent(() => import('@/components/trades/Trades.vue'))),
  stats: markRaw(defineAsyncComponent(() => import('@/components/stats/Stats.vue'))),
  counters: markRaw(defineAsyncComponent(() => import('@/components/counters/Counters.vue'))),
  prices: markRaw(defineAsyncComponent(() => import('@/components/prices/Prices.vue'))),
  website: markRaw(defineAsyncComponent(() => import('@/components/website/Website.vue'))),
  'trades-lite': markRaw(defineAsyncComponent(() => import('@/components/trades/TradesLite.vue'))),
  alerts: markRaw(defineAsyncComponent(() => import('@/components/alerts/Alerts.vue')))
}

const store = useStore()

const gridRef = ref<InstanceType<typeof GridLayout> | null>(null)
const panesRef = ref<any[]>([])
const rowHeight = ref(80)
const cols = ref(GRID_COLS)
const layoutReady = ref(false)

let _resizeTimeout: number | undefined
let _maximizedPaneId: string | null = null

const panes = computed(() => store.state.panes.panes)
const unlocked = computed(() => !store.state.panes.locked)
const layout = computed(() => store.state.panes.layout)

onMounted(() => {
  updateRowHeight()
  window.addEventListener('resize', updateRowHeight)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateRowHeight)
})

function resizeMaximizedPane() {
  let maximizedItem: HTMLElement | null = null

  if (!_maximizedPaneId) {
    maximizedItem = document.getElementsByClassName(
      '-maximized'
    )[0] as HTMLElement
  } else {
    maximizedItem = document.getElementById(_maximizedPaneId)?.parentElement || null
  }

  nextTick(() => {
    if (maximizedItem) {
      const maximizedPaneId = maximizedItem.children[0]?.id
      let width: number
      let height: number

      if (!_maximizedPaneId) {
        width = maximizedItem.clientWidth
        height = maximizedItem.clientHeight
        _maximizedPaneId = maximizedPaneId
      } else {
        width = parseFloat(maximizedItem.style.width)
        height = parseFloat(maximizedItem.style.height)
        _maximizedPaneId = null
      }
      resizePane(maximizedPaneId, height, width)
    }
  })
}

function resizePane(id: string, height: number, width: number) {
  if (!panesRef.value) {
    return
  }

  const pane = panesRef.value.find(p => p.paneId === id)

  if (!pane) {
    return
  }

  if (typeof pane.onResize === 'function') {
    nextTick(() => {
      pane.onResize(width, height)
    })
  }
}

function onItemResized(id: string, h: number, w: number, hPx: number, wPx: number) {
  resizePane(id, +hPx, +wPx)
}

function updateItem(id: string) {
  const item = layout.value.find((item: GridItemType) => item.i === id)
  store.commit('panes/UPDATE_ITEM', item)
}

function onLayoutUpdated(gridItems: GridItemType[]) {
  store.commit('panes/UPDATE_LAYOUT', gridItems)
}

function onContainerResized(id: string, h: number, w: number, hPx: number, wPx: number) {
  resizePane(id, +hPx, +wPx)
}

function updateRowHeight(event?: Event) {
  if (event && !event.isTrusted) {
    resizeMaximizedPane()
    return
  }

  if (_resizeTimeout) {
    clearTimeout(_resizeTimeout)
  }

  if (event) {
    _resizeTimeout = window.setTimeout(
      () => updateRowHeight(),
      200
    )
  } else {
    _resizeTimeout = undefined

    rowHeight.value = window.innerHeight / cols.value
  }
}
</script>
