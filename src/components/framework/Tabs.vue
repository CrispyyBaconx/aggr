<template>
  <div class="tabs">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { ref, useSlots, onMounted, onBeforeUnmount, watch, provide } from 'vue'

interface TabInstance {
  name: string
  select: () => void
  deselect: () => void
}

const props = defineProps<{
  modelValue?: string | number | null
  value?: string | number | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  input: [value: string]
}>()

const slots = useSlots()
const selectedTab = ref<TabInstance | null>(null)
const tabRefs = ref<TabInstance[]>([])

// Support both v-model (modelValue) and :value/@input patterns
const currentValue = () => props.modelValue ?? props.value

function selectTab(tab: TabInstance) {
  const name = tab.name

  if (!selectedTab.value || currentValue() !== name) {
    if (selectedTab.value) {
      selectedTab.value.deselect()
    }

    selectedTab.value = tab
    selectedTab.value.select()
  }

  emit('update:modelValue', tab.name)
  emit('input', tab.name)
}

// Provide selectTab to child Tab components
provide('tabsSelectTab', selectTab)

// Expose selectTab for external use
defineExpose({
  selectTab,
  registerTab(tab: TabInstance) {
    tabRefs.value.push(tab)
    if (currentValue() === tab.name) {
      selectTab(tab)
    }
  },
  unregisterTab(tab: TabInstance) {
    const index = tabRefs.value.indexOf(tab)
    if (index > -1) {
      tabRefs.value.splice(index, 1)
    }
  }
})
</script>

<style lang="scss" scoped>
.tabs {
  padding: 0 1rem;
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  list-style: none;
  margin: 0;
  height: 2.5rem;
  box-shadow: inset 0 -1px 0 var(--theme-background-200);
}
</style>
