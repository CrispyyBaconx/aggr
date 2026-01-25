import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useStore } from 'vuex'
import { Pane } from '@/store/panes'

export interface UsePaneOptions {
  paneId: string
  onResize?: (width: number, height: number, isMounting?: boolean) => void
}

// Overload signatures
export function usePane(
  paneId: string,
  onResize?: (width: number, height: number, isMounting?: boolean) => void
): {
  el: ReturnType<typeof ref<HTMLElement | null>>
  pane: ReturnType<typeof computed<Pane>>
  refreshZoom: () => void
  focusPane: () => void
}
export function usePane(options: UsePaneOptions): {
  el: ReturnType<typeof ref<HTMLElement | null>>
  pane: ReturnType<typeof computed<Pane>>
  refreshZoom: () => void
  focusPane: () => void
}

export function usePane(
  paneIdOrOptions: string | UsePaneOptions,
  onResizeArg?: (width: number, height: number, isMounting?: boolean) => void
) {
  const store = useStore()

  // Handle both signatures
  let paneId: string
  let onResize:
    | ((width: number, height: number, isMounting?: boolean) => void)
    | undefined

  if (typeof paneIdOrOptions === 'string') {
    paneId = paneIdOrOptions
    onResize = onResizeArg
  } else {
    paneId = paneIdOrOptions.paneId
    onResize = paneIdOrOptions.onResize
  }

  // Template ref for the root element
  const el = ref<HTMLElement | null>(null)

  const pane = computed<Pane>(() => {
    return store.state.panes?.panes?.[paneId]
  })

  function refreshZoom() {
    store.dispatch('panes/refreshZoom', {
      id: paneId
    })
  }

  function focusPane() {
    store.commit('app/SET_FOCUSED_PANE', paneId)
  }

  onMounted(() => {
    if (el.value) {
      el.value.id = paneId

      // Only refresh zoom if pane exists in state
      if (store.state.panes?.panes?.[paneId]) {
        refreshZoom()
      }

      // Use nextTick equivalent
      setTimeout(() => {
        if (el.value && onResize) {
          onResize(el.value.clientWidth, el.value.clientHeight, true)
        }
      }, 0)

      el.value.addEventListener('mousedown', focusPane)
    }
  })

  onBeforeUnmount(() => {
    if (el.value) {
      el.value.removeEventListener('mousedown', focusPane)
    }
  })

  return {
    el,
    pane,
    refreshZoom,
    focusPane
  }
}
