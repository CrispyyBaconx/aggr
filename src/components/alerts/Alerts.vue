<template>
  <div class="pane-alerts">
    <pane-header
      class="pane-alerts__header"
      :paneId="paneId"
      :settings="() => import('@/components/alerts/AlertsDialog.vue')"
      :show-search="false"
      :show-name="false"
    >
      <hr />
      <Btn type="button" class="-text" @click="alertsListRef?.getAlerts()">
        <i class="icon-refresh"></i>
      </Btn>
    </pane-header>
    <input
      ref="queryRef"
      type="text"
      placeholder="Search..."
      class="form-control pane-alerts__query pane-overlay"
      v-model="query"
    />
    <alerts-list ref="alertsListRef" :query="query" persist-sections />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { usePane } from '@/composables/usePane'
import ToggableSection from '@/components/framework/ToggableSection.vue'
import PaneHeader from '../panes/PaneHeader.vue'
import Btn from '@/components/framework/Btn.vue'
import AlertsList from '@/components/alerts/AlertsList.vue'

const props = defineProps<{
  paneId: string
}>()

const { pane } = usePane(props.paneId)

const queryRef = ref<HTMLInputElement | null>(null)
const alertsListRef = ref<InstanceType<typeof AlertsList> | null>(null)
const query = ref('')
</script>

<style lang="scss" scoped>
.pane-alerts {
  $self: &;

  :deep(.alerts-list__table) {
    width: 100%;
  }

  &__query {
    border: 0;
    width: 100%;
    position: absolute;
    z-index: 1;
    border-radius: 0;
    padding: 0;
    font-size: 1.125em;
  }

  &__header {
    background: 0;
  }
}
</style>
