<template>
  <div class="indicator-option-exchange form-group">
    <label>{{ label }}<slot name="description" /></label>
    <dropdown-button
      :modelValue="value"
      :options="exchanges"
      :placeholder="(definition as any)?.placeholder"
      class="-outline form-control -arrow"
      @update:modelValue="$emit('input', $event as string)"
    ></dropdown-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vuex'
import DropdownButton from '@/components/framework/DropdownButton.vue'

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

const store = useStore()

const exchanges = computed(() =>
  store.getters['exchanges/getExchanges'].reduce(
    (acc: Record<string, string>, exchange: string) => {
      acc[exchange] = exchange
      return acc
    },
    {
      null: 'Choose'
    }
  )
)
</script>
