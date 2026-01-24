// Composable for indicator option components
// Props are defined at the component level, this just provides common interface typing

export interface IndicatorOptionProps {
  paneId: string
  indicatorId: string
  label: string
  value: unknown
  definition?: Record<string, unknown>
}

export function useIndicatorOption() {
  // This is primarily a type helper - props are defined at the component level
  // Additional shared logic can be added here as needed
  return {}
}
