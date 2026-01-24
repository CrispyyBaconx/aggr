<template>
  <editable
    contenteditable
    class="w-100"
    ref="inputRef"
    value=""
    @input="onInput"
    @keydown="onKeydown"
    :placeholder="placeholder"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'

import Editable from '@/components/framework/Editable.vue'

import { isTouchSupported } from '@/utils/touchevent'
import { getTimeframeForHuman } from '@/utils/helpers'

const TIMEFRAME_VOL = /\$$|v$|k$|vol?$/i
const TIMEFRAME_BPS = /mb$|b$|bps?$/i
const TIMEFRAME_MBPS = /mb$|mbps$/i
const TIMEFRAME_TICK = /t$|ticks?$/i

const props = defineProps({
  hero: {
    type: Boolean,
    required: false,
    default: false
  },
  placeholder: {
    type: String,
    required: false,
    default: null
  },
  autofocus: {
    type: String,
    required: false,
    default: null
  }
})

const emit = defineEmits<{
  submit: [value: string]
  input: [value: { value: string; label: string } | null]
}>()

const inputRef = ref<InstanceType<typeof Editable> | null>(null)

onMounted(() => {
  if (!isTouchSupported()) {
    nextTick(() => {
      const inputElement = inputRef.value?.$el as HTMLElement
      inputElement?.focus()
    })
  }
})

function onKeydown(event: KeyboardEvent) {
  if (event.which === 13) {
    event.preventDefault()

    emit('submit', format((event.currentTarget as HTMLElement).innerText))

    const inputElement = inputRef.value?.$el as HTMLElement
    if (inputElement) {
      inputElement.innerText = ''
    }
  } else {
    onInput(event)
  }
}

function format(input: string) {
  const trimmed = input.trim()

  let output: number | string

  if (TIMEFRAME_BPS.test(trimmed)) {
    if (TIMEFRAME_MBPS.test(trimmed)) {
      return parseFloat(trimmed) / 1000 + 'b'
    }
    return parseFloat(trimmed) + 'b'
  } else if (TIMEFRAME_VOL.test(trimmed)) {
    if (trimmed[trimmed.length - 1] === 'k') {
      return (output = parseFloat(trimmed) * 1000 + 'v')
    }
    return (output = parseFloat(trimmed) + 'v')
  } else if (TIMEFRAME_TICK.test(trimmed)) {
    return (output = parseInt(trimmed) + 't')
  } else {
    if (/d$/i.test(trimmed)) {
      output = parseFloat(trimmed) * 60 * 60 * 24
    } else if (/h$/i.test(trimmed)) {
      output = parseFloat(trimmed) * 60 * 60
    } else if (/m$/i.test(trimmed)) {
      output = parseFloat(trimmed) * 60
    } else if (/ms$/i.test(trimmed)) {
      output = parseFloat(trimmed) / 1000
    } else {
      output = parseFloat(trimmed)
    }
  }

  return output.toString()
}

function onInput(event: Event) {
  const value = format((event.currentTarget as HTMLElement).innerText) || null
  let label: string | undefined
  if (value) {
    label = getTimeframeForHuman(value)
  } else {
    label = (event.currentTarget as HTMLElement).innerText
  }

  if (!label || !label.length) {
    return emit('input', null)
  }

  emit('input', {
    value,
    label
  })
}
</script>
