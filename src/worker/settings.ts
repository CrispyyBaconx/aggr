import { AggregatorSettings } from '@/types/types'

export default {
  calculateSlippage: null,
  aggregationLength: null,
  preferQuoteCurrencySize: null,
  wsProxyUrl: null,
  buckets: {},
  // Backend API configuration
  backendUrl: null,
  backendWsUrl: null,
  backendApiKey: null,
  useBackendPrimary: true
} as AggregatorSettings
