<template>
  <div class="quick-search" :class="{ '-expanded': isExpanded }">
    <button
      v-if="!isExpanded"
      class="quick-search__button"
      @click="expand"
      title="Quick instrument switch"
    >
      <i class="icon-search"></i>
    </button>
    <div
      v-else
      class="quick-search__input-wrapper"
      :class="{ '-closing': isClosing }"
    >
      <input
        ref="inputRef"
        type="text"
        class="quick-search__input"
        :value="query"
        @input="onInput"
        @keydown="onKeydown"
        @blur="onBlur"
        placeholder="Switch to..."
      />
      <button
        class="quick-search__close btn -text"
        @mousedown.prevent="collapse"
      >
        <i class="icon-cross"></i>
      </button>
    </div>
    <div
      v-if="isExpanded && results.length"
      class="quick-search__dropdown hide-scrollbar"
      ref="dropdownRef"
    >
      <button
        v-for="(result, index) in results"
        :key="result.localPair"
        class="quick-search__result"
        :class="{ '-active': index === activeIndex }"
        @mousedown.prevent="selectResult(result)"
        @mouseenter="activeIndex = index"
      >
        <span class="quick-search__result-pair">{{ result.localPair }}</span>
        <span class="quick-search__result-exchanges">
          {{ result.exchangeCount }} exchange{{
            result.exchangeCount > 1 ? 's' : ''
          }}
        </span>
      </button>
    </div>
    <div
      v-else-if="isExpanded && query.length >= 2 && !isLoading"
      class="quick-search__dropdown quick-search__no-results"
    >
      No results
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useStore } from 'vuex'
import {
  indexedProducts,
  ensureIndexedProducts,
  parseMarket,
  stripStableQuote
} from '@/services/productsService'

const store = useStore()

const inputRef = ref<HTMLInputElement | null>(null)
const dropdownRef = ref<HTMLElement | null>(null)
const query = ref('')
const isExpanded = ref(false)
const isClosing = ref(false)
const isLoading = ref(false)
const activeIndex = ref(0)
// Reactive trigger to force re-computation when indexedProducts changes
const productsTrigger = ref(0)

const MAX_RESULTS = 10

// Get all products flattened from all exchanges
const allProducts = computed(() => {
  // Access productsTrigger to make this computed reactive to manual triggers
  productsTrigger.value
  const products: any[] = []
  for (const exchangeId in indexedProducts) {
    if (indexedProducts[exchangeId]) {
      products.push(...indexedProducts[exchangeId])
    }
  }
  return products
})

// Group products by local pair
const results = computed(() => {
  if (query.value.length < 2) {
    return []
  }

  const searchQuery = query.value.toUpperCase()
  const groups: {
    [localPair: string]: { markets: string[]; exchanges: Set<string> }
  } = {}

  for (const product of allProducts.value) {
    // Match against local pair (e.g., BTCUSDT, ETHUSDT)
    const localPair = product.local || product.base + product.quote

    if (!localPair.toUpperCase().includes(searchQuery)) {
      continue
    }

    // Skip disabled exchanges
    if (store.state.exchanges[product.exchange]?.disabled) {
      continue
    }

    if (!groups[localPair]) {
      groups[localPair] = { markets: [], exchanges: new Set() }
    }

    groups[localPair].markets.push(product.id)
    groups[localPair].exchanges.add(product.exchange.replace(/_.*/, ''))
  }

  // Sort by relevance (starts with > contains) and alphabetically
  return Object.entries(groups)
    .map(([localPair, data]) => ({
      localPair,
      markets: data.markets,
      exchangeCount: data.exchanges.size
    }))
    .sort((a, b) => {
      const aStarts = a.localPair.toUpperCase().startsWith(searchQuery)
      const bStarts = b.localPair.toUpperCase().startsWith(searchQuery)
      if (aStarts && !bStarts) return -1
      if (!aStarts && bStarts) return 1
      // Secondary sort by exchange count (more exchanges = more relevant)
      if (b.exchangeCount !== a.exchangeCount) {
        return b.exchangeCount - a.exchangeCount
      }
      return a.localPair.localeCompare(b.localPair)
    })
    .slice(0, MAX_RESULTS)
})

// Reset active index when results change
watch(results, () => {
  activeIndex.value = 0
})

