<template>
  <div class="screener-settings">
    <div class="form-group">
      <label>Timeframe</label>
      <div class="btn-group">
        <button
          v-for="tf in timeframes"
          :key="tf"
          class="btn -small"
          :class="{ '-active': timeframe === tf }"
          @click="setTimeframe(tf)"
        >
          {{ tf }}
        </button>
      </div>
    </div>

    <div class="form-group mt16">
      <label>Default Sort</label>
      <select class="form-control" :value="sortBy" @change="setSortBy">
        <option value="symbol">Symbol</option>
        <option value="price">Price</option>
        <option value="change">Change %</option>
        <option value="volume">Volume</option>
        <option value="vdelta">Volume Delta</option>
        <option value="oi">Open Interest</option>
        <option value="funding">Funding Rate</option>
      </select>
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
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vuex'

const props = defineProps<{
  paneId: string
}>()

const store = useStore()

const timeframes = ['5m', '15m', '1h', '4h', '1d']

const timeframe = computed(() => store.state[props.paneId]?.timeframe || '1h')
const sortBy = computed(() => store.state[props.paneId]?.sortBy || 'volume')
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

function toggleCompactMode() {
  store.commit(`${props.paneId}/TOGGLE_COMPACT_MODE`)
}
</script>

<style lang="scss" scoped>
.screener-settings {
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
}
</style>
