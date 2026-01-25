<template>
  <div class="pane-chart">
    <pane-header
      ref="paneHeaderRef"
      :paneId="paneId"
      :settings="() => import('@/components/chart/ChartDialog.vue')"
    >
      <template v-slot:menu>
        <button type="button" class="dropdown-item" @click="toggleLayout">
          <i class="icon-resize-height"></i>
          <span>Arrange</span>
        </button>
        <button type="button" class="dropdown-item" @click="restart">
          <i class="icon-refresh"></i>
          <span>Restart</span>
        </button>
        <button type="button" class="dropdown-item" @click="takeScreenshot">
          <i class="icon-add-photo"></i>
          <span>Snapshot</span>
        </button>
      </template>
      <button
        v-for="(timeframeLabel, timeframe) of favoriteTimeframes"
        :key="timeframe"
        @click="selectTimeframe($event, timeframe)"
        title="Maintain shift key to change timeframe on all panes"
        class="btn pane-chart__timeframe -text -cases"
        :class="[
          timeframeForHuman === timeframeLabel && 'pane-header__highlight'
        ]"
      >
        <span>{{ timeframeLabel }}</span>
      </button>
      <Btn
        ref="timeframeButtonRef"
        @click="toggleTimeframeDropdown($event)"
        class="-arrow -cases pane-header__highlight pane-chart__timeframe-selector"
      >
        <span>{{ !isKnownTimeframe ? timeframeForHuman : '' }}</span>
      </Btn>
      <hr />
    </pane-header>
    <div
      class="chart-overlay hide-scrollbar"
      :style="{ left: overlayLeft + 'px' }"
    >
      <indicators-overlay v-model="showIndicatorsValue" :pane-id="paneId" />
      <markets-overlay :pane-id="paneId" />
    </div>

    <chart-layout
      v-if="layouting"
      :pane-id="paneId"
      :layouting="layouting"
      :axis="axis"
    ></chart-layout>

    <div class="chart__container" ref="chartContainerRef"></div>
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
import { usePane } from '@/composables/usePane'

import ChartClass from './chart'

import { getTimeframeForHuman, sleep } from '@/utils/helpers'
import { ChartPaneState } from '@/store/panesSettings/chart'

import aggregatorService from '@/services/aggregatorService'
import { AlertEvent } from '@/services/alertService'

import PaneHeader from '@/components/panes/PaneHeader.vue'
import ChartLayout from '@/components/chart/Layout.vue'
import IndicatorsOverlay from '@/components/chart/IndicatorsOverlay.vue'
import MarketsOverlay from '@/components/chart/MarketsOverlay.vue'
import AlertsList from '@/components/alerts/AlertsList.vue'
import Btn from '@/components/framework/Btn.vue'

import { Trade } from '@/types/types'

const props = defineProps<{
  paneId: string
}>()

const store = useStore()
const instance = getCurrentInstance()

const chartContainerRef = ref<HTMLElement | null>(null)
const paneHeaderRef = ref<InstanceType<typeof PaneHeader> | null>(null)
const timeframeButtonRef = ref<{ isLoading: boolean } | null>(null)

const axis = reactive({
  top: 0,
  left: 0,
  right: 0,
  time: 0
})

let chart: ChartClass | null = null

const { pane } = usePane({
  paneId: props.paneId,
  onResize: () => {
    if (!chart) return
    chart.refreshChartDimensions()
    chart.updateFontSize()
    refreshAxisSize()
  }
})

const layouting = computed(() => {
  refreshAxisSize()
  return (store.state[props.paneId] as ChartPaneState).layouting
})

const overlayLeft = computed(() => axis.left)
const overlayTop = computed(() => axis.top)

const favoriteTimeframes = computed(
  () => store.state.settings.favoriteTimeframes
)
const timeframe = computed(() => store.state[props.paneId].timeframe)

const isKnownTimeframe = computed(() => {
  return Object.keys(favoriteTimeframes.value).indexOf(timeframe.value) !== -1
})

