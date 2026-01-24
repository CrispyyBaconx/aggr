<template>
  <Dialog @clickOutside="hide" class="-timeframe">
    <template v-slot:header>
      <div class="dialog__title">Timeframe</div>
    </template>
    <form @submit.prevent="submit" ref="formRef">
      <div class="text-center">
        <timeframe-input
          :placeholder="placeholder"
          @input="onTimeframe"
          @submit="submit"
          class="form-control w-100"
        />
      </div>

      <div class="timeframe-for-human">
        <code
          v-if="valid"
          class="text-muted"
          v-text="'= ' + timeframeForHuman"
        ></code>
        <code v-else class="form-feedback">Unknown timeframe</code>
      </div>
    </form>

    <template v-slot:footer>
      <button type="button" class="btn -green ml8 -large" @click="submit">
        Go
      </button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useStore } from 'vuex'
import Dialog from '@/components/framework/Dialog.vue'
import { useDialog } from '@/composables/useDialog'
import { getTimeframeForHuman } from '@/utils/helpers'
import TimeframeInput from './chart/TimeframeInput.vue'

const props = defineProps<{
  timeframe?: string
}>()

const store = useStore()
const { close } = useDialog()

const formRef = ref<HTMLFormElement | null>(null)
const newTimeframe = ref('')
const paneId = ref<string | null>(null)
const placeholder = ref('')

const paneName = computed(() => {
  if (!paneId.value) return ''
  return store.state.panes.panes[paneId.value].name || paneId.value
})

const timeframeForHuman = computed(() => {
  return getTimeframeForHuman(newTimeframe.value)
})

const valid = computed(() => {
  return timeframeForHuman.value !== null
})

watch(
  () => store.state.app.showSearch,
  (value) => {
    if (!value) {
      close(false)
    }
  }
)

onMounted(() => {
  paneId.value = store.state.app.focusedPaneId

  if (props.timeframe) {
    newTimeframe.value = props.timeframe
  }

  if (paneId.value) {
    placeholder.value = store.state[paneId.value].timeframe
  }
})

function hide() {
  store.dispatch('app/hideSearch')
}

function onTimeframe(timeframe: { value: string } | null) {
  newTimeframe.value = timeframe ? timeframe.value : ''
}

function submit() {
  if (!valid.value || !paneId.value) {
    return
  }

  store.commit(paneId.value + '/SET_TIMEFRAME', newTimeframe.value)

  hide()
}

defineExpose({ close })
</script>
<style lang="scss">
.dialog.-timeframe {
  .dialog__content {
    min-width: 0;

    .form-control {
      font-size: 2rem;
      font-family: $font-monospace;
      text-align: center;
      padding: 0.5rem;
      border: 0;
    }

    .timeframe-for-human {
      padding: 0.5rem 1rem 0;
      text-align: center;
      font-size: 1.125rem;
    }
  }
}
</style>
