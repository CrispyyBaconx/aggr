<template>
  <div class="pane-positionflow" ref="el">
    <pane-header
      :paneId="paneId"
      :settings="() => import('@/components/positionflow/PositionFlowDialog.vue')"
    >
      <hr />
      <div class="positionflow-controls pane-overlay -text">
        <select
          class="form-control"
          :value="timeframe"
          @change="setTimeframe(($event.target as HTMLSelectElement).value)"
        >
          <option value="5m">5m</option>
          <option value="15m">15m</option>
          <option value="1h">1h</option>
          <option value="4h">4h</option>
          <option value="1d">1d</option>
        </select>
      </div>
    </pane-header>

    <div class="positionflow-chart" ref="chartContainer">
      <canvas ref="canvas" @mousemove="onMouseMove" @mouseleave="onMouseLeave" @click="onClick"></canvas>
      
      <!-- Quadrant labels -->
      <div class="positionflow-quadrant-labels">
        <span class="positionflow-label -top-left">SHORTS CLOSING</span>
        <span class="positionflow-label -top-right">LONGS ENTERING</span>
        <span class="positionflow-label -bottom-left">LONGS CLOSING</span>
        <span class="positionflow-label -bottom-right">SHORTS ENTERING</span>
      </div>

      <!-- Axis labels -->
      <div class="positionflow-axis-label -y">Price Change %</div>
      <div class="positionflow-axis-label -x">Open Interest Change %</div>

      <!-- Tooltip -->
      <div
        v-if="hoveredTicker"
        class="positionflow-tooltip"
        :style="tooltipStyle"
      >
        <div class="positionflow-tooltip__symbol">{{ hoveredTicker.baseAsset }}</div>
        <div class="positionflow-tooltip__row">
          <span>Price Δ:</span>
          <span :class="hoveredTicker.priceChange >= 0 ? '-up' : '-down'">
            {{ formatPercent(hoveredTicker.priceChange) }}
          </span>
        </div>
        <div class="positionflow-tooltip__row">
          <span>OI Δ:</span>
          <span :class="hoveredTicker.oiChange >= 0 ? '-up' : '-down'">
            {{ formatPercent(hoveredTicker.oiChange) }}
          </span>
        </div>
        <div class="positionflow-tooltip__row">
          <span>Price:</span>
          <span>{{ formatPrice(hoveredTicker.price) }}</span>
        </div>
      </div>
    </div>

    <div v-if="!isConnected" class="positionflow-empty">
      <p>Connecting to backend...</p>
    </div>
    <div v-else-if="!dataPoints.length" class="positionflow-empty">
      <p>Waiting for data...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
  nextTick
} from 'vue'
import { useStore } from 'vuex'
import PaneHeader from '../panes/PaneHeader.vue'
import backendWsService from '@/services/backendWsService'
import { usePane } from '@/composables/usePane'
import type { PositionFlowTimeframe } from '@/store/panesSettings/positionflow'

interface BackendTicker {
  symbol: string
  exchange: string
  baseAsset: string
  price: number
  openInterestUsd: number
  tf5m?: TimeframeMetrics
  tf15m?: TimeframeMetrics
  tf1h?: TimeframeMetrics
  tf4h?: TimeframeMetrics
  tf1d?: TimeframeMetrics
}

interface TimeframeMetrics {
  changePercent: number
  oiChange?: number
  volume: number
  vdelta: number
}

interface DataPoint {
  id: string
  baseAsset: string
  priceChange: number
  oiChange: number
  price: number
  volume: number
  x: number
  y: number
}

const props = defineProps<{
  paneId: string
}>()

const store = useStore()
const { el } = usePane(props.paneId, onResize)

const canvas = ref<HTMLCanvasElement | null>(null)
const chartContainer = ref<HTMLElement | null>(null)
const isConnected = ref(false)
const dataPoints = ref<DataPoint[]>([])
const hoveredTicker = ref<DataPoint | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)

// Chart dimensions
const width = ref(400)
const height = ref(300)
const padding = { top: 30, right: 30, bottom: 40, left: 50 }

