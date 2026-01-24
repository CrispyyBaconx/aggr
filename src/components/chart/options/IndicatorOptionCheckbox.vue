<template>
  <label class="indicator-option-checkbox checkbox-control">
    <input
      type="checkbox"
      class="form-control"
      :checked="value"
      @change="$emit('input', ($event.target as HTMLInputElement).checked)"
    />
    <span>{{ label }}<slot name="description" /></span>
    <div></div>
  </label>
</template>

<script setup lang="ts">
defineProps<{
  paneId: string
  indicatorId: string
  label: string
  value: boolean
  definition?: Record<string, unknown>
}>()

defineEmits<{
  (e: 'input', value: boolean): void
}>()
</script>

<style lang="scss" scoped>
.indicator-option-checkbox {
  > span {
    flex-grow: 1;
    word-break: break-word;

    > i {
      line-height: 0.875;
      vertical-align: bottom;
    }
  }
}
</style>
