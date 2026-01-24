<template>
  <div class="settings-counters">
    <div class="column">
      <div class="form-group -tight">
        <label
          class="checkbox-control checkbox-control-input -auto flex-right"
          v-tippy="{ placement: 'bottom' }"
          title="Sum amount of trades instead of volume"
        >
          <input
            type="checkbox"
            class="form-control"
            :checked="countersCount"
            @change="
              $store.commit(paneId + '/TOGGLE_COUNT', ($event.target as HTMLInputElement).checked)
            "
          />
          <div on="count" off="volume"></div>
        </label>
      </div>
      <div class="form-group -fill">
        <input
          v-tippy
          title="Comma separated list of steps (ex: 1m, 5m, 10m, 15m)"
          type="string"
          placeholder="Enter a set of timeframes (ie 1m, 15m)"
          class="form-control"
          :value="countersStepsStringified"
          @change="replaceCounters(($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <div class="form-group mt8">
      <label
        class="checkbox-control -rip checkbox-control-input"
        @change="
          $store.commit(
            paneId + '/TOGGLE_LIQUIDATIONS_ONLY',
            ($event.target as HTMLInputElement).checked
          )
        "
      >
        <input
          type="checkbox"
          class="form-control"
          :checked="liquidationsOnly"
        />
        <div></div>
        <span>Only count liquidations</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vuex'
import { ago } from '@/utils/helpers'

const props = defineProps<{
  paneId: string
}>()

const store = useStore()

const countersCount = computed(() => store.state[props.paneId].count)

const countersSteps = computed(() => store.state[props.paneId].steps)

const liquidationsOnly = computed(() => store.state[props.paneId].liquidationsOnly)

const countersStepsStringified = computed(() => {
  const now = Date.now()
  return countersSteps.value.map((a: number) => ago(now - a)).join(', ')
})

function replaceCounters(value: string) {
  const counters = value
    .split(',')
    .map(a => {
      a = a.trim()

      if (/[\d.]+s/.test(a)) {
        return parseFloat(a) * 1000
      } else if (/[\d.]+h/.test(a)) {
        return parseFloat(a) * 1000 * 60 * 60
      } else {
        return parseFloat(a) * 1000 * 60
      }
    })
    .filter(function (item, pos, self) {
      return self.indexOf(item) == pos
    })

  if (counters.filter(a => isNaN(a)).length) {
    store.dispatch('app/showNotice', {
      type: 'error',
      title: `Counters (${value}) contains invalid steps.`
    })
    return
  }

  store.commit(props.paneId + '/REPLACE_COUNTERS', counters)
}
</script>