const showIndicators = computed(() => store.state[props.paneId].showIndicators)

const showIndicatorsValue = computed({
  get: () => store.state[props.paneId].showIndicators,
  set: value => store.commit(`${props.paneId}/TOGGLE_INDICATORS`, value)
})

const timeframeForHuman = computed(() => {
  if (!timeframe.value) {
    return 'ERR'
  }
  return getTimeframeForHuman(timeframe.value)
})

onMounted(() => {
  chart = new ChartClass(props.paneId, chartContainerRef.value!)

  bindAggregator()

  const parentEl = instance?.proxy?.$el?.parentElement
  if (showIndicators.value && parentEl && parentEl.clientHeight > 420) {
    showIndicatorsValue.value = true
  }
})

onBeforeUnmount(() => {
  destroyChart()
})

function destroyChart() {
  unbindAggregator()
  chart?.destroy()
}

function onTrades(trades: Trade[]) {
  chart?.queueTrades(trades)
}

function onAlert(alertEvent: AlertEvent) {
  chart?.onAlert(alertEvent)
}

function bindAggregator() {
  aggregatorService.on('trades', onTrades)
  aggregatorService.on('alert', onAlert)
}

function unbindAggregator() {
  aggregatorService.off('trades', onTrades)
  aggregatorService.off('alert', onAlert)
}

function renderChart() {
  chart?.renderAll()
}

async function refreshAxisSize() {
  if (!chartContainerRef.value || !chart) {
    return
  }

  await sleep(100)

  const newAxis = chart.getAxisSize()
  axis.top = newAxis.top
  axis.left = newAxis.left
  axis.right = newAxis.right
  axis.time = newAxis.time
}

function toggleLayout() {
  store.commit(props.paneId + '/TOGGLE_LAYOUTING')
}

async function toggleTimeframeDropdown(event: MouseEvent) {
  if (timeframeButtonRef.value) {
    timeframeButtonRef.value.isLoading = true
  }
  await chart?.toggleTimeframeDropdown(event)
  if (timeframeButtonRef.value) {
    timeframeButtonRef.value.isLoading = false
  }
}

function restart() {
  chart?.restart()
}

function takeScreenshot(event: MouseEvent) {
  chart?.takeScreenshot(event)
}

function selectTimeframe(event: MouseEvent, tf: string) {
  if (tf === timeframe.value) {
    toggleTimeframeDropdown(event)
    return
  }
  store.dispatch(`${props.paneId}/setTimeframe`, tf)
}

defineExpose({
  onResize: () => {
    if (!chart) return
    chart.refreshChartDimensions()
    chart.updateFontSize()
    refreshAxisSize()
  }
})
</script>

<style lang="scss" scoped>
.pane-chart {
  font-family: $font-condensed;

  &:hover .chart-overlay {
    display: flex;
  }

  &__timeframe {
    $timeframe: &;
    opacity: 0.5;
    padding-inline: 0.125em;

    &.pane-header__highlight {
      opacity: 1;

      ~ #{$timeframe}-selector {
        opacity: 0.5;

        .pane:not(:hover) & {
          padding-inline: 0.0625em;
        }

        &:after {
          margin-inline: -0.25em;
        }

        &:hover {
          opacity: 1;
        }
      }
    }

    &:hover {
      opacity: 1;
    }

    &__title {
      flex-grow: 1;
      letter-spacing: 1px;
      text-transform: uppercase;
      opacity: 0.5;
      font-size: 0.875em;
      align-self: flex-end;
      margin-top: 1rem;

      ~ * {
        margin-top: 3rem;
      }
    }

    &__favorite {
      &:hover {
        background-color: var(--theme-color-o20);
      }

      &.icon-star-filled {
        background-color: $red;
        color: white;
        font-weight: 600;
      }
    }
  }
}

.chart__container {
  position: relative;
  width: 100%;
  flex-grow: 1;

  -webkit-touch-callout: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

body.-unselectable .chart-overlay {
  display: none !important;
}
</style>
