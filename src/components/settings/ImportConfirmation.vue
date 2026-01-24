<template>
  <Dialog @clickOutside="close">
    <template v-slot:header>
      <div class="dialog__title">Import settings</div>
    </template>
    <div class="form-group mb16">
      <label>Name</label>
      <input type="text" class="form-control w-100" v-model="workspaceName" />
    </div>
    <div class="d-flex flex-middle">
      <i class="icon-info mr16"></i>
      <div class="mr16">
        <small class="text-muted">Version</small>
        <div>v{{ workspace.version || 0 }}</div>
      </div>
      <div class="mr16">
        <small class="text-muted">Created at</small>
        <div>{{ createdAt }} ago</div>
      </div>
      <div>
        <small class="text-muted">Updated at</small>
        <div>{{ updatedAt }} ago</div>
      </div>
    </div>
    <div v-if="panes.length" class="form-group mt16">
      <label>Panels</label>
      <div v-for="pane in panes" :key="pane.id" class="column flex-middle">
        <i class="icon-plus mr8 -small"></i>
        <span>{{ pane.type.toUpperCase() }}</span>
        <small class="ml4">
          <code>{{ pane.id }}</code>
        </small>
      </div>
    </div>
    <div v-if="panes.length" class="form-group mt16">
      <label>Markets</label>
      <button
        v-for="(market, index) in markets"
        :key="index"
        type="button"
        disabled
        class="btn -small mr4 mb4"
      >
        {{ market }}
      </button>
    </div>
    <footer class="dialog__footer">
      <a href="javascript:void(0);" class="btn -text mr8" @click="close(false)"
        >Cancel</a
      >
      <button class="btn -large -green" @click="submitWorkspace">
        IMPORT
      </button>
    </footer>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import Dialog from '@/components/framework/Dialog.vue'
import { useDialog } from '@/composables/useDialog'
import { Workspace } from '@/types/types'
import { ago } from '@/utils/helpers'

const props = defineProps<{
  workspace: Workspace
}>()

const { close } = useDialog()

const workspaceName = ref(props.workspace.name)

const createdAt = computed(() => {
  return ago(props.workspace.createdAt)
})

const updatedAt = computed(() => {
  return ago(props.workspace.updatedAt)
})

const panes = computed(() => {
  if (props.workspace.states.panes && props.workspace.states.panes.panes) {
    return Object.keys(props.workspace.states.panes.panes).map(id => ({
      id,
      name: props.workspace.states.panes.panes[id].name,
      type: props.workspace.states.panes.panes[id].type,
      markets: props.workspace.states.panes.panes[id].markets
    }))
  }

  return []
})

const markets = computed(() => {
  return panes.value.reduce((marketsList: string[], pane) => {
    for (const market of pane.markets) {
      if (marketsList.indexOf(market) === -1) {
        marketsList.push(market)
      }
    }

    return marketsList
  }, [])
})

function submitWorkspace() {
  close({
    ...props.workspace,
    name: workspaceName.value
  })
}

defineExpose({ close })
</script>
