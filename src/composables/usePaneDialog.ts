import { computed } from 'vue'
import { useStore } from 'vuex'
import dialogService from '@/services/dialogService'
import { parseMarket } from '@/services/productsService'
import workspacesService from '@/services/workspacesService'
import { Pane } from '@/store/panes'
import panesSettings from '@/store/panesSettings'
import { Preset } from '@/types/types'

export interface UsePaneDialogOptions {
  paneId: string
  close: () => Promise<void>
}

export function usePaneDialog(options: UsePaneDialogOptions) {
  const store = useStore()

  const pane = computed<Pane>(() => {
    return store.state.panes.panes[options.paneId]
  })

  const name = computed({
    get(): string {
      const paneName = store.state.panes.panes[options.paneId].name

      if (!paneName) {
        if (store.state.panes.panes[options.paneId].markets.length) {
          const [, pair] = parseMarket(
            store.state.panes.panes[options.paneId].markets[0]
          )
          return pair + ' - ' + store.state.panes.panes[options.paneId].type
        } else {
          return options.paneId
        }
      }

      return paneName
    },
    set(value: string) {
      store.commit('panes/SET_PANE_NAME', { id: options.paneId, name: value })
    }
  })

  async function renamePane() {
    const newName = await dialogService.prompt({
      action: 'Rename',
      input: name.value
    })

    if (newName !== null && newName !== name.value) {
      name.value = newName
    }
  }

  async function resetPane(preset?: Preset) {
    await options.close()

    let presetData = preset ? preset.data : null

    if (!presetData) {
      presetData = JSON.parse(
        JSON.stringify(
          panesSettings[store.state.panes.panes[options.paneId].type].state
        )
      )
    }

    await store.dispatch('panes/resetPane', {
      id: options.paneId,
      data: presetData
    })
  }

  async function getPreset() {
    let storedState = await workspacesService.getState(options.paneId)

    if (!storedState) {
      await workspacesService.saveState(
        options.paneId,
        store.state[options.paneId]
      )

      storedState = await workspacesService.getState(options.paneId)
    }

    return storedState
  }

  return {
    pane,
    name,
    renamePane,
    resetPane,
    getPreset
  }
}
