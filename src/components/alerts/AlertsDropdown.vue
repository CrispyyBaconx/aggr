<template>
  <Dialog
    @clickOutside="close"
    class="pane-dialog"
    size="medium"
    @mousedown="clickOutsideClose = false"
    @mouseup="clickOutsideClose = true"
  >
    <template v-slot:header>
      <div
        class="dialog__title -editable"
        @dblclick="renamePane"
        v-text="name"
      ></div>
      <div class="column -center"></div>
    </template>
    <AlertsSettings />
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Dialog from '@/components/framework/Dialog.vue'
import AlertsSettings from './AlertsSettings.vue'
import { useDialog } from '@/composables/useDialog'
import { usePaneDialog } from '@/composables/usePaneDialog'

const props = defineProps<{
  paneId: string
}>()

const { close } = useDialog()
const { name, renamePane } = usePaneDialog({
  paneId: props.paneId,
  close
})

const clickOutsideClose = ref(true)

defineExpose({ close })
</script>
