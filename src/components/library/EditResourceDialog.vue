<template>
  <form @submit.prevent="submit">
    <transition name="dialog" :duration="500" @after-leave="onHide">
      <Dialog
        v-if="dialogOpened"
        class="edit-resource-dialog"
        @clickOutside="hide"
        @resize="resizeEditor"
      >
        <template v-slot:header>
          <div class="d-flex">
            <div class="dialog__title">Edit {{ item.name }}</div>

            <small class="-center">
              <code
                class="-filled -center ml4"
                :title="`ID: ${item.id}`"
                v-tippy
              >
                {{ displayId }}
              </code>
            </small>
          </div>
        </template>
        <div class="d-flex -gap16 mb16">
          <div class="form-group">
            <label for="label">Name</label>
            <input
              id="label"
              type="text"
              class="form-control w-100"
              v-model="name"
              required
            />
          </div>
          <div v-if="item.name !== name" class="form-group">
            <label for="label">&nbsp;</label>
            <label class="checkbox-control">
              <input type="checkbox" class="form-control" v-model="updateId" />
              <div class="mr8" title="Get a new ID" v-tippy></div>
              <i
                class="icon-info"
                title="IDs are unique in the library !"
                v-tippy
              ></i>
            </label>
          </div>
        </div>
        <p v-if="updateId && item.id !== newId">
          <i class="icon-info"></i> ID change
          <code class="-filled">{{ item.id }}</code> →
          <code class="-filled">{{ newId }}</code>
        </p>
        <div class="form-group mb16 flex-grow-1 d-flex -column">
          <label for="label">
            Description
            <span
              class="icon-info"
              title='Markdown supported <span class="badge -red ml4">new</span>'
              v-tippy
            ></span>
          </label>
          <MarkdownEditor
            class="w-100 flex-grow-1"
            ref="editorRef"
            style="height: auto"
            v-model="description"
            minimal
          />
        </div>
        <div class="d-flex -gap16">
          <div class="form-group">
            <label for="label">Preview</label>
            <button class="btn -file -blue -cases">
              <i class="icon-upload mr8"></i>
              {{ previewName }}
              <i
                v-if="hasCustomPreview"
                class="icon-cross mr8 btn__suffix"
                @click.stop.prevent="removePreview"
              ></i>
              <input
                type="file"
                class="input-file"
                accept="image/*"
                @change="handlePreviewFile"
              />
            </button>
          </div>
          <div class="edit-resource-dialog__preview">
            <img v-if="imageObjectUrl" :src="imageObjectUrl" />
          </div>
        </div>

        <template v-slot:footer>
          <Btn type="button" class="btn -text" @click="hide">Cancel</Btn>
          <Btn type="submit" class="btn -green ml8 -large">
            <i class="icon-check mr8"></i> Save
          </Btn>
        </template>
      </Dialog>
    </transition>
  </form>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  defineAsyncComponent
} from 'vue'
import Btn from '@/components/framework/Btn.vue'
import Dialog from '@/components/framework/Dialog.vue'
import { useDialog } from '@/composables/useDialog'
import { slugify, uniqueName } from '@/utils/helpers'

const MarkdownEditor = defineAsyncComponent(
  () => import('@/components/framework/editor/MarkdownEditor.vue')
)

interface ResourceItem {
  id: string
  name: string
  description?: string
  preview?: File | Blob | null
  [key: string]: unknown
}

const props = defineProps<{
  item: ResourceItem
  ids: string[]
}>()

const { output, close } = useDialog()

const editorRef = ref<any>(null)
const dialogOpened = ref(false)
const name = ref(props.item.name || '')
const description = ref(props.item.description || '')
const updateId = ref(false)
const imageObjectUrl = ref<string | null>(null)
const newImagePreview = ref<File | null>(null)
const hasDeletedPreview = ref(false)

const displayId = computed(() => {
  const id = props.item.id

  if (!id) {
    return 'no id'
  }

  if (id.length <= 16) {
    return id
  } else {
    return id.slice(0, 6) + '..' + id.substr(-6)
  }
})

const idsExceptCurrent = computed(() => {
  return props.ids.filter(id => id !== props.item.id)
})

const newId = computed(() => {
  return uniqueName(slugify(name.value), idsExceptCurrent.value)
})

const hasCustomPreview = computed(() => {
  if (hasDeletedPreview.value) {
    return false
  }

  if (newImagePreview.value || props.item.preview instanceof File) {
    return true
  }

  return false
})

const previewName = computed(() => {
  if (hasCustomPreview.value) {
    return props.item.id + '.png'
  }

  return 'Browse'
})

onMounted(() => {
  loadPreview()
  show()
})

onBeforeUnmount(() => {
  clearPreview()
})

function show() {
  dialogOpened.value = true
}

function hide() {
  dialogOpened.value = false
}

function onHide() {
  close()
}

function submit() {
  const result: ResourceItem = {
    ...props.item,
    name: name.value,
    displayName: name.value,
    description: description.value
  }

  if (newImagePreview.value) {
    result.preview = newImagePreview.value
  } else if (hasDeletedPreview.value) {
    result.preview = null
  }

  if (updateId.value) {
    result.id = newId.value
  }

  output.value = result
  hide()
}

function loadPreview() {
  clearPreview()

  const preview = newImagePreview.value || props.item.preview
  if (preview instanceof File || preview instanceof Blob) {
    imageObjectUrl.value = URL.createObjectURL(preview)
  }
}

function clearPreview() {
  if (imageObjectUrl.value) {
    URL.revokeObjectURL(imageObjectUrl.value)
    imageObjectUrl.value = null
  }
}

function handlePreviewFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) {
    return
  }

  newImagePreview.value = file
  hasDeletedPreview.value = false
  loadPreview()
}

function removePreview() {
  if (newImagePreview.value) {
    newImagePreview.value = null
  }

  clearPreview()
  hasDeletedPreview.value = true
}

function resizeEditor() {
  if (editorRef.value) {
    editorRef.value.resize()
  }
}

defineExpose({ output, close })
</script>
<style lang="scss" scoped>
.edit-resource-dialog {
  :deep(.dialog__content) {
    width: 420px;
  }
  &__preview {
    position: relative;
    border-radius: 0.375rem;
    border: 1px solid var(--theme-background-200);
    background-color: var(--theme-background-75);
    flex-grow: 1;

    img {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      object-fit: cover;
      width: 100%;
      height: 100%;
    }
  }
}
</style>
