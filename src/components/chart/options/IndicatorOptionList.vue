<template>
  <label class="indicator-option-dropdown form-group">
    <label>{{ label }}<slot name="description" /></label>
    <dropdown-button
      :value="value"
      :options="options"
      class="-outline form-control -arrow"
      :placeholder="(definition as any)?.placeholder"
      @input="$emit('input', $event)"
    ></dropdown-button>
  </label>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DropdownButton from '@/components/framework/DropdownButton.vue'

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

const options = computed(() => {
  if (!(props.definition as any)?.options) {
    return []
  }

  const defOptions = (props.definition as any).options

  if (Array.isArray(defOptions)) {
    return defOptions.reduce((acc: Record<string, string>, option: string) => {
      if (!option) {
        acc[option] = 'Choose'
      } else {
        acc[option] = option
      }
      return acc
    }, {})
  }

  return defOptions
})
</script>
