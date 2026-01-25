<template>
  <img v-if="imageObjectUrl" :src="imageObjectUrl" />
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'

const props = defineProps<{
  modelValue?: Blob | File | null
}>()

const imageObjectUrl = ref<string | null>(null)

watch(
  () => props.modelValue,
  () => {
    loadBlob()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  clearBlob()
})

function loadBlob() {
  clearBlob()

  const value = props.modelValue
  if (value && value instanceof Blob) {
    imageObjectUrl.value = URL.createObjectURL(value)
  }
}

function clearBlob() {
  if (imageObjectUrl.value) {
    URL.revokeObjectURL(imageObjectUrl.value)
    imageObjectUrl.value = null
  }
}
</script>
