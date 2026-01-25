<template>
  <Dialog @clickOutside="close" class="indicator-preset-dialog" size="medium">
    <template v-slot:header>
      <div class="dialog__title">Configure preset</div>
    </template>
    <form ref="formRef" @submit.prevent="submit">
      <p class="mt0 mb0">Choose what to include</p>
      <div class="d-flex">
        <div>
          <div class="form-group mb8">
            <label class="checkbox-control mt16">
              <input
                type="checkbox"
                class="form-control"
                v-model="form.colors"
                @input="
                  toggleType(true, ($event.target as HTMLInputElement).checked)
                "
              />
              <div></div>
              <span>Colors</span>
              <i
                class="icon-info pl4"
                v-tippy="{ placement: 'top', distance: 16 }"
                title="Toggle all color options"
              />
            </label>
          </div>
          <div class="form-group mb8">
            <label class="checkbox-control">
              <input
                type="checkbox"
                class="form-control"
                v-model="form.values"
                @input="
                  toggleType(false, ($event.target as HTMLInputElement).checked)
                "
              />
              <div></div>
              <span>Options</span>
              <i
                class="icon-info pl4"
                v-tippy="{ placement: 'top', distance: 16 }"
                title="Toggle all other options"
              />
            </label>
          </div>
          <div class="form-group mb8">
            <label class="checkbox-control">
              <input
                type="checkbox"
                class="form-control"
                v-model="form.script"
              />
              <div></div>
              <span>Script</span>
              <i
                class="icon-info pl4"
                v-tippy="{ placement: 'top', distance: 16 }"
                title="Include script in preset"
              />
            </label>
          </div>
        </div>
      </div>

      <div class="indicator-preset-dialog__grid mt8">
        <button
          type="button"
          class="btn indicator-preset-dialog__item -small"
          :class="[selection[key] ? '-green' : '-text']"
          @click="toggleOption(key)"
          v-for="(key, index) in keys"
          :key="index"
        >
          {{ key }}
        </button>
        <button
          type="button"
          class="btn indicator-preset-dialog__item -small"
          :class="[form.script ? '-green' : '-text']"
          @click="form.script = !form.script"
        >
          Script
        </button>
      </div>
    </form>

    <template v-slot:footer>
      <a href="javascript:void(0);" class="btn -text mr8" @click="close(false)">
        Cancel
      </a>

      <button type="button" @click="submit" class="btn -green -pill">
        <span
          v-if="count > 0"
          class="badge -red ml8"
          v-text="count"
          v-tippy
          :title="submitLabel"
        ></span>
        <span><i class="icon-save mr8"></i> Save</span>
      </button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import Dialog from '@/components/framework/Dialog.vue'
import { useDialog } from '@/composables/useDialog'
import { getIndicatorOptionType } from './options'

const props = withDefaults(
  defineProps<{
    plotTypes: string[]
    keys: string[]
    originalKeys?: string[] | null
  }>(),
  {
    originalKeys: null
  }
)

const emit = defineEmits<{
  close: [value: unknown]
}>()

const { close: useDialogClose } = useDialog()

function close(data?: unknown) {
  emit('close', data)
  useDialogClose(data)
}

const formRef = ref<HTMLFormElement | null>(null)

const selection = reactive<Record<string, boolean>>(
  props.keys.reduce(
    (acc, key) => {
      acc[key] =
        props.originalKeys && props.originalKeys.indexOf(key) !== -1
          ? true
          : false
      return acc
    },
    {} as Record<string, boolean>
  )
)

const form = reactive({
  colors: false,
  values: true,
  script: false
})

const count = computed(() => {
  return Object.values(selection).reduce(
    (acc, value) => {
      if (value) {
        acc++
      }

      return acc
    },
    form.script ? 1 : 0
  )
})

const submitLabel = computed(() => {
  if (!count.value) {
    return 'No selection'
  }

  const scriptCount = form.script ? 1 : 0
  const optionsCount = count.value - scriptCount

  const included: string[] = []

  if (optionsCount) {
    included.push(`${optionsCount} option${optionsCount > 1 ? 's' : ''}`)
  }

  if (scriptCount) {
    included.push(`the code`)
  }
  return included.join(' + ')
})

onMounted(() => {
  if (!props.originalKeys) {
    form.colors = true
    toggleType(true, true)
  }
})

function submit() {
  close({
    selection: { ...selection },
    script: form.script
  })
}

function toggleType(color: boolean, value: boolean) {
  for (const key of props.keys) {
    const type = getIndicatorOptionType(key, props.plotTypes)

    if ((color && type !== 'color') || (!color && type === 'color')) {
      continue
    }

    selection[key] = value
  }
}

function toggleOption(key: string) {
  selection[key] = !selection[key]
}

defineExpose({ close })
</script>

<style lang="scss" scoped>
.indicator-preset-dialog {
  &__grid {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  &__item {
    text-transform: none;
  }
}
</style>
