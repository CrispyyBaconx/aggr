<template>
  <transition
    name="dialog"
    :duration="500"
    @after-leave="onHide"
    @after-enter="onShow"
  >
    <Dialog
      v-if="dialogOpened"
      class="connection-issue-dialog"
      :resizable="false"
      @clickOutside="hide"
    >
      <template v-slot:header>
        <div>
          <div class="dialog__title">
            <i class="icon-warning -lower"></i>
            Connection issue
          </div>
        </div>

        <div class="column -center"></div>
      </template>
      <form @submit.prevent="submit">
        <transition-height
          stepper
          class="connection-issue-dialog__stepper"
          :name="`slide-fade-${isBack ? 'left' : 'right'}`"
          :duration="500"
        >
          <div
            v-if="stepIndex === 0"
            class="connection-issue-dialog__step"
            key="step-0"
          >
            <p class="form-feedback mt0 mb0">
              Can't connect to {{ restrictedUrl
              }}<i
                class="icon-info -lower ml4"
                :title="`Exchange API refused to connect<br>or blocked connection.`"
                v-tippy="{ boundary: 'window', distance: 24 }"
              ></i>
            </p>
          </div>
          <div
            v-if="stepIndex === 1"
            class="connection-issue-dialog__step"
            key="step-1"
          >
            <p class="-inline mb0 mt0">
              The exchange API is unreachable due to
              <u
                title="Beginning in late November 2022, Binance began declining API requests originating from US IP addresses."
                v-tippy
              >
                geo restriction
              </u>
              or something else.
            </p>
            <ol class="mb0">
              <li v-if="currentWsProxyUrl">
                <p>
                  The current proxy URL might not be working<br />
                  Last used : <code>{{ currentWsProxyUrl }}</code>
                </p>
                <button
                  type="button"
                  class="btn -red mrauto -cases"
                  @click="deleteWsProxyUrl"
                  :disable="selectedAction"
                >
                  <i class="icon-eraser mr8"></i> Clear proxy URL
                </button>
              </li>
              <li>
                <p>
                  Disable all {{ exchangeId }}'s pairs so you won't see the
                  issue anymore
                </p>

                <button
                  type="button"
                  class="btn -red -cases"
                  @click="disableExchange"
                  :disable="selectedAction"
                >
                  <i class="icon-cross mr8"></i> Disable&nbsp;
                  <span>{{ exchangeId }}</span>
                  <i class="ml4" :class="'icon-' + exchangeId"></i>
                </button>
              </li>

              <li>
                <p>Use a VPN</p>

                <button
                  type="button"
                  class="btn -green -cases"
                  @click="refreshExchange"
                  :disable="selectedAction"
                  title="Retry connection with exchange"
                  v-tippy
                >
                  <i class="icon-refresh mr8"></i> I enabled my VPN
                </button>
              </li>
            </ol>
          </div>
          <div
            v-else-if="stepIndex === 2"
            class="connection-issue-dialog__step"
            key="step-3"
          >
            <p class="mx0 text-center text-muted">Connecting to</p>
            <p class="mt0 text-center">
              <code>{{ testUrl }}</code>
            </p>
            <loader ref="loaderRef" />
            <p class="mb0 text-center text-muted">Please wait</p>
          </div>
        </transition-height>
      </form>
      <template v-slot:footer>
        <template v-if="stepIndex">
          <button
            v-if="stepIndex"
            :disabled="isTesting"
            type="button"
            class="btn -text -large mrauto"
            @click="prev"
          >
            Back
          </button>
        </template>
        <template v-else>
          <button type="button" class="btn -text mrauto" @click="dismiss">
            Dismiss
          </button>
          <button type="button" class="btn -text ml8 -large" @click="next">
            Troubleshoot
          </button>
        </template>
      </template>
    </Dialog>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useStore } from 'vuex'
import Dialog from '@/components/framework/Dialog.vue'
import TransitionHeight from '@/components/framework/TransitionHeight.vue'
import Loader from '@/components/framework/Loader.vue'
import { useDialog } from '@/composables/useDialog'
import aggregatorService from '@/services/aggregatorService'
import notificationService from '@/services/notificationService'

const props = defineProps<{
  exchangeId?: string
  restrictedUrl?: string
}>()

const store = useStore()
const { output, close } = useDialog()

const loaderRef = ref<InstanceType<typeof Loader> | null>(null)
const data = ref<string | null>(null)
const proxyUrl = ref('')
const isTesting = ref(false)
const selectedAction = ref<string | null>(null)
const isBack = ref(false)
const stepIndex = ref(0)
const dialogOpened = ref(false)

