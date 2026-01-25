<template>
  <transition
    name="dialog"
    :duration="500"
    @after-leave="onHide"
    @after-enter="onShow"
  >
    <Dialog v-if="dialogOpened" class="alert-dialog" @clickOutside="hide">
      <template v-slot:header>
        <div>
          <div class="dialog__title">
            <i
              class="-lower"
              :class="[!edit && 'icon-plus', edit && 'icon-edit']"
            ></i>
            Alert @<code>{{ price }}</code>
          </div>
        </div>

        <div class="column -center"></div>
      </template>
      <form ref="formRef" class="alert-dialog__form" @submit.prevent="create">
        <div class="form-group">
          <label>Label</label>

          <div class="input-group">
            <input
              ref="inputRef"
              type="text"
              class="form-control w-100"
              placeholder="Custom message (optional)"
              v-model="value"
              v-autofocus
              @keyup.enter="create"
            />
            <button
              v-if="value.length"
              type="button"
              class="btn -text -small"
              @click="value = ''"
            >
              <i class="icon-cross"></i>
            </button>
          </div>
        </div>

        <emoji-picker @emoji="appendEmoji" class="alert-dialog__picker" />
      </form>

      <template v-slot:footer>
        <button type="button" class="btn -text" @click="close(false)">
          Cancel
        </button>
        <button type="button" class="btn -green ml8 -large" @click="create">
          <i class="icon-check mr8"></i> {{ submitLabel }}
        </button>
      </template>
    </Dialog>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Dialog from '@/components/framework/Dialog.vue'
import EmojiPicker from '@/components/framework/EmojiPicker.vue'
import { useDialog } from '@/composables/useDialog'

const props = withDefaults(
  defineProps<{
    price?: number
    input?: string | null
    edit?: boolean
  }>(),
  {
    input: null,
    edit: false
  }
)

const { close } = useDialog()

const formRef = ref<HTMLFormElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const dialogOpened = ref(false)
const value = ref('')
const data = ref<string | null>(null)

const submitLabel = computed(() => {
  if (!props.edit) {
    return 'Create'
  }

  return 'Update'
})

onMounted(() => {
  if (props.input) {
    value.value = props.input
  }

  show()
})

function show() {
  dialogOpened.value = true
}

function hide() {
  dialogOpened.value = false
}

function onHide() {
  close(typeof data.value === 'string' ? data.value : null)
}

function onShow() {
  //
}

function create() {
  data.value = value.value
  hide()
}

function appendEmoji(str: string) {
  value.value += str

  inputRef.value?.focus()
}

defineExpose({ close })
</script>
<style lang="scss">
.alert-dialog {
  .dialog__content {
    width: 320px;
  }

  .dialog__body {
    height: 250px;
    padding: 0;
  }

  &__form {
    display: flex;
    flex-direction: column;
    height: 100%;

    .form-group {
      padding: 1rem 1rem 0;
    }
  }

  &__picker {
    flex-grow: 1;
  }
}
</style>
