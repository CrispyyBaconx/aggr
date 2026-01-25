<template>
  <div
    class="chart-pricescale"
    :style="{ top: roundedTop + '%', bottom: roundedBottom + '%' }"
    :class="{ '-active': !!currentSide }"
    v-tippy="{ followCursor: true }"
    :title="`<code>${priceScale.scaleMargins.top}</code><br><code>${priceScale.scaleMargins.bottom}</code>`"
  >
    <div class="chart-pricescale__content">
      <div
        class="chart-pricescale__title pane-overlay"
        @mousedown="handleMove"
        @touchstart="handleMove"
      >
        <i class="icon-move mr8"></i>
        <code>{{ priceScale.indicators.join(', ') }}</code>
        <code
          v-if="priceScaleId === 'left' || priceScaleId === 'right'"
          :title="`using ${priceScaleId} scale`"
          v-tippy
          class="ml4"
        >
          {{ priceScaleId === 'left' ? '← LEFT' : '→ RIGHT' }}
        </code>
        <dropdown-button
          :options="modes"
          :model-value="priceScale.mode"
          placeholder="linear"
          @update:model-value="updateMode($event)"
          button-class="badge -outline"
          class="chart-pricescale__mode -small ml8 text-bold"
        >
        </dropdown-button>
      </div>
      <div
        class="chart-pricescale__size pane-overlay"
        v-text="100 - roundedTop - roundedBottom + '%'"
      ></div>
    </div>
    <div
      class="chart-pricescale__boundary -top"
      :class="{ '-active': currentSide === 'top' }"
      @mousedown="handleResize($event, 'top')"
      @touchstart="handleResize($event, 'top')"
    ></div>
    <div
      class="chart-pricescale__boundary -bottom"
      :class="{ '-active': currentSide === 'bottom' }"
      @mousedown="handleResize($event, 'bottom')"
      @touchstart="handleResize($event, 'bottom')"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount, getCurrentInstance } from 'vue'
import { useStore } from 'vuex'

import { PriceScaleSettings } from '@/store/panesSettings/chart'
import { getEventCords, randomString } from '@/utils/helpers'
import DropdownButton from '@/components/framework/DropdownButton.vue'

const props = defineProps<{
  paneId: string
  priceScaleId: string
  priceScale: PriceScaleSettings & { indicators: string[] }
}>()

const emit = defineEmits<{
  update: [
    payload: {
      id: string
      side: string
      value: { top: number; bottom: number }
      syncable: boolean
    }
  ]
}>()

const store = useStore()
const instance = getCurrentInstance()

const top = ref<number>(0)
const bottom = ref<number>(0)
const roundedTop = ref<number>(0)
const roundedBottom = ref<number>(0)

const currentMoveId = ref<string | null>(null)
const currentSide = ref<'top' | 'bottom' | 'both' | null>(null)
const currentOrigin = ref<number>(0)
const currentContainerHeight = ref<number>(0)

const modes = {
  0: 'Linear',
  1: 'Logarithimic',
  2: 'Percent',
  3: 'Indexed to 100'
}

function getSize() {
  roundedTop.value = top.value = props.priceScale.scaleMargins.top * 100
  roundedBottom.value = bottom.value =
    props.priceScale.scaleMargins.bottom * 100
}

function handleResize(event: MouseEvent | TouchEvent, side: 'top' | 'bottom') {
  if (currentMoveId.value) {
    release()
    return
  }

  start(side, getEventCords(event).y)

  document.addEventListener('mousemove', resize)
  document.addEventListener('mouseup', release)
  document.addEventListener('touchmove', resize)
  document.addEventListener('touchend', release)
}

function resize(event: MouseEvent | TouchEvent) {
  const percentMove = getPercentMove(event)

  if (!percentMove) {
    return
  }

  if (currentSide.value === 'top') {
    top.value += percentMove
  } else if (currentSide.value === 'bottom') {
    bottom.value -= percentMove
  }

  updateScaleMargins(event)
}

function handleMove(event: MouseEvent | TouchEvent) {
  if (currentMoveId.value) {
    release()
    return
  }

  start('both', getEventCords(event).y)

  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', release)
  document.addEventListener('touchmove', move)
  document.addEventListener('touchend', release)
}

function move(event: MouseEvent | TouchEvent) {
  const percentMove = getPercentMove(event)

  if (!percentMove) {
    return
  }

  top.value += percentMove
  bottom.value -= percentMove

  updateScaleMargins(event)
}

