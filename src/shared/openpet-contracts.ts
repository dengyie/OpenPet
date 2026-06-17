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

export interface AiBehaviorDecision {
  id: number
  timestamp: string
  matched: boolean
  type?: string
  ruleId?: string
  reason: string
  actionId?: string
  label?: string
  kind?: string
  event?: string
  intent?: string
  inputSummary?: string
  cooldown?: boolean
  fallback?: boolean
  blockedReason?: string
  replay?: {
    reply?: string
    behaviorIntent?: AiBehaviorRule | null
  }
  replayRedacted?: boolean
}

export interface AiBehaviorConfig {
  enabled: boolean
  useTools: boolean
  cooldownMs: number
  rules: AiBehaviorRule[]
  decisions: AiBehaviorDecision[]
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
  atlas?: SpriteAtlas
  frameDurations?: number[]
  loop?: boolean
  previewSprite?: string
  [key: string]: unknown
}

export interface ActionsConfigViewState {
  defaultAction: string
  clickAction: string
  actions: ActionEntry[]
}

export interface OkResponse {
  ok: boolean
}

export interface ActionFrameInfo {
  fileName: string
  width: number
  height: number
  hasAlpha: boolean
}

export interface ActionFrameInspection {
  valid: boolean
  frameCount: number
  maxWidth: number
  maxHeight: number
  frames: ActionFrameInfo[]
  skippedFiles: string[]
  errors: string[]
  warnings: string[]
}

export interface CanceledDialogResult {
  canceled: true
}

export interface CanceledSelectionResult extends CanceledDialogResult {
  selectionId?: string
}

export interface CompletedActionFrameInspectionResult {
  canceled: false
  selectionId: string
  folderName: string
  actionId: string
  inspection: ActionFrameInspection
}

export type ActionFrameInspectionResult = CanceledSelectionResult | CompletedActionFrameInspectionResult

export interface ActionFrameInspectRequest {
  actionId?: string
}

export interface ActionFrameReinspectRequest {
  selectionId?: string
  actionId?: string
}

export interface ActionFrameClearRequest {
  selectionId: string
}

export interface ActionFrameImportRequest {
  selectionId?: string
  actionId?: string
  label?: string
}

export interface ActionFrameImportResult {
  ok?: boolean
  canceled?: boolean
  result?: {
    importedAction?: ActionEntry
  }
  animations?: ActionsConfigViewState
  inspectionResult?: ActionFrameInspectionResult
}

export interface ActionsSaveConfigRequest {
  defaultAction: string
  clickAction: string
}

export interface ActionsMutationResult {
  animations: ActionsConfigViewState
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
  atlas?: SpriteAtlas
  frameDurations?: number[]
  loop?: boolean
}

export interface SpriteAtlas {
  columns?: number
  rows?: number
  width?: number
  height?: number
}

export interface PetPackProvenance {
  sourceUrl?: string
  assetAuthor?: string
  license?: string
  licenseUrl?: string
  importedAt?: string
  originalFormat?: string
}

export interface PetPackVersionConflict {
  installed: boolean
  decision: 'new-install' | 'upgrade' | 'downgrade' | 'same-version'
  requiresReview: boolean
  installedVersion: string
  incomingVersion: string
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
  provenance?: PetPackProvenance
  actionCount?: number
  defaultAction?: string
  clickAction?: string
  previewSprite?: string
  previewAction?: PetPackPreviewAction | null
  valid?: boolean
  error?: string
  blockStatus?: { blocked: boolean; reasons: string[] }
  conflict?: PetPackVersionConflict
}

export interface PetPacksViewState {
  activePackId: string
  packs: PetPackSummary[]
}

export interface PetPackInspectionResult {
  canceled?: boolean
  selectionId?: string
  folderName?: string
  valid?: boolean
  errors?: string[]
  warnings?: string[]
  pack?: PetPackSummary
}

export interface PetPackMutationResult {
  pack?: PetPackSummary
  activePackId?: string
  petPacks: PetPacksViewState
  animations?: ActionsConfigViewState
}

export interface CompletedPetPackExportResult {
  canceled?: false
  packId: string
  fileName: string
  outputPath?: string
  sha256?: string
  byteSize?: number
}

export type PetPackExportResult = CanceledDialogResult | CompletedPetPackExportResult

export interface CatalogReviewState {
  blocked: boolean
  reasons: string[]
}

