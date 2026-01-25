<template>
  <dropdown
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <button
      @click="$emit('cmd', ['toggleTimeframeDropdown', $event])"
      class="dropdown-item -arrow"
    >
      {{ timeframeForHuman }}
    </button>
    <button @click="store.dispatch('app/showSearch')" class="dropdown-item">
      <i class="icon-search"></i>
      <span>Search</span>
    </button>
    <button
      @click="$emit('cmd', ['takeScreenshot', $event])"
      class="dropdown-item"
    >
      <i class="icon-add-photo"></i>
      <span>Snapshot</span>
    </button>
    <button @click="$emit('cmd', ['flipChart'])" class="dropdown-item">
      <i class="icon-flip"></i>
      <span>Flip</span>
    </button>
    <template v-if="price">
      <template v-if="alert">
        <div class="dropdown-divider" :data-label="`@${priceFormatted}`"></div>
        <button @click="removeAlert" class="dropdown-item">
          <i class="icon-cross"></i>
          <span>Remove</span>
        </button>
        <button @click="editAlert" class="dropdown-item">
          <i class="icon-edit"></i>
          <span>Edit</span>
        </button>
      </template>
      <template v-else>
        <div class="dropdown-divider" data-label="alerts"></div>
        <button @click="createAlert" class="dropdown-item">
          <i class="icon-plus"></i>
          <span>{{ priceFormatted }}</span>
          <i class="icon-cog" @click.stop="toggleAlertsSettingsDropdown"></i>
        </button>
      </template>
      <dropdown v-model="alertsDropdownTrigger" @click.stop>
        <alerts-list :query="market" with-options />
      </dropdown>
      <dropdown v-model="alertsDropdownSettingsTrigger" @click.stop>
        <button type="button" class="dropdown-item" @click.stop>
          <label class="checkbox-control -small">
            <input
              type="checkbox"
              class="form-control"
              :checked="showAlerts"
              @change="store.commit(`${paneId}/TOGGLE_ALERTS`)"
            />
            <div></div>
            <span>Visible</span>
          </label>
        </button>
        <button type="button" class="dropdown-item" @click.stop>
          <label class="checkbox-control -small">
            <input
              type="checkbox"
              class="form-control"
              :checked="showAlertsLabel"
              @change="store.commit(`${paneId}/TOGGLE_ALERTS_LABEL`)"
              :disabled="!showAlerts"
            />
            <div></div>
            <span>Label</span>
          </label>
        </button>
        <button
          type="button"
          class="dropdown-item"
          @click.stop="toggleAlertsDropdown"
        >
          Manage
          <i class="icon-more mr0"></i>
        </button>
      </dropdown>
    </template>
  </dropdown>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStore } from 'vuex'
import AlertsList from '@/components/alerts/AlertsList.vue'
import { getTimeframeForHuman } from '@/utils/helpers'
import { formatMarketPrice } from '@/services/productsService'
import dialogService from '@/services/dialogService'
import alertService, { MarketAlert } from '@/services/alertService'
import { ChartPaneState } from '@/store/panesSettings/chart'

const props = withDefaults(
  defineProps<{
    modelValue: any
    paneId: string
    timeframe: string
    market: string
    getPrice: (() => number) | null
    price: number | null
    timestamp: number | null
    alert?: MarketAlert | null
  }>(),
  {
    alert: null
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: any]
  cmd: [args: any[]]
}>()

const store = useStore()

const alertsDropdownTrigger = ref<HTMLElement | null>(null)
const alertsDropdownSettingsTrigger = ref<HTMLElement | null>(null)

const timeframeForHuman = computed(() => {
  if (!props.modelValue) {
    return null
  }
  return getTimeframeForHuman(props.timeframe)
})

const alertsEnabled = computed(() => store.state.settings.alerts)

const showAlerts = computed(
  () => (store.state[props.paneId] as ChartPaneState).showAlerts
)

const showAlertsLabel = computed(
  () => (store.state[props.paneId] as ChartPaneState).showAlertsLabel
)

const priceFormatted = computed(() => {
  if (props.price === null) return ''
  return +formatMarketPrice(props.price, props.market)
})

const alertLabel = computed(() => {
  if (!props.alert) {
    return null
  }

  if (props.alert.message) {
    return `${props.alert.message} @${formatMarketPrice(
      props.alert.price,
      props.alert.market
    )}`
  }

  return `${props.alert.market} @${formatMarketPrice(
    props.alert.price,
    props.alert.market
  )}`
})

function toggleAlertsDropdown(event: MouseEvent) {
  if (alertsDropdownTrigger.value) {
    alertsDropdownTrigger.value = null
  } else {
    alertsDropdownTrigger.value = (
      event.currentTarget as HTMLElement
    ).parentElement
  }
}

async function toggleAlertsSettingsDropdown(event: MouseEvent) {
  if (!(await ensureAlerts())) {
    return
  }

  if (alertsDropdownSettingsTrigger.value) {
    alertsDropdownSettingsTrigger.value = null
  } else {
    alertsDropdownSettingsTrigger.value = (
      event.currentTarget as HTMLElement
    ).parentElement
  }
}

async function ensureAlerts() {
  if (!store.state.settings.alerts) {
    if (
      !(await dialogService.confirm({
        title: 'Alerts are disabled',
        message: 'Enable alerts ?',
        ok: 'Yes please'
      }))
    ) {
      return false
    }

    store.commit('settings/TOGGLE_ALERTS', true)
  }

  return true
}

async function createAlert() {
  if (!(await ensureAlerts())) {
    return
  }

  if (props.price === null || !props.getPrice) return

  const alert: MarketAlert = {
    price: props.price,
    market: props.market,
    timestamp: props.timestamp || Date.now(),
    active: false
  }

  alertService.createAlert(alert, props.getPrice(), true)
}

function removeAlert() {
  if (props.alert) {
    alertService.removeAlert(props.alert)
  }
}

async function editAlert() {
  if (!props.alert || !props.getPrice) return

  const message = await dialogService.openAsPromise(
    (await import('@/components/alerts/CreateAlertDialog.vue')).default,
    {
      price: +formatMarketPrice(props.alert.price, props.alert.market),
      input: props.alert.message,
      edit: true
    }
  )

  if (typeof message === 'string' && message !== props.alert.message) {
    const newAlert = {
      ...props.alert,
      price: props.alert.price,
      message: message
    }
    await alertService.moveAlert(
      props.alert.market,
      props.alert.price,
      newAlert,
      props.getPrice()
    )
  }
}
</script>
