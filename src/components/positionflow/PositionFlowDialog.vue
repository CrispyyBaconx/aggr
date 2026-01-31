<template>
  <Dialog @clickOutside="close" class="positionflow-dialog" size="small">
    <template #header>
      <div>
        <div class="dialog__title">Position Flow Settings</div>
      </div>
    </template>

    <div class="form-group">
      <label>Timeframe</label>
      <div class="column">
        <select
          class="form-control"
          :value="timeframe"
          @change="setTimeframe(($event.target as HTMLSelectElement).value)"
        >
          <option value="5m">5 minutes</option>
          <option value="15m">15 minutes</option>
          <option value="1h">1 hour</option>
          <option value="4h">4 hours</option>
          <option value="1d">1 day</option>
        </select>
        <p class="help-text mt4">
          Timeframe for price change and OI change calculations
        </p>
      </div>
    </div>

    <div class="form-group">
      <label>Dot Size</label>
      <div class="column">
        <input
          type="range"
          class="form-control"
          :value="dotSize"
          @input="setDotSize(+($event.target as HTMLInputElement).value)"
          min="2"
          max="20"
          step="1"
        />
        <span class="ml8">{{ dotSize }}px</span>
      </div>
    </div>

    <div class="form-group">
      <label>Show Labels</label>
      <div class="column">
        <label class="checkbox-control">
          <input
            type="checkbox"
            class="form-control"
            :checked="showLabels"
            @change="toggleShowLabels"
          />
          <span>Display symbol labels on dots</span>
        </label>
      </div>
    </div>

    <template #footer>
      <button class="btn -text" @click="close">Close</button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vuex'
import Dialog from '@/components/framework/Dialog.vue'
import type { PositionFlowTimeframe } from '@/store/panesSettings/positionflow'

const props = defineProps<{
  paneId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const store = useStore()

const timeframe = computed(() => store.state[props.paneId]?.timeframe || '1h')
const dotSize = computed(() => store.state[props.paneId]?.dotSize || 6)
const showLabels = computed(() => store.state[props.paneId]?.showLabels ?? true)

function setTimeframe(value: string) {
  store.commit(`${props.paneId}/SET_TIMEFRAME`, value as PositionFlowTimeframe)
}

function setDotSize(value: number) {
  store.commit(`${props.paneId}/SET_DOT_SIZE`, value)
}

function toggleShowLabels() {
  store.commit(`${props.paneId}/TOGGLE_SHOW_LABELS`)
}

function close() {
  emit('close')
}
</script>

<style lang="scss" scoped>
.positionflow-dialog {
  .form-group {
    display: flex;
    align-items: flex-start;
    margin-bottom: 1rem;

    > label:first-child {
      width: 100px;
      flex-shrink: 0;
      padding-top: 0.375rem;
      font-weight: 500;
    }

    .column {
      flex: 1;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }
  }

  .help-text {
    width: 100%;
    font-size: 0.75rem;
    opacity: 0.6;
    margin: 0;
  }

  input[type="range"] {
    flex: 1;
    min-width: 100px;
  }
}
</style>