export type CatalogItemKind = 'plugin' | 'pet-pack'

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
  previewImage?: string
  actionCount?: number
  downloadable?: boolean
  installed?: boolean
  installedVersion?: string
  updateAvailable?: boolean
  sha256?: string
  reportUrl?: string
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

export interface PermissionDiffState {
  added: string[]
  removed: string[]
  unchanged: string[]
}

export interface PluginPermissionDiff {
  permissions: PermissionDiffState
  networkAllowlist: PermissionDiffState
}

export interface PluginCommandViewState {
  id: string
  title: string
}

export interface PluginCommandEntryViewState extends PluginCommandViewState {
  command: string
  cwd: string
}

export type PluginSetupRuntimeStatus = 'not-run' | 'running' | 'stopping' | 'succeeded' | 'failed'

export interface PluginSetupRuntimeViewState {
  status: PluginSetupRuntimeStatus
  lastRunAt?: string
  exitCode?: number | null
  error?: string
}

export interface PluginSetupEntryViewState {
  id: string
  title: string
  command: string
  cwd: string
  runtime?: PluginSetupRuntimeViewState
}

export interface PluginSetupRunResultViewState {
  ok: boolean
  pluginId: string
  setupId: string
  runtime: PluginSetupRuntimeViewState
}

export interface PluginServiceEntryViewState {
  id: string
  title: string
  command: string
  cwd: string
  platforms?: Record<string, {
    command: string
    cwd: string
  }>
  health?: {
    type: string
    url?: string
  } | null
  healthPolicy?: PluginServiceHealthPolicyViewState
  runtime?: PluginServiceRuntimeViewState
}

export interface PluginDashboardEntryViewState {
  id: string
  title: string
  url: string
}

export interface PluginEntriesViewState {
  setup: PluginSetupEntryViewState[]
  commands: PluginCommandEntryViewState[]
  services: PluginServiceEntryViewState[]
  dashboards: PluginDashboardEntryViewState[]
}

export interface PluginManifestViewState {
  id: string
  name: string
  version: string
  profile?: 'runtime' | 'creator-tools' | 'hybrid'
  description?: string
  permissions: string[]
  network?: {
    allowlist: string[]
  }
  commands: PluginCommandViewState[]
  entries: PluginEntriesViewState
  main?: string
  config?: string
  configSchema?: string
  manifest?: JsonObject
  assets?: string[]
}

export interface PluginSignatureViewState {
  status?: string
  label: string
  signer?: string
  algorithm?: string
  verified?: boolean
  errors: string[]
}

export interface PluginPackageReviewViewState {
  canceled?: false
  selectionId?: string
  sourceType?: string
  installMode: 'install' | 'update'
  existingVersion: string
  riskLevel: string
  plugin: PluginManifestViewState
  permissionDiff: PluginPermissionDiff
  signature: PluginSignatureViewState
  blockStatus: CatalogReviewState
  packageHash: string
  fileCount: number
  byteSize: number
  requiresReview?: boolean
}

export type PluginPackageInspectionResult = CanceledSelectionResult | PluginPackageReviewViewState

export interface PluginStorageViewState {
  keyCount: number
  byteSize: number
  valid?: boolean
}

export interface PluginViewState {
  id: string
  name: string
  version: string
  profile?: 'runtime' | 'creator-tools' | 'hybrid'
  source: string
  enabled: boolean
  runnable: boolean
  permissions: string[]
  commands: PluginCommandViewState[]
  entries: PluginEntriesViewState
  configSchema: {
    title?: string
    description?: string
    properties: unknown[]
  }
  config: JsonObject
  storage: PluginStorageViewState
  signatureStatus: {
    label: string
  }
  blockStatus?: CatalogReviewState
}

export interface PluginLogEntry {
  id: string
  timestamp: string
  level: string
  pluginId: string
  commandId: string
  message: string
}

export interface PluginLogFilters {
  pluginId?: string
  level?: string
  query?: string
  format?: 'json' | 'csv'
}

export interface CreatorActionsReadResponse {
  ok: boolean
  actions: ActionsConfigViewState
}

export interface CreatorActionsMutationResult {
  ok: boolean
  validation?: {
    ok: boolean
    errors: string[]
    warnings: string[]
    actions: ActionsConfigViewState
  }
  actions?: ActionsConfigViewState
}

export interface PluginMutationResult extends OkResponse {
  pluginId?: string
  installMode?: string
  disabled?: boolean
  storageRemoved?: boolean
  plugins: PluginViewState[]
}

