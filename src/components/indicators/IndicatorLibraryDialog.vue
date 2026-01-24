<template>
  <Dialog
    @clickOutside="close"
    class="indicator-library-dialog"
    size="medium"
    contrasted
  >
    <template #header>
      <div class="d-flex">
        <div class="dialog__title indicator-dialog__title -center">
          <div>Indicators</div>
        </div>
      </div>
    </template>
    <template #subheader>
      <tabs v-model="tab">
        <tab name="installed"> Installed </tab>
        <tab v-if="communityTabEnabled" name="community"> Community </tab>
      </tabs>
    </template>

    <TransitionHeight
      stepper
      class="indicator-library-dialog__stepper"
      :name="`slide-fade-${isBack ? 'left' : 'right'}`"
      :duration="500"
    >
      <InstalledIndicators
        v-if="tab === 'installed'"
        key="installed"
        ref="installedRef"
        :pane-id="paneId"
        @close="close"
        @add="addToChart"
        @selected="selection = $event"
      />
      <CommunityIndicators
        v-else-if="tab === 'community'"
        key="community"
        :pane-id="paneId"
        @close="close"
        @selected="selection = $event"
      />
    </TransitionHeight>

    <IndicatorDetail
      v-if="selection"
      :indicator="selection"
      :pane-id="paneId"
      @close="selection = null"
      @add="addToChart($event, true)"
      @reload="reloadSelection"
    />

    <template v-slot:footer>
      <button class="btn -theme -large -cases -file">
        <input
          type="file"
          class="input-file"
          @change="handleFile"
          ref="importButtonRef"
        />
        Import <i class="icon-upload ml8"></i>
      </button>
      <button
        class="mlauto btn -green -large -cases"
        @click="promptCreateIndicator"
      >
        Create
        <i class="icon-plus ml8"></i>
      </button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStore } from 'vuex'
import { ago } from '@/utils/helpers'
import Dialog from '@/components/framework/Dialog.vue'
import InstalledIndicators from '@/components/indicators/InstalledIndicators.vue'
import CommunityIndicators from '@/components/indicators/CommunityIndicators.vue'
import IndicatorDetail from '@/components/indicators/IndicatorDetail.vue'
import { useDialog } from '@/composables/useDialog'
import dialogService from '@/services/dialogService'
import importService from '@/services/importService'
import Tabs from '@/components/framework/Tabs.vue'
import Tab from '@/components/framework/Tab.vue'
import TransitionHeight from '@/components/framework/TransitionHeight.vue'
import workspacesService from '@/services/workspacesService'

const store = useStore()
const { close } = useDialog()

const installedRef = ref<InstanceType<typeof InstalledIndicators> | null>(null)
const importButtonRef = ref<HTMLInputElement | null>(null)
const tab = ref('installed')
const selection = ref<any>(null)
const communityTabEnabled = !!import.meta.env.VITE_APP_LIB_URL

const isBack = computed(() => {
  if (tab.value === 'installed') {
    return true
  }

  return false
})

const paneId = computed(() => {
  if (
    store.state.app.focusedPaneId &&
    store.state.panes.panes[store.state.app.focusedPaneId]?.type === 'chart'
  ) {
    return store.state.app.focusedPaneId
  } else {
    for (const id in store.state.panes.panes) {
      if (store.state.panes.panes[id].type === 'chart') {
        return id
      }
    }
  }

  return null
})

async function handleFile(event: Event) {
  try {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return

    const json = await importService.getJSON(file)

    await importService.importIndicator(json, {
      save: true,
      openLibrary: true
    })
  } catch (error: any) {
    store.dispatch('app/showNotice', {
      title: error.message,
      type: 'error'
    })
  }
}

function showNoPaneId() {
  dialogService.confirm({
    title: 'No chart',
    message: `Add a chart to continue`,
    cancel: null,
    ok: 'Ok'
  })
}

async function addToChart(indicator: any, closeDialog = false) {
  if (!paneId.value) return

  store.dispatch(
    paneId.value + '/addIndicator',
    await workspacesService.incrementIndicatorUsage(indicator.id)
  )

  if (closeDialog) {
    close()
  }
}

async function createIndicator(indicator: any = {}) {
  if (!paneId.value) {
    return showNoPaneId()
  }

  if (!indicator.name) {
    indicator.name = 'Untitled'
  }

  if (!indicator.libraryId) {
    indicator.libraryId = null
  }

  dialogService.openIndicator(
    paneId.value,
    await store.dispatch(paneId.value + '/addIndicator', indicator)
  )

  close()
}

async function promptCreateIndicator() {
  if (!paneId.value) {
    return showNoPaneId()
  }

  const payload = await dialogService.openAsPromise(
    (await import('@/components/chart/CreateIndicatorDialog.vue')).default,
    {
      paneId: paneId.value
    }
  )

  if (payload) {
    createIndicator(payload)
  }
}

function setSelection(indicator: any) {
  selection.value = indicator

  if (installedRef.value) {
    installedRef.value.getIndicators()
  }
}

async function reloadSelection(id?: string) {
  if (!selection.value) {
    return
  }

  setSelection(
    await workspacesService.getIndicator(id || selection.value.id)
  )
}

defineExpose({ close })
</script>
<style lang="scss" scoped>
.indicator-library-dialog {
  :deep() {
    .dialog__content {
      width: 500px;
    }
    .dialog__body {
      height: 75vh;
    }
  }

  &__loader {
    .loader {
      margin-top: 2rem;
    }
  }
}
</style>