// Axis range (auto-scaled with padding)
const axisRange = ref({ minX: -10, maxX: 10, minY: -10, maxY: 10 })

// Computed store state
const timeframe = computed(() => store.state[props.paneId]?.timeframe || '1h')
const dotSize = computed(() => store.state[props.paneId]?.dotSize || 6)
const showLabels = computed(() => store.state[props.paneId]?.showLabels ?? true)

const tooltipStyle = computed(() => ({
  left: `${tooltipX.value}px`,
  top: `${tooltipY.value}px`
}))

// Colors from theme
const colors = {
  bullish: 'rgba(76, 175, 80, 0.85)',    // Green for price up (top quadrants)
  bearish: 'rgba(183, 28, 28, 0.85)',    // Dark red for price down (bottom quadrants)
  dot: 'rgba(100, 181, 246, 0.9)',       // Blue dots
  dotHover: 'rgba(255, 255, 255, 1)',
  axis: 'rgba(255, 255, 255, 0.3)',
  text: 'rgba(255, 255, 255, 0.7)',
  gridLine: 'rgba(255, 255, 255, 0.08)'
}

function setTimeframe(tf: string) {
  store.commit(`${props.paneId}/SET_TIMEFRAME`, tf)
}

function formatPercent(value: number): string {
  if (value === null || value === undefined) return '-'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function formatPrice(price: number): string {
  if (!price) return '-'
  if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (price >= 1) return price.toFixed(2)
  if (price >= 0.01) return price.toFixed(4)
  return price.toFixed(6)
}

function calculateAxisRange(points: DataPoint[]) {
  if (!points.length) {
    axisRange.value = { minX: -10, maxX: 10, minY: -10, maxY: 10 }
    return
  }

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity

  for (const p of points) {
    if (p.oiChange < minX) minX = p.oiChange
    if (p.oiChange > maxX) maxX = p.oiChange
    if (p.priceChange < minY) minY = p.priceChange
    if (p.priceChange > maxY) maxY = p.priceChange
  }

  // Add padding and ensure we include 0
  const xPad = Math.max(2, (maxX - minX) * 0.15)
  const yPad = Math.max(2, (maxY - minY) * 0.15)

  axisRange.value = {
    minX: Math.min(minX - xPad, -1),
    maxX: Math.max(maxX + xPad, 1),
    minY: Math.min(minY - yPad, -1),
    maxY: Math.max(maxY + yPad, 1)
  }
}

function dataToCanvas(oiChange: number, priceChange: number): { x: number; y: number } {
  const { minX, maxX, minY, maxY } = axisRange.value
  const chartWidth = width.value - padding.left - padding.right
  const chartHeight = height.value - padding.top - padding.bottom

  const x = padding.left + ((oiChange - minX) / (maxX - minX)) * chartWidth
  const y = padding.top + ((maxY - priceChange) / (maxY - minY)) * chartHeight

  return { x, y }
}

function canvasToData(canvasX: number, canvasY: number): { oiChange: number; priceChange: number } {
  const { minX, maxX, minY, maxY } = axisRange.value
  const chartWidth = width.value - padding.left - padding.right
  const chartHeight = height.value - padding.top - padding.bottom

  const oiChange = minX + ((canvasX - padding.left) / chartWidth) * (maxX - minX)
  const priceChange = maxY - ((canvasY - padding.top) / chartHeight) * (maxY - minY)

  return { oiChange, priceChange }
}

function draw() {
  const ctx = canvas.value?.getContext('2d')
  if (!ctx) return

  const w = width.value
  const h = height.value

  // Clear
  ctx.clearRect(0, 0, w, h)

  const { minX, maxX, minY, maxY } = axisRange.value
  const chartWidth = w - padding.left - padding.right
  const chartHeight = h - padding.top - padding.bottom

  // Calculate zero positions
  const zeroX = padding.left + ((0 - minX) / (maxX - minX)) * chartWidth
  const zeroY = padding.top + ((maxY - 0) / (maxY - minY)) * chartHeight

  // Draw quadrant backgrounds
  // Top-left: SHORTS CLOSING (green) - price up, OI down
  ctx.fillStyle = colors.bullish
  ctx.fillRect(padding.left, padding.top, zeroX - padding.left, zeroY - padding.top)

  // Top-right: LONGS ENTERING (green) - price up, OI up
  ctx.fillStyle = colors.bullish
  ctx.fillRect(zeroX, padding.top, w - padding.right - zeroX, zeroY - padding.top)

  // Bottom-left: LONGS CLOSING (red) - price down, OI down
  ctx.fillStyle = colors.bearish
  ctx.fillRect(padding.left, zeroY, zeroX - padding.left, h - padding.bottom - zeroY)

  // Bottom-right: SHORTS ENTERING (red) - price down, OI up
  ctx.fillStyle = colors.bearish
  ctx.fillRect(zeroX, zeroY, w - padding.right - zeroX, h - padding.bottom - zeroY)

  // Draw grid lines
  ctx.strokeStyle = colors.gridLine
  ctx.lineWidth = 1

  // Vertical grid lines
  const xStep = calculateNiceStep(maxX - minX, 6)
  for (let x = Math.ceil(minX / xStep) * xStep; x <= maxX; x += xStep) {
    if (Math.abs(x) < 0.001) continue // Skip zero (drawn separately)
    const canvasX = padding.left + ((x - minX) / (maxX - minX)) * chartWidth
    ctx.beginPath()
    ctx.moveTo(canvasX, padding.top)
    ctx.lineTo(canvasX, h - padding.bottom)
    ctx.stroke()
  }

  // Horizontal grid lines
  const yStep = calculateNiceStep(maxY - minY, 6)
  for (let y = Math.ceil(minY / yStep) * yStep; y <= maxY; y += yStep) {
    if (Math.abs(y) < 0.001) continue // Skip zero (drawn separately)
    const canvasY = padding.top + ((maxY - y) / (maxY - minY)) * chartHeight
    ctx.beginPath()
    ctx.moveTo(padding.left, canvasY)
    ctx.lineTo(w - padding.right, canvasY)
    ctx.stroke()
  }

  // Draw zero axes (thicker)
  ctx.strokeStyle = colors.axis
  ctx.lineWidth = 1.5

  // Vertical zero line (Y axis at X=0)
  ctx.beginPath()
  ctx.moveTo(zeroX, padding.top)
  ctx.lineTo(zeroX, h - padding.bottom)
  ctx.stroke()

  // Horizontal zero line (X axis at Y=0)
  ctx.beginPath()
  ctx.moveTo(padding.left, zeroY)
  ctx.lineTo(w - padding.right, zeroY)
  ctx.stroke()

  // Draw axis labels (tick marks)
  ctx.fillStyle = colors.text
  ctx.font = '10px "Barlow", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  // X-axis labels
  for (let x = Math.ceil(minX / xStep) * xStep; x <= maxX; x += xStep) {
    const canvasX = padding.left + ((x - minX) / (maxX - minX)) * chartWidth
    ctx.fillText(x.toFixed(1), canvasX, h - padding.bottom + 5)
  }

  // Y-axis labels
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let y = Math.ceil(minY / yStep) * yStep; y <= maxY; y += yStep) {
    const canvasY = padding.top + ((maxY - y) / (maxY - minY)) * chartHeight
    ctx.fillText(y.toFixed(1), padding.left - 5, canvasY)
  }

  // Draw data points
  const size = dotSize.value
  
  for (const point of dataPoints.value) {
    const { x, y } = dataToCanvas(point.oiChange, point.priceChange)
    
    // Skip if outside chart area
    if (x < padding.left || x > w - padding.right || y < padding.top || y > h - padding.bottom) {
      continue
    }

    // Draw dot
    ctx.beginPath()
    ctx.arc(x, y, size / 2, 0, Math.PI * 2)
    ctx.fillStyle = hoveredTicker.value?.id === point.id ? colors.dotHover : colors.dot
    ctx.fill()

    // Draw label if enabled and not too crowded
    if (showLabels.value && size >= 4) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
      ctx.font = '9px "Barlow", sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(point.baseAsset, x + size / 2 + 3, y)
    }
  }
}

