import { computed, onMounted, onBeforeUnmount, getCurrentInstance } from 'vue'
import { useStore } from 'vuex'
import { Pane } from '@/store/panes'

export interface UsePaneOptions {
  paneId: string
  onResize?: (width: number, height: number, isMounting?: boolean) => void
}

export function usePane(options: UsePaneOptions) {
  const store = useStore()
  const instance = getCurrentInstance()

  const pane = computed<Pane>(() => {
    return store.state.panes.panes[options.paneId]
  })

  function refreshZoom() {
    store.dispatch('panes/refreshZoom', {
      id: options.paneId
    })
  }

  function focusPane() {
    store.commit('app/SET_FOCUSED_PANE', options.paneId)
  }

  onMounted(() => {
    const el = instance?.proxy?.$el as HTMLElement
    if (el) {
      el.id = options.paneId
      refreshZoom()

      // Use nextTick equivalent
      setTimeout(() => {
        const width = el.clientWidth
        if (options.onResize) {
          options.onResize(width, el.clientHeight, true)
        }
      }, 0)

      el.addEventListener('mousedown', focusPane)
    }
  })

  onBeforeUnmount(() => {
    const el = instance?.proxy?.$el as HTMLElement
    if (el) {
      el.removeEventListener('mousedown', focusPane)
    }
  })

  return {
    pane,
    refreshZoom,
    focusPane
  }
}
