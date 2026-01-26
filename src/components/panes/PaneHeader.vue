<template>
  <div
    class="pane-header hide-scrollbar d-flex"
    :class="[split && 'pane-header--split']"
    @dblclick="maximizePane"
  >
    <div
      v-if="showName && name"
      class="btn -cases pane-header__highlight"
      @dblclick="maximizePane"
    >
      <slot name="title">
        {{ name }}
        <btn
          type="button"
          @click="renamePane"
          class="pane-header__edit btn -text -small"
        >
          <i class="icon-edit"></i>
        </btn>
      </slot>
    </div>
    <slot>
      <hr />
    </slot>
    <button
      v-if="showSearch"
      type="button"
      @click="openSearch"
      class="btn -text"
    >
      <i class="icon-search"></i>
    </button>
    <btn
      v-if="settings"
      type="button"
      @click="openSettings"
      class="pane-overlay -text"
      :loading="isLoading"
    >
      <i class="icon-cog"></i>
    </btn>
    <button
      type="button"
      @click="toggleDropdown"
      class="pane-overlay btn -text"
    >
      <i class="icon-more"></i>
    </button>

    <dropdown v-model="paneDropdownTrigger">
      <div class="d-flex btn-group">
        <button
          type="button"
          class="btn -green"
          @click.stop="changeZoom($event, -1)"
        >
          <i class="icon-minus"></i>
        </button>
        <button
          type="button"
          class="btn -green text-monospace flex-grow-1 text-center"
          @click.stop="resetZoom"
        >
          × {{ zoom.toFixed(2) }}
        </button>
        <button
          type="button"
          class="btn -green"
          @click.stop="changeZoom($event, 1)"
        >
          <i class="icon-plus"></i>
        </button>
      </div>
      <button
        v-if="settings !== null"
        type="button"
        class="dropdown-item"
        @click="openSettings"
      >
        <i class="icon-cog"></i>
        <span>Settings</span>
      </button>
      <button
        v-if="showSearch"
        type="button"
        class="dropdown-item"
        @click="openSearch"
      >
        <i class="icon-search"></i>
        <span>Sources</span>
      </button>
      <div v-if="showSearch" class="dropdown-item" @click.stop>
        <label class="checkbox-control -small">
          <input
            type="checkbox"
            class="form-control"
            :checked="lockedSources"
            @change="store.commit('panes/TOGGLE_PANE_LOCKED_SOURCES', paneId)"
          />
          <div></div>
          <span>Lock sources</span>
        </label>
      </div>
      <div v-if="isInFrame" class="dropdown-item" @click.stop>
        <label class="checkbox-control -small">
          <input
            type="checkbox"
            class="form-control"
            :checked="syncedWithParent"
            @change="
              store.commit('panes/TOGGLE_SYNC_WITH_PARENT_FRAME', paneId)
            "
          />
          <div></div>
          <span>Sync</span>
        </label>
      </div>
      <div
        v-if="$slots.menu"
        class="dropdown-divider"
        :data-label="`${paneId} options`"
      ></div>
      <slot name="menu"></slot>
      <div class="dropdown-divider" data-label="utilities"></div>
      <button type="button" class="dropdown-item" @click="maximizePane">
        <i class="icon-enlarge"></i>
        <span>Maximize</span>
      </button>
      <button type="button" class="dropdown-item" @click="duplicatePane">
        <i class="icon-copy-paste"></i>
        <span>Duplicate</span>
      </button>
      <button type="button" class="dropdown-item" @click="downloadPane">
        <i class="icon-download"></i>
        <span>Download</span>
      </button>
      <button type="button" class="dropdown-item" @click="renamePane">
        <i class="icon-edit"></i>
        <span>Rename</span>
      </button>
      <button type="button" class="dropdown-item" @click="removePane">
        <i class="icon-trash"></i>
        <span>Remove</span>
      </button>
    </dropdown>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, getCurrentInstance } from 'vue'
import { useStore } from 'vuex'

import Btn from '@/components/framework/Btn.vue'
import { downloadAnything, getSiblings, slugify } from '@/utils/helpers'
import dialogService from '@/services/dialogService'
import { INFRAME } from '@/utils/constants'