function calculateNiceStep(range: number, targetSteps: number): number {
  const roughStep = range / targetSteps
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)))
  const normalized = roughStep / magnitude
  
  let niceStep: number
  if (normalized <= 1) niceStep = 1
  else if (normalized <= 2) niceStep = 2
  else if (normalized <= 5) niceStep = 5
  else niceStep = 10
  
  return niceStep * magnitude
}

function onMouseMove(event: MouseEvent) {
  if (!canvas.value) return
  
  const rect = canvas.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  
  // Find closest point
  let closest: DataPoint | null = null
  let closestDist = Infinity
  const threshold = 15

  for (const point of dataPoints.value) {
    const canvasPos = dataToCanvas(point.oiChange, point.priceChange)
    const dist = Math.sqrt(Math.pow(canvasPos.x - x, 2) + Math.pow(canvasPos.y - y, 2))
    
    if (dist < threshold && dist < closestDist) {
      closest = point
      closestDist = dist
    }
  }

  hoveredTicker.value = closest
  
  if (closest) {
    tooltipX.value = event.clientX - rect.left + 15
    tooltipY.value = event.clientY - rect.top - 10
    
    // Keep tooltip in bounds
    const tooltipWidth = 150
    const tooltipHeight = 90
    if (tooltipX.value + tooltipWidth > width.value) {
      tooltipX.value = event.clientX - rect.left - tooltipWidth - 15
    }
    if (tooltipY.value + tooltipHeight > height.value) {
      tooltipY.value = height.value - tooltipHeight - 10
    }
    if (tooltipY.value < 10) {
      tooltipY.value = 10
    }
  }

  draw()
}

