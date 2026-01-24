<template>
  <div
    class="dialog"
    :class="[
      impliedSize && `dialog--size-${impliedSize}`,
      currentSize && `dialog--${currentSize}`,
      contrasted && `dialog--contrasted`,
      borderless && `dialog--borderless`,
      moved && `dialog--moved`,
      mask && 'dialog--mask'
    ]"
  >
    <div v-if="mask" class="dialog__mask" @click="clickOutside" />
    <div
      ref="contentRef"
      class="dialog__content"
      :class="contentClass"
      @click.stop
      @mousedown="onMouseDown"
    >
      <i
        v-if="resizable"
        class="dialog__resize icon-up-thin"
        @mousedown="handleResize"
        @touchstart="handleResize"
      ></i>
      <header
        v-if="$slots.header"
        class="dialog__header-wrapper"
        @mousedown="handleDrag"
        @touchstart="handleDrag"
      >
        <slot name="cover"></slot>
        <div class="dialog__header">
          <slot name="header"></slot>
          <button
            type="button"
            class="dialog__close btn -link -text -no-grab"
            @click="close"
          >
            <i class="icon-cross"></i>
          </button>
        </div>
        <div class="dialog__subheader" v-if="$slots.subheader">
          <slot name="subheader" />
        </div>
      </header>
      <div ref="bodyRef" class="dialog__body hide-scrollbar" :class="bodyClass">
        <slot></slot>
      </div>
      <footer v-if="$slots.footer" class="dialog__footer d-flex">
        <slot name="footer"></slot>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, getCurrentInstance } from 'vue'
import dialogService, { DialogPosition } from '@/services/dialogService'
import { getEventCords } from '../../utils/helpers'

const props = withDefaults(defineProps<{
  mask?: boolean
  contrasted?: boolean
  borderless?: boolean
  resizable?: boolean
  size?: string | null
  bodyClass?: string
  contentClass?: string
  closeOnEscape?: boolean
}>(), {
  mask: true,
  contrasted: false,
  borderless: false,
  resizable: true,
  size: null,
  closeOnEscape: true
})

const emit = defineEmits<{
  clickOutside: []
  mounted: []
  resize: []
}>()

const contentRef = ref<HTMLElement | null>(null)
const bodyRef = ref<HTMLElement | null>(null)

const delta = reactive({ x: 0, y: 0 })
const impliedSize = ref<string | null>(props.size)
const currentSize = ref<string | null>(null)
const moved = ref(false)
const position = ref<DialogPosition>({})

let _deinteractionTimeout: number | undefined
let _windowResizeTimeout: number | undefined
let _handleTranslateMove: ((event: MouseEvent | TouchEvent) => void) | undefined
let _handleTranslateRelease: (() => void) | undefined
let _handleResizeMove: ((event: MouseEvent | TouchEvent) => void) | undefined
let _handleResizeRelease: (() => void) | undefined
let _handleEscKey: ((event: KeyboardEvent) => void) | undefined
let _handleWindowResize: (() => void) | undefined
let _resizeOrigin: { x: number; y: number } | undefined
let _persistTimeout: ReturnType<typeof setTimeout> | undefined

const instance = getCurrentInstance()

onMounted(async () => {
  const parentDialog = instance?.parent?.proxy as { dialogId?: string } | undefined
  if (parentDialog?.dialogId) {
    setPosition(
      dialogService.dialogPositions[parentDialog.dialogId],
      true
    )
  }

  if (props.closeOnEscape) {
    bindEscKey()
  }

  bindWindowResize()

  await nextTick()
  if (contentRef.value) {
    detectSize(contentRef.value.clientWidth)
  }

  emit('mounted')
})

onBeforeUnmount(() => {
  persistPosition()

  if (_handleTranslateRelease) {
    _handleTranslateRelease()
  }

  if (_handleResizeRelease) {
    _handleResizeRelease()
  }

  if (_handleEscKey) {
    document.removeEventListener('keydown', _handleEscKey)
  }

  if (_handleWindowResize) {
    window.removeEventListener('resize', _handleWindowResize)
  }
})

function persistPosition() {
  const dialogPosition = position.value
  const parentDialog = instance?.parent?.proxy as { dialogId?: string } | undefined

  if (parentDialog?.dialogId) {
    dialogService.dialogPositions[parentDialog.dialogId] = {
      x: dialogPosition.x,
      y: dialogPosition.y,
      w: dialogPosition.w,
      h: dialogPosition.h
    }
  }
}

function handleDrag(event: MouseEvent | TouchEvent) {
  if (
    _handleTranslateRelease ||
    (event as MouseEvent).button === 2 ||
    (event.target as HTMLElement).classList.contains('-no-grab') ||
    (event.target as HTMLElement).parentElement?.classList.contains('-no-grab')
  ) {
    return
  }

  const lastMove = { ...delta }
  const startPosition = getEventCords(event)
  const startOffset = contentRef.value?.offsetTop || 0
  const minY = startOffset * -1

  _handleTranslateMove = (evnt: MouseEvent | TouchEvent) => {
    moved.value = true
    const endPosition = getEventCords(evnt)

    const x = lastMove.x + endPosition.x - startPosition.x
    const y = Math.max(minY, lastMove.y + endPosition.y - startPosition.y)

    delta.x = x
    delta.y = y

    setPosition({ x, y }, true)
  }

  _handleTranslateRelease = () => {
    document.removeEventListener('mousemove', _handleTranslateMove!)
    document.removeEventListener('mouseup', _handleTranslateRelease!)
    document.removeEventListener('touchmove', _handleTranslateMove!)
    document.removeEventListener('touchend', _handleTranslateRelease!)
    window.removeEventListener('blur', _handleTranslateRelease!)

    _handleTranslateRelease = undefined
  }

  document.addEventListener('mousemove', _handleTranslateMove)
  document.addEventListener('mouseup', _handleTranslateRelease)
  document.addEventListener('touchmove', _handleTranslateMove)
  document.addEventListener('touchend', _handleTranslateRelease)
  window.addEventListener('blur', _handleTranslateRelease)
}

