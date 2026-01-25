<template>
  <Dialog
    class="indicator-dialog"
    :class="[
      !navigation.columnWidth && 'indicator-dialog--collapsed-column',
      resizingColumn && 'indicator-dialog--resizing-column'
    ]"
    size="wide"
    :mask="false"
    :close-on-escape="false"
    :cover="savedPreview"
    @clickOutside="close"
    @resize="onResize"
    contrasted
  >
    <template #cover>
      <BlobImage :value="savedPreview" class="indicator-dialog__preview" />
    </template>

    <template #header>
      <div class="dialog__title indicator-dialog__title -center mrauto">
        <div @dblclick="renameIndicator">{{ name }}</div>
        <code
          class="indicator-dialog__id -filled"
          @click="copyIndicatorId"
          :title="libraryId"
          v-tippy
        >
          <small>{{ displayId }}</small>
        </code>
      </div>

      <button
        v-if="unsavedChanges"
        title="Rollback changes"
        v-tippy
        class="btn ml8 -text -no-grab indicator-dialog__action"
        @click="undoIndicator"
      >
        <i class="icon-eraser"></i><span class="ml8">Discard</span>
      </button>

      <button
        title="Save changes"
        v-tippy
        class="btn ml8 -no-grab indicator-dialog__action"
        :class="[!unsavedChanges && '-text', unsavedChanges && '-green']"
        @click="saveIndicator"
      >
        <i class="icon-save"></i><span class="ml8">Save</span>
      </button>
    </template>
    <template #subheader>
      <tabs :value="navigation.tab" @input="setTab">
        <tab name="script">Script</tab>
        <tab name="options">Options</tab>
      </tabs>

      <IndicatorDropdown
        v-model="dropdownIndicatorTrigger"
        :indicator-id="indicatorId"
        :pane-id="paneId"
      >
        <DropdownButton
          @click.stop
          button-class="dropdown-item"
          :options="{
            revert: 'Revert changes',
            reset: 'Reset to default'
          }"
          class="-cases"
          @input="revertChanges"
        >
          <template #selection>
            <i class="icon-eraser"></i> <span>Reset</span>
          </template>
        </DropdownButton>
      </IndicatorDropdown>

      <button
        class="btn -text -arrow indicator-dialog__settings"
        @click="toggleIndicatorDropdown"
      >
        Settings
      </button>
    </template>
    <div
      v-if="loadedEditor"
      v-show="navigation.tab === 'script'"
      class="indicator-editor"
    >
      <p v-if="error" class="form-feedback ml16">
        <i class="icon-warning mr4"></i> {{ error }}
      </p>
      <editor
        ref="editorRef"
        :value="code"
        :editor-options="navigation.editorOptions"
        @blur="updateScript"
        @options="updateIndicatorOptions"
      />
    </div>
    <div
      v-show="navigation.tab === 'options'"
      class="indicator-options indicator-options--tab hide-scrollbar"
    >
      <ToggableSection
        v-if="scriptOptionsKeys.length"
        :badge="scriptOptionsKeys.length"
        title="Script options"
        id="indicator-left-script"
      >
        <div class="indicator-options__grid">
          <indicator-option
            v-for="key in scriptOptionsKeys"
            :key="key"
            class="indicator-options__option"
            :name="key"
            :pane-id="paneId"
            :indicator-id="indicatorId"
            :plot-types="plotTypes"
            :ensure="ensureOptionValue"
            @change="setIndicatorOption"
          />
        </div>
      </ToggableSection>
      <ToggableSection
        v-if="colorOptionsKeys.length"
        :badge="colorOptionsKeys.length"
        title="Colors"
        id="indicator-left-colors"
      >
        <div class="indicator-options__grid">
          <indicator-option
            v-for="key in colorOptionsKeys"
            :key="key"
            class="indicator-options__option"
            :name="key"
            :pane-id="paneId"
            :indicator-id="indicatorId"
            :plot-types="plotTypes"
            @change="setIndicatorOption"
          />
        </div>
      </ToggableSection>
      <ToggableSection
        v-if="defaultOptionsKeys.length"
        :badge="defaultOptionsKeys.length"
        title="Other options"
        id="indicator-left-other"
      >
        <div class="indicator-options__grid">
          <indicator-option
            v-for="key in defaultOptionsKeys"
            :key="key"
            class="indicator-options__option"
            :name="key"
            :pane-id="paneId"
            :indicator-id="indicatorId"
            :plot-types="plotTypes"
            @change="setIndicatorOption"
          />
        </div>
      </ToggableSection>
    </div>
    <div class="indicator-delimiter">
      <div
        class="indicator-delimiter__resizer"
        @mousedown="handleColumnResize"
        @touchstart="handleColumnResize"
      />
      <button
        class="btn indicator-delimiter__collapser -text"
        @click="toggleCollapseColum"
      >
        <i class="icon-up-thin" />
      </button>
    </div>
    <div
      class="indicator-options indicator-options--column hide-scrollbar"
      :style="{ width: navigation.columnWidth + 'px' }"
    >
      <div
        class="indicator-search input-group"
        :class="[navigation.optionsQuery && 'indicator-search--active']"
      >
        <input
          type="text"
          class="form-control"
          placeholder="search option..."
          v-model="navigation.optionsQuery"
        />
        <button
          v-if="navigation.optionsQuery"
          type="button"
          class="btn -text -small"
          @click="navigation.optionsQuery = ''"
        >
          <i class="icon-cross"></i>
        </button>
      </div>
      <div
        v-if="navigation.optionsQuery.length"
        class="indicator-options__list indicator-search__results"
      >
        <indicator-option
          v-for="key in queryOptionsKeys"
          :key="key"
          :name="key"
          :pane-id="paneId"
          :indicator-id="indicatorId"
          :plot-types="plotTypes"
          @change="setIndicatorOption"
        />
        <p v-if="!queryOptionsKeys.length">No results</p>
      </div>
      <template v-else>
        <ToggableSection
          v-if="colorOptionsKeys.length"
          :badge="colorOptionsKeys.length"
          title="Colors"
          id="indicator-right-colors"
        >
          <div class="indicator-options__list">
            <indicator-option
              v-for="key in colorOptionsKeys"
              :key="key"
              :name="key"
              :pane-id="paneId"
              :indicator-id="indicatorId"
              :plot-types="plotTypes"
              inline
              @change="setIndicatorOption"
            />
          </div>
        </ToggableSection>

        <ToggableSection
          v-if="scriptOptionsKeys.length"
          :badge="scriptOptionsKeys.length"
          title="Script"
          id="indicator-right-script"
        >
          <div class="indicator-options__list">
            <indicator-option
              v-for="key in scriptOptionsKeys"
              :key="key"
              :name="key"
              :pane-id="paneId"
              :indicator-id="indicatorId"
              :plot-types="plotTypes"
              :ensure="ensureOptionValue"
              @change="setIndicatorOption"
            />
          </div>
        </ToggableSection>

        <ToggableSection
          v-if="defaultOptionsKeys.length"
          :badge="defaultOptionsKeys.length"
          title="Other"
          id="indicator-right-default"
        >
          <div class="indicator-options__list">
            <indicator-option
              v-for="key in defaultOptionsKeys"
              :key="key"
              :name="key"
              :pane-id="paneId"
              :indicator-id="indicatorId"
              :plot-types="plotTypes"
              @change="setIndicatorOption"
            />
          </div>
        </ToggableSection>

        <ToggableSection title="Scale" id="indicator-right-scale">
          <div class="form-group">
            <label
              >Scale with
              <i class="icon-info" v-tippy :title="helps.priceScaleId"></i
            ></label>
            <dropdown-button
              :value="indicator?.options?.priceScaleId"
              :options="availableScales"
              placeholder="Default scale"
              class="-outline form-control -arrow w-100"
              @input="setPriceScale($event)"
            ></dropdown-button>
          </div>
        </ToggableSection>

        <ToggableSection title="Format" id="indicator-right-format">
          <div class="d-flex mb4">
            <div class="mrauto">Format</div>
            <div>Precision</div>
          </div>
          <div class="d-flex">
            <dropdown-button
              :value="priceFormat"
              :options="['price', 'volume', 'percent']"
              class="mr8 -outline form-control -arrow"
              @input="setPriceFormat($event, precision)"
              v-tippy
              title="Volume uses abbreviation for Million and Thousand"
            ></dropdown-button>
            <editable
              class="form-control mlauto"
              :model-value="precision"
              @update:model-value="setPriceFormat(priceFormat, $event)"
            ></editable>
          </div>
        </ToggableSection>
      </template>
    </div>

    <template v-slot:footer>
      <presets
        :type="'indicator:' + libraryId"
        class="mr8 -left"
        :adapter="getIndicatorPreset"
        :placeholder="presetPlaceholder"
        :label="lastPreset"
        :show-reset="false"
        @apply="applyIndicatorPreset($event)"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import {
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
  defineAsyncComponent
} from 'vue'
import { useStore } from 'vuex'
import Dialog from '@/components/framework/Dialog.vue'
import Tabs from '@/components/framework/Tabs.vue'
import Tab from '@/components/framework/Tab.vue'
import IndicatorDropdown from '@/components/indicators/IndicatorDropdown.vue'
import ToggableSection from '@/components/framework/ToggableSection.vue'
import IndicatorOption from '@/components/chart/IndicatorOption.vue'
import DropdownButton from '@/components/framework/DropdownButton.vue'
import BlobImage from '@/components/framework/BlobImage.vue'
import Presets from '@/components/framework/Presets.vue'
import Editable from '@/components/framework/Editable.vue'
import { useDialog } from '@/composables/useDialog'
import {
  defaultPlotsOptions,
  defaultSerieOptions,
  getChartScales,
  getIndicatorOptionType,
  getIndicatorOptionValue,
  plotTypesMap
} from '@/components/chart/options'
import dialogService from '@/services/dialogService'
import merge from 'lodash.merge'
import IndicatorPresetDialog from '@/components/chart/IndicatorPresetDialog.vue'
import { copyTextToClipboard, getEventCords } from '@/utils/helpers'
import workspacesService from '@/services/workspacesService'
import { Preset } from '@/types/types'

