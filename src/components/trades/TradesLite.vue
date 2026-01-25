<template>
  <div class="pane-trades" ref="el" @mouseenter="bindScroll">
    <pane-header
      :paneId="paneId"
      ref="paneHeader"
      :settings="() => import('@/components/trades/TradesDialog.vue')"
      @zoom="onResize"
    >
      <hr />
      <dropdown
        v-if="market"
        v-model="sliderDropdownTrigger"
        interactive
        no-scroll
      >
        <slider
          style="width: 100px"
          :min="0"
          :max="10"
          :step="0.01"
          label
          :show-completion="false"
          :gradient="gradient"
          :value="thresholdsMultipler"
          @input="
            store.commit(paneId + '/SET_THRESHOLDS_MULTIPLER', {
              value: $event,
              market: market
            })
          "
          @reset="
            store.commit(paneId + '/SET_THRESHOLDS_MULTIPLER', {
              value: 1,
              market: market
            })
          "
          log
        >
          <template v-slot:tooltip>
            {{ formatAmountValue(thresholdsMultipler * minAmountValue) }}
          </template>
        </slider>
      </dropdown>
      <button
        class="btn"
        :name="paneId"
        @click="
          sliderDropdownTrigger = sliderDropdownTrigger
            ? null
            : ($event.currentTarget as HTMLElement)
        "
      >
        <i class="icon-gauge"></i>
      </button>
    </pane-header>
    <code v-if="paused" class="pane-trades__paused">
      {{ paused }}
    </code>
    <canvas ref="canvas" @dblclick="prepareEverything" />
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  nextTick,
  getCurrentInstance
} from 'vue'
import { useStore } from 'vuex'
import { usePane } from '../../composables/usePane'
import aggregatorService from '../../services/aggregatorService'
import { formatAmount, formatMarketPrice } from '../../services/productsService'
import { Threshold, TradesPaneState } from '../../store/panesSettings/trades'
import {
  getColorByWeight,
  getLinearShadeText,
  getLinearShade,
  joinRgba,
  rgbaToRgb,
  splitColorCode,
  getAppBackgroundColor
} from '../../utils/colors'
import Slider from '@/components/framework/picker/Slider.vue'

import PaneHeader from '@/components/panes/PaneHeader.vue'
import dialogService from '../../services/dialogService'
import audioService, { AudioFunction } from '../../services/audioService'
import logos from '@/assets/exchanges'
import { Trade } from '../../types/types'

const DEBUG = false
const GRADIENT_DETAIL = 5
const LOGOS: { [key: string]: HTMLCanvasElement } = {}

enum TradeType {
  trade,
  liquidation
}

interface ColorRange {
  from: number
  to: number
  buy: {
    background: string
    color: string
    step: number
  }[]
  sell: {
    background: string
    color: string
    step: number
  }[]
  max?: boolean
}

interface ColorConfig {
  lastRangeIndex: number
  minAmount: number
  maxAmount: number
  significantAmount: number
  ranges: ColorRange[]
}

interface TradeRendering {
  type: TradeType
  background: string
  color: string
  step: number
  exchange: string
  pair: string
  amount: number
  count: number
  price: number
  side: string
  time: string | null
}

const props = defineProps<{
  paneId: string
}>()

const store = useStore()
const instance = getCurrentInstance()

const { el, pane } = usePane(props.paneId, onResize)

const canvas = ref<HTMLCanvasElement | null>(null)
const paneHeader = ref<InstanceType<typeof PaneHeader> | null>(null)
const sliderDropdownTrigger = ref<HTMLElement | null>(null)
const paused = ref(0)

let ctx: CanvasRenderingContext2D | null = null
let width = 0
let maxWidth = 0
let pairOffset = 0
let priceOffset = 0
let amountOffset = 0
let height = 0
let lineHeight = 0
let fontSize = 0
let paddingTop = 0
let paddingLeft = 0
let margin = 0
let logoWidth = 0
let timeWidth = 0
let pxRatio = 1
let maxLines = 0
let maxHistory = 0
let buyColorBase = ''
let buyColor100 = ''
let sellColorBase = ''
let sellColor100 = ''
let themeBase = ''
let renderTrades = false
let showPairs = false
let showPrices = false
let showHistograms = false
let drawOffset = 0

