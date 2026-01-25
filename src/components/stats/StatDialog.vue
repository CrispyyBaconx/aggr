<template>
  <Dialog @clickOutside="close">
    <template #header>
      <div class="d-flex">
        <div class="dialog__title -center">BUCKET</div>
        <code class="-filled ml4">
          <small>{{ name }}</small>
        </code>
      </div>

      <dropdown-button
        v-model="type"
        :options="availableTypes"
        class="mlauto"
        button-class="-text -arrow"
        @input="updateBucketType"
      ></dropdown-button>
    </template>
    <div class="column mb8">
      <div class="form-group -fill">
        <label>Name</label>
        <input
          type="text"
          class="form-control"
          :value="name"
          @input="renameBucket"
        />
      </div>
      <div
        v-if="!conditionnalColor"
        class="form-group -end mtauto -tight"
        ref="colorContainerRef"
      >
        <color-picker-control
          :value="color"
          @input="updateBucketColor"
        ></color-picker-control>
      </div>
      <div v-if="type === 'histogram'" class="form-group -tight -end mtauto">
        <label
          class="checkbox-control checkbox-control-input -auto flex-right"
          v-tippy="{ placement: 'bottom' }"
          title="Enable onditionnal color"
        >
          <input
            type="checkbox"
            class="form-control"
            :checked="conditionnalColor"
            @change="toggleConditionnalColor"
          />
          <div on="dynamic" off="fixed"></div>
        </label>
      </div>
    </div>
    <div v-if="conditionnalColor" class="form-group mb8">
      <label for
        >Color condition
        <span
          class="icon-info"
          title="ex: value > 0 ? 'red' : 'white'"
          v-tippy
        ></span
      ></label>
      <textarea
        class="form-control -code"
        rows="2"
        spellcheck="false"
        :value="color"
        @change="updateBucketColorCondition"
      ></textarea>
    </div>
    <div class="column">
      <div class="form-group mb8">
        <label>
          Window (m)
          <span
            class="icon-info"
            title="Sum over given interval (ex: 30s or 10m or 1h)"
            v-tippy
          ></span>
        </label>
        <input
          type="text"
          class="form-control"
          :value="window"
          :placeholder="getHmsValue(store.state[paneId].window) + ' (default)'"
          @change="updateBucketWindow"
        />
      </div>
      <div class="form-group mb8">
        <label>
          Precision
          <span class="icon-info" title="Decimal precision" v-tippy></span>
        </label>
        <editable
          class="form-control"
          placeholder="auto"
          :model-value="precision"
          @update:model-value="updateBucketPrecision"
        ></editable>
      </div>
    </div>
    <div class="form-group">
      <label for
        >Value
        <span
          class="icon-info"
          title="/!\Javascript syntax/!\<br>use build in variable such as vbuy/vsell (volume) cbuy/csell (trade count) lbuy/lsell (liquidation volume)"
          v-tippy
        ></span
      ></label>
      <textarea
        class="form-control -code"
        rows="5"
        spellcheck="false"
        :value="input"
        @change="updateBucketInput"
      ></textarea>
      <p class="help-text mt-8">
        Sum <code>{{ input }}</code> over {{ window }} window
      </p>
    </div>
    <div class="column">
      <div class="form-group">
        <label
          class="checkbox-control"
          v-tippy="{ placement: 'bottom' }"
          :title="enabled ? 'Disable' : 'Enable'"
          @change="disable"
        >
          <input type="checkbox" class="form-control" :checked="enabled" />
          <div></div>
          <span>
            {{ enabled ? 'Active' : 'Disabled' }}
          </span>
        </label>
      </div>
      <button class="btn -red" @click="remove">
        <i class="icon-trash"></i>
      </button>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vuex'
import { getHms } from '@/utils/helpers'
import Dialog from '@/components/framework/Dialog.vue'
import DropdownButton from '@/components/framework/DropdownButton.vue'
import ColorPickerControl from '@/components/framework/picker/ColorPickerControl.vue'
import Editable from '@/components/framework/Editable.vue'
import { useDialog } from '@/composables/useDialog'

const props = defineProps<{
  paneId: string
  bucketId: string
}>()

const store = useStore()

const emit = defineEmits<{
  close: [value: unknown]
}>()

const { close: useDialogClose } = useDialog()

function close(data?: unknown) {
  emit('close', data)
  useDialogClose(data)
}

const availableTypes = { line: 'Line', area: 'Area', histogram: 'Histogram' }

const bucket = computed(
  () => store.state[props.paneId]?.buckets?.[props.bucketId]
)

const color = computed(() => bucket.value?.color)
const conditionnalColor = computed(
  () => bucket.value?.conditionnalColor ?? false
)
const enabled = computed(() => bucket.value?.enabled)
const name = computed(() => bucket.value?.name)
const type = computed(() => bucket.value?.type)
const input = computed(() => bucket.value?.input)
const precision = computed(() => bucket.value?.precision || null)

const window = computed(() => {
  const windowValue = bucket.value?.window

  if (windowValue) {
    return getHms(windowValue)
  } else {
    return null
  }
})

function getHmsValue(value: number) {
  return getHms(value)
}

function updateBucketType(value: string) {
  store.dispatch(props.paneId + '/updateBucket', {
    id: props.bucketId,
    prop: 'type',
    value
  })
}

function renameBucket(event: Event) {
  const target = event.target as HTMLInputElement
  store.dispatch(props.paneId + '/renameBucket', {
    id: props.bucketId,
    name: target.value
  })
}

function updateBucketColor(value: string) {
  store.dispatch(props.paneId + '/updateBucket', {
    id: props.bucketId,
    prop: 'color',
    value
  })
}

function toggleConditionnalColor() {
  store.commit(props.paneId + '/TOGGLE_BUCKET_COLOR_CONDITION', props.bucketId)
}

function updateBucketColorCondition(event: Event) {
  const target = event.target as HTMLTextAreaElement
  store.dispatch(props.paneId + '/updateBucket', {
    id: props.bucketId,
    prop: 'color',
    value: target.value
  })
}

function updateBucketWindow(event: Event) {
  const target = event.target as HTMLInputElement
  store.dispatch(props.paneId + '/updateBucket', {
    id: props.bucketId,
    prop: 'window',
    value: target.value
  })
}

function updateBucketPrecision(value: string | number) {
  store.dispatch(props.paneId + '/updateBucket', {
    id: props.bucketId,
    prop: 'precision',
    value
  })
}

function updateBucketInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  store.dispatch(props.paneId + '/updateBucket', {
    id: props.bucketId,
    prop: 'input',
    value: target.value
  })
}

function disable(event: Event) {
  const target = event.target as HTMLInputElement
  store.dispatch(props.paneId + '/updateBucket', {
    id: props.bucketId,
    prop: 'enabled',
    value: target.checked
  })
  close()
}

async function remove() {
  await close()
  store.commit(props.paneId + '/REMOVE_BUCKET', props.bucketId)
}

defineExpose({ close })
</script>
