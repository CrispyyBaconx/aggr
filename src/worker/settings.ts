import { AggregatorSettings } from '@/types/types'

export default {
  calculateSlippage: null,
  aggregationLength: null,
  preferQuoteCurrencySize: null,
  wsProxyUrl: null,
  buckets: {},
  // Backend API configuration (for historical data)
  backendUrl: null,
  backendApiKey: null
} as AggregatorSettings
