<template>
  <div class="editor" @contextmenu="onContextMenu"></div>
</template>

<script setup lang="ts">
import {
  ref,
  reactive,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
  getCurrentInstance
} from 'vue'
import monaco from './editor'
import { createComponent, getEventCords, mountComponent } from '@/utils/helpers'
import {
  IndicatorEditorOptions,
  IndicatorEditorWordWrapOption
} from '@/store/panesSettings/chart'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    value?: string
    editorOptions?: IndicatorEditorOptions
  }>(),
  {
    modelValue: '',
    value: '',
    editorOptions: () => ({})
  }
)

// Support both :value (Vue 2 style) and v-model/modelValue (Vue 3 style)
const currentValue = () => props.modelValue || props.value || ''

const emit = defineEmits<{
  blur: [value: string]
  options: [
    options: { fontSize: number; wordWrap: IndicatorEditorWordWrapOption }
  ]
}>()

const instance = getCurrentInstance()

let preventOverride = false
let editorInstance: ReturnType<typeof monaco.create> | null = null
let _blurTimeout: number | undefined
let _beforeUnloadHandler: ((event: Event) => void) | null = null
let contextMenuComponent: any = null

const currentEditorOptions = reactive({
  fontSize: window.devicePixelRatio > 1 ? 12 : 14,
  wordWrap: 'off' as IndicatorEditorWordWrapOption
})

watch(
  () => props.editorOptions,
  options => {
    if (editorInstance && options) {
      editorInstance.updateOptions(options)
    }
  },
  { deep: true }
)

watch(
  () => currentValue(),
  value => {
    if (!preventOverride && editorInstance) {
      editorInstance.setValue(value)
    }
  }
)

onMounted(async () => {
  for (const key in props.editorOptions) {
    if (props.editorOptions[key as keyof IndicatorEditorOptions]) {
      ;(currentEditorOptions as any)[key] =
        props.editorOptions[key as keyof IndicatorEditorOptions]
    }
  }

  createEditor()
})

onBeforeUnmount(() => {
  if (_blurTimeout) {
    onBlur(true)
  }

  editorInstance?.dispose()
})

async function resize() {
  editorInstance?.layout({ width: 0, height: 0 })

  await nextTick()
  editorInstance?.layout()
}

async function onBlur(silent = false) {
  if (_beforeUnloadHandler) {
    window.removeEventListener('beforeunload', _beforeUnloadHandler)
    _beforeUnloadHandler = null
  }

  if (!silent) {
    preventOverride = true
    emit('blur', editorInstance?.getValue() || '')

    await nextTick()

    preventOverride = false
  }
}

function onFocus() {
  if (_beforeUnloadHandler) {
    return
  }

  _beforeUnloadHandler = (event: BeforeUnloadEvent) => {
    event.preventDefault()
    event.returnValue = ''
    return false
  }
  window.addEventListener('beforeunload', _beforeUnloadHandler)
}

async function createEditor() {
  const el = instance?.proxy?.$el as HTMLElement
  if (!el) return

  editorInstance = monaco.create(el, {
    value: currentValue(),
    language: 'javascript',
    tabSize: 2,
    insertSpaces: true,
    fontSize: currentEditorOptions.fontSize,
    wordWrap: currentEditorOptions.wordWrap,
    scrollbar: {
      vertical: 'hidden'
    },
    overviewRulerLanes: 0,
    overviewRulerBorder: false,
    contextmenu: false,
    theme: 'aggr'
  })

  editorInstance.getDomNode()?.addEventListener('mousedown', () => {
    if (contextMenuComponent && contextMenuComponent.value) {
      contextMenuComponent.value = null
    }
  })

  editorInstance.onDidBlurEditorText(() => {
    if (_blurTimeout) {
      clearTimeout(_blurTimeout)
    }

    _blurTimeout = setTimeout(() => {
      onBlur()
      _blurTimeout = undefined
    }, 100) as unknown as number
  })

  editorInstance.onDidFocusEditorText(() => {
    if (_blurTimeout) {
      clearTimeout(_blurTimeout)
      _blurTimeout = undefined
    }

    onFocus()
  })
}

async function onContextMenu(event: MouseEvent) {
  if (window.innerWidth < 375) {
    return
  }

  event.preventDefault()
  const { x, y } = getEventCords(event, true)

  const propsData = {
    value: {
      top: y,
      left: x,
      width: 2,
      height: 2
    },
    editorOptions: currentEditorOptions
  }

  const cmdHandler = (args: string[]) => {
    const methodName = args[0]
    if (methodName === 'zoom') {
      zoom(args[1] as unknown as number, args[2] as unknown as boolean)
    } else if (methodName === 'toggleWordWrap') {
      toggleWordWrap(args[1] as unknown as boolean)
    }
  }

  if (contextMenuComponent) {
    for (const key in propsData) {
      contextMenuComponent.instance[key] = (propsData as any)[key]
    }
    contextMenuComponent.instance.onCmd = cmdHandler
  } else {
    document.body.style.cursor = 'progress'
    const module = await import(
      `@/components/framework/editor/EditorContextMenu.vue`
    )
    document.body.style.cursor = ''

    contextMenuComponent = createComponent(module.default, {
      ...propsData,
      onCmd: cmdHandler
    })
    mountComponent(contextMenuComponent)
  }
}

function zoom(value: number, override?: boolean) {
  if (override) {
    currentEditorOptions.fontSize = value
  } else {
    currentEditorOptions.fontSize += value
  }
  emit('options', { ...currentEditorOptions })
}

function toggleWordWrap(value: boolean) {
  currentEditorOptions.wordWrap = !value ? 'on' : 'off'
  emit('options', { ...currentEditorOptions })
}

defineExpose({
  resize,
  zoom,
  toggleWordWrap
})
</script>

<style lang="scss">
.editor {
  height: 100%;
  min-height: 50px;

  .monaco-editor {
    #app.-light & {
      --vscode-editor-background: var(--theme-background-100);
      --vscode-editorStickyScroll-background: var(--theme-background-100);
      --vscode-editorStickyScrollHover-background: var(--theme-background-100);
      --vscode-editorGutter-background: var(--theme-background-100);
    }

    .minimap-shadow-visible {
      box-shadow: rgb(0 0 0 / 10%) -6px 0 6px -6px inset;
    }

    .scroll-decoration {
      box-shadow: rgb(0 0 0 / 10%) 0 6px 6px -6px inset;
    }

    .view-overlays .current-line {
      border-color: var(--theme-background-100);
    }

    .minimap {
      left: auto !important;
      right: 0 !important;
    }
  }
}
</style>
