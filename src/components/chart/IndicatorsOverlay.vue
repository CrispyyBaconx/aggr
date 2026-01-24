<template>
  <div class="chart-overlay__panel indicators-overlay">
    <div class="chart-overlay__content" v-if="modelValue">
      <IndicatorDropdown
        v-model="dropdownTrigger"
        :indicator-id="indicatorId"
        :pane-id="paneId"
      />
      <IndicatorControl
        v-for="id in indicatorOrder"
        :key="id"
        :indicator-id="id"
        :pane-id="paneId"
        @action="onClickIndicator"
        @mousedown="bindSort(id, $event)"
      />
    </div>
    <div class="chart-overlay__head pane-overlay" @click="toggleOverlay">
      <span class="chart-overlay__title">
        {{ label }}
      </span>
      <button type="button" class="btn badge -text" @click.stop="addIndicator">
        <i class="icon-plus"></i>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useStore } from 'vuex'

import { ChartPaneState } from '../../store/panesSettings/chart'

import dialogService from '../../services/dialogService'

import IndicatorControl from '@/components/chart/IndicatorControl.vue'
import IndicatorDropdown from '@/components/indicators/IndicatorDropdown.vue'

const props = defineProps<{
  paneId: string
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const store = useStore()

const dropdownTrigger = ref<HTMLElement | null>(null)
const indicatorId = ref<string | null>(null)
const sorting = ref<{
  id: string
  height: number
  startY: number
  maxPosition: number
  oldPosition: number
  newPosition: number
  moved?: boolean
} | null>(null)

const indicators = computed(() => {
  return (store.state[props.paneId] as ChartPaneState).indicators
})

const indicatorOrder = computed(() => {
  return (store.state[props.paneId] as ChartPaneState).indicatorOrder
})

const label = computed(() => {
  const count = Object.values(indicators.value).length
  return `${count} indicator${count > 1 ? 's' : ''}`
})

function toggleOverlay() {
  emit('update:modelValue', !props.modelValue)
}

function toggleDropdown(event?: Event, id?: string) {
  if (
    event &&
    (!dropdownTrigger.value || !indicatorId.value || indicatorId.value !== id)
  ) {
    const triggerElement = event.currentTarget as HTMLElement
    indicatorId.value = id || null
    dropdownTrigger.value = triggerElement
  } else {
    dropdownTrigger.value = null
    indicatorId.value = null
  }
}

async function editIndicator(id: string) {
  dialogService.open(
    (await import('@/components/indicators/IndicatorDialog.vue')).default,
    { paneId: props.paneId, indicatorId: id },
    'indicator'
  )
  dropdownTrigger.value = null
}

async function addIndicator() {
  dialogService.open(
    (await import('@/components/indicators/IndicatorLibraryDialog.vue'))
      .default,
    {},
    'indicator-library'
  )
}

function onClickIndicator({
  indicatorId: id,
  actionName,
  event
}: {
  indicatorId: string
  actionName?: string
  event?: Event
}) {
  if (sorting.value && sorting.value.moved) {
    return
  }

  switch (actionName) {
    case 'menu':
      return toggleDropdown(event, id)
    case 'remove':
      return store.dispatch(props.paneId + '/removeIndicator', {
        id
      })
    case 'resize':
      return store.commit(
        props.paneId + '/TOGGLE_LAYOUTING',
        id
      )
  }

  return editIndicator(id)
}

function bindSort(id: string, event: MouseEvent) {
  if (sorting.value) {
    return
  }

  const keys = Object.keys(indicators.value)
  let position = indicatorOrder.value.indexOf(id)
  if (position === -1) {
    position = keys.indexOf(id)
  }

  const element = event.currentTarget as HTMLElement
  const startY = event.clientY

  sorting.value = {
    id,
    height: element.clientHeight,
    startY,
    maxPosition: keys.length - 1,
    oldPosition: position,
    newPosition: position
  }

  document.addEventListener('mousemove', handleSort)
  document.addEventListener('mouseup', unbindSort)
}

function handleSort(event: MouseEvent) {
  if (!sorting.value) {
    return
  }

  const offset = event.clientY - sorting.value.startY

  if (!sorting.value.moved) {
    sorting.value.moved = Math.abs(offset) > 3
  }

  const newPosition = Math.max(
    0,
    Math.min(
      sorting.value.maxPosition,
      sorting.value.oldPosition + Math.round(offset / sorting.value.height)
    )
  )

  if (newPosition !== sorting.value.newPosition) {
    sorting.value.newPosition = newPosition
    setIndicatorOrder(sorting.value.id, sorting.value.newPosition)
  }
}

function setIndicatorOrder(id: string, position: number) {
  store.commit(`${props.paneId}/UPDATE_INDICATOR_ORDER`, {
    id,
    position
  })
}

async function unbindSort() {
  if (!sorting.value) {
    return
  }

  document.removeEventListener('mousemove', handleSort)
  document.removeEventListener('mouseup', unbindSort)

  await nextTick()

  setTimeout(() => {
    sorting.value = null
  })
}
</script>