export interface PluginCommandRunResultViewState extends OkResponse {
  pluginId?: string
  commandId?: string
  exitCode?: number | null
  stdout?: string
  stderr?: string
  result?: JsonValue
}

export interface PluginDashboardOpenResult extends OkResponse {
  pluginId: string
  dashboardId: string
  url: string
}

export type PluginServiceRuntimeStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'exited' | 'failed'

export type PluginServiceHealthStatus = 'not-configured' | 'unknown' | 'checking' | 'healthy' | 'unhealthy'

export interface PluginServiceHealthViewState {
  status: PluginServiceHealthStatus
  checkedAt?: string
  url?: string
  statusCode?: number | null
  message?: string
}

export interface PluginServiceHealthPolicyViewState {
  enabled: boolean
  intervalMs: number
}

export interface PluginServiceRuntimeViewState {
  status: PluginServiceRuntimeStatus
  pid?: number
  startedAt?: string
  stoppedAt?: string
  command?: string
  cwd?: string
  exitCode?: number | null
  signal?: string
  error?: string
  health?: PluginServiceHealthViewState
}

export interface PluginServiceControlResult extends OkResponse {
  pluginId: string
  serviceId: string
  runtime: PluginServiceRuntimeViewState
}

export interface PluginServiceHealthCheckResult extends OkResponse {
  pluginId: string
  serviceId: string
  health: PluginServiceHealthViewState
  runtime: PluginServiceRuntimeViewState
}

export interface CatalogPluginInstallSelection {
  kind: 'plugin'
  itemId: string
  selectionId: string
  sourcePackageHash: string
  pluginReview: PluginPackageReviewViewState
}

export interface CatalogPetPackInstallSelection {
  kind: 'pet-pack'
  itemId: string
  selectionId: string
  sourcePackageHash: string
  petPackReview: {
    pack: {
      id: string
      displayName: string
      version: string
      actionCount: number
      defaultAction?: string
      clickAction?: string
      packageHash?: string
      blockStatus?: CatalogReviewState
    }
  }
}

export type CatalogInstallSelection = CatalogPluginInstallSelection | CatalogPetPackInstallSelection

export interface CatalogInstallRequest {
  kind: CatalogItemKind
  itemId: string
}

export interface CatalogInstallResult extends OkResponse {
  kind?: CatalogItemKind
  itemId?: string
  catalog: CatalogState
  plugins?: PluginViewState[]
  petPacks?: PetPacksViewState
  animations?: ActionsConfigViewState
}

export interface CatalogBlocklistEntry {
  type: 'pluginId' | 'packId' | 'sha256'
  value: string
}

export interface CatalogBlocklistResult {
  catalog: CatalogState
  blocklist: BlocklistState
}

export interface AboutUpdateInfo {
  configured: boolean
  provider: string
  owner?: string
  repo?: string
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
  name?: string
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

export interface AiSaveApiKeyResult {
  apiKeyRef: string
  hasApiKey: boolean
}

export interface AiConnectionTestResult {
  ok: boolean
  reply: string
}

export interface AiChatRequest {
  conversationId: string
  message: string
}

export interface AiChatResponse {
  reply: string
  messages?: ChatMessage[]
  behavior?: Partial<AiBehaviorDecision>
  action?: {
    actionId?: string
    label?: string
    error?: string
  }
}

export interface AiBehaviorDryRunRequest {
  reply: string
  behavior: AiBehaviorConfig
}

export interface AiBehaviorResult extends Partial<AiBehaviorDecision> {
  matched: boolean
  reason: string
  actionId?: string
  replayOf?: number
}

export interface ServiceLogFilters {
  format?: 'json' | 'csv'
  [key: string]: unknown
}

export interface ReleaseEvidenceFileSummary {
  path: string
  sha256: string
  byteSize: number
}

export interface ReleaseEvidenceArchiveFile {
  role: string
  path: string
  exists: boolean
  bytes: number
  sha256: string
  error?: string
}

export interface ReleaseEvidenceReportSnapshot {
  platform: string
  arch: string
  generatedAt: string
  artifact: JsonObject
  linkedEvidence?: JsonObject
}

export interface PackagedRuntimeLinkedEvidence {
  desktopPickerSmokeReport: string
  desktopPickerSmokeRunbook: string
  screenshots: string[]
  recordings: string[]
}

export interface ReleaseEvidenceReportValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
  summary?: JsonObject
}

