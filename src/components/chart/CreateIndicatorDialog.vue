<template>
  <Dialog
    @clickOutside="close"
    class="create-indicator-dialog"
    size="small"
    :resizable="false"
  >
    <template v-slot:header>
      <div class="dialog__title">New indicator</div>
    </template>
    <form ref="formRef" @submit.prevent="submit">
      <div class="form-group mb16">
        <label>Create blank indicator</label>
        <input class="form-control" v-model="name" placeholder="Untitled" />
      </div>
      <div class="form-group mb16">
        <label>Scale with</label>
        <dropdown-button
          v-model="priceScaleId"
          :options="availableScales"
          placeholder="Default scale"
          class="-outline form-control -arrow"
        ></dropdown-button>
      </div>
    </form>

    <template v-slot:footer>
      <button class="btn -text mr8" @click="close(false)">Cancel</button>
      <button type="button" @click="submit" class="btn">
        <span><i class="icon-check mr8"></i> Create</span>
      </button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useStore } from 'vuex'
import Dialog from '@/components/framework/Dialog.vue'
import DropdownButton from '@/components/framework/DropdownButton.vue'
import { useDialog } from '@/composables/useDialog'
import { getChartScales } from './options'

const props = defineProps<{
  paneId: string
}>()

const store = useStore()

const emit = defineEmits<{
  close: [value: unknown]
}>()

const { close: useDialogClose } = useDialog()

function close(data?: unknown) {
  emit('close', data)
  useDialogClose(data)
}

const formRef = ref<HTMLFormElement | null>(null)
const availableScales = ref<Record<string, string>>({})
const priceScaleId = ref('right')
const name = ref('')

onMounted(() => {
  availableScales.value = getChartScales(store.state[props.paneId].indicators)
})

function submit() {
  close({
    name: name.value,
    priceScaleId: priceScaleId.value
  })
}

defineExpose({ close })
</script>
