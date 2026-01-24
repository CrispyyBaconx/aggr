<template>
  <div class="indicator-option-text form-group">
    <label>{{ label }}<slot name="description" /></label>
    <editable
      class="form-control"
      :value="value"
      :placeholder="(definition as any)?.placeholder"
      @input="$emit('input', $event)"
    ></editable>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  paneId: string
  indicatorId: string
  label: string
  value: string
  definition?: Record<string, unknown>
}>()

defineEmits<{
  (e: 'input', value: string): void
}>()
</script>
