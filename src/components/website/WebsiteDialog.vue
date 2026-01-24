<template>
  <Dialog
    @clickOutside="close"
    class="pane-dialog"
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
    <website-settings :paneId="paneId" />
    <template v-slot:footer>
      <presets
        type="website"
        :adapter="getPreset"
        :placeholder="paneId"
        @apply="resetPane($event)"
        class="-left -top"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Dialog from '@/components/framework/Dialog.vue'
import Presets from '@/components/framework/Presets.vue'
import WebsiteSettings from './WebsiteSettings.vue'
import { useDialog } from '@/composables/useDialog'
import { usePaneDialog } from '@/composables/usePaneDialog'

const props = defineProps<{
  paneId: string
}>()

const { close } = useDialog()
const { name, renamePane, resetPane, getPreset } = usePaneDialog({
  paneId: props.paneId,
  close
})

const clickOutsideClose = ref(true)

defineExpose({ close })
</script>