const Editor = defineAsyncComponent(
  () => import('@/components/framework/editor/Editor.vue')
)

const ignoredOptionsKeys = [
  'crosshairMarkerVisible',
  'minLength',
  'visible',
  'priceScaleId',
  'priceFormat'
]

const props = defineProps<{
  paneId: string
  indicatorId: string
}>()

const store = useStore()
const { close } = useDialog()

const editorRef = ref<any>(null)
const code = ref('')
const navigation = reactive({
  optionsQuery: '',
  editorOptions: {} as Record<string, unknown>,
  columnWidth: 240,
  tab: 'options'
})
const resizingColumn = ref(false)
const loadedEditor = ref(false)
const savedPreview = ref<Blob | null>(null)
const plotTypes = ref<string[]>([])
const defaultOptionsKeys = ref<string[]>([])
const scriptOptionsKeys = ref<string[]>([])
const colorOptionsKeys = ref<string[]>([])
const dropdownIndicatorTrigger = ref<HTMLElement | null>(null)
const ensureOptionValue = ref(true)
let originalIndicator: any = null

const helps = {
  priceScaleId: `Use <u>right</u> for binding indicator to main price scale. Otherwise use it as an id to align multiple indicator on same scale (as overlay)`,
  lastValueVisible: `Show last value on right axis`,
  priceLineVisible: `Show horizontal line at current value`,
  borderVisible: `Only for candlestick series, enable borders of candles`,
  lineWidth: `Only for line and area series`,
  lineStyle: `Only for line and area series`,
  lineType: `Only for line and area series`
}

