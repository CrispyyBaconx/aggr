<template>
  <div class="indicator-option-color">
    <label>{{ label }}<slot name="description" /></label>
    <color-picker-control
      :label="label"
      model="rgb"
      allow-null
      :value="value"
      @input="$emit('input', $event)"
      @close="reloadIndicator"
    ></color-picker-control>
  </div>
</template>

<script setup lang="ts">
import { useStore } from 'vuex'
import ColorPickerControl from '@/components/framework/picker/ColorPickerControl.vue'

const props = defineProps<{
  paneId: string
  indicatorId: string
  label: string
  value: string
  definition?: Record<string, unknown>
}>()

defineEmits<{
  (e: 'input', value: string): void
}>()

const store = useStore()

function reloadIndicator() {
  store.commit(props.paneId + '/SET_INDICATOR_SCRIPT', {
    id: props.indicatorId,
    value: store.state[props.paneId].indicators[props.indicatorId].script
  })
}
</script>

<style lang="scss" scoped>
.indicator-option-color {
  display: flex;
  justify-content: space-between;
  align-items: center;

  > label > i {
    vertical-align: bottom;
    line-height: 1;
  }
}
</style>