export interface ReleaseEvidenceReportSection {
  file: ReleaseEvidenceArchiveFile
  report: ReleaseEvidenceReportSnapshot | null
  structuralValidation: ReleaseEvidenceReportValidation | null
  readinessValidation: ReleaseEvidenceReportValidation | null
  releaseReady: boolean
  errors: string[]
  warnings: string[]
}

export interface ReleaseEvidenceLinkedArchiveSection {
  file: ReleaseEvidenceArchiveFile
  path: string
  archiveDir: string
  outputPath: string
  ok: boolean
  releaseReady: boolean
  reportPath: string
  reportSha256: string
  summaryPath: string
  matchesReport: boolean
  matchesDesktopPickerReport?: boolean
  errors: string[]
  warnings: string[]
}

export type MacosReleaseEvidenceStatus = 'missing' | 'pending' | 'pass'

export interface MacosReleaseEvidenceFileStatus {
  status: MacosReleaseEvidenceStatus
  file: ReleaseEvidenceArchiveFile
}

export interface ReleaseEvidenceArchiveManifest {
  generatedAt: string
  requireSigned: boolean
  ok: boolean
  releaseReady: boolean
  archive: {
    archiveDir: string
    outputPath: string
  }
  files: ReleaseEvidenceArchiveFile[]
  macos: {
    releaseReady: boolean
    codesign: MacosReleaseEvidenceFileStatus
    notarization: MacosReleaseEvidenceFileStatus
    gatekeeper: MacosReleaseEvidenceFileStatus
  }
  reports: {
    releaseReady: boolean
    windowsSmoke: ReleaseEvidenceReportSection
    desktopPicker: ReleaseEvidenceReportSection
    packagedRuntime: ReleaseEvidenceReportSection
  }
  archives: {
    releaseReady: boolean
    windowsSmoke: ReleaseEvidenceLinkedArchiveSection
    desktopPicker: ReleaseEvidenceLinkedArchiveSection
  }
  errors: string[]
  warnings: string[]
}

export interface ReleaseEvidenceArchiveSummary {
  generatedAt: string
  archiveDir: string
  releaseReady: boolean
  files: ReleaseEvidenceFileSummary[]
  blockers: string[]
}

export type SignedReleaseClaimStatus = 'ready' | 'not-ready'

export interface SignedReleaseClaim {
  key: string
  status: SignedReleaseClaimStatus
  claim: string
  blockers: string[]
}

export interface SignedReleaseClosureReport {
  schemaVersion: number
  generatedAt: string
  releaseReady: boolean
  manifest: {
    ok: boolean
    releaseReady: boolean
    requireSigned: boolean
    archiveDir: string
    outputPath: string
  }
  claims: {
    officialDesktopRelease: SignedReleaseClaim
    macos: SignedReleaseClaim
    windows: SignedReleaseClaim
  }
  smartScreen: {
    status: 'document-observed-result' | 'not-proven'
    claim: string
  }
  nextActions: string[]
}

export interface SignedReleaseClaimSummary {
  generatedAt: string
  officialDesktopReleaseReady: boolean
  macosReleaseReady: boolean
  windowsReleaseReady: boolean
  blockers: string[]
}

