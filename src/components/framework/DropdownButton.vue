<template>
  <Btn :loading="loading" :class="buttonClass" @click="toggleDropdown">
    <slot name="selection" :item="modelValue" :placeholder="placeholder">
      <span>{{ label }}</span>
    </slot>
    <dropdown
      v-model="dropdownTrigger"
      @mousedown="selectFromElementRecursive($event)"
    >
      <button
        type="button"
        class="dropdown-item"
        v-for="(option, index) in options"
        :key="index"
      >
        <slot name="option" :value="option" :index="index">
          <span>{{ option }}</span>
        </slot>
      </button>
    </dropdown>
  </Btn>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Btn from '@/components/framework/Btn.vue'

const props = withDefaults(
  defineProps<{
    modelValue?: unknown
    loading?: boolean
    buttonClass?: string
    placeholder?: string | null
    options?: unknown[] | Record<string, unknown>
  }>(),
  {
    modelValue: null,
    loading: false,
    buttonClass: '-arrow',
    placeholder: null,
    options: () => []
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const dropdownTrigger = ref<HTMLElement | null>(null)
const isArray = ref(false)

onMounted(() => {
  isArray.value = Array.isArray(props.options)
})

const label = computed(() => {
  if (props.modelValue) {
    return (
      (props.options as Record<string, unknown>)[props.modelValue as string] ||
      props.modelValue
    )
  }

  if (props.placeholder) {
    return props.placeholder
  }

  return 'Choose'
})

function toggleDropdown(event: MouseEvent) {
  if (event && !dropdownTrigger.value) {
    dropdownTrigger.value = event.currentTarget as HTMLElement
  } else {
    dropdownTrigger.value = null
  }
}

function selectFromElementRecursive(event: MouseEvent) {
  let element = event.target as HTMLElement | null

  let depth = 0
  while (element && ++depth < 3) {
    if (element.classList && element.classList.contains('dropdown-item')) {
      selectOption(element)
      toggleDropdown(event)
      event.stopPropagation()

      break
    }

    element = element.parentElement
  }
}

function selectOption(optionElement: HTMLElement) {
  const index = Array.prototype.indexOf.call(
    optionElement.parentElement?.children,
    optionElement
  )

  let value
  if (isArray.value) {
    value = (props.options as unknown[])[index]
  } else {
    value = Object.keys(props.options as Record<string, unknown>)[index]
  }

  emit('update:modelValue', value)
}
</script>
