<template>
  <component
    :is="tag || 'div'"
    :contenteditable="editable !== false"
    :disabled="editable === false"
    @keydown="onKeyDown"
    @input="onInput"
    @focus="onFocus"
    @blur="onBlur"
    @wheel="onWheel"
  ></component>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, getCurrentInstance } from 'vue'
import { countDecimals } from '@/services/productsService'
import { toPlainString } from '@/utils/helpers'

const props = defineProps<{
  modelValue?: string | number
  step?: number
  min?: number
  max?: number
  editable?: boolean
  disabled?: boolean
  tag?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: [value: string | number | undefined]
}>()

const instance = getCurrentInstance()
const changed = ref(false)
const position = ref<number | undefined>(undefined)

let _incrementSelectionTimeout: number | undefined
let _emitTimeout: number | undefined

onMounted(() => {
  setValue(props.modelValue)
})

watch(
  () => props.modelValue,
  newVal => {
    const input = instance?.proxy?.$el as HTMLElement
    const value = input?.innerText

    if (+newVal! !== +value || (isNaN(+newVal!) && value !== newVal)) {
      if (input) {
        input.innerText = String(newVal ?? '')
      }
    }
  }
)

function setValue(value: string | number | undefined) {
  if (typeof value === 'number' && (value < 1e-6 || value > 1e6)) {
    value = toPlainString(value)
  }
  const el = instance?.proxy?.$el as HTMLElement
  if (el) {
    el.innerText = String(value ?? '')
  }
}

function getCursorPosition(): number {
  if (typeof position.value !== 'undefined') {
    return position.value
  }

  let caretPos = 0

  if (window.getSelection) {
    const sel = window.getSelection()
    if (sel?.rangeCount) {
      const range = sel.getRangeAt(0)
      if (range.commonAncestorContainer.parentNode === instance?.proxy?.$el) {
        caretPos = range.endOffset
      }
    }
  }

  return caretPos
}

function setCursorPosition(pos: number) {
  position.value = pos

  if (_incrementSelectionTimeout) {
    clearTimeout(_incrementSelectionTimeout)
  }

  _incrementSelectionTimeout = setTimeout(() => {
    _incrementSelectionTimeout = undefined

    const sel = window.getSelection()
    const el = instance?.proxy?.$el as HTMLElement
    if (sel && el?.lastChild) {
      sel.collapse(el.lastChild, pos)
    }

    position.value = undefined
  }, 50) as unknown as number
}

function onBlur(event: FocusEvent & { which?: number; target: HTMLElement }) {
  if (event.which === 13 && !isNaN(+event.target.innerText)) {
    event.preventDefault()
    return
  }

  if (changed.value) {
    event.target.innerHTML = event.target.innerText
    emit('update:modelValue', event.target.innerText)
  }

  if (window.getSelection) {
    window.getSelection()?.removeAllRanges()
  }
}

function emitInput(value: string) {
  if (_emitTimeout) {
    clearTimeout(_emitTimeout)
  }
  _emitTimeout = setTimeout(() => {
    _emitTimeout = undefined
    emit('update:modelValue', value)
  }, 50) as unknown as number
}

function onInput() {
  changed.value = true
}

function onKeyDown(event: KeyboardEvent) {
  const el = instance?.proxy?.$el as HTMLInputElement

  if (props.disabled || event.which === 13) {
    event.preventDefault()
    el?.blur()
    ;(event.target as HTMLElement).innerText =
      String(props.modelValue ?? '') || el?.innerText || ''

    emit('submit', props.modelValue)

    return
  }

  if (event.which === 38 || event.which === 40) {
    increment((event.which === 40 ? 1 : -1) * (event.shiftKey ? 10 : 1))
  }
}

function onFocus() {
  changed.value = false
}

function increment(direction: number) {
  const el = instance?.proxy?.$el as HTMLElement
  let pos = getCursorPosition()
  let text = el?.innerText.trim() || ''

  let boundaries = findNumberBoundaries(text, pos)
  if (!boundaries && text.match(/\d/)) {
    const singleNumberMatch = text.match(/[\d.-]+/)
    if (singleNumberMatch && singleNumberMatch.index !== undefined) {
      boundaries = {
        start: singleNumberMatch.index,
        end: singleNumberMatch.index + singleNumberMatch[0].length
      }
      pos = boundaries.start
    }
  }
  if (!boundaries) return

  const numberStr = text.substring(boundaries.start, boundaries.end)
  const number = parseFloat(numberStr)

  const max = typeof props.max !== 'number' ? Infinity : props.max
  const min = typeof props.min !== 'number' ? -Infinity : props.min
  const precision = countDecimals(numberStr)
  const step = 1 / Math.pow(10, precision)
  const change = step * (direction * -1)
  const newNumber = Math.max(min, Math.min(max, number + change)).toFixed(
    precision
  )

  text =
    text.slice(0, boundaries.start) + newNumber + text.slice(boundaries.end)

  if (el) {
    el.innerText = text
  }
  emitInput(text)
  setCursorPosition(pos)
}

function findNumberBoundaries(
  text: string,
  pos: number
): { start: number; end: number } | null {
  let start = pos
  let end = pos

  while (start > 0 && /[\d.-]/.test(text[start - 1])) {
    start--
  }

  while (end < text.length && /[\d.-]/.test(text[end])) {
    end++
  }

  if (start === end) return null
  return { start, end }
}

function onWheel(event: WheelEvent) {
  const focusedElement = document.activeElement as HTMLElement

  if (focusedElement !== event.target || !focusedElement.isContentEditable) {
    return
  }

  event.preventDefault()

  increment(Math.sign(event.deltaY) * (event.shiftKey ? 10 : 1))
}
</script>
