<template>
  <Dialog @clickOutside="close" class="pane-dialog">
    <template v-slot:header>
      <div
        class="dialog__title -editable"
        @dblclick="renamePane"
        v-text="name"
      ></div>
      <div class="column -center"></div>
    </template>
    <stats-settings :paneId="paneId" />
  </Dialog>
</template>

<script setup lang="ts">
import Dialog from '@/components/framework/Dialog.vue'
import StatsSettings from './StatsSettings.vue'
import { useDialog } from '@/composables/useDialog'
import { usePaneDialog } from '@/composables/usePaneDialog'

const props = defineProps<{
  paneId: string
}>()

const emit = defineEmits<{
  close: [value: unknown]
}>()

const { close: useDialogClose } = useDialog()

function close(data?: unknown) {
  emit('close', data)
  useDialogClose(data)
}

const { name, renamePane } = usePaneDialog({
  paneId: props.paneId,
  close
})

defineExpose({ close })
</script>
