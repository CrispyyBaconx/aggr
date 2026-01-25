<template>
  <Dialog
    @clickOutside="close"
    size="small"
    :resizable="markdown"
    @resize="resizeEditor"
  >
    <template v-slot:header>
      <div class="dialog__title">{{ action }}</div>
    </template>
    <p class="mt0 mb8 -nl" v-if="question">{{ question }}</p>
    <form
      ref="formRef"
      class="flex-grow-1 d-flex -column"
      @submit.prevent="submit"
    >
      <div class="form-group flex-grow-1 d-flex -column">
        <div v-if="label || markdown" class="d-flex mb8">
          <label class="mr8 mt4 mb4">{{ label }}</label>

          <label v-if="markdown" class="checkbox-control -small mlauto mr0">
            <input type="checkbox" class="form-control" v-model="showPreview" />
            <div v-tippy title="Show preview"></div>
          </label>
        </div>
        <MarkdownEditor
          v-if="markdown"
          class="w-100 flex-grow-1"
          ref="editorRef"
          v-model="value"
          :show-preview="showPreview"
          minimal
          autofocus
        />
        <input
          v-else
          type="text"
          class="form-control w-100"
          :placeholder="placeholder"
          v-model="value"
          v-autofocus
          v-on:keyup.enter="submit"
        />
      </div>
    </form>

    <template v-slot:footer>
      <a href="javascript:void(0);" class="btn -text" @click="close(null)">
        Cancel
      </a>
      <button type="button" class="btn -green ml8 -large" @click="submit">
        <i class="icon-check mr8"></i> {{ submitLabel }}
      </button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, defineAsyncComponent } from 'vue'
import Dialog from '@/components/framework/Dialog.vue'
import { useDialog } from '@/composables/useDialog'

const MarkdownEditor = defineAsyncComponent(
  () => import('@/components/framework/editor/MarkdownEditor.vue')
)

const props = withDefaults(
  defineProps<{
    markdown?: boolean
    textarea?: boolean
    question?: string
    action: string
    input?: string
    submitLabel?: string
    placeholder?: string | null
    label?: string | null
  }>(),
  {
    markdown: false,
    textarea: false,
    input: '',
    submitLabel: 'Submit',
    placeholder: null,
    label: null
  }
)

const { output, close } = useDialog()

const formRef = ref<HTMLFormElement | null>(null)
const editorRef = ref<any>(null)
const value = ref('')
const showPreview = ref(false)

onMounted(() => {
  if (props.input && props.input.length) {
    value.value = props.input
  }
})

function submit() {
  close(value.value)
}

function resizeEditor() {
  if (editorRef.value && editorRef.value.resize) {
    editorRef.value.resize()
  }
}

defineExpose({ output, close })
</script>
