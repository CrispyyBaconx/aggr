<template>
  <div class="settings-chart">
    <div class="form-group mb16">
      <label>
        Refresh chart every
        <code v-text="refreshRateHms" class="text-color-base"></code>
      </label>

      <slider
        :min="0"
        :max="10000"
        :step="100"
        :show-completion="true"
        class="mt8"
        :model-value="refreshRate"
        @update:model-value="store.commit(paneId + '/SET_REFRESH_RATE', $event)"
        @reset="store.commit(paneId + '/SET_REFRESH_RATE', 500)"
      ></slider>
    </div>
    <p v-if="refreshRate < 500" class="form-feedback">
      <i class="icon-warning"></i> Low refresh rate can be <u>very</u> CPU
      intensive
    </p>
    <div class="form-group mb8">
      <label class="checkbox-control">
        <input
          type="checkbox"
          class="form-control"
          :checked="showLegend"
          @change="store.commit(paneId + '/TOGGLE_LEGEND')"
        />
        <div></div>
        <span class="-inline">Show legend</span>
      </label>
    </div>
    <div class="form-group mb8">
      <div class="form-group column">
        <label
          class="checkbox-control"
          @change="
            store.commit(paneId + '/SET_GRIDLINES', {
              type: 'vertical',
              value: ($event.target as HTMLInputElement).checked
            })
          "
        >
          <input
            type="checkbox"
            class="form-control"
            :checked="showVerticalGridlines"
          />
          <div></div>
          <span>Show vertical grid lines</span>
        </label>
        <color-picker-control
          v-if="showVerticalGridlines"
          class="ml8"
          :model-value="verticalGridlinesColor"
          label="Vertical line color"
          @update:model-value="
            $event !== verticalGridlinesColor &&
              store.commit(paneId + '/SET_GRIDLINES', {
                type: 'vertical',
                value: $event
              })
          "
        ></color-picker-control>
      </div>
    </div>
    <div class="form-group mb8">
      <div class="form-group column">
        <label
          class="checkbox-control"
          @change="
            store.commit(paneId + '/SET_GRIDLINES', {
              type: 'horizontal',
              value: ($event.target as HTMLInputElement).checked
            })
          "
        >
          <input
            type="checkbox"
            class="form-control"
            :checked="showHorizontalGridlines"
            :id="paneId + 'showHorizontalGridlines'"
          />
          <div></div>
          <span>Show horizontal grid lines</span>
        </label>
        <color-picker-control
          v-if="showHorizontalGridlines"
          class="ml8"
          model="rgb"
          :model-value="horizontalGridlinesColor"
          label="Horizontal line color"
          @update:model-value="
            $event !== horizontalGridlinesColor &&
              store.commit(paneId + '/SET_GRIDLINES', {
                type: 'horizontal',
                value: $event
              })
          "
        ></color-picker-control>
      </div>
    </div>
    <div class="form-group mb8 column">
      <label
        class="checkbox-control"
        @change="
          store.commit(paneId + '/SET_WATERMARK', {
            value: ($event.target as HTMLInputElement).checked
          })
        "
      >
        <input type="checkbox" class="form-control" :checked="showWatermark" />
        <div></div>
        <span>Watermark</span>
      </label>
      <color-picker-control
        v-if="showWatermark"
        class="ml8"
        :model-value="watermarkColor"
        label="Watermark color"
        @update:model-value="
          $event !== watermarkColor &&
            store.commit(paneId + '/SET_WATERMARK', { value: $event })
        "
      ></color-picker-control>
    </div>
    <div class="form-group mb8 column">
      <label
        class="checkbox-control"
        @change="
          store.commit(paneId + '/SET_BORDER', {
            value: ($event.target as HTMLInputElement).checked
          })
        "
      >
        <input type="checkbox" class="form-control" :checked="showBorder" />
        <div></div>
        <span>Borders</span>
      </label>
      <color-picker-control
        v-if="showBorder"
        class="ml8"
        :model-value="borderColor"
        label="Border color"
        @update:model-value="
          $event !== borderColor &&
            store.commit(paneId + '/SET_BORDER', { value: $event })
        "
      ></color-picker-control>
      <color-picker-control
        class="ml8"
        :model-value="textColor"
        label="Text color"
        @update:model-value="
          $event !== textColor &&
            store.commit(paneId + '/SET_TEXT_COLOR', { value: $event })
        "
      ></color-picker-control>
    </div>
    <div class="form-group">
      <label>Scales</label>
      <div class="form-group mb8 column">
        <label
          class="checkbox-control"
          @change="store.commit(paneId + '/TOGGLE_AXIS', 'left')"
        >
          <input
            type="checkbox"
            class="form-control"
            :checked="showLeftScale"
          />
          <div></div>
          <span>Left</span>
        </label>
        <label
          class="checkbox-control"
          @change="store.commit(paneId + '/TOGGLE_AXIS', 'right')"
        >
          <input
            type="checkbox"
            class="form-control"
            :checked="showRightScale"
          />
          <div></div>
          <span>Right</span>
        </label>
        <label
          class="checkbox-control"
          @change="store.commit(paneId + '/TOGGLE_AXIS', 'time')"
        >
          <input
            type="checkbox"
            class="form-control"
            :checked="showTimeScale"
          />
          <div></div>
          <span>Time</span>
        </label>
      </div>
    </div>
    <div class="divider" />
    <div class="form-group mb8">
      <div class="form-group column">
        <label
          class="checkbox-control"
          @change="store.commit(paneId + '/TOGGLE_FILL_GAPS_WITH_EMPTY')"
        >
          <input
            type="checkbox"
            class="form-control"
            :checked="fillGapsWithEmpty"
          />
          <div></div>
          <span>Fill gaps with empty bars</span>
        </label>
      </div>
    </div>
    <div class="divider" />
    <AlertsSettings />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vuex'
import { getHms } from '@/utils/helpers'
import Slider from '@/components/framework/picker/Slider.vue'
import ToggableGroup from '@/components/framework/ToggableGroup.vue'
import DropdownButton from '@/components/framework/DropdownButton.vue'
import ColorPickerControl from '@/components/framework/picker/ColorPickerControl.vue'
import AlertsSettings from '@/components/alerts/AlertsSettings.vue'

const props = defineProps<{
  paneId: string
}>()

const store = useStore()

const showLegend = computed(() => store.state[props.paneId].showLegend)
const fillGapsWithEmpty = computed(() => store.state[props.paneId].fillGapsWithEmpty)
const refreshRate = computed(() => store.state[props.paneId].refreshRate)
const showVerticalGridlines = computed(() => store.state[props.paneId].showVerticalGridlines)
const verticalGridlinesColor = computed(() => store.state[props.paneId].verticalGridlinesColor)
const showHorizontalGridlines = computed(() => store.state[props.paneId].showHorizontalGridlines)
const horizontalGridlinesColor = computed(() => store.state[props.paneId].horizontalGridlinesColor)
const showWatermark = computed(() => store.state[props.paneId].showWatermark)
const watermarkColor = computed(() => store.state[props.paneId].watermarkColor)
const showBorder = computed(() => store.state[props.paneId].showBorder)
const borderColor = computed(() => store.state[props.paneId].borderColor)
const textColor = computed(() => store.state[props.paneId].textColor)
const showRightScale = computed(() => store.state[props.paneId].showRightScale)
const showLeftScale = computed(() => store.state[props.paneId].showLeftScale)
const showTimeScale = computed(() => store.state[props.paneId].showTimeScale)
const refreshRateHms = computed(() => getHms(refreshRate.value))
</script>
