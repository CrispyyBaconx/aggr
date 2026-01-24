<template>
  <component
    :is="tag"
    :type="type"
    :href="href"
    :target="target"
    class="btn"
    @click="onClick"
  >
    <loader v-if="isLoading" class="btn__loader" small />
    <slot />
  </component>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Loader from '@/components/framework/Loader.vue'

const props = withDefaults(defineProps<{
  loading?: boolean
  type?: string
  href?: string | null
  target?: string | null
}>(), {
  loading: false,
  type: 'button',
  href: null,
  target: null
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const isLoading = ref(props.loading)

const tag = computed(() => {
  if (props.href) {
    return 'a'
  }
  return 'button'
})

watch(() => props.loading, (value) => {
  isLoading.value = value
})

function onClick(event: MouseEvent) {
  if (!isLoading.value) {
    emit('click', event)
  }
}
</script>

<style lang="scss" scoped>
.btn {
  &__loader {
    width: 0.5em;
    height: 0.5em;

    &:first-child + * {
      display: none;
    }
  }
}
</style>
