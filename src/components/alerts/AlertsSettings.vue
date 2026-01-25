<template>
  <toggable-group
    class="alerts-settings"
    :modelValue="alerts"
    label="Price alerts"
    @change="toggleAlerts($event)"
  >
    <p class="mt0 text-color-50">
      <i class="icon-info"></i> Uses average price of the coin
    </p>
    <div class="column">
      <div class="form-group">
        <label>Line style</label>
        <dropdown-button
          class="-outline form-control -arrow flex-grow-1 w-100"
          :value="alertsLineStyle"
          :options="{
            0: 'Solid',
            1: 'Dotted',
            2: 'Dashed',
            3: 'LargeDashed',
            4: 'SparseDotted'
          }"
          placeholder="lineStyle"
          @input="$store.commit('settings/SET_ALERTS_LINESTYLE', $event)"
          title="Line style (ex: dashed)"
          v-tippy
        ></dropdown-button>
      </div>
      <div class="form-group">
        <label>Line width</label>
        <editable
          :model-value="alertsLineWidth"
          @update:model-value="$store.commit('settings/SET_ALERTS_LINEWIDTH', $event)"
          class="form-control -center w-100"
          title="Line width (ex: 2)"
          v-tippy
        ></editable>
      </div>
      <div class="form-group">
        <label>Color</label>
        <color-picker-control
          :value="alertsColor"
          label="Alert color"
          @input="$store.commit('settings/SET_ALERTS_COLOR', $event)"
        ></color-picker-control>
      </div>
    </div>

    <div class="column">
      <div class="form-group mb16 mt16">
        <label><i class="icon-click mr4"></i> Control</label>
        <label
          class="checkbox-control d-flex -aggr -auto -auto"
          @change="$store.commit('settings/TOGGLE_ALERTS_CLICK')"
          title="Place alerts faster ⚡️"
          v-tippy
        >
          <input type="checkbox" class="form-control" :checked="alertsClick" />
          <div on="1 CLICK ⚡️" off="ALT+CLICK"></div>
        </label>
      </div>
      <div class="form-group mt16 mb16">
        <label for="audio-assistant-source"
          ><i class="icon-music-note mr4"></i> Alert sound</label
        >
        <button class="btn -file -blue -cases">
          <i class="icon-upload mr8"></i> {{ displayAlertSound || 'Browse' }}
          <i
            v-if="alertSound"
            class="icon-volume-high mr8 btn__suffix"
            @click.stop.prevent="playAlertSound"
          ></i>
          <i
            v-if="alertSound"
            class="icon-cross mr8 btn__suffix"
            @click.stop.prevent="removeAlertSound"
          ></i>
          <input
            type="file"
            class="input-file"
            accept="audio/*"
            @change="handleAlertSoundFile"
          />
        </button>
      </div>
    </div>

    <template #off>
      <label
        v-if="notificationsPermissionState === 'denied'"
        class="text-danger help-text mt0 mb0"
        v-tippy
        :title="`${helps['notifications-disabled']} ${helps['notifications-grant']}`"
      >
        <i class="icon-warning mr4"></i> Notifications are blocked.
      </label>
      <p
        v-else-if="notificationsPermissionState !== 'granted'"
        class="text-info help-text mt0 mb0"
        v-tippy
        :title="`${helps['notifications-disabled']} ${helps['notifications-grant']}`"
      >
        <i class="icon-info mr4"></i> Awaiting browser persmission.
      </p>
    </template>
  </toggable-group>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useStore } from 'vuex'
import DropdownButton from '@/components/framework/DropdownButton.vue'
import ToggableGroup from '@/components/framework/ToggableGroup.vue'
import ColorPickerControl from '@/components/framework/picker/ColorPickerControl.vue'

import audioService from '@/services/audioService'
import importService from '@/services/importService'

const store = useStore()

let notificationsPermission: PermissionStatus | null = null

const helps = {
  'notifications-disabled': 'Push notification are disabled.',
  'notifications-grant': 'Enable notifications for this site in your browser.'
}
const notificationsPermissionState = ref('granted')

const alertSound = computed(() => store.state.settings.alertSound)
const alerts = computed(() => store.state.settings.alerts)
const alertsColor = computed(() => store.state.settings.alertsColor)
const alertsLineStyle = computed(() => store.state.settings.alertsLineStyle)
const alertsLineWidth = computed(() => store.state.settings.alertsLineWidth)
const alertsClick = computed(() => store.state.settings.alertsClick)

const displayAlertSound = computed(() => {
  const id = alertSound.value

  if (!id) {
    return null
  }

  if (id.length <= 14) {
    return id
  } else {
    return id.slice(0, 6) + '..' + id.substr(-6)
  }
})

// created equivalent
checkNotificationsPermission()

function checkNotificationsPermission() {
  navigator.permissions
    .query({ name: 'notifications' })
    .then(result => {
      if (!notificationsPermission) {
        result.onchange = (event: any) => {
          setNotificationsPermission(event.target.state)
        }

        notificationsPermission = result
      }

      setNotificationsPermission(result.state)
    })
    .catch(err => {
      console.error(err.message)
    })
}

function setNotificationsPermission(state: string) {
  notificationsPermissionState.value = state

  if (notificationsPermissionState.value !== 'granted' && alerts.value) {
    store.commit('settings/TOGGLE_ALERTS', false)
  }
}

async function toggleAlerts(event: Event) {
  let checked = (event.target as HTMLInputElement).checked

  if (checked) {
    notificationsPermissionState.value = await Notification.requestPermission()
  }

  if (notificationsPermissionState.value === 'denied' && checked) {
    checked = false

    store.dispatch('app/showNotice', {
      id: 'alert-notifications',
      type: 'error',
      icon: 'icon-warning -large pt0',
      timeout: 100000,
      html: true,
      title: `<div class="ml8"><strong>This might not work as expected.</strong><br>${helps['notifications-grant']}</div>`
    })
  } else {
    store.dispatch('app/showNotice', {
      id: 'alert-notifications',
      type: 'info',
      title: checked ? `Alerts are enabled` : 'Alerts are disabled'
    })
  }

  ;(event.target as HTMLInputElement).checked = checked
  store.commit('settings/TOGGLE_ALERTS', checked)
}

async function handleAlertSoundFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]

  if (!file) {
    return
  }

  try {
    await importService.importSound(file)

    store.commit('settings/SET_ALERT_SOUND', file.name)

    audioService.playOnce(file.name)
  } catch (error: any) {
    store.dispatch('app/showNotice', {
      title: error.message,
      type: 'error'
    })
    return
  }
}

function removeAlertSound() {
  if (!alertSound.value) {
    return
  }

  store.commit('settings/SET_ALERT_SOUND', null)
}

async function playAlertSound() {
  if (!alertSound.value) {
    return
  }

  try {
    await audioService.playOnce(alertSound.value, 3000)
  } catch (error) {
    console.error(error)
    store.dispatch('app/showNotice', {
      type: 'error',
      title: `Failed to play ${alertSound.value}`
    })
  }
}
</script>