const indicator = computed(() => {
  return store.state[props.paneId]?.indicators?.[props.indicatorId]
})

const libraryId = computed(() => {
  return indicator.value?.libraryId || props.indicatorId
})

const displayId = computed(() => {
  const id = libraryId.value

  if (!id) {
    return 'n/a'
  }

  if (id.length <= 16) {
    return id
  } else {
    return id.slice(0, 6) + '..' + id.substr(-6)
  }
})

const presetPlaceholder = computed(() => {
  return `${indicator.value?.name?.replace(/\{.*\}/, '').trim() || ''} preset`
})

const unsavedChanges = computed(() => {
  return indicator.value?.unsavedChanges
})

const error = computed(() => {
  return store.state[props.paneId]?.indicatorsErrors?.[props.indicatorId]
})

const name = computed(() => {
  return indicator.value?.displayName || indicator.value?.name
})

const script = computed(() => {
  return indicator.value?.script || ''
})

const precision = computed(() => {
  if (
    !indicator.value?.options?.priceFormat ||
    indicator.value?.options?.priceFormat.auto
  ) {
    return 'auto'
  }

  return typeof indicator.value?.options?.priceFormat.precision === 'number'
    ? indicator.value.options.priceFormat.precision
    : 2
})

const priceFormat = computed(() => {
  return (
    (indicator.value?.options?.priceFormat &&
      indicator.value?.options?.priceFormat.type) ||
    'price'
  )
})