let minAmount = 0
let minAudio = 0
let colors: { [type: string]: ColorConfig } = {}
let sounds: { [type: string]: { buy: AudioFunction; sell: AudioFunction }[] } =
  {}

let baseSizingCurrency = false
let filters: { [key: number]: boolean } = {}
let rendering = false
let tradesRendering: TradeRendering[] = []
let tradesHistory: TradeRendering[] = []
let paneMarkets: { [market: string]: boolean } = {}
let volumeBySide = { buy: 0, sell: 0 }
let insignificantVolumeBySide = { buy: 0, sell: 0 }
let addedVolumeBySide = { buy: 0, sell: 0 }
let offset = 0
let maxCount = 100
let showAvgPrice = false
let limit = 0
let batchSize = 1

let scrollHandler: ((event: WheelEvent) => void) | null = null
let blurHandler: (() => void) | null = null
let _onStoreMutation: (() => void) | null = null

const market = computed(() => pane.value.markets[0])

const thresholdsMultipler = computed(
  () => store.state[props.paneId].thresholdsMultipler
)

const minAmountValue = computed(() => minAmount)

const gradient = computed(() => [
  store.state[props.paneId].thresholds[0].buyColor,
  store.state[props.paneId].thresholds[
    store.state[props.paneId].thresholds.length - 1
  ].buyColor
])

function formatAmountValue(v: number) {
  return formatAmount(v)
}

function getThresholdsByType(type: TradeType | number): Threshold[] {
  const paneSettings = store.state[props.paneId] as TradesPaneState

  if (type === TradeType.liquidation) {
    return paneSettings.liquidations
  }

  return paneSettings.thresholds
}

function onTrades(trades: Trade[]) {
  let date: Date | null = null
  let side: string | null = null

  for (let i = 0; i < trades.length; i++) {
    const marketKey = trades[i].exchange + ':' + trades[i].pair
    const type = trades[i].liquidation ? TradeType.liquidation : TradeType.trade

    if (!filters[type] || !paneMarkets[marketKey]) {
      continue
    }

    if (
      trades[i].amount < colors[type].minAmount ||
      trades[i].amount > colors[type].maxAmount
    ) {
      if (trades[i].amount > minAudio) {
        sounds[type][0][trades[i].side](
          audioService,
          trades[i].amount / colors[type].significantAmount
        )
      }

      insignificantVolumeBySide[trades[i].side] += trades[i].amount
      continue
    }

    volumeBySide[trades[i].side] += trades[i].amount

    if (side === null) {
      side = trades[i].side
    }

    const colorResult = getColors(trades[i].amount, trades[i].side, type)

    maxCount = Math.max(maxCount, trades[i].count || 1)

    const trade: TradeRendering = {
      type,
      background: colorResult.background,
      color: colorResult.color,
      step: colorResult.step,
      exchange: trades[i].exchange,
      pair: trades[i].pair,
      amount: trades[i].amount,
      count: trades[i].count || 1,
      price: showAvgPrice ? trades[i].avgPrice : trades[i].price,
      side: trades[i].side,
      time: null
    }

    if (!date) {
      date = new Date(+trades[i].timestamp)

      trade.time = `${date.getHours().toString().padStart(2, '0')}:${date
        .getMinutes()
        .toString()
        .padStart(2, '0')}`
    }

    if (trade.amount > minAudio) {
      sounds[type][Math.floor(trade.step / GRADIENT_DETAIL)][trade.side](
        audioService,
        trade.amount / colors[type].significantAmount
      )
    }

    tradesRendering.push(trade)
  }

  if (date && !rendering && side) {
    volumeBySide[side] += insignificantVolumeBySide[side]
    addedVolumeBySide[side] += insignificantVolumeBySide[side]
    insignificantVolumeBySide[side] = 0
    renderTradesBatch()
  }

  renderVolumeBySide()
}

