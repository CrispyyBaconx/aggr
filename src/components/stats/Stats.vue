<template>
  <div class="pane-stats" ref="el">
    <pane-header
      :paneId="paneId"
      :settings="() => import('@/components/stats/StatsDialog.vue')"
    />
    <ul class="stats-buckets">
      <li
        v-for="(bucket, id) in data"
        :key="id"
        class="stat-bucket"
        @click="editStat(id as string)"
      >
        <div class="stat-bucket__name">{{ bucket.name }}</div>
        <div class="stat-bucket__value">{{ bucket.value }}</div>
      </li>
    </ul>
    <div v-if="enableChart" class="stats-chart" ref="chartEl"></div>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  reactive,
  computed,
  onMounted,
  onBeforeUnmount,
  nextTick,
  getCurrentInstance
} from 'vue'
import { useStore } from 'vuex'
import * as TV from 'lightweight-charts'
import aggregatorService from '@/services/aggregatorService'
import Bucket from '../../utils/bucket'
import {
  defaultStatsChartOptions,
  getChartOptions,
  getChartCustomColorsOptions,
  getChartFontSize
} from '../chart/options'

import StatDialog from './StatDialog.vue'
import dialogService from '@/services/dialogService'

import { getBucketId } from '@/utils/helpers'
import { formatAmount } from '@/services/productsService'
import { usePane } from '@/composables/usePane'
import PaneHeader from '../panes/PaneHeader.vue'

const props = defineProps<{
  paneId: string
}>()

const store = useStore()
const instance = getCurrentInstance()

const { el, pane } = usePane(props.paneId, onResize)

const chartEl = ref<HTMLElement | null>(null)
const data = reactive<{
  [id: string]: { value: number | string; name: string; color: string }
}>({})

let _refreshChartDimensionsTimeout: number | null = null
let _chart: TV.IChartApi | null = null
let _buckets: { [id: string]: Bucket } = {}
let _feed: string | null = null
let _onStoreMutation: (() => void) | null = null

const enableChart = computed(() => store.state[props.paneId].enableChart)
const buckets = computed(() => store.state[props.paneId].buckets)

function prepareBuckets() {
  if (_feed) {
    console.debug(`[stats/${props.paneId}] unsubscribe from feed`, _feed)
    aggregatorService.off(_feed, onVolume)
  }

  clearBuckets()

  for (const id in buckets.value) {
    createBucket(buckets.value[id])
  }

  _feed = 'bucket-' + getBucketId(pane.value.markets)
  console.debug(`[stats/${props.paneId}] subscribe to feed`, _feed)

  if (_feed.length) {
    aggregatorService.on(_feed, onVolume)
  } else {
    console.debug(`[stats/${props.paneId}] error feed empty...`)
  }
}

function onVolume(sums: any) {
  for (const id in _buckets) {
    _buckets[id].onStats(sums)

    if (_buckets[id].stacks.length) {
      const value = _buckets[id].getValue()

      data[id].value = formatAmount(value, _buckets[id].precision)
    }

    if (_chart) {
      _buckets[id].updateSerie()
    }
  }
}

function clearBuckets() {
  for (const id in _buckets) {
    removeBucket(id)
  }

  _buckets = {}
}

function removeBucket(id: string) {
  if (!_buckets[id]) {
    return
  }

  _buckets[id].unbind()

  if (_chart) {
    _buckets[id].removeIndicator(_chart)
  }

  delete data[id]

  delete _buckets[id]
}

function refreshBucket(id: string) {
  const options = buckets.value[id]

  if (!options) {
    return
  }

  removeBucket(id)
  createBucket(options)
}

function recolorBucket(id: string, color: string) {
  if (!_buckets[id]) {
    return
  }

  _buckets[id].updateColor(color)

  data[id].color = color
}

function reloadBucketSerie(id: string, type?: string) {
  if (!_buckets[id] || !_chart) {
    return
  }

  if (type) {
    // set different serie type
    _buckets[id].type = type
  }

  _buckets[id].removeIndicator(_chart)
  _buckets[id].createSerie(_chart)
}

function createBucket(statBucket: any) {
  if (statBucket.enabled && typeof data[statBucket.id] === 'undefined') {
    const bucket = new Bucket(statBucket.input, statBucket, props.paneId)

    if (_chart) {
      bucket.createSerie(_chart)
    }

    _buckets[statBucket.id] = bucket

    data[bucket.id] = {
      value: 0,
      name: bucket.name,
      color: typeof bucket.color === 'function' ? bucket.color(0) : bucket.color
    }
  }
}

function refreshBucketName({ id, name }: { id: string; name: string }) {
  const bucket = _buckets[id]
  bucket.name = name
  data[id].name = name
}

function editStat(id: string) {
  dialogService.open(StatDialog, { paneId: props.paneId, bucketId: id })
}

