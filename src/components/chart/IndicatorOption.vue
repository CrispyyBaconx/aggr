<template>
  <div class="indicator-option">
    <component
      v-if="type"
      :is="componentName"
      :pane-id="paneId"
      :indicator-id="indicatorId"
      :label="label"
      :value="value"
      :definition="definition"
      @input="setValue($event)"
    >
      <template v-if="definition.description" #description>
        <i
          class="icon-info pl4"
          v-tippy="{ followCursor: true, distance: 24 }"
          :title="definition.description"
        ></i>
      </template>
    </component>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent } from 'vue'
import { useStore } from 'vuex'
import {
  getIndicatorOptionType,
  getDefaultIndicatorOptionValue
} from './options'
import { ALLOWED_OPTION_TYPES } from './buildUtils'

const IndicatorOptionNumber = defineAsyncComponent(() =>
  import('@/components/chart/options/IndicatorOptionNumber.vue')
)
const IndicatorOptionText = defineAsyncComponent(() =>
  import('@/components/chart/options/IndicatorOptionText.vue')
)
const IndicatorOptionList = defineAsyncComponent(() =>
  import('@/components/chart/options/IndicatorOptionList.vue')
)
const IndicatorOptionLineStyle = defineAsyncComponent(() =>
  import('@/components/chart/options/IndicatorOptionLineStyle.vue')
)
const IndicatorOptionLineType = defineAsyncComponent(() =>
  import('@/components/chart/options/IndicatorOptionLineType.vue')
)
const IndicatorOptionExchange = defineAsyncComponent(() =>
  import('@/components/chart/options/IndicatorOptionExchange.vue')
)
const IndicatorOptionRange = defineAsyncComponent(() =>
  import('@/components/chart/options/IndicatorOptionRange.vue')
)
const IndicatorOptionCheckbox = defineAsyncComponent(() =>
  import('@/components/chart/options/IndicatorOptionCheckbox.vue')
)
const IndicatorOptionColor = defineAsyncComponent(() =>
  import('@/components/chart/options/IndicatorOptionColor.vue')
)

const props = defineProps<{
  indicatorId: string
  paneId: string
  plotTypes: string[]
  name: string
  ensure?: boolean
}>()

const emit = defineEmits<{
  (e: 'change', payload: { key: string; value: unknown }): void
}>()

const store = useStore()

const type = ref<string | null>(null)
const value = ref<unknown>(null)

const currentIndicatorValue = computed(() =>
  store.state[props.paneId].indicators[props.indicatorId].options[props.name]
)

const definition = computed(() =>
  store.state[props.paneId].indicators[props.indicatorId].optionsDefinitions[props.name] || {}
)

const label = computed(() => definition.value.label || props.name)

const componentName = computed(() => {
  if (!type.value) {
    return 'IndicatorOptionText'
  }

  if (props.name === 'lineType') {
    return 'IndicatorOptionLineType'
  }

  if (props.name === 'lineStyle') {
    return 'IndicatorOptionLineStyle'
  }

  return `IndicatorOption${type.value[0].toUpperCase()}${type.value.toLowerCase().slice(1)}`
})

watch(() => definition.value, () => {
  type.value = getType()
})

watch(() => currentIndicatorValue.value, () => {
  const newValue = getValue()

  if (
    +value.value !== +newValue ||
    (isNaN(+(value.value as number)) && newValue !== value.value)
  ) {
    value.value = newValue
  }
})

// created equivalent
value.value = getValue()
type.value = getType()

if (
  props.ensure &&
  typeof currentIndicatorValue.value === 'undefined' &&
  value.value !== 'null'
) {
  setValue(value.value)
}

function getType() {
  const optionType =
    definition.value.type ||
    getIndicatorOptionType(
      props.name,
      props.plotTypes,
      true,
      currentIndicatorValue.value
    )

  if (!Object.values(ALLOWED_OPTION_TYPES).includes(optionType)) {
    return 'number'
  }

  return optionType
}

function getValue() {
  let preferedValue: unknown

  if (typeof currentIndicatorValue.value !== 'undefined') {
    preferedValue = currentIndicatorValue.value
  }

  if (
    typeof preferedValue === 'undefined' &&
    typeof definition.value.default !== 'undefined'
  ) {
    return definition.value.default
  }

  const defaultValue = getDefaultIndicatorOptionValue(
    props.name,
    props.plotTypes
  )

  if (typeof preferedValue !== 'undefined') {
    if (
      preferedValue &&
      typeof preferedValue === 'object' &&
      defaultValue &&
      typeof defaultValue === 'object'
    ) {
      return Object.assign({}, defaultValue, preferedValue)
    } else {
      return preferedValue
    }
  } else if (typeof defaultValue !== 'undefined') {
    return defaultValue
  }

  return null
}

function setValue(newValue: unknown) {
  emit('change', {
    key: props.name,
    value: newValue
  })

  value.value = newValue
  type.value = getType()
}
</script>

<style lang="scss">
.indicator-option {
  width: 100%;
  max-width: 200px;

  .form-control {
    min-width: 100px;
    max-width: 100%;
  }
}
</style>