async function prepareTypeFilter(checkRequirements?: boolean) {
  filters = {
    [TradeType.trade]: store.state[props.paneId].showTrades,
    [TradeType.liquidation]: store.state[props.paneId].showLiquidations
  }

  baseSizingCurrency = !store.state.settings.preferQuoteCurrencySize

  if (checkRequirements) {
    for (const type in filters) {
      if (!filters[+type] && typeof colors[type] !== 'undefined') {
        delete colors[type]
      } else if (filters[+type] && typeof colors[type] === 'undefined') {
        prepareThresholds(+type as TradeType, getThresholdsByType(+type))
      }

      if (!filters[+type] && typeof sounds[type] !== 'undefined') {
        delete sounds[type]
      } else if (
        filters[+type] &&
        typeof sounds[type] === 'undefined' &&
        minAudio > 0
      ) {
        await prepareSounds(type, getThresholdsByType(+type))
      }
    }
  }

  for (let i = 0; i < tradesHistory.length; i++) {
    if (!filters[tradesHistory[i].type]) {
      tradesHistory.splice(i, 1)
      i--
    }
  }
}

function prepareMarkets() {
  paneMarkets = store.state.panes.panes[props.paneId].markets.reduce(
    (output: { [key: string]: boolean }, marketKey: string) => {
      const [exchange] = marketKey.split(':')

      if (!store.state.app.activeExchanges[exchange]) {
        output[marketKey] = false
        return output
      }

      output[marketKey] = true
      return output
    },
    {}
  )
}

async function prepareAudio(prepareSoundsFlag = true) {
  const audioThreshold = store.state[props.paneId].audioThreshold

  if (
    !store.state.settings.useAudio ||
    store.state[props.paneId].muted ||
    store.state[props.paneId].audioVolume === 0
  ) {
    minAudio = Infinity
    sounds = {}
    return
  }

  if (audioThreshold) {
    if (typeof audioThreshold === 'string' && /\d\s*%$/.test(audioThreshold)) {
      minAudio = minAmount * (parseFloat(audioThreshold) / 100)
    } else {
      minAudio = +audioThreshold
    }
  } else {
    minAudio = minAmount * 0.1
  }

  if (prepareSoundsFlag) {
    for (const type in filters) {
      if (filters[+type]) {
        await prepareSounds(type, getThresholdsByType(+type))
      }
    }
  }
}

async function prepareSounds(type: string, thresholds: Threshold[]) {
  const soundsArr: { buy: AudioFunction; sell: AudioFunction }[] = []
  const audioPitch = store.state[props.paneId].audioPitch

  for (let i = 0; i < thresholds.length; i++) {
    soundsArr.push({
      buy: await audioService.buildAudioFunction(
        thresholds[i].buyAudio,
        'buy',
        audioPitch
      ),
      sell: await audioService.buildAudioFunction(
        thresholds[i].sellAudio,
        'sell',
        audioPitch
      )
    })
  }

  sounds[type] = soundsArr
}

function prepareColors() {
  const style = getComputedStyle(document.documentElement)
  themeBase = style.getPropertyValue('--theme-base')

  let baseColorThreshold: Threshold

  if (filters[TradeType.trade]) {
    baseColorThreshold =
      store.state[props.paneId].thresholds[
        store.state[props.paneId].thresholds.length - 2
      ]
  } else {
    baseColorThreshold =
      store.state[props.paneId].liquidations[
        store.state[props.paneId].thresholds.length - 2
      ]
  }

  buyColorBase = baseColorThreshold.buyColor
  buyColor100 = joinRgba(getLinearShade(splitColorCode(buyColorBase), 0.25))
  sellColorBase = baseColorThreshold.sellColor
  sellColor100 = joinRgba(getLinearShade(splitColorCode(sellColorBase), 0.25))

  for (const type in filters) {
    if (filters[+type]) {
      prepareThresholds(+type as TradeType, getThresholdsByType(+type))
    }
  }

  for (let i = 0; i < tradesHistory.length; i++) {
    if (tradesHistory[i].amount < minAmount) {
      tradesHistory.splice(i, 1)
      i--
      continue
    }

    const color = getColors(
      tradesHistory[i].amount,
      tradesHistory[i].side,
      tradesHistory[i].type
    )

    Object.assign(tradesHistory[i], color)
  }
}