const currentWsProxyUrl = computed(() => {
  return store.state.settings.wsProxyUrl
})

const valid = computed(() => {
  return /wss?:\/\/.{3,}/.test(proxyUrl.value)
})

const computedUrl = computed(() => {
  const [base, params] = proxyUrl.value.split('?')

  const url = base.replace(/([^/])$/, '$1/')
  if (params && params.length) {
    return url + '?' + params + '&url='
  }

  return url + '?url='
})

const testUrl = computed(() => {
  return computedUrl.value + props.restrictedUrl
})

const contextId = computed(() => {
  return props.exchangeId + props.restrictedUrl
})

watch(stepIndex, (currentStep, previousStep) => {
  isBack.value = currentStep < previousStep
  if (currentStep === 2) {
    test()
  }
})

function onSubscribed(event: { url: string }) {
  if (event.url === props.restrictedUrl || event.url === testUrl.value) {
    hide()
  }
}

onMounted(() => {
  if (currentWsProxyUrl.value) {
    proxyUrl.value = currentWsProxyUrl.value.replace(/(&|\?)url=/g, '')
  }
  aggregatorService.on('connection', onSubscribed)

  if (!data.value) {
    show()
  }
})

onBeforeUnmount(() => {
  aggregatorService.off('connection', onSubscribed)
})

function show() {
  dialogOpened.value = true
}

function hide(newData: string | null = null) {
  if (isTesting.value) {
    return
  }

  data.value = newData
  dialogOpened.value = false
}

function onShow() {
  //
}

function onHide() {
  close(data.value)
}

function submit() {
  if (!valid.value) {
    return
  }

  hide()
}

function dismiss() {
  hide()
  notificationService.dismiss(contextId.value, 86400000)
}

function next() {
  stepIndex.value = Math.min(2, stepIndex.value + 1)
}

function prev() {
  stepIndex.value = Math.max(0, stepIndex.value - 1)
}

async function disableExchange() {
  selectedAction.value = 'disable'
  try {
    await store.dispatch('exchanges/toggleExchange', props.exchangeId)
    hide()
  } catch (error: any) {
    store.dispatch('app/showNotice', {
      title: error.message
    })
  } finally {
    selectedAction.value = null
  }
}

async function refreshExchange() {
  selectedAction.value = 'disable'
  try {
    await store.dispatch('exchanges/disconnect', props.exchangeId)
    await store.dispatch('exchanges/connect', props.exchangeId)
    hide()
  } catch (error: any) {
    store.dispatch('app/showNotice', {
      title: error.message
    })
  } finally {
    selectedAction.value = null
  }
}

function test() {
  if (!proxyUrl.value) {
    return false
  }

  isTesting.value = true

  const url = testUrl.value

  return new Promise<boolean>(resolve => {
    const ws = new WebSocket(url)
    let openTimeout: ReturnType<typeof setTimeout> | null = null
    let openHandler: () => void
    let errorHandler: () => void

    const postHandler = () => {
      ws.removeEventListener('open', openHandler)
      ws.removeEventListener('error', errorHandler)
      ws.removeEventListener('close', errorHandler)

      if (ws.readyState < 2) {
        ws.close()
      }
    }

    openHandler = () => {
      openTimeout = setTimeout(() => {
        openTimeout = null
        resolve(true)
        postHandler()
      }, 3000)
    }

    errorHandler = () => {
      if (openTimeout) {
        clearTimeout(openTimeout)
      }

      setTimeout(() => {
        resolve(false)
        postHandler()
      }, 1000)
    }

    ws.addEventListener('open', openHandler)
    ws.addEventListener('error', errorHandler)
    ws.addEventListener('close', errorHandler)
  }).then(value => {
    isTesting.value = false

    if (value) {
      hide(computedUrl.value)
    } else {
      store.dispatch('app/showNotice', {
        title: `Failed to open ws connection with ${url}`,
        type: 'error'
      })
      prev()
    }

    return value
  })
}

function deleteWsProxyUrl() {
  hide('')
}

defineExpose({ output, close })
</script>
<style lang="scss">
.connection-issue-dialog {
  .dialog__content {
    width: 320px;
  }

  code {
    word-break: break-all;
  }

  .form-control {
    width: 100%;
  }

  &__stepper {
    margin: 0 -1rem;

    &.transition-height--active {
      overflow: hidden;
    }
  }

  &__step {
    padding: 0 1rem;
  }

  &__action {
    text-transform: none !important;
  }
}
</style>