const availableScales = computed(() => {
  return getChartScales(
    store.state[props.paneId]?.indicators,
    props.indicatorId
  )
})

const queryOptionsKeys = computed(() => {
  if (!navigation.optionsQuery.length) {
    return []
  }

  const query = new RegExp(navigation.optionsQuery, 'i')

  return [
    ...scriptOptionsKeys.value,
    ...defaultOptionsKeys.value,
    ...colorOptionsKeys.value
  ].filter(key => query.test(key))
})

const lastPreset = computed({
  get() {
    if (indicator.value?.lastPreset) {
      return indicator.value.lastPreset
    }

    return 'Presets'
  },
  set(preset: Preset | null) {
    if (indicator.value) {
      indicator.value.lastPreset = (preset && preset.name) || null
    }
  }
})

watch(
  script,
  value => {
    code.value = value
  },
  { immediate: true }
)

onMounted(() => {
  restoreNavigation()
  getSavedPreview()

  nextTick(() => {
    getPlotTypes()
    getOptionsKeys()
  })

  originalIndicator = JSON.parse(JSON.stringify(indicator.value))
})

onBeforeUnmount(() => {
  saveNavigation()
})

async function getSavedPreview() {
  const ind = await workspacesService.getIndicator(libraryId.value)
  savedPreview.value = ind?.preview
}

function toggleCollapseColum() {
  if (navigation.columnWidth > 50) {
    navigation.columnWidth = 0
  } else {
    navigation.columnWidth = 240
  }

  resizeEditor()
}

function handleColumnResize(startEvent: MouseEvent | TouchEvent) {
  resizingColumn.value = true

  let refX = getEventCords(startEvent).x

  const moveHandler = (moveEvent: MouseEvent | TouchEvent) => {
    const endX = getEventCords(moveEvent).x

    navigation.columnWidth += refX - endX
    refX = endX
  }

  const endHandler = (endEvent: MouseEvent | TouchEvent) => {
    if (endEvent instanceof MouseEvent) {
      document.removeEventListener('mousemove', moveHandler)
      document.removeEventListener('mouseup', endHandler)
    } else {
      document.removeEventListener('touchmove', moveHandler)
      document.removeEventListener('touchend', endHandler)
    }

    if (navigation.columnWidth < 50) {
      navigation.columnWidth = 0
    }

    resizeEditor()
    resizingColumn.value = false
  }

  if (startEvent instanceof MouseEvent) {
    document.addEventListener('mousemove', moveHandler)
    document.addEventListener('mouseup', endHandler)
  } else {
    document.addEventListener('touchmove', moveHandler)
    document.addEventListener('touchend', endHandler)
  }
}

function restoreNavigation() {
  const navigationState = store.state.settings.indicatorDialogNavigation

  if (navigationState) {
    try {
      const json = JSON.parse(navigationState)
      for (const key in json) {
        ;(navigation as any)[key] = json[key]
      }
    } catch (error) {
      console.error('Failed to parse navigation state', error)
    }
  }
}

function saveNavigation() {
  store.commit('settings/SET_INDICATOR_DIALOG_NAVIGATION', navigation)
}

function setPriceScale(id: string) {
  store.dispatch(props.paneId + '/setIndicatorOption', {
    id: props.indicatorId,
    key: 'priceScaleId',
    value: id
  })
}

function updateScript(newScript: string) {
  store.commit(props.paneId + '/SET_INDICATOR_SCRIPT', {
    id: props.indicatorId,
    value: newScript ? newScript.trim() : undefined
  })

  getPlotTypes()
  getOptionsKeys()
}

