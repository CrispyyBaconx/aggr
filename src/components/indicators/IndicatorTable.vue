<template>
  <table class="table indicator-table__table">
    <thead>
      <tr>
        <th v-if="showEnabled" class="table-min"></th>
        <th
          class="table-sortable table-min"
          @click="toggleSort('name')"
          :class="[sortProperty === 'name' && 'table-sort--active']"
        >
          <span>Name</span>
          <i
            v-if="sortProperty === 'name'"
            class="table-sortable__direction icon-up"
            :class="[sortDirection < 0 && 'table-sortable__direction--desc']"
          ></i>
        </th>
        <th class="table-sortable w-100" @click="toggleSort('description')">
          <span>Description</span>
          <i
            v-if="sortProperty === 'description'"
            class="table-sortable__direction icon-up"
            :class="[sortDirection < 0 && 'table-sortable__direction--desc']"
          ></i>
        </th>
        <th
          v-if="showAuthor"
          class="-dialog-min-m table-sortable text-right"
          @click="toggleSort('author')"
        >
          <span>Author</span>
          <i
            v-if="sortProperty === 'author'"
            class="table-sortable__direction icon-up"
            :class="[sortDirection < 0 && 'table-sortable__direction--desc']"
          ></i>
        </th>
        <th
          class="-dialog-min-m table-sortable text-right"
          @click="toggleSort('updatedAt')"
        >
          <span>Date</span>
          <i
            v-if="sortProperty === 'updatedAt'"
            class="table-sortable__direction icon-up"
            :class="[sortDirection < 0 && 'table-sortable__direction--desc']"
          ></i>
        </th>
        <th class="table-min" v-if="showDropdown"></th>
      </tr>
    </thead>
    <tbody
      v-if="filteredIndicators.length"
      @mousemove="movePreview"
      @mouseleave="clearPreview"
    >
      <tr
        v-for="indicator of filteredIndicators"
        :key="indicator.id"
        @click="$emit('selected', indicator)"
        @mouseenter="showPreview(indicator)"
        class="-action"
      >
        <td
          v-if="showEnabled"
          class="table-action table-min"
          @click.stop="$emit('enabled', indicator)"
        >
          <i
            class="-lower"
            :class="indicator.enabled ? 'icon-star-filled' : 'icon-star'"
            title="Enable by default<br>on new charts"
            v-tippy="{ placement: 'top' }"
          ></i>
        </td>
        <td
          class="table-input text-color-base table-ellipsis"
          style="max-width: 200px"
        >
          {{
            (indicator.displayName || indicator.name).replace(/\{[\w_]+\}/g, '')
          }}
        </td>
        <td class="table-input table-ellipsis">
          <span class="text-muted">{{ indicator.description }}</span>
        </td>
        <td v-if="showAuthor" class="table-input table-ellipsis">
          <span class="text-muted">{{ indicator.author }}</span>
        </td>
        <td class="-dialog-min-m table-input table-min text-right">
          <span>{{ ago(indicator.updatedAt) }}</span>
        </td>
        <td
          v-if="showDropdown"
          class="table-action -hover table-min"
          @click.stop="$emit('dropdown', [$event, indicator])"
        >
          <button class="btn -text -small">
            <i class="icon-more"></i>
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ago } from '@/utils/helpers'
import { usePreview } from '@/composables/usePreview'

const props = withDefaults(
  defineProps<{
    indicators: any[]
    query?: string
    showDropdown?: boolean
    showAuthor?: boolean
    showEnabled?: boolean
  }>(),
  {
    query: '',
    showDropdown: false,
    showAuthor: false,
    showEnabled: false
  }
)

defineEmits<{
  selected: [indicator: any]
  enabled: [indicator: any]
  dropdown: [payload: [Event, any]]
}>()

const { showPreview, movePreview, clearPreview } = usePreview()

const sortDirection = ref(-1)
const sortProperty = ref('updatedAt')

const queryFilter = computed(() => {
  return new RegExp(props.query.replace(/\W/, '.*'), 'i')
})

const sortFunction = computed(() => {
  if (sortProperty.value === 'description') {
    if (sortDirection.value > 0) {
      return (a: any, b: any) =>
        (a.description || '').localeCompare(b.description || '')
    }
    return (a: any, b: any) =>
      (b.description || '').localeCompare(a.description || '')
  } else if (sortProperty.value === 'name') {
    if (sortDirection.value > 0) {
      return (a: any, b: any) => (a.name || '').localeCompare(b.name || '')
    }
    return (a: any, b: any) => (b.name || '').localeCompare(a.name || '')
  } else if (sortProperty.value === 'createdAt') {
    if (sortDirection.value > 0) {
      return (a: any, b: any) => a.createdAt - b.createdAt
    }
    return (a: any, b: any) => b.createdAt - a.createdAt
  } else if (sortProperty.value === 'updatedAt') {
    if (sortDirection.value > 0) {
      return (a: any, b: any) => a.updatedAt - b.updatedAt
    }
    return (a: any, b: any) => b.updatedAt - a.updatedAt
  } else if (sortProperty.value === 'author') {
    if (sortDirection.value > 0) {
      return (a: any, b: any) => a.author - b.author
    }
    return (a: any, b: any) => b.author - a.author
  }

  return (a: any, b: any) => a.id.localeCompare(b.id)
})

const filteredIndicators = computed(() => {
  const sortFn = sortFunction.value
  return props.indicators
    .filter(
      a =>
        queryFilter.value.test(a.description) || queryFilter.value.test(a.name)
    )
    .sort(sortFn)
})

function toggleSort(name: string) {
  if (name === sortProperty.value) {
    sortDirection.value = sortDirection.value * -1
  }

  sortProperty.value = name
}
</script>
<style lang="scss" scoped>
.icon-star-filled {
  color: var(--theme-buy-200);
}
</style>
