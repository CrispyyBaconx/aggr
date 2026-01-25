<template>
  <div class="indicator-option-range form-group">
    <label>
      {{ label }}
      <editable
        tag="code"
        class="indicator-option-range__value -filled"
        :value="stepRoundedValue"
        :min="min"
        :max="max"
        :step="step"
        @input="$emit('input', +$event || 0)"
      ></editable>
      <slot name="description" />
    </label>
    <slider
      class="mt8"
      :min="min"
      :max="max"
      :step="step"
      :log="log"
      :label="true"
      :value="value"
      :gradient="gradient"
      @input="$emit('input', $event)"
      @reset="
        $emit(
          'input',
          (definition as any)?.default ?? (definition as any)?.value
        )
      "
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Slider from '@/components/framework/picker/Slider.vue'
import { countDecimals } from '@/services/productsService'

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
  typeof (props.definition as any)?.min === 'number'
    ? (props.definition as any).min
    : 0
)
const max = computed(() =>
  typeof (props.definition as any)?.max === 'number'
    ? (props.definition as any).max
    : 1
)
const log = computed(() => !!(props.definition as any)?.log)
const step = computed(() =>
  typeof (props.definition as any)?.step === 'number'
    ? (props.definition as any).step
    : 0.1
)

const decimals = computed(() => countDecimals(step.value))

const stepRoundedValue = computed(() => {
  if (typeof props.value !== 'number') {
    return props.value
  }

  return +props.value.toFixed(decimals.value)
})

const gradient = computed(() => {
  if (
    !(props.definition as any)?.gradient ||
    !Array.isArray((props.definition as any).gradient)
  ) {
    return null
  }

  return (props.definition as any).gradient
})
</script>

<style lang="scss" scoped>
.indicator-option-range {
  &__value {
    font-size: 0.875rem;
  }
}
</style>
