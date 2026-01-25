<template>
  <div
    v-if="isBooted"
    id="app"
    :data-prefered-sizing-currency="preferedSizingCurrency"
    :class="{
      '-no-animations': disableAnimations,
      '-auto-hide-headers': autoHideHeaders,
      '-auto-hide-names': autoHideNames,
      '-light': theme === 'light'
    }"
  >
    <Loader v-if="isLoading" />
    <Notices />
    <div class="app__wrapper">
      <Menu />

      <div class="app__layout">
        <Panes />
      </div>
    </div>
  </div>
  <div id="app" v-else>
    <div class="app__loader d-flex -column">
      <div v-if="showStuck" class="px8 py8">
        💡 Stuck here ?
        <button class="btn -text" @click="resetAndReload">
          reset everything
        </button>
      </div>
      <Loader />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useStore } from 'vuex'

import aggregatorService from './services/aggregatorService'

import Loader from '@/components/framework/Loader.vue'
import Notices from '@/components/framework/Notices.vue'
import Menu from '@/components/Menu.vue'

import Panes from '@/components/panes/Panes.vue'

import upFavicon from '@/assets/up.png'
import downFavicon from '@/assets/down.png'

import { Notice } from '@/store/app'

import workspacesService from '@/services/workspacesService'
import { formatMarketPrice } from '@/services/productsService'
import dialogService from '@/services/dialogService'
import importService from '@/services/importService'
import { pathToBase64 } from './utils/helpers'

const store = useStore()

const price = ref<string | null>(null)
const showStuck = ref(false)

let mainPrices: { [marketKey: string]: number } = {}
let mainMarkets: string[] = []
let faviconElement: HTMLLinkElement | null = null
let stuckTimeout: number | undefined
let mainPair: string = ''
let favicons: { up?: string; down?: string } = {}

const showSearch = computed(() => store.state.app?.showSearch)

const isBooted = computed(() => {
  const booted = store.state.app && store.state.app.isBooted

  clearTimeout(stuckTimeout)

  if (!booted) {
    showStuck.value = false
    stuckTimeout = setTimeout(() => {
      showStuck.value = true
    }, 15000) as unknown as number
  }

  return booted
})

const isLoading = computed(() => store.state.app?.isLoading)

const theme = computed(() => store.state.settings?.theme)

const autoHideHeaders = computed(() => store.state.settings?.autoHideHeaders)

const autoHideNames = computed(() => store.state.settings?.autoHideNames)

const preferedSizingCurrency = computed(() => {
  return store.state.settings?.preferQuoteCurrencySize ? 'quote' : 'base'
})

const disableAnimations = computed(
  () => store.state.settings?.disableAnimations
)

watch(
  () => store.state.panes?.marketsListeners,
  (newMarkets, previousMarkets) => {
    if (newMarkets && newMarkets !== previousMarkets) {
      refreshMainMarkets(newMarkets)
    }
  }
)

onMounted(async () => {
  aggregatorService.on('notice', (notice: Notice) => {
    store.dispatch('app/showNotice', notice)
  })
  document.addEventListener('keydown', onDocumentKeyPress)

  bindDropFile()
  await startUpdatingPrice()
})

onBeforeUnmount(() => {
  unbindDropFile()
  stopUpdatingPrice()
})

function updatePrice(tickers: { [key: string]: { price: number } }) {
  let priceSum = 0
  let count = 0

  for (const marketKey of mainMarkets) {
    if (tickers[marketKey]) {
      mainPrices[marketKey] = tickers[marketKey].price
    }

    if (!mainPrices[marketKey]) {
      continue
    }

    priceSum += mainPrices[marketKey]
    count++
  }

  if (count) {
    priceSum = priceSum / count

    if (price.value !== null) {
      if (priceSum > +price.value) {
        updateFavicon('up')
      } else if (priceSum < +price.value) {
        updateFavicon('down')
      }
    }

    price.value = formatMarketPrice(priceSum, mainPair)

    window.document.title = mainPair + ' ' + price.value
  } else {
    price.value = null
    updateFavicon('neutral')

    window.document.title = mainPair ? mainPair : 'AGGR'
  }
}

async function startUpdatingPrice() {
  const up = await pathToBase64(upFavicon)
  const down = await pathToBase64(downFavicon)
  favicons = { up, down }

  aggregatorService.on('tickers', updatePrice)
}

function stopUpdatingPrice() {
  aggregatorService.off('tickers', updatePrice)
  price.value = null
}

function updateFavicon(direction: 'up' | 'down' | 'neutral') {
  if (!faviconElement) {
    faviconElement = document.createElement('link')
    faviconElement.id = 'favicon'
    faviconElement.rel = 'shortcut icon'

    document.head.appendChild(faviconElement)
  }

  if (direction === 'up') {
    faviconElement.href = favicons.up || ''
  } else {
    faviconElement.href = favicons.down || ''
  }
}

function onDocumentKeyPress(event: KeyboardEvent) {
  if (!isBooted.value) {
    return
  }

  const activeElement = document.activeElement as HTMLElement

  if (
    store.state.app?.showSearch ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    activeElement.tagName === 'INPUT' ||
    activeElement.tagName === 'TEXTAREA' ||
    activeElement.tagName === 'SELECT' ||
    activeElement.isContentEditable
  ) {
    return
  }

  if (/^[a-z]$/i.test(event.key)) {
    store.dispatch('app/showSearch', {
      pristine: true,
      input: event.key
    })
  } else if (/^[0-9]$/i.test(event.key)) {
    store.dispatch('app/showTimeframe')
  }
}

async function resetAndReload() {
  const response = await dialogService.confirm({
    title: 'Reset app',
    message: 'Are you sure ?',
    ok: 'Reset settings',
    cancel: workspacesService.workspace
      ? 'Download workspace ' + workspacesService.workspace.id
      : 'Cancel'
  })

  if (response === true) {
    await workspacesService.reset()
    window.location.reload()
  } else if (response === false && workspacesService.workspace) {
    workspacesService.downloadWorkspace()
  }
}

function bindDropFile() {
  document.body.addEventListener('drop', handleDrop)
  document.body.addEventListener('dragover', handleDrop)
}

function unbindDropFile() {
  document.body.removeEventListener('drop', handleDrop)
  document.body.removeEventListener('dragover', handleDrop)
}

async function handleDrop(event: DragEvent) {
  event.preventDefault()

  if (event.type !== 'drop') {
    return false
  }

  if (!event.dataTransfer?.files || !event.dataTransfer.files.length) {
    return
  }

  for (const file of event.dataTransfer.files) {
    try {
      await importService.importAnything(file)
    } catch (error) {
      store.dispatch('app/showNotice', {
        title: (error as Error).message,
        type: 'error',
        timeout: 60000
      })
    }
  }
}

function refreshMainMarkets(
  markets: Record<
    string,
    { local: string; listeners: number; exchange: string; pair: string }
  >
) {
  const marketsByNormalizedPair: Record<string, number> = {}
  for (const id in markets) {
    const pair = markets[id].local
    if (!marketsByNormalizedPair[pair]) {
      marketsByNormalizedPair[pair] = 0
    }

    marketsByNormalizedPair[pair] += markets[id].listeners
  }

  mainPair = Object.keys(marketsByNormalizedPair).sort(
    (a, b) => marketsByNormalizedPair[b] - marketsByNormalizedPair[a]
  )[0]

  mainMarkets = Object.keys(markets)
    .filter(id => markets[id].local === mainPair)
    .map(id => markets[id].exchange + ':' + markets[id].pair)

  mainPrices = {}
}
</script>