async function createChart() {
  await nextTick()

  if (!chartEl.value) return

  const chartOptions = getChartOptions(
    defaultStatsChartOptions as any,
    props.paneId
  )

  _chart = TV.createChart(chartEl.value, chartOptions)

  for (const id in _buckets) {
    _buckets[id].createSerie(_chart)
  }

  refreshChartDimensions(0)
}

function updateFontSize() {
  if (!_chart) {
    return
  }

  _chart.applyOptions({
    layout: {
      fontSize: getChartFontSize(props.paneId)
    }
  })
}

function removeChart() {
  if (!_chart) {
    return
  }

  for (const id in _buckets) {
    _buckets[id].removeIndicator(_chart)
  }

  _chart.remove()

  _chart = null
}

async function refreshChartDimensions(debounceTime = 500) {
  if (!enableChart.value) {
    return
  }

  if (_refreshChartDimensionsTimeout) {
    clearTimeout(_refreshChartDimensionsTimeout)
  }

  _refreshChartDimensionsTimeout = setTimeout(() => {
    const rootEl = instance?.proxy?.$el as HTMLElement
    if (_chart) {
      _chart.resize(rootEl?.clientWidth || 0, rootEl?.clientHeight || 0)
    }
  }, debounceTime) as unknown as number
}

function onResize() {
  refreshChartDimensions()
}

// Setup store mutation subscription
_onStoreMutation = store.subscribe(mutation => {
  switch (mutation.type) {
    case 'settings/SET_TEXT_COLOR':
      if (_chart && mutation.payload) {
        _chart.applyOptions(getChartCustomColorsOptions(props.paneId))
      }
      break
    case 'settings/SET_CHART_THEME':
      if (_chart) {
        _chart.applyOptions(getChartCustomColorsOptions(props.paneId))
      }
      break
    case 'panes/SET_PANE_MARKETS':
    case props.paneId + '/SET_WINDOW':
      if (mutation.payload.id && mutation.payload.id !== props.paneId) {
        break
      }
      prepareBuckets()
      break
    case props.paneId + '/SET_BUCKET_COLOR':
      recolorBucket(mutation.payload.id, mutation.payload.value)
      break
    case props.paneId + '/SET_BUCKET_TYPE':
      if (_chart) {
        reloadBucketSerie(mutation.payload.id, mutation.payload.value)
      }
      break
    case props.paneId + '/TOGGLE_CHART':
      if (mutation.payload) {
        createChart()
      } else {
        removeChart()
      }
      break
    case props.paneId + '/TOGGLE_BUCKET':
      if (mutation.payload.value) {
        createBucket(buckets.value[mutation.payload.id])
      } else {
        removeBucket(mutation.payload.id)
      }
      break
    case 'panes/SET_PANE_ZOOM':
      if (mutation.payload.id === props.paneId) {
        updateFontSize()
      }
      break
    case props.paneId + '/REMOVE_BUCKET':
      removeBucket(mutation.payload)
      break
    case props.paneId + '/SET_BUCKET_WINDOW':
    case props.paneId + '/SET_BUCKET_INPUT':
    case props.paneId + '/SET_BUCKET_PRECISION':
      refreshBucket(mutation.payload.id)
      break
    case props.paneId + '/RENAME_BUCKET':
      refreshBucketName(mutation.payload)
      break
  }
})

prepareBuckets()

onMounted(() => {
  if (enableChart.value) {
    createChart()
  }
})

onBeforeUnmount(() => {
  if (_feed) {
    aggregatorService.off(_feed, onVolume)
  }

  clearBuckets()
  removeChart()

  _chart = null

  if (_onStoreMutation) {
    _onStoreMutation()
  }
})

defineExpose({
  onResize
})
</script>

<style lang="scss">
.pane-stats {
  position: relative;
}

.stats-chart {
  display: static;

  &:before {
    content: '';
    display: block;
  }

  > * {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }
}

.stats-buckets {
  padding: 0;
  margin: 0;
  list-style: none;
  top: 0;
  position: relative;
  width: 0;

  .tv-lightweight-charts canvas {
    z-index: auto;
  }

  .stat-bucket {
    flex-direction: column;
    align-items: flex-start;
    width: 0;
    white-space: nowrap;
  }

  &:last-child {
    width: auto;
    .stat-bucket {
      flex-direction: row;
      align-items: center;
      width: auto;
    }
  }
}

.stat-bucket {
  display: flex;
  align-items: center;
  padding: 0.75em;
  cursor: pointer;

  + .stat-bucket {
    padding-top: 0;
  }

  &__name {
    letter-spacing: 0.4px;
    transition: opacity 0.2s $ease-out-expo;
    font-size: 80%;
  }

  &__value {
    text-align: right;
    white-space: nowrap;
    font-family: $font-condensed;
    z-index: 1;
    flex-grow: 1;
    font-weight: 600;
    letter-spacing: 0.5px;
  }
}
</style>