function prepareThresholds(type: TradeType, thresholds: Threshold[]) {
  const themeBackgroundColor = splitColorCode(themeBase)
  const appBackgroundColor = getAppBackgroundColor()

  const ranges: ColorRange[] = []
  let significantAmount = 0
  const total = thresholds.length * GRADIENT_DETAIL

  for (let i = 0; i < thresholds.length - 1; i++) {
    const from = thresholds[i].amount
    const to = thresholds[i + 1].amount

    if (i === 0) {
      significantAmount = to
    }

    const buyColorFrom = splitColorCode(thresholds[i].buyColor)
    const buyColorTo = splitColorCode(thresholds[i + 1].buyColor)
    const buyAlpha =
      typeof buyColorFrom[3] === 'undefined' ? 1 : buyColorFrom[3]

    const buyColorRange = [
      rgbaToRgb(buyColorFrom, appBackgroundColor),
      rgbaToRgb(buyColorTo, appBackgroundColor)
    ]

    const buyColorRangeTheme = [
      rgbaToRgb(buyColorFrom, themeBackgroundColor),
      rgbaToRgb(buyColorTo, themeBackgroundColor)
    ]

    const sellColorFrom = splitColorCode(thresholds[i].sellColor)
    const sellColorTo = splitColorCode(thresholds[i + 1].sellColor)
    const sellAlpha =
      typeof sellColorFrom[3] === 'undefined' ? 1 : sellColorFrom[3]

    const sellColorRange = [
      rgbaToRgb(sellColorFrom, appBackgroundColor),
      rgbaToRgb(sellColorTo, appBackgroundColor)
    ]

    const sellColorRangeTheme = [
      rgbaToRgb(sellColorFrom, themeBackgroundColor),
      rgbaToRgb(sellColorTo, themeBackgroundColor)
    ]

    const buy: { background: string; color: string; step: number }[] = []
    const sell: { background: string; color: string; step: number }[] = []

    for (let j = 0; j < GRADIENT_DETAIL; j++) {
      const position = j / (GRADIENT_DETAIL - 1)

      const buyBackground = getColorByWeight(
        buyColorRange[0],
        buyColorRange[1],
        position
      )
      const buyTextColor = getColorByWeight(
        buyColorRangeTheme[0],
        buyColorRangeTheme[1],
        position
      )
      const buyText = getLinearShadeText(
        buyTextColor,
        0.5 + Math.min(1, (i * GRADIENT_DETAIL + j) / total),
        Math.exp(1 - buyAlpha) / 5
      )

      buy.push({
        background: joinRgba(buyBackground),
        color: joinRgba(buyText),
        step: i * GRADIENT_DETAIL + j
      })

      const sellBackground = getColorByWeight(
        sellColorRange[0],
        sellColorRange[1],
        position
      )
      const sellTextColor = getColorByWeight(
        sellColorRangeTheme[0],
        sellColorRangeTheme[1],
        position
      )
      const sellText = getLinearShadeText(
        sellTextColor,
        0.5 + Math.min(1, (i * GRADIENT_DETAIL + j) / total),
        Math.exp(1 - sellAlpha) / 5
      )

      sell.push({
        background: joinRgba(sellBackground),
        color: joinRgba(sellText),
        step: i * GRADIENT_DETAIL + j
      })
    }

    ranges.push({
      from,
      to,
      buy,
      sell
    })

    if (thresholds[i + 1].max) {
      ranges[ranges.length - 1].max = true
      break
    }
  }

  const lastRangeIndex = ranges.length - 1
  const minAmountVal = ranges[0].from

  let maxAmount: number

  if (!ranges[ranges.length - 1].max) {
    maxAmount = Infinity
  } else {
    maxAmount = ranges[ranges.length - 1].to
  }

  colors[type] = {
    lastRangeIndex,
    minAmount: minAmountVal,
    maxAmount,
    significantAmount,
    ranges
  }

  if (type == TradeType.trade || !filters[TradeType.trade]) {
    minAmount = minAmountVal
  }
}

function prepareDisplaySettings() {
  const paneState = store.state[props.paneId] as TradesPaneState
  maxHistory = paneState.maxRows
  showHistograms = paneState.showHistograms
  showPairs = paneState.showPairs
  showAvgPrice = paneState.showAvgPrice
  renderTrades = !paneState.showHistograms || height > window.innerHeight / 24
  showPrices = paneState.showPrices
  offset = 0
  drawOffset = showHistograms ? lineHeight : 0

  refreshColumnsWidth()
}

