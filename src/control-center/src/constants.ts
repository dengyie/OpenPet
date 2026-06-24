export type ControlCenterTabId = 'pet' | 'actions' | 'ai' | 'plugins' | 'catalog' | 'service' | 'about'

interface ControlCenterTab {
  id: ControlCenterTabId
  label: string
}

interface NumericOption {
  label: string
  value: number
}

interface StringOption<T extends string = string> {
  label: string
  value: T
}

export const tabs: ControlCenterTab[] = [
  { id: 'pet', label: 'Pet' },
  { id: 'actions', label: 'Actions' },
  { id: 'ai', label: 'AI' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'service', label: 'Service' },
  { id: 'about', label: 'About' }
]

export const speedOptions: NumericOption[] = [
  { label: '慢', value: 1 },
  { label: '中', value: 2 },
  { label: '快', value: 3 }
]

export const walkDurationOptions: NumericOption[] = [
  { label: '10秒', value: 10000 },
  { label: '15秒', value: 15000 },
  { label: '30秒', value: 30000 },
  { label: '60秒', value: 60000 }
]

export const bubbleDurationOptions: NumericOption[] = [
  { label: '短', value: 4000 },
  { label: '中', value: 6000 },
  { label: '长', value: 10000 }
]

export const homeRadiusOptions: StringOption[] = [
  { label: '小', value: 'small' },
  { label: '中', value: 'medium' },
  { label: '大', value: 'large' }
]

export const menuPositionOptions: StringOption[] = [
  { label: '自动', value: 'auto' },
  { label: '右侧', value: 'right' },
  { label: '左侧', value: 'left' },
  { label: '上方', value: 'above' },
  { label: '下方', value: 'below' }
]
