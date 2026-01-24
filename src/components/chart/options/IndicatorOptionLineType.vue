<template>
  <label class="indicator-option-line-type form-group">
    <label>{{ label }}<slot name="description" /></label>
    <dropdown-button
      :modelValue="value"
      :options="{ 0: 'Simple', 1: 'with steps' }"
      class="-outline form-control -arrow"
      :placeholder="(definition as any)?.placeholder || 'lineType'"
      @update:modelValue="$emit('input', $event)"
    ></dropdown-button>
  </label>
</template>

<script setup lang="ts">
import DropdownButton from '@/components/framework/DropdownButton.vue'

defineProps<{
  paneId: string
  indicatorId: string
  label: string
  value: number
  definition?: Record<string, unknown>
}>()

defineEmits<{
  (e: 'input', value: number): void
}>()
</script>