function onResize(newWidth?: number, newHeight?: number, isMounting?: boolean) {
  resize()

  if (!isMounting) {
    renderHistory()
  }
}

function resize() {
  const canvasEl = canvas.value
  if (!canvasEl) return

  const rootEl = instance?.proxy?.$el as HTMLElement
  if (!rootEl) return

  let headerHeight = 0

  if (!store.state.settings.autoHideHeaders) {
    headerHeight = (store.state.panes.panes[props.paneId].zoom || 1) * 2 * 16
  }

  pxRatio = window.devicePixelRatio || 1
  const zoom = store.state.panes.panes[props.paneId].zoom || 1

  width = canvasEl.width = rootEl.clientWidth * pxRatio
  height = canvasEl.height = (rootEl.clientHeight - headerHeight) * pxRatio
  fontSize = Math.round(12 * zoom * pxRatio)
  logoWidth = fontSize
  paddingTop = Math.round(Math.max(width * 0.005 * zoom, 2) * pxRatio)
  lineHeight = Math.round(fontSize + paddingTop)
  drawOffset = showHistograms ? lineHeight : 0
  maxLines = Math.ceil(height / lineHeight)
  renderTrades =
    !store.state[props.paneId].showHistograms ||
    height > window.innerHeight / 24
  offset = offset || 0
  limit = offset + maxLines

  if (ctx) {
    ctx.font = `${zoom > 1.25 ? '600 ' : ''}${fontSize}px Spline Sans Mono`
    ctx.textBaseline = 'middle'
  }

  refreshColumnsWidth()
}

function refreshColumnsWidth() {
  if (typeof showPairs === 'undefined') {
    return
  }

  const zoom = store.state.panes.panes[props.paneId].zoom || 1
  const count = (showPairs ? 1 : 0) + (showPrices ? 1 : 0) + 2

  paddingLeft =
    Math.round(Math.max(width * 0.01 * zoom, 2) * pxRatio) * (count < 3 ? 4 : 1)
  margin = Math.round(Math.max(width * 0.01 * zoom, 4) * pxRatio)

  const contentWidth = width - margin * 2 - logoWidth - paddingLeft * count
  timeWidth = contentWidth * (0.75 / count)
  maxWidth = (contentWidth - timeWidth) / (count - 1)
  amountOffset = width - timeWidth - margin - paddingLeft
  priceOffset = margin + logoWidth + paddingLeft
  pairOffset = priceOffset + (showPrices ? paddingLeft + maxWidth : 0)
}

function getColors(amount: number, side: string, type: TradeType) {
  const colorsConfig = colors[type]

  for (let i = 0; i < colorsConfig.ranges.length; i++) {
    if (
      i === colorsConfig.lastRangeIndex ||
      amount < colorsConfig.ranges[i].to
    ) {
      let innerStep = GRADIENT_DETAIL - 1

      if (amount < colorsConfig.ranges[i].to) {
        innerStep = Math.floor(
          ((amount - colorsConfig.ranges[i].from) /
            (colorsConfig.ranges[i].to - colorsConfig.ranges[i].from)) *
            GRADIENT_DETAIL
        )
      }

      return colorsConfig.ranges[i][side as 'buy' | 'sell'][innerStep]
    }
  }

  return { background: '', color: '', step: 0 }
}

function clear() {
  if (!ctx) return

  ctx.resetTransform()
  const style = getComputedStyle(document.documentElement)
  const themeBaseColor = splitColorCode(style.getPropertyValue('--theme-base'))
  const backgroundColor = splitColorCode(
    style.getPropertyValue('--theme-background-base'),
    themeBaseColor
  )
  themeBaseColor[3] = 0.1
  ctx.fillStyle = joinRgba(
    splitColorCode(joinRgba(themeBaseColor), backgroundColor)
  )
  ctx.fillRect(0, 0, width, height)
}