function updateIndicatorOptions(options: Record<string, unknown>) {
  navigation.editorOptions = options
}

function getScriptOptions(scriptCode: string) {
  const keys = Object.keys(indicator.value?.optionsDefinitions || {})
  const reg =
    /options\.([a-zA-Z0-9_]+)|[\s\n]*(\w[\d\w]+)[\s\n]*=[\s\n]*option\(/g

  let match

  do {
    if (
      (match = reg.exec(scriptCode)) &&
      match[1] &&
      keys.indexOf(match[1]) === -1
    ) {
      keys.push(match[1])
    }
  } while (match)

  return keys
}

function getPlotTypes() {
  const availableTypes = Object.keys(defaultPlotsOptions).map(a =>
    a.replace(/[^\w]/g, '')
  )

  plotTypes.value = (
    script.value.match(
      new RegExp(`(?:\\n|\\s|^)(?:plot)?(${availableTypes.join('|')})\\(`, 'g')
    ) || []
  )
    .map(a => {
      const justType = a.replace(/[^\w]/g, '').replace(/^plot/, '')

      return plotTypesMap[justType] || justType
    })
    .filter(
      (t, index, self) => self.indexOf(t) === index && defaultPlotsOptions[t]
    )
}

async function renameIndicator() {
  const newName = await dialogService.prompt({
    action: 'Rename',
    input: store.state[props.paneId].indicators[props.indicatorId].name
  })

  if (typeof newName === 'string' && newName !== name.value) {
    store.dispatch(props.paneId + '/renameIndicator', {
      id: props.indicatorId,
      name: newName
    })
  }
}

async function saveIndicator() {
  await store.dispatch(props.paneId + '/saveIndicator', props.indicatorId)
  setTimeout(() => {
    getSavedPreview()
  }, 500)
}

async function undoIndicator() {
  if (!(await dialogService.confirm('Undo changes ?'))) {
    return
  }

  store.dispatch(props.paneId + '/undoIndicator', {
    libraryId: libraryId.value,
    indicatorId: props.indicatorId
  })
}

async function getIndicatorPreset(originalPreset?: Preset) {
  const optionsKeys = [
    ...colorOptionsKeys.value,
    ...scriptOptionsKeys.value,
    ...defaultOptionsKeys.value
  ]
  const payload = await dialogService.openAsPromise(IndicatorPresetDialog, {
    keys: optionsKeys,
    plotTypes: plotTypes.value,
    originalKeys: originalPreset
      ? Object.keys(originalPreset.data.options)
      : scriptOptionsKeys.value
  })

  if (payload) {
    if (
      typeof Object.values(payload.selection).find(a => !!a) === 'undefined' &&
      !payload.script
    ) {
      store.dispatch('app/showNotice', {
        title: 'You did not select anything to save in the preset !',
        type: 'error'
      })
      return
    }

    const indicatorPreset: any = {
      options: {}
    }

    for (const key of optionsKeys) {
      if (!payload.selection[key]) {
        continue
      }
      indicatorPreset.options[key] = getIndicatorOptionValue(
        props.paneId,
        props.indicatorId,
        key,
        plotTypes.value
      )
    }

    if (payload.script) {
      indicatorPreset.script = script.value
    }

    return indicatorPreset
  }
}

function getOptionsKeys() {
  const scriptOpts = getScriptOptions(script.value)
  const defaultOpts = Object.keys(defaultSerieOptions)
  const defaultSeriesOpts = plotTypes.value.reduce(
    (typesKeys: string[], key) => [
      ...typesKeys,
      ...Object.keys(defaultPlotsOptions[key] || {})
    ],
    []
  )

  const allKeys = [...defaultOpts, ...defaultSeriesOpts, ...scriptOpts].filter(
    (x, i, a) => {
      if (ignoredOptionsKeys.indexOf(x) === -1 && a.indexOf(x) == i) {
        return true
      }
      return false
    }
  )

  const colorKeys: string[] = []
  const nonColorScriptKeys: string[] = []
  const otherKeys: string[] = []

  for (let i = 0; i < allKeys.length; i++) {
    const key = allKeys[i]
    if (
      getIndicatorOptionType(
        key,
        plotTypes.value,
        false,
        indicator.value?.options?.[key]
      ) === 'color'
    ) {
      colorKeys.push(allKeys.shift()!)
    } else if (scriptOpts.indexOf(key) !== -1) {
      nonColorScriptKeys.push(allKeys.shift()!)
    } else {
      otherKeys.push(allKeys.shift()!)
    }
    i--
  }

  scriptOptionsKeys.value = nonColorScriptKeys
  defaultOptionsKeys.value = otherKeys
  colorOptionsKeys.value = colorKeys
}

function applyIndicatorPreset(preset?: Preset & { name: string }) {
  const data = preset ? preset.data : null

  const ind = store.state[props.paneId].indicators[props.indicatorId]

  lastPreset.value = preset || null

  if (data) {
    merge(ind, data)
  } else {
    const keys = scriptOptionsKeys.value.concat(
      defaultOptionsKeys.value,
      colorOptionsKeys.value
    )

    for (const key of keys) {
      const defaultValue = getDefaultValue(key)

      if (typeof defaultValue !== 'undefined') {
        ind.options[key] = defaultValue
      }
    }
  }

  colorOptionsKeys.value = []

  nextTick(() => {
    store.commit(props.paneId + '/SET_INDICATOR_SCRIPT', {
      id: props.indicatorId
    })

    getPlotTypes()
    getOptionsKeys()

    store.commit(props.paneId + '/FLAG_INDICATOR_AS_UNSAVED', props.indicatorId)
  })
}

function getDefaultValue(key: string): any {
  // Implementation depends on your logic
  return undefined
}

function setPriceFormat(type: string, precisionInput: string | number) {
  let auto = false

  let precisionNum = Math.round(Number(precisionInput))

  if (precisionInput === '' || isNaN(precisionNum)) {
    auto = true
    precisionNum = 2
  }

  const priceFormatValue = {
    type,
    precision: precisionNum,
    minMove: 1 / Math.pow(10, precisionNum),
    auto
  }

  store.dispatch(props.paneId + '/setIndicatorOption', {
    id: props.indicatorId,
    key: 'priceFormat',
    value: priceFormatValue
  })

  store.commit(props.paneId + '/SET_PRICE_SCALE', {
    id: indicator.value?.options?.priceScaleId,
    priceScale: {
      ...store.state[props.paneId].priceScales[
        indicator.value?.options?.priceScaleId
      ],
      priceFormat: {
        type,
        precision: precisionNum,
        minMove: 1 / Math.pow(10, precisionNum),
        auto
      }
    }
  })
}

function copyIndicatorId() {
  copyTextToClipboard(props.indicatorId)

  store.dispatch('app/showNotice', {
    title: `Copied indicator id to clipboard`
  })
}

function toggleIndicatorDropdown(event: MouseEvent) {
  if (dropdownIndicatorTrigger.value) {
    dropdownIndicatorTrigger.value = null
  } else {
    dropdownIndicatorTrigger.value = event.currentTarget as HTMLElement
  }
}

function setIndicatorOption({ key, value }: { key: string; value: any }) {
  store.dispatch(props.paneId + '/setIndicatorOption', {
    id: props.indicatorId,
    key: key,
    value
  })
}

function resizeEditor() {
  if (editorRef.value) {
    editorRef.value.resize()
  }
}

function onResize() {
  resizeEditor()
}

async function revertChanges(op: 'reset' | 'revert') {
  if (op === 'reset') {
    ensureOptionValue.value = false
    if (indicator.value) {
      indicator.value.options = {
        priceScaleId: indicator.value.options.priceScaleId
      }
    }
    store.commit(props.paneId + '/SET_INDICATOR_SCRIPT', {
      id: props.indicatorId
    })
  } else if (op === 'revert') {
    applyIndicatorPreset({
      data: originalIndicator,
      name: ''
    })
  }

  scriptOptionsKeys.value = []
  defaultOptionsKeys.value = []
  colorOptionsKeys.value = []
  await nextTick()
  getOptionsKeys()
}

async function setTab(value: string) {
  navigation.tab = value

  if (navigation.tab === 'script') {
    loadedEditor.value = true
  }

  await nextTick()

  resizeEditor()
  saveNavigation()
}

defineExpose({ close })
</script>
<style lang="scss" scoped>
.indicator-dialog {
  &--resizing-column {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;

    .indicator-editor {
      overflow: hidden;
    }
  }

  &__settings {
    position: absolute;
    right: 0.25rem;
    top: 0.25rem;
    bottom: 0.5rem;
    padding: 0.5rem;
  }

  &__preview {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: hidden;
    border-radius: 1rem 1rem 0 0;
    filter: blur(0.25rem);
    object-fit: cover;
  }

  :deep(.dialog__content) {
    width: 755px;
    overflow: visible;

    .dialog__body {
      padding: 0;
      flex-direction: row;
      align-items: stretch;
      overflow: visible;
    }
  }

  &__title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-overflow: ellipsis;
    overflow: hidden;
  }

  &__action {
    .dialog--small & span,
    .dialog--medium & span {
      display: none;
    }
  }

  &__id {
    display: none;
    max-width: 5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0;

    @media screen and (min-width: 768px) {
      display: block;
    }

    .dialog--small & {
      display: none;
    }
  }
}

