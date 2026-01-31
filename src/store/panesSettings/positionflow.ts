import { MutationTree, ActionTree, GetterTree, Module } from 'vuex'

export type PositionFlowTimeframe = '5m' | '15m' | '1h' | '4h' | '1d'

export interface PositionFlowPaneState {
  _id?: string
  timeframe: PositionFlowTimeframe
  dotSize: number
  showLabels: boolean
  autoScale: boolean
}

const getters = {} as GetterTree<PositionFlowPaneState, PositionFlowPaneState>

const state = {
  timeframe: '1h',
  dotSize: 6,
  showLabels: true,
  autoScale: true
} as PositionFlowPaneState

const actions = {} as ActionTree<PositionFlowPaneState, PositionFlowPaneState>

const mutations = {
  SET_TIMEFRAME(state, value: PositionFlowTimeframe) {
    state.timeframe = value
  },
  SET_DOT_SIZE(state, value: number) {
    state.dotSize = Math.max(2, Math.min(20, value))
  },
  TOGGLE_SHOW_LABELS(state) {
    state.showLabels = !state.showLabels
  },
  TOGGLE_AUTO_SCALE(state) {
    state.autoScale = !state.autoScale
  }
} as MutationTree<PositionFlowPaneState>

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations
} as Module<PositionFlowPaneState, PositionFlowPaneState>
