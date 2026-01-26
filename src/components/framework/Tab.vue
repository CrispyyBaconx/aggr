<template>
  <button
    type="button"
    class="btn tab"
    :class="[selected && 'tab--active']"
    @click="onClick"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { ref, inject } from 'vue'

const props = defineProps<{
  name: string
}>()

const emit = defineEmits<{
  select: [instance: { name: string; select: () => void; deselect: () => void }]
}>()

const selected = ref(false)

// Inject the selectTab function from parent Tabs component
const tabsSelectTab = inject<
  | ((tab: { name: string; select: () => void; deselect: () => void }) => void)
  | null
>('tabsSelectTab', null)

function select() {
  selected.value = true
}

function deselect() {
  selected.value = false
}

function onClick() {
  // Call parent's selectTab via inject if available
  if (tabsSelectTab) {
    tabsSelectTab({ name: props.name, select, deselect })
  }

  // Also emit for backwards compatibility
  emit('select', { name: props.name, select, deselect })
}

defineExpose({
  select,
  deselect
})
</script>

<style lang="scss" scoped>
.tab {
  display: inline-flex;
  border: 0;
  background: 0;
  text-align: center;
  padding: 0 1rem;
  align-items: center;
  cursor: pointer;
  text-transform: none;
  border-radius: 8px 8px 0 0;
  font-size: 1.125rem;
  color: var(--theme-color-100);
  font-family: $font-base;
  border: 1px solid transparent;
  border-bottom: 0;

  &:hover {
    color: var(--theme-color-base);
    background: 0;
    border-color: transparent;
  }

  &:focus {
    box-shadow: none;
  }

  &.tab--active {
    position: relative;
    z-index: 1;
    color: var(--theme-color-base);
    border: 1px solid var(--theme-background-200);
    border-bottom: 0;
    outline: 0;
    background: var(--theme-background-100);
    z-index: 26;
    position: relative;

    &:active {
      box-shadow: 0 1px 0 1px var(--theme-background-100);
      background: var(--theme-background-100);
    }
  }
}
</style>