function onMouseLeave() {
  hoveredTicker.value = null
  draw()
}

function onClick() {
  if (hoveredTicker.value) {
    // Switch all panes to this market
    const symbol = `BINANCE_FUTURES:${hoveredTicker.value.baseAsset}USDT`
    store.dispatch('panes/setMarketsForAll', [symbol])
  }
}

function handleTickersUpdate(data: { tickers: BackendTicker[] }) {
  if (!data?.tickers) return

  const tf = timeframe.value as PositionFlowTimeframe
  const tfKey = `tf${tf}` as keyof BackendTicker

  // Aggregate by baseAsset
  const aggregated = new Map<string, {
    priceChange: number
    oiChange: number
    price: number
    volume: number
    totalOi: number
  }>()

  for (const ticker of data.tickers) {
    const metrics = ticker[tfKey] as TimeframeMetrics | undefined
    if (!metrics || metrics.oiChange === undefined) continue

    const baseAsset = ticker.baseAsset || ticker.symbol.replace(/USDT?$/, '')
    const oi = ticker.openInterestUsd || 0

    if (!aggregated.has(baseAsset)) {
      aggregated.set(baseAsset, {
        priceChange: 0,
        oiChange: 0,
        price: ticker.price,
        volume: 0,
        totalOi: 0
      })
    }

    const agg = aggregated.get(baseAsset)!
    
    // Weight by OI for averaging
    const weight = oi
    agg.priceChange += metrics.changePercent * weight
    agg.oiChange += metrics.oiChange * weight
    agg.volume += metrics.volume
    agg.totalOi += weight

    // Use price from highest OI source
    if (oi > agg.totalOi - oi) {
      agg.price = ticker.price
    }
  }

  // Convert to data points
  const points: DataPoint[] = []
  for (const [baseAsset, data] of aggregated) {
    if (data.totalOi === 0) continue

    const priceChange = data.priceChange / data.totalOi
    const oiChange = data.oiChange / data.totalOi
    
    points.push({
      id: baseAsset,
      baseAsset,
      priceChange,
      oiChange,
      price: data.price,
      volume: data.volume,
      x: 0,
      y: 0
    })
  }

  dataPoints.value = points
  calculateAxisRange(points)
  draw()
}

