<template>
  <dropdown-button
    :modelValue="sortType"
    :options="['none', 'price', 'volume', 'delta', 'change']"
    @update:modelValue="selectSortType($event)"
  ></dropdown-button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from 'vuex'
import DropdownButton from '@/components/framework/DropdownButton.vue'

const props = defineProps<{
  paneId: string
  buttonClass?: string
}>()

const store = useStore()

const sortType = computed(() => store.state[props.paneId].sortType)
const sortOrder = computed(() => store.state[props.paneId].sortOrder)

function selectSortType(option: string) {
  if (option === sortType.value) {
    store.commit(props.paneId + '/TOGGLE_SORT_ASC')
  }

  store.commit(props.paneId + '/SET_SORT_TYPE', option)
}
</script>
