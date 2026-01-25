<template>
  <div class="pane-website" ref="el">
    <pane-header
      ref="paneHeader"
      :paneId="paneId"
      :settings="() => import('@/components/website/WebsiteDialog.vue')"
      :show-search="false"
    >
      <template v-slot:menu>
        <div class="dropdown-item">
          <label class="checkbox-control -small" @click.stop>
            <input
              type="checkbox"
              class="form-control"
              :checked="interactive"
              @change="store.commit(paneId + '/TOGGLE_INTERACTIVE')"
            />
            <div></div>
            <span>Interactive</span>
          </label>
        </div>
        <button type="button" class="dropdown-item" @click="reload(true)">
          <i class="icon-refresh"></i>
          <span>Reload</span>
        </button>
        <div class="dropdown-divider"></div>
      </template>
    </pane-header>
    <div class="iframe__lock" v-if="locked">
      <div class="ml8 mr8">
        <p>
          Load
          <span
            class="text-condensed"
            v-text="trimmedUrl"
            title="url"
            v-tippy
          ></span>
          ?
        </p>
        <div class="text-center">
          <button class="btn" @click="store.commit(paneId + '/UNLOCK_URL')">
            Yes, authorize
          </button>
        </div>
      </div>
    </div>
    <div class="iframe__wrapper" v-else>
      <iframe
        :src="url"
        ref="iframe"
        frameborder="0"
        width="100%"
        height="100%"
        :class="invert && '-solid'"
        :scrolling="!interactive && 'no'"
        :style="style"
      ></iframe>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useStore } from 'vuex'

import { usePane } from '@/composables/usePane'
import PaneHeader from '../panes/PaneHeader.vue'

const props = defineProps<{
  paneId: string
}>()

const store = useStore()

const { el } = usePane(props.paneId)

const iframe = ref<HTMLIFrameElement | null>(null)
const paneHeader = ref<InstanceType<typeof PaneHeader> | null>(null)

let _reloadTimeout: number | null = null

const locked = computed(() => {
  return store.state[props.paneId].locked
})

const url = computed(() => {
  return (
    store.state[props.paneId].url ||
    'https://alternative.me/crypto/fear-and-greed-index.png'
  )
})

const interactive = computed(() => {
  return store.state[props.paneId].interactive
})

const invert = computed(() => {
  return store.state[props.paneId].invert
})

const reloadTimer = computed(() => {
  return store.state[props.paneId].reloadTimer
})

const zoom = computed(() => {
  return store.state.panes.panes[props.paneId].zoom
})

const style = computed(() => {
  const size = (1 / zoom.value) * 100

  return {
    transform: `scale(${zoom.value})`,
    width: size + '%',
    height: size + '%',
    pointerEvents: (interactive.value ? 'all' : 'none') as 'all' | 'none'
  }
})

const trimmedUrl = computed(() => {
  if (url.value.length <= 33) {
    return url.value
  } else {
    return url.value.slice(0, 15) + '[...]' + url.value.substr(-15)
  }
})

function setupReloadTimer() {
  if (_reloadTimeout) {
    clearTimeout(_reloadTimeout)
  }

  if (!reloadTimer.value) {
    return
  }

  const intervalStr: string = reloadTimer.value.trim()
  let interval: number

  if (/[\d.]+s/.test(intervalStr)) {
    interval = parseFloat(intervalStr) * 1000
  } else if (/[\d.]+h/.test(intervalStr)) {
    interval = parseFloat(intervalStr) * 1000 * 60 * 60
  } else {
    interval = parseFloat(intervalStr) * 1000 * 60
  }

  if (!interval) {
    return
  }

  const now = Date.now()
  let delay =
    Math.ceil(now / (interval as number)) * (interval as number) - now - 20

  if (delay < 1000) {
    delay += interval as number
  }

  _reloadTimeout = setTimeout(() => {
    _reloadTimeout = null

    reload()

    setupReloadTimer()
  }, delay) as unknown as number
}

async function reload(focus?: boolean) {
  if (!iframe.value) return

  iframe.value.src += ''

  if (focus) {
    iframe.value.onload = () => {
      if (!iframe.value) return
      iframe.value.onload = null
      iframe.value.focus()
    }
  }
}

// Watch reloadTimer changes
watch(reloadTimer, () => {
  setupReloadTimer()
})

// Lifecycle
onMounted(() => {
  setupReloadTimer()
})

onBeforeUnmount(() => {
  if (_reloadTimeout) {
    clearTimeout(_reloadTimeout)
  }
})
</script>

<style lang="scss" scoped>
.iframe__lock {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: rgba($red, 0.5);
}

.iframe__wrapper {
  width: 100%;
  height: 100%;
  overflow: hidden;

  iframe {
    border: 0;
    width: 100%;
    height: 100%;
    transform-origin: top left;

    &.-solid {
      filter: invert(1);
    }
  }
}
</style>