function handleConnected() {
  isConnected.value = true
  backendWsService.subscribeTickersSummary()
}

function handleDisconnected() {
  isConnected.value = false
}

function onResize() {
  updateCanvasSize()
}

function updateCanvasSize() {
  if (!chartContainer.value || !canvas.value) return
  
  const rect = chartContainer.value.getBoundingClientRect()
  width.value = rect.width
  height.value = rect.height
  
  canvas.value.width = rect.width * window.devicePixelRatio
  canvas.value.height = rect.height * window.devicePixelRatio
  canvas.value.style.width = `${rect.width}px`
  canvas.value.style.height = `${rect.height}px`
  
  const ctx = canvas.value.getContext('2d')
  if (ctx) {
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
  }
  
  draw()
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  backendWsService.on('tickers', handleTickersUpdate)
  backendWsService.on('connected', handleConnected)
  backendWsService.on('disconnected', handleDisconnected)

  if (backendWsService.isConnected()) {
    isConnected.value = true
    backendWsService.subscribeTickersSummary()
  } else if (backendWsService.isConfigured()) {
    backendWsService.connect().catch(err => {
      console.warn('[PositionFlow] Failed to connect to backend:', err)
    })
  }

  nextTick(() => {
    updateCanvasSize()
    if (chartContainer.value) {
      resizeObserver = new ResizeObserver(() => {
        updateCanvasSize()
      })
      resizeObserver.observe(chartContainer.value)
    }
  })
})

onBeforeUnmount(() => {
  backendWsService.off('tickers', handleTickersUpdate)
  backendWsService.off('connected', handleConnected)
  backendWsService.off('disconnected', handleDisconnected)

  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

watch(timeframe, () => {
  // Re-process data when timeframe changes
  draw()
})

defineExpose({
  onResize
})
</script>

<style lang="scss" scoped>
.pane-positionflow {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--theme-background-base);
  position: relative;
}

.positionflow-controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0 0.5rem;

  select {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    min-width: 3.5rem;
    background: var(--theme-background-150);
    border: 1px solid var(--theme-background-200);
    border-radius: 3px;
    color: var(--theme-color-base);
    cursor: pointer;
  }
}

.positionflow-chart {
  flex: 1;
  position: relative;
  min-height: 0;

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: crosshair;
  }
}

.positionflow-quadrant-labels {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.positionflow-label {
  position: absolute;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.4);
  pointer-events: none;

  &.-top-left {
    top: 40px;
    left: 60px;
  }

  &.-top-right {
    top: 40px;
    right: 40px;
  }

  &.-bottom-left {
    bottom: 50px;
    left: 60px;
  }

  &.-bottom-right {
    bottom: 50px;
    right: 40px;
  }
}

.positionflow-axis-label {
  position: absolute;
  font-size: 0.5625rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
  pointer-events: none;

  &.-y {
    left: 8px;
    top: 50%;
    transform: rotate(-90deg) translateX(-50%);
    transform-origin: left center;
    white-space: nowrap;
  }

  &.-x {
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
  }
}

.positionflow-tooltip {
  position: absolute;
  background: rgba(30, 30, 35, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  padding: 0.5rem 0.75rem;
  pointer-events: none;
  z-index: 10;
  min-width: 120px;
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);

  &__symbol {
    font-weight: 700;
    font-size: 0.875rem;
    margin-bottom: 0.375rem;
    color: var(--theme-color-base);
    letter-spacing: 0.025em;
  }

  &__row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.75rem;
    line-height: 1.5;
    color: var(--theme-color-100);

    span:first-child {
      opacity: 0.7;
    }

    .-up {
      color: var(--theme-buy-base);
      font-weight: 600;
    }

    .-down {
      color: var(--theme-sell-base);
      font-weight: 600;
    }
  }
}

.positionflow-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--theme-color-200);
  font-size: 0.875rem;

  p {
    opacity: 0.6;
  }
}
</style>
