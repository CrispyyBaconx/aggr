<template>
  <img v-if="imageObjectUrl" :src="imageObjectUrl" />
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'

const props = defineProps<{
  modelValue?: Blob | File | null
}>()

const imageObjectUrl = ref<string | null>(null)

watch(() => props.modelValue, () => {
  loadBlob()
}, { immediate: true })

onBeforeUnmount(() => {
  clearBlob()
})

function loadBlob() {
  clearBlob()

  if (props.modelValue instanceof Blob || props.modelValue instanceof File) {
    imageObjectUrl.value = URL.createObjectURL(props.modelValue)
  }
}

function clearBlob() {
  if (imageObjectUrl.value) {
    URL.revokeObjectURL(imageObjectUrl.value)
    imageObjectUrl.value = null
  }
}
</script>