async function expand() {
  isExpanded.value = true
  isLoading.value = true

  // Ensure products are indexed
  await ensureIndexedProducts()
  
  // Trigger re-computation of allProducts since indexedProducts is not reactive
  productsTrigger.value++

  isLoading.value = false

  await nextTick()
  inputRef.value?.focus()
}

function collapse() {
  isClosing.value = true
  setTimeout(() => {
    isExpanded.value = false
    isClosing.value = false
    query.value = ''
    activeIndex.value = 0
  }, 200)
}

function onInput(event: Event) {
  query.value = (event.target as HTMLInputElement).value
}

function onKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'Escape':
      collapse()
      break
    case 'ArrowDown':
      event.preventDefault()
      if (results.value.length) {
        activeIndex.value = (activeIndex.value + 1) % results.value.length
        scrollToActive()
      }
      break
    case 'ArrowUp':
      event.preventDefault()
      if (results.value.length) {
        activeIndex.value =
          (activeIndex.value - 1 + results.value.length) % results.value.length
        scrollToActive()
      }
      break
    case 'Enter':
      event.preventDefault()
      if (results.value.length && results.value[activeIndex.value]) {
        selectResult(results.value[activeIndex.value])
      }
      break
  }
}

function scrollToActive() {
  nextTick(() => {
    const dropdown = dropdownRef.value
    if (!dropdown) return

    const activeEl = dropdown.querySelector('.-active') as HTMLElement
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  })
}

function onBlur() {
  // Delay to allow click events on dropdown items
  setTimeout(() => {
    if (!dropdownRef.value?.contains(document.activeElement)) {
      collapse()
    }
  }, 150)
}

function selectResult(result: { localPair: string; markets: string[] }) {
  store.dispatch('panes/switchInstrument', result.localPair)
  collapse()
}
</script>

<style lang="scss">
.quick-search {
  position: fixed;
  bottom: 1.5rem;
  right: 5rem;
  z-index: 10;

  &__button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    background-color: #3a3a3a;
    color: var(--theme-color-100);
    z-index: 1;
    position: relative;
    border: 1px solid #4a4a4a;
    cursor: pointer;

    &:hover {
      background-color: #4a4a4a;
      border-color: #5a5a5a;
    }
  }

  &__input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    background-color: var(--theme-background-100);
    border: 1px solid var(--theme-background-300);
    border-radius: 1.25rem;
    width: 180px;
    overflow: hidden;
    animation: quick-search-expand 0.15s ease-out forwards;

    &.-closing {
      animation: quick-search-collapse 0.2s ease-out forwards;
    }
  }

  &__input {
    flex: 1;
    min-width: 0;
    height: 2.25rem;
    background: transparent;
    border: none;
    outline: none;
    color: var(--theme-color-100);
    font-size: 0.875rem;
    padding: 0 2rem 0 0.75rem;

    &::placeholder {
      color: var(--theme-color-o50);
      font-weight: 300;
      letter-spacing: 0.025em;
      opacity: 0.7;
    }
  }

  &__close {
    position: absolute;
    right: 0.25rem;
    top: 50%;
    transform: translateY(-50%);
    padding: 0.25rem;
    opacity: 0.5;
    flex-shrink: 0;

    &:hover {
      opacity: 1;
    }
  }

  &__dropdown {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 0.5rem;
    background-color: var(--theme-background-100);
    border: 1px solid var(--theme-background-200);
    border-radius: 0.5rem;
    min-width: 200px;
    max-height: 300px;
    overflow-y: auto;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  &__result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--theme-color-100);
    text-align: left;
    font-size: 0.875rem;
    transition: background-color 0.1s;

    &:hover,
    &.-active {
      background-color: var(--theme-background-150);
    }

    &-pair {
      font-weight: 600;
    }

    &-exchanges {
      font-size: 0.75rem;
      opacity: 0.6;
    }
  }

  &__no-results {
    padding: 0.75rem;
    text-align: center;
    color: var(--theme-color-o50);
    font-size: 0.875rem;
  }
}

@keyframes quick-search-expand {
  from {
    width: 2.5rem;
    opacity: 0.5;
  }
  to {
    width: 180px;
    opacity: 1;
  }
}

@keyframes quick-search-collapse {
  from {
    width: 180px;
    opacity: 1;
  }
  to {
    width: 2.5rem;
    opacity: 0;
  }
}
</style>
