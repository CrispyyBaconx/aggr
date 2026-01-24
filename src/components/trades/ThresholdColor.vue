<template>
  <ColorPickerControl
    v-if="color"
    class="ml8"
    :value="color"
    label="Buy color"
    @input="regenerateSwatch"
    @click.stop
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vuex'
import ColorPickerControl from '../framework/picker/ColorPickerControl.vue'
import { TradesPaneState } from '@/store/panesSettings/trades'
import { joinRgba, splitColorCode } from '@/utils/colors'

const props = defineProps<{
  paneId: string
  side: 'buy' | 'sell'
  type: 'thresholds' | 'liquidations'
}>()

const store = useStore()

const thresholds = computed(() => 
  (store.state[props.paneId] as TradesPaneState)[props.type]
)

const name = computed(() => `${props.side}Color`)

const color = computed(() => {
  const value = thresholds.value[1][name.value]
  if (!value) {
    return null
  }
  const colorRgb = splitColorCode(value)
  colorRgb[3] = 1
  return joinRgba(colorRgb)
})

async function regenerateSwatch(colorValue: string) {
  store.dispatch(`${props.paneId}/generateSwatch`, {
    type: props.type,
    side: props.side,
    baseVariance: 0.33,
    color: colorValue
  })

  // force refresh
  store.state[props.paneId][props.type] = JSON.parse(
    JSON.stringify(store.state[props.paneId][props.type])
  )
  store.commit(props.paneId + '/SET_THRESHOLD_COLOR', {})
}
</script>
