import { MutationTree, ActionTree, GetterTree, Module } from 'vuex'

export type ScreenerTimeframe = '5m' | '15m' | '1h' | '4h' | '1d'
export type ScreenerSortBy =
  | 'symbol'
  | 'price'
  | 'change'
  | 'volume'
  | 'oi'
  | 'funding'
  | 'vdelta'

export interface ScreenerPaneState {
  _id?: string
  sortBy: ScreenerSortBy
  sortOrder: 1 | -1
  timeframe: ScreenerTimeframe
  searchQuery: string
  showSpots: boolean
  showPerps: boolean
  exchangeFilter: string[]
  compactMode: boolean
}

const getters = {} as GetterTree<ScreenerPaneState, ScreenerPaneState>

const state = {
  sortBy: 'volume',
  sortOrder: -1,
  timeframe: '1h',
  searchQuery: '',
  showSpots: false,
  showPerps: true,
  exchangeFilter: [],
  compactMode: false
} as ScreenerPaneState

const actions = {} as ActionTree<ScreenerPaneState, ScreenerPaneState>

const mutations = {
  SET_SORT_BY(state, value: ScreenerSortBy) {
    state.sortBy = value
  },
  TOGGLE_SORT_ORDER(state) {
    state.sortOrder = state.sortOrder > 0 ? -1 : 1
  },
  SET_TIMEFRAME(state, value: ScreenerTimeframe) {
    state.timeframe = value
  },
  SET_SEARCH_QUERY(state, value: string) {
    state.searchQuery = value
  },
  TOGGLE_SHOW_SPOTS(state) {
    state.showSpots = !state.showSpots
  },
  TOGGLE_SHOW_PERPS(state) {
    state.showPerps = !state.showPerps
  },
  SET_EXCHANGE_FILTER(state, exchanges: string[]) {
    state.exchangeFilter = exchanges
  },
  TOGGLE_EXCHANGE_FILTER(state, exchange: string) {
    const index = state.exchangeFilter.indexOf(exchange)
    if (index === -1) {
      state.exchangeFilter.push(exchange)
    } else {
      state.exchangeFilter.splice(index, 1)
    }
  },
  TOGGLE_COMPACT_MODE(state) {
    state.compactMode = !state.compactMode
  }
} as MutationTree<ScreenerPaneState>

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations
} as Module<ScreenerPaneState, ScreenerPaneState>