function reset() {
  if (ctx) {
    clear()
  }

  tradesRendering = []
  tradesHistory = []
  volumeBySide = { buy: 0, sell: 0 }
  insignificantVolumeBySide = { buy: 0, sell: 0 }
  addedVolumeBySide = { buy: 0, sell: 0 }
  colors = {}
  sounds = {}
  offset = 0
  limit = 0
  maxCount = 100

  prepareDisplaySettings()
}

function renderTradesBatch() {
  if (paused.value) {
    paused.value = tradesRendering.length
    rendering = false
    return
  }

  let count = Math.ceil(tradesRendering.length * 0.1)
  let i = 0
  while (count-- && ++i <= batchSize) {
    const trade = tradesRendering.shift()

    if (!trade) break

    if (renderTrades) {
      renderTrade(trade)

      if (offset >= 1) {
        offset++
      }
    }

    tradesHistory.unshift(trade)

    if (tradesHistory.length > maxHistory) {
      const oldTrade = tradesHistory.pop()

      if (oldTrade && addedVolumeBySide[oldTrade.side as 'buy' | 'sell']) {
        oldTrade.amount += addedVolumeBySide[oldTrade.side as 'buy' | 'sell']
        addedVolumeBySide[oldTrade.side as 'buy' | 'sell'] = 0
      }

      if (oldTrade) {
        volumeBySide[oldTrade.side as 'buy' | 'sell'] -= oldTrade.amount
      }
    }
  }

  const rate = Math.ceil(tradesRendering.length / 10)
  batchSize = rate

  rendering = tradesRendering.length > 0

  if (rendering) {
    return requestAnimationFrame(renderTradesBatch)
  }
}

function renderTrade(trade: TradeRendering) {
  if (!ctx) return

  const tradeHeight = paddingTop + Math.round((trade.step / 2) * pxRatio)
  const totalHeight = lineHeight + tradeHeight * 2

  ctx.drawImage(ctx.canvas, 0, totalHeight)
  ctx.fillStyle = trade.background
  ctx.fillRect(0, drawOffset, width, totalHeight)

  drawHistogram(trade, totalHeight)
  ctx.fillStyle = trade.color

  drawLogo(trade.exchange, margin, drawOffset + totalHeight / 2 - logoWidth / 2)

  if (showPairs) {
    drawPair(trade, totalHeight)
  }

  if (showPrices) {
    const marketKey = trade.exchange + ':' + trade.pair
    drawPrice(trade, marketKey, totalHeight)
  }

  drawAmount(trade, totalHeight, trade.type === TradeType.liquidation)

  if (trade.time) {
    drawTime(trade, totalHeight)
  }
}

function drawTime(trade: TradeRendering, tradeHeight: number) {
  if (!ctx) return

  ctx.fillText(
    trade.time || '',
    width - margin,
    drawOffset + tradeHeight / 2 + 1,
    timeWidth
  )
}

function drawHistogram(trade: TradeRendering, tradeHeight: number) {
  if (!ctx) return

  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fillRect(
    0,
    0,
    Math.min(1, trade.count / 100) * width,
    drawOffset + tradeHeight
  )
}

function drawPair(trade: TradeRendering, tradeHeight: number) {
  if (!ctx) return

  ctx.textAlign = 'left'
  ctx.fillText(
    trade.pair,
    pairOffset,
    drawOffset + tradeHeight / 2 + 1,
    maxWidth
  )
}

function drawPrice(
  trade: TradeRendering,
  marketKey: string,
  tradeHeight: number
) {
  if (!ctx) return

  ctx.textAlign = 'left'
  ctx.fillText(
    formatMarketPrice(trade.price, marketKey),
    priceOffset,
    drawOffset + tradeHeight / 2 + 1,
    maxWidth
  )
}

function drawAmount(
  trade: TradeRendering,
  tradeHeight: number,
  liquidation: boolean
) {
  if (!ctx) return

  ctx.textAlign = 'right'
  const backupFont = ctx.font
  ctx.font = ctx.font.replace(new RegExp(`^(${fontSize}px)`), 'bold $1')
  const amount = baseSizingCurrency
    ? Math.round(trade.amount * 1e6) / 1e6
    : formatAmount(trade.amount)

  ctx.fillText(
    amount + (liquidation ? (trade.side === 'buy' ? '🐻' : '🐂') : ''),
    amountOffset,
    drawOffset + tradeHeight / 2 + 1,
    maxWidth
  )

  ctx.font = backupFont
}

