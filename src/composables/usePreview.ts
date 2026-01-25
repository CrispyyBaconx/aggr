import { ref, onMounted, onBeforeUnmount } from 'vue'
import { getEventCords } from '@/utils/helpers'
import { isTouchSupported } from '@/utils/touchevent'

const PREVIEW_SIZE = {
  originalWidth: 500,
  originalHeight: 100,
  displayWidth: 300,
  displayHeight: 100
}

export function usePreview() {
  const previewCanvasElement = ref<HTMLCanvasElement | null>(null)
  const previewImageElement = ref<HTMLImageElement | null>(null)
  const previewObjectUrl = ref<string | null>(null)
  const currentPreviewId = ref<string | null>(null)
  let previewCtx: CanvasRenderingContext2D | null = null

  function mountPreview() {
    const pxRatio = window.devicePixelRatio || 1
    const canvas = document.createElement('canvas')
    canvas.width = PREVIEW_SIZE.displayWidth * pxRatio
    canvas.height = PREVIEW_SIZE.displayHeight * pxRatio
    canvas.style.width = `${PREVIEW_SIZE.displayWidth}px`
    canvas.style.height = `${PREVIEW_SIZE.displayHeight}px`
    canvas.style.top = `-1rem`
    canvas.style.left = `0`
    canvas.style.position = `absolute`
    canvas.style.pointerEvents = `none`
    canvas.style.zIndex = `11`
    canvas.style.borderRadius = `0.75rem`
    document.getElementById('app')?.appendChild(canvas)

    previewCanvasElement.value = canvas
    previewCtx = canvas.getContext('2d')
  }

  function onLoad() {
    if (
      !previewImageElement.value ||
      !previewCtx ||
      !previewCanvasElement.value
    )
      return

    const { width, height } = previewImageElement.value
    const pxRatio = window.devicePixelRatio || 1

    previewCtx.drawImage(
      previewImageElement.value,
      width - PREVIEW_SIZE.displayWidth * pxRatio,
      0,
      PREVIEW_SIZE.displayWidth * pxRatio,
      height,
      0,
      0,
      PREVIEW_SIZE.displayWidth * pxRatio,
      PREVIEW_SIZE.displayHeight * pxRatio
    )

    if (previewObjectUrl.value) {
      URL.revokeObjectURL(previewObjectUrl.value)
      previewObjectUrl.value = null
    }
    previewImageElement.value = null
  }

  async function showPreview(json: {
    id: string
    preview?: Blob
    imagePath?: string | null
  }) {
    if (isTouchSupported()) {
      return
    }

    if (!json.preview) {
      if (json.imagePath) {
        json.preview = await fetch(
          `${import.meta.env.VITE_APP_LIB_URL}${json.imagePath}`
        ).then(response => {
          if (!response.ok) {
            json.imagePath = null
            throw new Error('Network response was not ok')
          }
          return response.blob()
        })
      }

      if (!json.preview) {
        clearPreview()
        return
      }
    }

    if (json.id !== currentPreviewId.value) {
      clearPreview()

      currentPreviewId.value = json.id

      if (json.preview instanceof Blob) {
        previewObjectUrl.value = URL.createObjectURL(json.preview)
        const img = new Image()
        img.src = previewObjectUrl.value
        img.addEventListener('load', onLoad)
        previewImageElement.value = img
      }
    }
  }

  function movePreview(event: MouseEvent | TouchEvent) {
    if (!previewCanvasElement.value) {
      return
    }

    const coordinates = getEventCords(event)
    previewCanvasElement.value.style.transform = `translate(${
      coordinates.x - PREVIEW_SIZE.displayWidth / 2
    }px, ${coordinates.y - PREVIEW_SIZE.displayHeight}px)`
  }

  function clearPreview() {
    if (previewCtx && previewCanvasElement.value) {
      previewCtx.clearRect(
        0,
        0,
        previewCanvasElement.value.width,
        previewCanvasElement.value.height
      )
    }
    currentPreviewId.value = null

    if (previewImageElement.value) {
      previewImageElement.value.removeEventListener('load', onLoad)
      previewImageElement.value.src = ''
      previewImageElement.value = null
    }

    if (previewObjectUrl.value) {
      URL.revokeObjectURL(previewObjectUrl.value)
      previewObjectUrl.value = null
    }
  }

  onMounted(() => {
    mountPreview()
  })

  onBeforeUnmount(() => {
    if (previewCanvasElement.value) {
      document.getElementById('app')?.removeChild(previewCanvasElement.value)
    }
  })

  return {
    showPreview,
    movePreview,
    clearPreview
  }
}