function release() {
  if (!currentSide.value) {
    return
  }

  if (currentSide.value !== 'both') {
    document.removeEventListener('mousemove', resize)
    document.removeEventListener('touchmove', resize)
  } else {
    document.removeEventListener('mousemove', move)
    document.removeEventListener('touchmove', move)
  }

  document.removeEventListener('mouseup', release)
  document.removeEventListener('touchend', release)

  currentMoveId.value = null
  currentSide.value = null

  top.value = roundedTop.value
  bottom.value = roundedBottom.value
}

function updateScaleMargins(event: MouseEvent | TouchEvent) {
  const topVal = Math.round(top.value)
  const bottomVal = Math.round(bottom.value)

  roundedTop.value = Math.max(0, Math.min(100 - bottomVal, topVal))
  roundedBottom.value = Math.max(0, Math.min(bottomVal, 100 - topVal))

  const scaleMargins = {
    top: roundedTop.value / 100,
    bottom: roundedBottom.value / 100
  }

  if (
    props.priceScale.scaleMargins.top === scaleMargins.top &&
    props.priceScale.scaleMargins.bottom === scaleMargins.bottom
  ) {
    return
  }

  emit('update', {
    id: currentMoveId.value!,
    side: currentSide.value!,
    value: scaleMargins,
    syncable: event.type !== 'touchmove' && !(event as MouseEvent).shiftKey
  })
}

function updateMode(mode: number | string) {
  const updatedPriceScale = { ...props.priceScale, mode: +mode }

  store.commit(props.paneId + '/SET_PRICE_SCALE', {
    id: props.priceScaleId,
    priceScale: updatedPriceScale
  })
}

function getContainerHeight() {
  const el = instance?.proxy?.$el as HTMLElement
  const height = parseFloat(el?.parentElement?.clientHeight as any)
  return height
}

function getPercentMove(event: MouseEvent | TouchEvent) {
  const currentPosition = getEventCords(event)

  const percent =
    ((currentPosition.y - currentOrigin.value) / currentContainerHeight.value) *
    100

  if (!percent) {
    return null
  }

  currentOrigin.value = currentPosition.y

  return percent
}

function start(side: 'top' | 'bottom' | 'both', origin: number) {
  currentMoveId.value = randomString(8)
  currentSide.value = side
  currentOrigin.value = origin
  currentContainerHeight.value = getContainerHeight()
}

// Initialize
getSize()

// Watch for external changes
watch(
  () => props.priceScale.scaleMargins.top,
  () => {
    if (!currentMoveId.value) {
      getSize()
    }
  }
)

watch(
  () => props.priceScale.scaleMargins.bottom,
  () => {
    if (!currentMoveId.value) {
      getSize()
    }
  }
)

onBeforeUnmount(() => {
  release()
})
</script>

<style lang="scss">
.chart-pricescale {
  position: absolute;
  width: 100%;
  font-family: $font-condensed;
  pointer-events: none;

  .pane-overlay {
    border-radius: 4px;
    background-color: var(--theme-background-150);
    box-shadow: 0 0.2rem 1rem rgb(0 0 0 / 20%);
  }

  &.-active,
  &:hover {
    .chart-pricescale__size {
      display: block;
    }

    .chart-pricescale__content:before {
      background-color: var(--theme-base-o25);
    }
  }

  &__boundary {
    position: absolute;
    width: 100%;
    height: 1em;
    cursor: ns-resize;
    pointer-events: all;

    &:before {
      content: '';
      position: absolute;
      border-top: 1px solid var(--theme-background-200);
      width: 100%;
      margin: 0.5em 0;
    }

    &.-top {
      top: -0.5em;

      &:before {
        top: 0;
      }
    }

    &.-bottom {
      bottom: -0.5em;

      &:before {
        bottom: 0;
      }
    }

    &.-active,
    &:hover {
      &:before {
        display: block;
        border-color: var(--theme-color-base);
      }
    }
  }

  &__content {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    cursor: move;

    &:before {
      content: '';
      position: absolute;
      width: 100%;
      height: 100%;
      background-color: var(--theme-background-o10);
    }
  }

  &__title {
    line-height: 1;
    display: inline-flex;
    position: absolute;
    top: 0.5em;
    left: 0.5em;
    padding: 0.25em 0.375em 0.25em 0.25em;
    pointer-events: all;
    text-transform: uppercase;
    align-items: center;
    z-index: 2;

    .icon-move {
      color: var(--theme-color-200);
    }
  }

  &__mode .dropdown__options {
    color: var(--theme-color-base);
  }

  &__size {
    display: none;
    position: absolute;
    bottom: 0.5em;
    right: 0.5em;
    padding: 0.25em;
  }
}
</style>
