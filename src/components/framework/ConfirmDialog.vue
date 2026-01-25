<template>
  <Dialog ref="dialogRef" @clickOutside="close" size="small" :resizable="false">
    <template v-slot:header>
      <div class="dialog__title">{{ title }}</div>
    </template>
    <p class="mx0 -nl text-color-50" v-if="!html" v-text="message"></p>
    <p class="mx0 text-color-50" v-else v-html="message"></p>
    <template v-if="showFooter" v-slot:footer>
      <button
        v-for="action in actions"
        :key="action.label"
        type="button"
        class="btn -text mr8"
        @click="onClickAction($event, action)"
        @mousedown.prevent
      >
        {{ action.label }}
      </button>
      <Btn
        type="button"
        class="mr8"
        :class="cancelClass"
        @click="close(false)"
        @mousedown.prevent
        v-if="cancel"
      >
        <i v-if="cancelIcon" class="mr4" :class="cancelIcon"></i> {{ cancel }}
      </Btn>

      <Btn
        v-if="ok"
        type="button"
        :disabled="!isSubmitEnabled"
        class="-large"
        :class="okClass"
        v-autofocus
        @click="close(true)"
        @mousedown.prevent
      >
        <i v-if="okIcon" class="mr4" :class="okIcon"></i> {{ ok }}
      </Btn>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Btn from '@/components/framework/Btn.vue'
import Dialog from '@/components/framework/Dialog.vue'
import { useDialog } from '@/composables/useDialog'

const props = withDefaults(
  defineProps<{
    title?: string
    message: string
    ok?: string
    okIcon?: string
    okClass?: string
    cancel?: string
    cancelIcon?: string | null
    cancelClass?: string
    html?: boolean
    actions?: Array<{ label: string; callback?: (event: Event) => unknown }>
    requireScroll?: boolean
  }>(),
  {
    title: 'Confirmation',
    ok: 'OK',
    okIcon: 'icon-check',
    okClass: '-green',
    cancel: 'Cancel',
    cancelIcon: null,
    cancelClass: '-text',
    html: false,
    actions: () => [],
    requireScroll: false
  }
)

const emit = defineEmits<{
  close: [value: unknown]
}>()

const { output, close: useDialogClose } = useDialog()

function close(data?: unknown) {
  emit('close', data)
  useDialogClose(data)
}

const dialogRef = ref<InstanceType<typeof Dialog> | null>(null)
const isSubmitEnabled = ref(!props.requireScroll)
let scrollHandler: (() => void) | null = null

const showFooter = computed(() => {
  return props.ok || props.cancel || props.actions.length
})

onMounted(() => {
  document.querySelector('.app__wrapper')?.classList.add('-blur')

  if (props.requireScroll) {
    bindScroll()
  }
})

onBeforeUnmount(() => {
  document.querySelector('.app__wrapper')?.classList.remove('-blur')
  unbindScroll()
})

async function bindScroll() {
  await nextTick()
  const bodyElement = dialogRef.value?.$refs?.body as HTMLElement | undefined

  if (!bodyElement) return

  if (bodyElement.clientHeight === bodyElement.scrollHeight) {
    isSubmitEnabled.value = true
    return
  }

  scrollHandler = handleScroll
  bodyElement.addEventListener('scroll', handleScroll)
}

function handleScroll() {
  const bodyElement = dialogRef.value?.$refs?.body as HTMLElement | undefined
  if (!bodyElement) return

  isSubmitEnabled.value =
    bodyElement.scrollTop + bodyElement.clientHeight >=
    bodyElement.scrollHeight - 1

  if (isSubmitEnabled.value) {
    unbindScroll()
  }
}

function unbindScroll() {
  if (!scrollHandler) return

  const bodyElement = dialogRef.value?.$refs?.body as HTMLElement | undefined

  if (bodyElement) {
    bodyElement.removeEventListener('scroll', handleScroll)
  }
  scrollHandler = null
}

function onClickAction(
  event: Event,
  action: { label: string; callback?: (event: Event) => unknown }
) {
  if (action.callback) {
    const result = action.callback(event)
    if (typeof result !== 'undefined') {
      close(result)
    }
  }
}

defineExpose({ output, close })
</script>
<style lang="scss">
.app__wrapper.-blur {
  filter: blur(0.25rem);
}
</style>
