<template>
  <div class="slider" ref="wrapper" :class="{ '-disabled': disabled }">
    <div class="slider__track" ref="track">
      <div
        class="slider__fill"
        ref="fill"
        @mousedown="select"
        @touchstart="select"
      ></div>
      <div
        v-if="effectiveShowCompletion"
        class="slider__completion"
        :style="`width: ${handle.position}%`"
      ></div>
      <tippy :distance="24" follow-cursor>
        <div
          class="slider__handle"
          @mousedown="select"
          @touchstart="select"
          :style="`left: ${handle.position}%;`"
        />
        <template #content>
          <slot name="tooltip" :value="handle.value">
            {{ +handle.value.toFixed(2) }}
          </slot>
        </template>
      </tippy>
    </div>
  </div>
</template>

<script>
import { getEventCords } from '@/utils/helpers'

export default {
  name: 'Slider',
  props: {
    gradient: { type: Array, default: null },
    colorCode: { type: Boolean, default: false },
    label: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    min: { type: Number, default: 0 },
    max: { type: Number, default: 255 },
    step: { type: Number, default: 1 },
    value: { type: Number, default: 0 },
    showCompletion: {
      type: Boolean,
      default: null // Will be computed based on gradient if not explicitly set
    },
    log: { type: Boolean, default: false }
  },
  data() {
    return {
      handle: {
        value: Number(this.value),
        position: 0,
        color: '#fff'
      }
    }
  },
  computed: {
    sizeRelatedOptions() {
      return [this.log, this.min, this.max, this.step]
    },
    effectiveShowCompletion() {
      // If showCompletion was explicitly set, use that value
      if (this.showCompletion !== null) {
        return this.showCompletion
      }
      // Otherwise, show completion only when there's no gradient
      return !this.gradient
    }
  },
  watch: {
    sizeRelatedOptions() {
      this.updateSize()
      this.updateHandlePosition(true)
    },
    gradient(value) {
      this.initGradient(value)
    },
    value(value) {
      this.handle.value = value
      this.updateHandlePosition(true)
    }
  },
  async mounted() {
    window.addEventListener('resize', this.handleResize)
    this.initElements()
    this.updateSize()

    if (this.gradient) {
      this.initGradient(this.gradient)
    }

    this.updateHandlePosition(true)
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.handleResize)

    if (this._dragHandler) {
      this.release()
    }

    if (this._dblClickTimeout) {
      clearTimeout(this._dblClickTimeout)
    }
  },
  methods: {
    initElements() {
      this.wrapper = this.$refs.wrapper
      this.track = this.$refs.track
      this.fill = this.$refs.fill
    },
    initGradient(gradient) {
      if (gradient.length > 1) {
        this.fill.style.backgroundImage = `linear-gradient(90deg, ${gradient})`
        this.updateHandleColor()
        return
      }
      this.fill.style.backgroundImage = ''
      this.fill.style.backgroundColor = gradient[0]
      this.handle.color = gradient[0]
    },
    updateHandleColor() {
      if (!this.gradient || this.gradient.length < 2) return
      const position = this.handle.position / 100
      const newColor = this.getColorAtPosition(position)
      this.handle.color = newColor
    },
    getColorAtPosition(position) {
      const colors = this.gradient
      if (!colors || colors.length === 0) return '#fff'
      if (colors.length === 1) return colors[0]

      const segmentSize = 1 / (colors.length - 1)
      const segmentIndex = Math.min(
        Math.floor(position / segmentSize),
        colors.length - 2
      )
      const segmentPosition =
        (position - segmentIndex * segmentSize) / segmentSize

      const startColor = this.parseColor(colors[segmentIndex])
      const endColor = this.parseColor(colors[segmentIndex + 1])

      const r = Math.round(
        startColor.r + (endColor.r - startColor.r) * segmentPosition
      )
      const g = Math.round(
        startColor.g + (endColor.g - startColor.g) * segmentPosition
      )
      const b = Math.round(
        startColor.b + (endColor.b - startColor.b) * segmentPosition
      )
      // Force full opacity for handle visibility (gradient colors may have low alpha)
      return `rgb(${r}, ${g}, ${b})`
    },
    parseColor(colorStr) {
      const rgbaMatch = colorStr.match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
      )
      if (rgbaMatch) {
        return {
          r: parseInt(rgbaMatch[1]),
          g: parseInt(rgbaMatch[2]),
          b: parseInt(rgbaMatch[3]),
          a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1
        }
      }
      const hexMatch = colorStr.match(
        /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i
      )
      if (hexMatch) {
        return {
          r: parseInt(hexMatch[1], 16),
          g: parseInt(hexMatch[2], 16),
          b: parseInt(hexMatch[3], 16),
          a: 1
        }
      }
      const shortHexMatch = colorStr.match(/^#?([a-f\d])([a-f\d])([a-f\d])$/i)
      if (shortHexMatch) {
        return {
          r: parseInt(shortHexMatch[1] + shortHexMatch[1], 16),
          g: parseInt(shortHexMatch[2] + shortHexMatch[2], 16),
          b: parseInt(shortHexMatch[3] + shortHexMatch[3], 16),
          a: 1
        }
      }
      return { r: 255, g: 255, b: 255, a: 1 }
    },
    handleResize() {
      this.updateSize()
      this.updateHandlePosition(true)
    },
    select(event) {
      event.preventDefault()

      if (event.buttons === 2) return

      if (this._dblClickTimeout) {
        clearTimeout(this._dblClickTimeout)
      }

      if (this.pendingDblClick) {
        this.pendingDblClick = false
        this.$emit('reset')
        return
      }

      this.pendingDblClick = true

      this.updateSize()
      this.track.classList.add('slider--dragging')
      this.ticking = false

      this.updateHandleValue(event)
      this.updateHandlePosition()

      this._dragHandler = this.dragging.bind(this)
      this._releaseHandler = this.release.bind(this)
      document.addEventListener('mousemove', this._dragHandler)
      document.addEventListener('touchmove', this._dragHandler)
      document.addEventListener('touchend', this._releaseHandler)
      document.addEventListener('mouseup', this._releaseHandler)
    },
    dragging(event) {
      const stepValue = this.updateHandleValue(event)
      if (!this.ticking) {
        window.requestAnimationFrame(() => {
          this.updateHandlePosition(stepValue)
          this.ticking = false
        })
        this.ticking = true
      }
    },
    release() {
      this.track.classList.remove('slider--dragging')
      document.removeEventListener('mousemove', this._dragHandler)
      document.removeEventListener('touchmove', this._dragHandler)
      document.removeEventListener('mouseup', this._releaseHandler)
      document.removeEventListener('touchend', this._releaseHandler)

      if (this.pendingDblClick) {
        this._dblClickTimeout = setTimeout(() => {
          this.pendingDblClick = false
          this._dblClickTimeout = null
        }, 150)
      }

      this._dragHandler = null
      this._releaseHandler = null
    },
    // get the current slider value from the click/move event on the slider (using event.clientX)
    updateHandleValue(event) {
      // x = x coordinate of mouse click / move event
      const { x } = getEventCords(event)
      let value

      // offsetX = slider offset x
      // width = slider width
      const { offsetX, width } = this

      if (!this.log) {
        // value = current slider value (between min & max)
        value = ((x - offsetX) / width) * (this.max - this.min) + this.min
      } else {
        // value = same but log scaled (smaller values takes a larger space on the slider)
        const scale = width / (Math.log(this.max + 1) - Math.log(this.min + 1))
        value = Math.exp((x - offsetX) / scale + Math.log(this.min + 1)) - 1
      }

      // Constrain value to be between this.min and this.max
      value = Math.min(this.max, Math.max(this.min, value))

      // make sure the value is rounded to the step prop
      const stepValue = Math.round(value / this.step) * this.step

      this.handle.value = stepValue
    },
    // set the handle position (left: n%) based on the slider value (value between min & max)
    updateHandlePosition(silent) {
      const { value } = this.handle
      if (!this.log) {
        // this is working fine
        this.handle.position =
          ((value - this.min) / (this.max - this.min)) * 100
      } else {
        const scale = Math.log(this.max + 1) - Math.log(this.min + 1)
        this.handle.position =
          ((Math.log(value + 1) - Math.log(this.min + 1)) / scale) * 100
      }

      if (this.gradient && this.gradient.length > 1) {
        this.updateHandleColor()
      }

      if (!silent) {
        this.$emit('input', value)
      }
    },
    updateSize() {
      this.width = this.track.offsetWidth
      this.offsetX = this.track.getBoundingClientRect().left
    }
  }
}
</script>

