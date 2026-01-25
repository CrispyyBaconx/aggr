<template>
  <div class="markdown-editor form-control">
    <Loader v-if="isLoading" class="markdown-editor__loader" small />
    <template v-if="isLoaded">
      <div ref="editorRef" class="markdown-editor__monaco" style=""></div>
      <template v-if="showPreview">
        <div class="markdown-editor__divider">
          <span class="markdown-editor__divider-badge badge ml4">
            preview
          </span>
        </div>
        <div class="markdown-editor__preview" v-html="preview" />
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { marked } from 'marked'
import Loader from '@/components/framework/Loader.vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    minimal?: boolean
    autofocus?: boolean
    showPreview?: boolean
  }>(),
  {
    modelValue: '',
    minimal: false,
    autofocus: false,
    showPreview: false
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorRef = ref<HTMLElement | null>(null)
const isLoaded = ref(false)
const isLoading = ref(false)

let editorInstance: any = null

const preview = computed(() => {
  return marked(props.modelValue)
})

watch(
  () => props.modelValue,
  value => {
    if (editorInstance && value !== editorInstance.getValue()) {
      editorInstance.setValue(value)
    }
  }
)

watch(
  () => props.showPreview,
  () => {
    resize()
  }
)

onMounted(async () => {
  await loadMonaco()
})

onBeforeUnmount(() => {
  editorInstance?.dispose()
})

async function loadMonaco() {
  isLoading.value = true
  try {
    const { default: monaco } = await import('./editor')

    isLoaded.value = true

    await nextTick()

    createEditor(monaco)

    await nextTick()
  } catch (error) {
    console.error('Failed to load editor:', error)
  } finally {
    isLoading.value = false
  }
}

async function resize() {
  editorInstance?.layout({ width: 0, height: 0 })

  await nextTick()
  editorInstance?.layout()
}

function getDefaultOptions(): any {
  return {
    padding: {
      top: 8,
      bottom: 8
    },
    value: props.modelValue,
    tabSize: 2,
    insertSpaces: true,
    fontSize: 12,
    lineNumbers: 'off',
    overviewRulerLanes: 0,
    overviewRulerBorder: false,
    contextmenu: false,
    theme: 'aggr',

    minimap: {
      enabled: false
    },
    glyphMargin: false,
    folding: false,
    lineNumbersMinChars: 3,
    renderLineHighlight: 'none',
    renderIndentGuides: false,
    renderLineHighlightOnlyWhenFocus: true,
    renderValidationDecorations: 'off',
    renderWhitespace: 'none',
    rulers: [],
    language: 'markdown',
    scrollBeyondLastLine: false,
    automaticLayout: false,
    scrollbar: {
      vertical: 'hidden',
      horizontal: 'auto'
    }
  }
}

async function createEditor(monaco: any) {
  console.log('create editor', monaco, editorRef.value)
  editorInstance = monaco.create(
    editorRef.value as HTMLElement,
    getDefaultOptions()
  )

  const containerEl = editorRef.value as HTMLElement

  let previousHeight = 0

  editorInstance.onDidContentSizeChange(() => {
    const contentHeight = editorInstance.getContentHeight()
    if (contentHeight !== previousHeight) {
      previousHeight = contentHeight
      containerEl.style.height = `${contentHeight}px`
      editorInstance.layout()
    }
  })
  editorInstance.onDidChangeModelContent(() => {
    console.log('monaco change')
    emit('update:modelValue', editorInstance.getValue())
  })

  if (props.autofocus) {
    await nextTick()
    editorInstance.focus()
    const model = editorInstance.getModel()
    const lastLine = model.getLineCount()
    const lastColumn = model.getLineMaxColumn(lastLine)
    editorInstance.setPosition({
      lineNumber: lastLine,
      column: lastColumn
    })
  }

  ;(window as any).instance = editorInstance

  await nextTick()

  editorInstance.layout()
}

defineExpose({
  resize
})
</script>

<style lang="scss" scoped>
.markdown-editor {
  padding: 0;
  flex-grow: 1;
  display: flex;

  &__monaco {
    flex-grow: 1;
    max-height: 50vh;
  }

  &__loader {
    width: 1rem;
    height: 1rem;
    margin: 1rem auto;
  }

  &__divider {
    position: relative;
    background-color: var(--theme-background-200);
    width: 1px;
    height: 100%;
  }

  &__preview {
    position: relative;
    flex-basis: 33%;
    overflow: auto;
    padding: 0.5rem;
    background-color: var(--theme-background-50);
  }
}
</style>
