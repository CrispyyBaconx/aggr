<template>
  <button
    type="button"
    class="dropdown-item dropdown-item--narrow"
    @click.stop="togglePriceScaleDropdown(indicatorId, $event.currentTarget)"
  >
    <span class="dropdown-item__emoji"> 📊 </span>
    <span class="d-flex -column">
      <small class="block text-muted">Scale with:</small>
      {{ priceScaleLabel }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, defineAsyncComponent, h, render } from 'vue'
import { useStore } from 'vuex'
import { ChartPaneState } from '../../store/panesSettings/chart'

const props = defineProps<{
  paneId: string
  indicatorId: string
}>()

const store = useStore()
const priceScaleLabel = ref<string | null>(null)
let priceScaleDropdownInstance: any = null

function updateLabel() {
  const { options, name } = (store.state[props.paneId] as ChartPaneState)
    .indicators[props.indicatorId]

  const { priceScaleId } = options

  priceScaleLabel.value =
    priceScaleId === props.indicatorId ? name : priceScaleId
}

async function togglePriceScaleDropdown(
  indicatorId: string,
  anchor: HTMLElement
) {
  updateLabel()

  if (!priceScaleDropdownInstance) {
    const module =
      await import('@/components/indicators/PriceScaleDropdown.vue')
    const PriceScaleDropdown = module.default

    const container = document.createElement('div')
    document.getElementById('app')?.appendChild(container)

    const vnode = h(PriceScaleDropdown, {
      paneId: props.paneId,
      indicatorId: indicatorId,
      modelValue: anchor,
      'onUpdate:modelValue': async (v: any) => {
        // Update the component props and re-render
        const newVnode = h(PriceScaleDropdown, {
          paneId: props.paneId,
          indicatorId: indicatorId,
          modelValue: v,
          'onUpdate:modelValue': arguments.callee
        })
        render(newVnode, container)
        priceScaleDropdownInstance = { vnode: newVnode, container, value: v }
        await nextTick()
        updateLabel()
      }
    })

    render(vnode, container)
    priceScaleDropdownInstance = { vnode, container, value: anchor }
  } else if (priceScaleDropdownInstance.value) {
    // Close dropdown
    const newVnode = h(
      (await import('@/components/indicators/PriceScaleDropdown.vue')).default,
      {
        paneId: props.paneId,
        indicatorId: indicatorId,
        modelValue: null
      }
    )
    render(newVnode, priceScaleDropdownInstance.container)
    priceScaleDropdownInstance.value = null
  } else {
    // Open dropdown with new anchor
    const module =
      await import('@/components/indicators/PriceScaleDropdown.vue')
    const newVnode = h(module.default, {
      paneId: props.paneId,
      indicatorId: indicatorId,
      modelValue: anchor,
      'onUpdate:modelValue': async (v: any) => {
        const newerVnode = h(module.default, {
          paneId: props.paneId,
          indicatorId: indicatorId,
          modelValue: v
        })
        render(newerVnode, priceScaleDropdownInstance.container)
        priceScaleDropdownInstance.value = v
        await nextTick()
        updateLabel()
      }
    })
    render(newVnode, priceScaleDropdownInstance.container)
    priceScaleDropdownInstance.value = anchor
  }
}

onMounted(() => {
  updateLabel()
})
</script>
