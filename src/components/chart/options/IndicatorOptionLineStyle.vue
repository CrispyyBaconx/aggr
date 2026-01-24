<template>
  <div class="indicator-option-line-style form-group">
    <label>{{ label }}<slot name="description" /></label>
    <dropdown-button
      :modelValue="value"
      :options="{
        0: 'Solid',
        1: 'Dotted',
        2: 'Dashed',
        3: 'LargeDashed',
        4: 'SparseDotted'
      }"
      class="-outline form-control -arrow"
      :placeholder="(definition as any)?.placeholder || 'lineStyle'"
      @update:modelValue="$emit('input', $event)"
    ></dropdown-button>
  </div>
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
