<template>
  <div class="indicator-option-number form-group">
    <label>{{ label }}</label>
    <editable
      class="form-control"
      :value="value"
      :min="min"
      :max="max"
      :step="step"
      @input="$emit('input', $event)"
    ></editable>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  paneId: string
  indicatorId: string
  label: string
  value: number
  definition?: Record<string, unknown>
}>()

defineEmits<{
  (e: 'input', value: number): void
}>()

const min = computed(() =>
  typeof props.definition?.min === 'number' ? props.definition.min : null
)
const max = computed(() =>
  typeof props.definition?.max === 'number' ? props.definition.max : null
)
const step = computed(() =>
  typeof props.definition?.step === 'number' ? props.definition.step : null
)
</script>
