<template>
  <btn class="-arrow mrauto" :class="classes" @click="toggleDropdown">
    {{ label }}
    <dropdown v-model="dropdownTrigger" @opened="onOpened">
      <div class="d-flex btn-group presets-control" @click.stop>
        <input
          ref="queryRef"
          type="text"
          placeholder="Search"
          class="form-control presets-control__query"
          v-model="query"
          @keyup.enter="savePreset()"
        />
        <div
          class="mlauto btn -text"
          @click="savePreset()"
          title="Save as"
          v-tippy="{ boundary: 'window', placement: 'left' }"
        >
          <i class="icon-save"></i>
        </div>
        <div
          class="btn -text flex-right"
          @click.stop="toggleUtilityDropdown($event)"
        >
          <i class="icon-cog"></i>
        </div>
      </div>
      <div
        v-for="preset in filteredPresets"
        :key="preset.id"
        class="dropdown-item dropdown-item--group"
        @click="selectPreset(preset)"
      >
        <span class="mr8">{{ preset.label }}</span>

        <div
          class="btn -text mlauto flex-right"
          @click.stop="togglePresetDropdown($event, preset)"
        >
          <i class="icon-more"></i>
        </div>
      </div>
      <dropdown v-model="presetDropdownTrigger">
        <button
          type="button"
          class="dropdown-item"
          @click.stop="selectPreset(dropdownPreset!)"
        >
          <i class="icon-check"></i>
          <span>Apply</span>
        </button>
        <button
          type="button"
          class="dropdown-item"
          @click.stop="replacePreset(dropdownPreset!)"
        >
          <i class="icon-refresh"></i>
          <span>Update</span>
        </button>
        <button
          type="button"
          class="dropdown-item"
          @click.stop="renamePreset(dropdownPreset!)"
        >
          <i class="icon-edit"></i>
          <span>Rename</span>
        </button>
        <button
          type="button"
          class="dropdown-item"
          @click.stop="downloadPreset(dropdownPreset!)"
        >
          <i class="icon-download"></i>
          <span>Download</span>
        </button>
        <div class="dropdown-divider"></div>
        <button
          type="button"
          class="dropdown-item"
          @click="deletePreset(dropdownPreset!)"
        >
          <i class="icon-trash"></i>
          <span>Remove</span>
        </button>
      </dropdown>
      <dropdown v-model="utilityDropdownTrigger">
        <button
          type="button"
          class="dropdown-item btn -file -text -cases"
          title="Import from preset file"
          v-tippy="{ boundary: 'window', placement: 'left' }"
        >
          <i class="icon-upload"></i>
          <input
            type="file"
            class="input-file"
            @change="handleFile"
            title="Browse"
          />
          <span>Import</span>
        </button>
        <button
          type="button"
          class="dropdown-item btn -text -cases"
          title="Download preset file"
          v-tippy="{ boundary: 'window', placement: 'left' }"
          @click.stop="downloadSettings"
        >
          <i class="icon-download"></i>
          <span>Download</span>
        </button>
        <template v-if="showReset">
          <button
            type="button"
            class="dropdown-item btn -text -red -cases"
            @click="applyDefault"
          >
            <span>Reset</span>
            <i class="icon-eraser"></i>
          </button>
        </template>
      </dropdown>
    </dropdown>
  </btn>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useStore } from 'vuex'
import Btn from '@/components/framework/Btn.vue'
import dialogService from '@/services/dialogService'
import workspacesService from '@/services/workspacesService'
import importService from '@/services/importService'
import { Preset } from '@/types/types'
import { downloadAnything, slugify } from '@/utils/helpers'

interface PresetSummary {
  id: string
  label: string
}

const props = withDefaults(
  defineProps<{
    type: string
    adapter: (originalPreset?: Preset) => Promise<Preset | undefined>
    label?: string
    showReset?: boolean
    placeholder?: string | null
    classes?: string
  }>(),
  {
    label: 'Presets',
    showReset: true,
    placeholder: null,
    classes: '-green'
  }
)

const emit = defineEmits<{
  apply: [preset?: Preset & { name?: string }]
}>()

const store = useStore()

const queryRef = ref<HTMLInputElement | null>(null)
const presets = ref<PresetSummary[]>([])
const dropdownTrigger = ref<HTMLElement | null>(null)
const presetDropdownTrigger = ref<HTMLElement | null>(null)
const utilityDropdownTrigger = ref<HTMLElement | null>(null)
const dropdownPreset = ref<PresetSummary | null>(null)
const query = ref('')

const filteredPresets = computed(() => {
  if (!query.value.length) {
    return presets.value
  }

  return presets.value.filter(
    preset => preset.label.indexOf(query.value) !== -1
  )
})

async function toggleDropdown(event: MouseEvent) {
  if (!dropdownTrigger.value) {
    await getPresets()

    dropdownTrigger.value = event.target as HTMLElement
  } else {
    dropdownTrigger.value = null
  }
}

function togglePresetDropdown(event: MouseEvent, preset: PresetSummary) {
  if (presetDropdownTrigger.value) {
    presetDropdownTrigger.value = null
  } else {
    presetDropdownTrigger.value = event.currentTarget as HTMLElement
    dropdownPreset.value = preset
  }
}