<style lang="scss">
.slider {
  position: relative;
  display: flex;
  align-items: center;
  box-sizing: border-box;

  &.-alpha {
    .slider__track {
      background-image: $checkerboard;
      background-size: 6px 6px;
      background-position:
        0 0,
        3px -3px,
        0 3px,
        -3px 0px;
    }
  }

  &.-disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  &:hover,
  &--dragging {
    .slider__label {
      visibility: visible;
      opacity: 1;
    }
  }
}

.slider__input {
  margin-bottom: 0;
  padding: 0.3em;
  margin-left: 0.2em;
  max-width: 70px;
  width: 20%;
  border: 0;
  text-align: center;
  font-size: 12px;
  appearance: textfield;
  -webkit-appearance: none;
  -moz-appearance: textfield;

  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &:focus {
    outline: none;
    border-color: $blue;
  }
}

.slider__track {
  position: relative;
  flex: 1;
  margin: 0;
  width: auto;
  height: 8px;
  background: var(--theme-background-200);
  will-change: transfom;
  border-radius: 10px;
  cursor: pointer;
  padding: 0;
}

.slider__handle {
  position: relative;
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
  color: white;
  margin: -0.25rem -0.5rem;
  width: 1rem;
  height: 1rem;
  border: 0;
  background-color: currentColor;
  border-radius: 50%;
  cursor: grab;
  box-shadow: 0 1px 0 1px rgba(black, 0.2);

  &:active,
  &:hover {
    box-shadow: 0 0 0 0.5em rgba(white, 0.2);
  }

  &:active {
    cursor: grabbing;
  }
}

.slider__label {
  position: absolute;
  bottom: 2rem;
  left: 50%;
  z-index: 999;
  padding: 0.5rem;
  min-width: 1rem;
  border-radius: 4px;
  filter: drop-shadow(-1em -1em 3em var(--theme-background-base));
  color: white;
  background-color: rgba(black, 0.75);
  text-align: center;
  font-size: 14px;
  line-height: 1rem;
  transform: translate(-50%, 0);
  white-space: nowrap;
  visibility: hidden;
  opacity: 0;

  &:before {
    position: absolute;
    bottom: -0.5rem;
    left: 50%;
    display: block;
    width: 0;
    height: 0;
    border-width: 0.5rem 0.5rem 0 0.5rem;
    border-style: solid;
    border-color: rgba(black, 0.75) transparent transparent transparent;
    content: '';
    transform: translate3d(-50%, 0, 0);
  }
}

.slider__fill {
  width: 100%;
  height: 100%;
  transform-origin: left top;
  border-radius: 10px;
}

.slider__completion {
  position: absolute;
  top: 0;
  height: 100%;

  border-radius: 10px;
  background-color: var(--theme-buy-base);

  pointer-events: none;
}
</style>
