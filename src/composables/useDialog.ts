import { ref, onMounted, getCurrentInstance } from 'vue'

export interface UseDialogOptions {
  preventClose?: () => boolean
}

export function useDialog(options: UseDialogOptions = {}) {
  const output = ref<unknown>(null)
  const isDestroyed = ref(false)
  const instance = getCurrentInstance()

  onMounted(() => {
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        close()
      })
    }
  })

  async function close(data?: unknown): Promise<void> {
    if (isDestroyed.value) {
      return
    }

    if (options.preventClose?.()) {
      return
    }

    if (typeof data !== 'undefined' && data !== null) {
      output.value = data
    }

    isDestroyed.value = true

    // In Vue 3, we use the app's unmount mechanism
    // The dialog service should handle the actual unmounting
    const el = instance?.proxy?.$el as HTMLElement
    if (el?.parentNode) {
      try {
        el.parentNode.removeChild(el)
      } catch (error) {
        // ignore
      }
    }
  }

  return {
    output,
    close
  }
}