function onMouseDown() {
  if (_deinteractionTimeout) {
    clearTimeout(_deinteractionTimeout)
  }

  dialogService.isInteracting = true

  const handler = () => {
    document.removeEventListener('mouseup', handler)

    _deinteractionTimeout = setTimeout(() => {
      dialogService.isInteracting = false
      _deinteractionTimeout = undefined
    }, 100) as unknown as number
  }

  document.addEventListener('mouseup', handler)
}

function clickOutside() {
  if (dialogService.isInteracting) {
    return false
  }

  emit('clickOutside')
}

function close() {
  emit('clickOutside')
}

function handleResize(event: MouseEvent | TouchEvent) {
  _resizeOrigin = getEventCords(event)

  const padding = parseInt(getComputedStyle(bodyRef.value!).padding)

  setPosition({
    w: contentRef.value!.clientWidth,
    h: bodyRef.value!.clientHeight - padding * 2
  })

  _handleResizeMove = (event: MouseEvent | TouchEvent) => {
    const coordinates = getEventCords(event)

    const dialogWidth =
      parseInt(contentRef.value!.style.width) +
      (coordinates.x - _resizeOrigin!.x) * 2
    const dialogHeight =
      parseInt(bodyRef.value!.style.height) +
      (coordinates.y - _resizeOrigin!.y) * 2

    setPosition({ w: dialogWidth, h: dialogHeight }, true)

    _resizeOrigin = coordinates
  }

  _handleResizeRelease = () => {
    document.removeEventListener('mousemove', _handleResizeMove!)
    document.removeEventListener('mouseup', _handleResizeRelease!)
    document.removeEventListener('touchmove', _handleResizeMove!)
    document.removeEventListener('touchend', _handleResizeRelease!)
    window.removeEventListener('blur', _handleResizeRelease!)

    document.body.classList.remove('-unselectable')
    _handleResizeRelease = undefined
  }

  document.addEventListener('mousemove', _handleResizeMove)
  document.addEventListener('mouseup', _handleResizeRelease)
  document.addEventListener('touchmove', _handleResizeMove)
  document.addEventListener('touchend', _handleResizeRelease)
  window.addEventListener('blur', _handleResizeRelease)

  document.body.classList.add('-unselectable')
}

function savePosition(pos: DialogPosition) {
  position.value = {
    ...position.value,
    ...pos
  }
}

function setPosition(pos: DialogPosition | undefined, shouldSavePosition?: boolean) {
  if (!pos) {
    return
  }

  if (typeof pos.w === 'number' && typeof pos.h === 'number') {
    lockSize(pos)
    detectSize(pos.w)
  }

  if (typeof pos.x === 'number' && typeof pos.y === 'number') {
    contentRef.value!.style.transform = `translate(${pos.x}px, ${pos.y}px)`
    delta.x = Math.round(pos.x)
    delta.y = Math.round(pos.y)
  }

  if (shouldSavePosition) {
    if (
      typeof pos.w === 'number' &&
      typeof pos.h === 'number' &&
      (pos.w !== position.value?.w || pos.h !== position.value?.h)
    ) {
      emit('resize')
    }

    savePosition(pos)
  }

  if (_persistTimeout) {
    clearTimeout(_persistTimeout)

    _persistTimeout = setTimeout(() => persistPosition(), 100)
  }
}

function bindEscKey() {
  if (_handleEscKey) {
    return
  }

  _handleEscKey = (event: KeyboardEvent) => {
    const el = instance?.proxy?.$el as HTMLElement
    if (
      event.key === 'Escape' &&
      el === el.parentElement?.querySelector('.dialog:last-child')
    ) {
      event.stopPropagation()
      close()
    }
  }

  document.addEventListener('keydown', _handleEscKey)
}

function bindWindowResize() {
  if (_handleWindowResize) {
    return
  }

  _handleWindowResize = () => {
    if (_windowResizeTimeout) {
      clearTimeout(_windowResizeTimeout)
    }
    _windowResizeTimeout = setTimeout(() => {
      if (contentRef.value) {
        detectSize(contentRef.value.clientWidth)
      }
      _windowResizeTimeout = undefined
    }) as unknown as number
  }

  window.addEventListener('resize', _handleWindowResize)
}

function lockSize(pos?: { w?: number; h?: number }) {
  if (!pos) {
    pos = {
      w: contentRef.value?.clientWidth,
      h: bodyRef.value?.clientHeight
    }
  }
  contentRef.value!.style.maxWidth = '100vw'
  bodyRef.value!.style.maxHeight = '100vh'
  contentRef.value!.style.width = pos.w + 'px'
  bodyRef.value!.style.height = pos.h + 'px'
  moved.value = true
}

function detectSize(w: number) {
  if (w >= 840) {
    currentSize.value = 'large'
  } else if (w > 420) {
    currentSize.value = 'medium'
  } else {
    currentSize.value = 'small'
  }
}

defineExpose({
  setPosition,
  lockSize
})
</script>