function renderHistory() {
  clear()

  if (!renderTrades) {
    return
  }

  if (DEBUG) {
    renderDebug()
  }

  const offsetRounded = Math.round(offset)
  const limitRounded = Math.round(limit)

  if (limitRounded - offsetRounded <= 0) {
    if (ctx) {
      ctx.fillText('waiting for trades', 8, 8)
    }
    return
  }

  for (let i = limitRounded - 1; i >= offsetRounded; i--) {
    if (!tradesHistory[i]) {
      continue
    }

    renderTrade(tradesHistory[i])
  }
}

function renderVolumeBySide() {
  if (!showHistograms || !ctx) {
    return
  }

  const insignificantVolume =
    insignificantVolumeBySide.buy + insignificantVolumeBySide.sell
  const volume = volumeBySide.buy + volumeBySide.sell
  const total = insignificantVolume + volume
  const buyWidth = width * (volumeBySide.buy / total)
  const buyWidthFast = width * (insignificantVolumeBySide.buy / total)
  const sellWidthFast = width * (insignificantVolumeBySide.sell / total)
  const sellWidth = width * (volumeBySide.sell / total)

  const barHeight = renderTrades ? lineHeight : height

  ctx.fillStyle = buyColorBase
  ctx.fillRect(0, 0, buyWidth, barHeight)
  ctx.fillStyle = buyColor100
  ctx.fillRect(buyWidth, 0, buyWidthFast, barHeight)
  ctx.fillStyle = sellColor100
  ctx.fillRect(buyWidth + buyWidthFast, 0, sellWidthFast, barHeight)
  ctx.fillStyle = sellColorBase
  ctx.fillRect(width - sellWidth, 0, sellWidth, barHeight)
}

function renderDebug() {
  if (!ctx) return

  const quarterWidth = width / 4
  ctx.fillStyle = buyColorBase
  ctx.fillRect(0, 0, quarterWidth, lineHeight)
  ctx.fillStyle = buyColor100
  ctx.fillRect(quarterWidth, 0, quarterWidth, lineHeight)
  ctx.fillStyle = sellColor100
  ctx.fillRect(quarterWidth * 2, 0, quarterWidth, lineHeight)
  ctx.fillStyle = sellColorBase
  ctx.fillRect(quarterWidth * 3, 0, quarterWidth, lineHeight)

  for (const type in filters) {
    if (filters[+type]) {
      for (const range of colors[type].ranges) {
        for (let i = 0; i < range.buy.length; i++) {
          ctx.translate(0, lineHeight)
          const buy = range.buy[i]
          ctx.fillStyle = buy.background
          ctx.fillRect(0, 0, width / 2, lineHeight)
          ctx.fillStyle = buy.color
          ctx.textAlign = 'left'
          ctx.fillText('B:' + buy.color, 0, lineHeight / 2)

          const sell = range.sell[i]
          ctx.fillStyle = sell.background
          ctx.fillRect(width / 2, 0, width / 2, lineHeight)
          ctx.fillStyle = sell.color
          ctx.textAlign = 'left'
          ctx.fillText('S: ' + sell.color, width / 2, lineHeight / 2)
        }
      }
    }
  }

  ctx.resetTransform()
}

function onBlur() {
  const rootEl = instance?.proxy?.$el as HTMLElement
  if (!rootEl) return

  if (blurHandler) {
    rootEl.removeEventListener('mouseleave', blurHandler)
  }
  if (scrollHandler) {
    rootEl.removeEventListener('wheel', scrollHandler)
  }
  scrollHandler = null
  blurHandler = null
  paused.value = 0
  offset = 0
  limit = maxLines
  renderHistory()
  renderTradesBatch()
}

function onScroll(event: WheelEvent) {
  event.preventDefault()

  const direction = Math.sign(event.deltaY) * (event.shiftKey ? 2 : 1)

  const newOffset = Math.max(
    0,
    Math.min(tradesHistory.length, offset + direction)
  )
  const newLimit = Math.min(
    tradesHistory.length,
    Math.max(newOffset + maxLines, limit + direction)
  )

  const redraw = Math.round(newOffset) !== Math.round(offset)

  paused.value = newOffset
  offset = newOffset
  limit = newLimit

  if (redraw) {
    renderHistory()
  }
}

