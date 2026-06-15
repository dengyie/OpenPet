export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject {
  [key: string]: JsonValue
}

export interface ControlCenterSettings {
  scale: number
  walkSpeed: number
  walkDuration: number
  bubbleDuration: number
  autoStart: boolean
}

export interface AiBehaviorRule {
  id?: string
  label?: string
  kind?: string
  actionId?: string
  bubbleText?: string
  intent?: string
  confidence?: number
}

export interface AiBehaviorConfig {
  enabled: boolean
  useTools: boolean
  cooldownMs: number
  rules: AiBehaviorRule[]
  decisions: AiBehaviorRule[]
}

export interface AiConfigViewState {
  enabled: boolean
  provider: string
  baseUrl: string
  model: string
  apiKeyRef: string
  systemPrompt: string
  behavior: AiBehaviorConfig
  hasApiKey: boolean
}

export interface ServiceLogEntry {
  id: string
  timestamp: string
  method: string
  path: string
  statusCode: number
  authorized: boolean
  remoteAddress: string
  error: string
}

export interface LocalHttpConfigViewState {
  enabled: boolean
  host: string
  port: number
  token: string
  logs: ServiceLogEntry[]
}

export interface LocalHttpRuntimeViewState {
  enabled: boolean
  host: string
  port: number
  mcp: {
    activeSessions: number
    sessionTtlMs: number
  }
}

export interface ServiceStatusViewState {
  config: LocalHttpConfigViewState
  runtime: LocalHttpRuntimeViewState
}

export interface ActionEntry {
  id?: string
  label?: string
  kind?: string
  sprite?: string
  frameCount?: number
  frameWidth?: number
  frameHeight?: number
  frameMs?: number
  frameRow?: number
  frameColumn?: number
  atlas?: string
  frameDurations?: number[]
  [key: string]: unknown
}

export interface ActionsConfigViewState {
  defaultAction: string
  clickAction: string
  actions: ActionEntry[]
}

export interface BlocklistState {
  pluginIds: string[]
  packIds: string[]
  sha256: string[]
}

export interface PetPackPreviewAction {
  id?: string
  label?: string
  frameCount?: number
  frameWidth?: number
  frameHeight?: number
  frameMs?: number
  frameRow?: number
  frameColumn?: number
  atlas?: string
  frameDurations?: number[]
}

export interface PetPackSummary {
  id: string
  displayName: string
  version: string
  source: string
  rootPath: string
  active?: boolean
  installedAt?: string
  updatedAt?: string
  packageHash?: string
  sourcePackageHash?: string
  actionCount?: number
  defaultAction?: string
  clickAction?: string
  previewSprite?: string
  previewAction?: PetPackPreviewAction | null
  valid?: boolean
  error?: string
  blockStatus?: { blocked: boolean; reasons: string[] }
}

export interface PetPacksViewState {
  activePackId: string
  packs: PetPackSummary[]
}

export interface CatalogReviewState {
  blocked: boolean
  reasons: string[]
}

export interface CatalogPluginEntry {
  id: string
  name: string
  version: string
  author?: string
  description?: string
  openpetApiVersion?: string
  permissions?: string[]
  downloadable?: boolean
  installed?: boolean
  installedVersion?: string
  updateAvailable?: boolean
  sha256?: string
  reportUrl?: string
  blockStatus?: CatalogReviewState
}

export interface CatalogPetPackEntry {
  id: string
  displayName: string
  version: string
  author?: string
  description?: string
  actionCount?: number
  downloadable?: boolean
  installed?: boolean
  installedVersion?: string
  updateAvailable?: boolean
  sha256?: string
  blockStatus?: CatalogReviewState
}

export interface CatalogState {
  schemaVersion: number
  updatedAt: string
  feedbackUrl: string
  localBlocklist: BlocklistState
  catalogBlocklist: BlocklistState
  blocklist: BlocklistState
  plugins: CatalogPluginEntry[]
  petPacks: CatalogPetPackEntry[]
}

export interface AboutUpdateInfo {
  configured: boolean
  provider: string
  channel: string
  url: string
}

export interface AboutInfoViewState {
  name: string
  productName: string
  version: string
  packaged: boolean
  platform: string
  arch: string
  update: AboutUpdateInfo
}

export interface UpdateAssetViewState {
  [key: string]: unknown
}

export interface UpdateCheckViewState {
  status: string
  configured: boolean
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  prerelease: boolean
  releaseUrl: string
  assets: UpdateAssetViewState[]
  checkedAt: string
  message: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}
