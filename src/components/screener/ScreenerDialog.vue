<template>
  <Dialog
    @clickOutside="close"
    class="pane-dialog"
    size="small"
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

    <div class="form-group">
      <label>Timeframe</label>
      <div class="btn-group">
        <button
          class="btn -small"
          :class="{ '-active': timeframe === '5m' }"
          @click="setTimeframe('5m')"
        >
          5m
        </button>
        <button
          class="btn -small"
          :class="{ '-active': timeframe === '15m' }"
          @click="setTimeframe('15m')"
        >
          15m
        </button>
        <button
          class="btn -small"
          :class="{ '-active': timeframe === '1h' }"
          @click="setTimeframe('1h')"
        >
          1h
        </button>
        <button
          class="btn -small"
          :class="{ '-active': timeframe === '4h' }"
          @click="setTimeframe('4h')"
        >
          4h
        </button>
        <button
          class="btn -small"
          :class="{ '-active': timeframe === '1d' }"
          @click="setTimeframe('1d')"
        >
          1d
        </button>
      </div>
    </div>

    <div class="form-group mt16">
      <label>Sort By</label>
      <div class="d-flex gap8">
        <select class="form-control" :value="sortBy" @change="setSortBy">
          <option value="symbol">Symbol</option>
          <option value="price">Price</option>
          <option value="change">Change %</option>
          <option value="volume">Volume</option>
          <option value="vdelta">Volume Delta</option>
          <option value="oi">Open Interest</option>
          <option value="funding">Funding Rate</option>
        </select>
        <button class="btn -small" @click="toggleSortOrder">
          <i :class="sortOrder > 0 ? 'icon-up-thin' : 'icon-down-thin'"></i>
        </button>
      </div>
    </div>

    <div class="form-group mt16">
      <label class="checkbox-control">
        <input
          type="checkbox"
          class="form-control"
          :checked="compactMode"
          @change="toggleCompactMode"
        />
        <div></div>
        <span>Compact mode</span>
      </label>
    </div>

    <template v-slot:footer>
      <presets
        type="screener"
        :adapter="getPreset"
        :placeholder="paneId"
        @apply="resetPane($event)"
        class="-left -top"
      />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStore } from 'vuex'
import Dialog from '@/components/framework/Dialog.vue'
import Presets from '@/components/framework/Presets.vue'
import { useDialog } from '@/composables/useDialog'
import { usePaneDialog } from '@/composables/usePaneDialog'

const props = defineProps<{
  paneId: string
}>()

const emit = defineEmits<{
  close: [value: unknown]
}>()

const store = useStore()

const { close: useDialogClose } = useDialog()

function close(data?: unknown) {
  emit('close', data)
  useDialogClose(data)
}

const { name, renamePane, resetPane, getPreset } = usePaneDialog({
  paneId: props.paneId,
  close
})

const clickOutsideClose = ref(true)

const timeframe = computed(() => store.state[props.paneId]?.timeframe || '1h')
const sortBy = computed(() => store.state[props.paneId]?.sortBy || 'volume')
const sortOrder = computed(() => store.state[props.paneId]?.sortOrder || -1)
const compactMode = computed(
  () => store.state[props.paneId]?.compactMode || false
)

function setTimeframe(tf: string) {
  store.commit(`${props.paneId}/SET_TIMEFRAME`, tf)
}

function setSortBy(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  store.commit(`${props.paneId}/SET_SORT_BY`, value)
}

function toggleSortOrder() {
  store.commit(`${props.paneId}/TOGGLE_SORT_ORDER`)
}

function toggleCompactMode() {
  store.commit(`${props.paneId}/TOGGLE_COMPACT_MODE`)
}

defineExpose({ close })
</script>

<style lang="scss" scoped>
.btn-group {
  display: flex;
  gap: 0.25rem;

  .btn {
    flex: 1;
    justify-content: center;

    &.-active {
      background: var(--theme-buy-base);
      color: var(--theme-buy-color);
    }
  }
}
</style>