function toggleUtilityDropdown(event: MouseEvent) {
  if (utilityDropdownTrigger.value) {
    utilityDropdownTrigger.value = null
  } else {
    utilityDropdownTrigger.value = event.currentTarget as HTMLElement
  }
}

async function getPresets() {
  presets.value.splice(1, presets.value.length)
  const keys = (await workspacesService.getPresetsKeysByType(
    props.type
  )) as string[]

  presets.value = keys.map(key => ({
    id: key,
    label: key.split(':').pop() || ''
  }))
}

async function selectPreset(presetSummary: PresetSummary) {
  const preset = await workspacesService.getPreset(presetSummary.id)
  emit('apply', {
    ...preset,
    name: presetSummary.label
  })
}

async function replacePreset(presetSummary: PresetSummary) {
  const preset = await workspacesService.getPreset(presetSummary.id)
  savePreset(presetSummary.label, preset)
}

async function savePreset(name?: string, originalPreset?: Preset) {
  const push = !name

  if (!originalPreset) {
    if (!name || typeof name !== 'string') {
      name = await dialogService.prompt({
        action: 'Save as',
        question: 'Save current settings',
        submitLabel: 'Save',
        input: query.value || props.placeholder || ''
      })

      if (typeof name !== 'string') {
        return
      }
    } else if (
      !(await dialogService.confirm(
        `Override preset ${name} with current settings ?`
      ))
    ) {
      return
    }
  }

  const data = await getData(originalPreset)

  if (!data) {
    return
  }

  if (!name) {
    return
  }

  name = props.type + ':' + name
  const now = Date.now()
  const original = await workspacesService.getPreset(name)

  await workspacesService.savePreset(
    {
      name,
      data,
      createdAt: original ? original.createdAt : now,
      updatedAt: original ? now : null
    },
    props.type
  )

  if (push) {
    const index = presets.value.findIndex(preset => preset.id === name)
    if (index !== -1) {
      presets.value.splice(index, 1)
    }
    presets.value.push({
      id: name,
      label: name.split(':').pop() || ''
    })
  }

  query.value = ''
}

async function applyDefault() {
  if (
    await dialogService.confirm(
      'Reset ' + props.type + ' to default settings ?'
    )
  ) {
    emit('apply')
  }
}

async function handleFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]

  if (!file) {
    return
  }

  try {
    const preset = await importService.importPreset(file, props.type)
    if (preset) {
      presets.value.push({
        id: preset.name,
        label: preset.name.split(':').pop() || ''
      })
    }
  } catch (error) {
    store.dispatch('app/showNotice', {
      title: (error as Error).message,
      type: 'error'
    })
  }
}

async function renamePreset(presetSummary: PresetSummary) {
  const name = (
    (await dialogService.prompt({
      action: 'Rename',
      input: presetSummary.label
    })) || ''
  ).trim()

  if (name && name !== presetSummary.label) {
    const preset = await workspacesService.getPreset(presetSummary.id)
    await workspacesService.removePreset(presetSummary.id)

    const meta = presetSummary.id.split(':')
    meta[meta.length - 1] = name
    preset.name = meta.join(':')

    await workspacesService.savePreset(preset)
    presets.value.splice(presets.value.indexOf(presetSummary), 1, {
      id: preset.name,
      label: name
    })
  }
}

async function deletePreset(presetSummary: PresetSummary) {
  if (
    await dialogService.confirm('Remove preset "' + presetSummary.label + '" ?')
  ) {
    await workspacesService.removePreset(presetSummary.id)
    presets.value.splice(presets.value.indexOf(presetSummary), 1)
  }
}

async function getData(originalPreset?: Preset) {
  const data = await props.adapter(originalPreset)

  if (!data) {
    return
  }

  if ((data as { _id?: string })._id) {
    delete (data as { _id?: string })._id
  }

  return data
}

async function downloadPreset(presetSummary: PresetSummary) {
  const preset = await workspacesService.getPreset(presetSummary.id)
  downloadAnything(
    {
      ...preset,
      type: 'preset'
    },
    slugify(presetSummary.label)
  )
}

async function downloadSettings() {
  const name = props.placeholder || props.type.split(':').pop()
  const data = await getData()

  if (!data) {
    return
  }

  downloadAnything(
    {
      name: props.type + ':' + name,
      type: 'preset',
      data
    },
    slugify(name || '')
  )
}

async function onOpened() {
  await nextTick()

  queryRef.value?.focus()
}
</script>

<style lang="scss">
.presets-control {
  background-color: var(--theme-background-150);

  &__query {
    border: 0;
    width: 7rem;
    flex-grow: 1;
  }

  .d-flex {
    .btn {
      border-radius: 0;
      color: var(--theme-color-100);

      &:hover {
        color: var(--theme-color-base);
      }
    }

    &:last-child {
      .btn:first-child {
        border-radius: 0 0.25rem 0 0;
      }

      .btn:last-child {
        border-radius: 0 0 0.25rem 0;
      }
    }
  }
}
</style>