.indicator-search {
  backdrop-filter: blur(0.25rem);
  background-color: var(--theme-background-o75);
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1;

  input {
    border: 0;
    background: 0;
    color: inherit;
    padding: 1rem;
    border-radius: 0;
  }

  &__results {
    padding: 1rem;
  }
}

.indicator-options {
  position: relative;

  &--tab {
    display: block;
    overflow: auto;
    flex-grow: 1;
  }

  &--column {
    width: 15rem;
    flex-shrink: 0;
    flex-direction: column;
    display: none;
    overflow-y: auto;

    .dialog--small & {
      width: 100%;
      display: none;
    }

    @media screen and (min-width: 768px) {
      display: flex;
    }
  }

  &__grid {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
    justify-content: stretch;
    container-type: inline-size;

    .indicator-options__option {
      margin: 0;
      flex-basis: 0;
      min-width: 150px;
      flex-shrink: 0;
      flex-grow: 1;

      @container (min-width: 0px) {
        max-width: none;
        min-width: 0;
        flex-grow: 0;
        flex-basis: 100%;
        width: 100%;
      }

      @container (min-width: 420px) {
        flex-basis: calc(50% - 0.5rem);
        width: calc(50% - 0.5rem);
      }

      @container (min-width: 580px) {
        flex-basis: calc(33% - 0.66rem);
        width: calc(33% - 0.66rem);
      }

      @container (min-width: 768px) {
        flex-basis: calc(25% - 0.75rem);
        width: calc(25% - 0.75rem);
      }
    }
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
}

.indicator-delimiter {
  position: relative;

  &__resizer {
    position: relative;
    z-index: 2;
    overflow: visible;
    height: 100%;
    width: 1px;
    background-color: var(--theme-background-150);

    .indicator-dialog--collapsed-column & {
      width: 0px;
    }

    &:before {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      cursor: ew-resize;
      left: -0.25rem;
      right: -0.25rem;
    }
  }

  &__collapser {
    border: 1px solid var(--theme-background-300);
    border-radius: 0.25rem;
    padding: 0.25rem 0.125rem;
    position: absolute;
    z-index: 10;
    right: -0.5rem;
    top: 0.75rem;
    font-size: 0.75rem;
    transition: right 0.2s cubic-bezier(0, 1.4, 1, 1);
    z-index: 20;
    display: none;
    height: 2rem;

    &.btn {
      background-color: var(--theme-background-150);
    }

    .dialog--small & {
      display: none;
    }

    @media screen and (min-width: 768px) {
      display: inline-flex;
    }

    i {
      transform: rotateZ(90deg);
      transition: transform 0.2s cubic-bezier(0, 1.4, 1, 1);
      display: block;

      .indicator-dialog--collapsed-column & {
        transform: rotateZ(-90deg);
      }
    }

    .indicator-dialog--collapsed-column & {
      right: -4px;
    }
  }
}

.indicator-editor {
  display: flex;
  flex-direction: column;
  position: relative;
  flex-grow: 1;
  min-height: 50px;
}
</style>