export interface ControlCenterApi {
  getSettings: () => Promise<ControlCenterSettings>
  saveSettings: (settings: Partial<ControlCenterSettings>) => Promise<ControlCenterSettings>
  previewScale: (scale: number) => void
  getActions: () => Promise<ActionsConfigViewState>
  inspectActionFrames: (payload?: ActionFrameInspectRequest) => Promise<ActionFrameInspectionResult>
  reinspectActionFrames: (payload?: ActionFrameReinspectRequest) => Promise<ActionFrameInspectionResult>
  clearActionFrameSelection: (payload: ActionFrameClearRequest) => Promise<OkResponse>
  importActionFrames: (payload?: ActionFrameImportRequest) => Promise<ActionFrameImportResult>
  saveActionsConfig: (payload: ActionsSaveConfigRequest) => Promise<ActionsMutationResult>
  deleteAction: (actionId: string) => Promise<ActionsMutationResult>
  listPetPacks: () => Promise<PetPacksViewState>
  inspectPetPackDirectory: () => Promise<PetPackInspectionResult>
  clearPetPackSelection: (selectionId: string) => Promise<OkResponse>
  importPetPack: (selectionId: string) => Promise<PetPackMutationResult>
  exportPetPack: (packId: string) => Promise<PetPackExportResult>
  setActivePetPack: (packId: string) => Promise<PetPackMutationResult>
  removePetPack: (packId: string) => Promise<PetPackMutationResult>
  getAiConfig: () => Promise<AiConfigViewState>
  saveAiConfig: (config: Partial<AiConfigViewState>) => Promise<AiConfigViewState>
  saveAiApiKey: (apiKey: string) => Promise<AiSaveApiKeyResult>
  testAiConnection: () => Promise<AiConnectionTestResult>
  getAiConversation: (conversationId: string) => Promise<ChatMessage[]>
  chat: (payload: AiChatRequest) => Promise<AiChatResponse>
  getAiBehavior: () => Promise<AiBehaviorConfig>
  saveAiBehavior: (config: AiBehaviorConfig) => Promise<AiBehaviorConfig>
  dryRunAiBehavior: (payload: AiBehaviorDryRunRequest) => Promise<AiBehaviorResult>
  replayAiBehaviorDecision: (decisionId: number) => Promise<AiBehaviorResult>
  exportAiBehaviorDiagnostics: () => Promise<string>
  clearAiBehaviorDecisions: () => Promise<AiBehaviorDecision[]>
  getPlugins: () => Promise<PluginViewState[]>
  setPluginEnabled: (pluginId: string, enabled: boolean) => Promise<Partial<PluginViewState>>
  savePluginConfig: (pluginId: string, config: JsonObject) => Promise<Partial<PluginViewState>>
  savePluginServiceHealthPolicy: (pluginId: string, serviceId: string, policy: PluginServiceHealthPolicyViewState) => Promise<PluginViewState>
  runPluginCommand: (pluginId: string, commandId: string, payload?: JsonObject) => Promise<PluginCommandRunResultViewState>
  runPluginSetup: (pluginId: string, setupId: string) => Promise<PluginSetupRunResultViewState>
  openPluginDashboard: (pluginId: string, dashboardId: string) => Promise<PluginDashboardOpenResult>
  startPluginService: (pluginId: string, serviceId: string) => Promise<PluginServiceControlResult>
  stopPluginService: (pluginId: string, serviceId: string) => Promise<PluginServiceControlResult>
  checkPluginServiceHealth: (pluginId: string, serviceId: string) => Promise<PluginServiceHealthCheckResult>
  inspectPluginPackage: () => Promise<PluginPackageInspectionResult>
  clearPluginSelection: (selectionId: string) => Promise<OkResponse>
  installPlugin: (selectionId: string) => Promise<PluginMutationResult>
  updatePlugin: (selectionId: string) => Promise<PluginMutationResult>
  uninstallPlugin: (pluginId: string, options?: { removeStorage?: boolean }) => Promise<PluginMutationResult>
  getPluginLogs: (filters?: PluginLogFilters) => Promise<PluginLogEntry[]>
  exportPluginLogs: (filters?: PluginLogFilters) => Promise<string>
  clearPluginLogs: () => Promise<PluginLogEntry[]>
  clearPluginStorage: (pluginId: string) => Promise<Partial<PluginViewState>>
  getServiceStatus: () => Promise<ServiceStatusViewState>
  saveServiceConfig: (config: Partial<LocalHttpConfigViewState>) => Promise<ServiceStatusViewState>
  getServiceLogs: (filters?: ServiceLogFilters) => Promise<ServiceLogEntry[]>
  exportServiceLogs: (filters?: ServiceLogFilters) => Promise<string>
  clearServiceLogs: () => Promise<ServiceLogEntry[]>
  rotateServiceToken: () => Promise<ServiceStatusViewState>
  revokeMcpSessions: () => Promise<ServiceStatusViewState>
  getAboutInfo: () => Promise<AboutInfoViewState>
  checkForUpdates: () => Promise<UpdateCheckViewState>
  getCatalog: () => Promise<CatalogState>
  prepareCatalogInstall: (payload: CatalogInstallRequest) => Promise<CatalogInstallSelection>
  installCatalogSelection: (selectionId: string) => Promise<CatalogInstallResult>
  clearCatalogSelection: (selectionId: string) => Promise<OkResponse>
  addCatalogBlocklistEntry: (payload: CatalogBlocklistEntry) => Promise<CatalogBlocklistResult>
  removeCatalogBlocklistEntry: (payload: CatalogBlocklistEntry) => Promise<CatalogBlocklistResult>
  close: () => void
}