function bindScroll() {
  if (scrollHandler) {
    onBlur()
    return
  }

  paused.value = 1

  const rootEl = instance?.proxy?.$el as HTMLElement
  if (!rootEl) return

  blurHandler = onBlur
  scrollHandler = onScroll
  rootEl.addEventListener('wheel', scrollHandler)
  rootEl.addEventListener('mouseleave', blurHandler)
}

function drawLogo(exchange: string, x: number, y: number) {
  if (!ctx) return

  if (!LOGOS[exchange]) {
    const logoCanvas = document.createElement('canvas')
    logoCanvas.width = logoWidth
    logoCanvas.height = logoWidth

    const image = new Image()
    image.onload = () => {
      const logoCtx = logoCanvas.getContext('2d')
      if (logoCtx) {
        logoCtx.drawImage(image, 0, 0, logoWidth, logoWidth)
      }
    }
    image.src = logos[exchange]

    LOGOS[exchange] = logoCanvas
  } else {
    ctx.drawImage(LOGOS[exchange], x, y, logoWidth, logoWidth)
  }
}

async function prepareEverything() {
  reset()

  prepareTypeFilter()
  prepareMarkets()
  prepareColors()
  await prepareAudio()

  renderHistory()
}

// Setup store mutation subscription
_onStoreMutation = store.subscribe(mutation => {
  switch (mutation.type) {
    case 'panes/SET_PANE_MARKETS':
      if (mutation.payload.id === props.paneId) {
        clear()
        prepareMarkets()
        renderHistory()
      }
      break
    case 'app/EXCHANGE_UPDATED':
    case props.paneId + '/SET_MAX_ROWS':
    case props.paneId + '/TOGGLE_PREFERENCE':
      prepareTypeFilter(true)
      prepareDisplaySettings()
      refreshColumnsWidth()
      renderHistory()
      break
    case props.paneId + '/SET_THRESHOLD_AUDIO':
    case props.paneId + '/SET_AUDIO_VOLUME':
    case props.paneId + '/SET_AUDIO_PITCH':
    case props.paneId + '/TOGGLE_MUTED':
    case 'settings/SET_AUDIO_VOLUME':
    case 'settings/TOGGLE_AUDIO':
      prepareAudio()
      break
    case props.paneId + '/SET_AUDIO_THRESHOLD':
      prepareAudio(false)
      break
    case 'settings/SET_BACKGROUND_COLOR':
    case props.paneId + '/SET_THRESHOLD_COLOR':
    case props.paneId + '/SET_THRESHOLD_AMOUNT':
    case props.paneId + '/SET_THRESHOLDS_MULTIPLER':
    case props.paneId + '/TOGGLE_THRESHOLD_MAX':
    case props.paneId + '/DELETE_THRESHOLD':
    case props.paneId + '/ADD_THRESHOLD':
      prepareColors()
      renderHistory()

      if (
        mutation.type === props.paneId + '/DELETE_THRESHOLD' ||
        mutation.type === props.paneId + '/SET_THRESHOLDS_MULTIPLER' ||
        mutation.type === props.paneId + '/ADD_THRESHOLD'
      ) {
        prepareAudio()
      }
      break
  }
})

onMounted(() => {
  if (canvas.value) {
    ctx = canvas.value.getContext('2d', { alpha: false })
  }

  nextTick(prepareEverything)

  aggregatorService.on('trades', onTrades)
})

onBeforeUnmount(() => {
  aggregatorService.off('trades', onTrades)

  if (_onStoreMutation) {
    _onStoreMutation()
  }

  if (blurHandler) {
    onBlur()
  }
})

defineExpose({
  onResize
})
</script>

<style lang="scss" scoped>
canvas {
  width: 100%;
  height: 100%;
  background-color: var(--theme-background-base);
}

.pane-trades {
  position: relative;

  &__paused {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    padding: 1rem;
    text-shadow: 1px 1px black;
  }
}
</style>