const props = withDefaults(
  defineProps<{
    paneId: string
    settings?: (() => Promise<any>) | null
    showSearch?: boolean
    showName?: boolean
    split?: boolean
  }>(),
  {
    settings: null,
    showSearch: true,
    showName: true,
    split: true
  }
)

const emit = defineEmits<{
  zoom: [value: number]
}>()

const store = useStore()
const instance = getCurrentInstance()

const paneDropdownTrigger = ref<HTMLElement | null>(null)
const isLoading = ref(false)
const isInFrame = INFRAME

const zoom = computed(() => store.state.panes.panes[props.paneId].zoom || 1)
const type = computed(() => store.state.panes.panes[props.paneId].type)

const syncedWithParent = computed(() => {
  return store.state.panes.syncedWithParentFrame.indexOf(props.paneId) !== -1
})

const lockedSources = computed(() => {
  return store.state.panes.panes[props.paneId].lockedSources === true
})

const name = computed(() => {
  const paneName = store.state.panes.panes[props.paneId].name
  const market =
    store.state.panes.marketsListeners[
      store.state.panes.panes[props.paneId].markets[0]
    ]

  if (paneName) {
    return paneName.trim()
  } else if (market) {
    return market.local
  } else {
    return type.value
  }
})

function openSearch() {
  store.dispatch('app/showSearch', { paneId: props.paneId })
}

function changeZoom(event: MouseEvent, direction: number) {
  const newZoom = zoom.value + (event.shiftKey ? 0.0625 : 0.125) * direction
  store.dispatch('panes/setZoom', { id: props.paneId, zoom: newZoom })

  emit('zoom', newZoom)
}

function resetZoom() {
  store.dispatch('panes/setZoom', { id: props.paneId, zoom: 1 })

  emit('zoom', 1)
}

async function removePane() {
  if (
    await dialogService.confirm(`Delete pane ${type.value} "${name.value}" ?`)
  ) {
    store.dispatch('panes/removePane', props.paneId)
  }
}

function duplicatePane() {
  store.dispatch('panes/duplicatePane', props.paneId)
}

function maximizePane(event: MouseEvent) {
  if (event.type === 'dblclick' && event.currentTarget !== event.target) {
    return
  }

  const el = instance?.proxy?.$el as HTMLElement
  const parentEl = el?.parentElement?.parentElement
  if (!parentEl) return

  const isMaximized = parentEl.classList.toggle('-maximized')

  const siblings = getSiblings(parentEl)

  for (const sibling of siblings) {
    if (!sibling.getAttribute('type')) {
      continue
    }
    sibling.classList.remove('-maximized')
    ;(sibling as HTMLElement).style.display = isMaximized ? 'none' : 'block'
  }

  window.dispatchEvent(new Event('resize'))

  store.dispatch('panes/setZoom', {
    id: props.paneId,
    zoom: isMaximized ? zoom.value * 1.5 : zoom.value * (2 / 3)
  })
}

async function renamePane(event?: MouseEvent) {
  if (event) {
    event.stopPropagation()
  }

  const newName = await dialogService.prompt({
    placeholder: `Main pane's market`,
    action: 'Rename',
    input: name.value
  })

  if (typeof newName === 'string' && newName !== name.value) {
    store.commit('panes/SET_PANE_NAME', { id: props.paneId, name: newName })
  }
}

async function downloadPane() {
  const id = `${type.value}:${props.paneId}`

  downloadAnything(
    {
      name: id,
      type: type.value,
      data: store.state[props.paneId],
      markets: store.state.panes.panes[props.paneId].markets,
      createdAt: Date.now(),
      updatedAt: null
    },
    slugify(`${type.value} ${name.value}`)
  )
}

function toggleDropdown(event: MouseEvent) {
  if (paneDropdownTrigger.value) {
    paneDropdownTrigger.value = null
  } else {
    paneDropdownTrigger.value = event.currentTarget as HTMLElement
  }
}

async function openSettings() {
  if (!props.settings) {
    return
  }

  isLoading.value = true
  dialogService.open((await props.settings()).default, {
    paneId: props.paneId
  })
  isLoading.value = false
}
</script>
