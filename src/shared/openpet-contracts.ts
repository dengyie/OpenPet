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
  menuPosition: 'auto' | 'right' | 'left' | 'above' | 'below'
  autoStart: boolean
  selectedCursorId: string
  customCursor: CustomCursorSettings
  customCursors: CustomCursorRecord[]
  grounded: boolean
  home: ControlCenterPetHomeSettings
}

export interface CustomCursorSettings {
  enabled: boolean
  assetPath: string
  assetUrl: string
  fileName: string
  hotspotX: number
  hotspotY: number
}

export type CursorOptionType = 'system' | 'builtin' | 'custom'

export interface CursorOption {
  id: string
  type: CursorOptionType
  name: string
  assetPath: string
  assetUrl: string
  fileName: string
  width: number
  height: number
  byteSize: number
  hotspotX: number
  hotspotY: number
  createdAt: string
}

export interface CustomCursorRecord extends CursorOption {
  type: 'custom'
}

export interface ImportedCursorAsset extends CustomCursorRecord {}

export interface CursorImportResult {
  canceled: boolean
  cursor?: ImportedCursorAsset
}

export type PetHomeRadius = 'small' | 'medium' | 'large'

export interface ControlCenterPetHomeSettings {
  enabled: boolean
  radius: PetHomeRadius
  hasAnchor: boolean
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

export interface AiMemoryConfig {
  enabled: boolean
}

export interface AiConfigViewState {
  enabled: boolean
  provider: string
  baseUrl: string
  model: string
  apiKeyRef: string
  systemPrompt: string
  memory: AiMemoryConfig
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

export type PluginSubmissionDecision = 'ready-for-human-review' | 'blocked-before-review'

export type PluginMaintainerApprovalDecision = 'approved' | 'changes-requested'

export interface PluginSubmissionCommandSummary {
  id: string
  title: string
}

export interface PluginSubmissionPluginSummary {
  id: string
  name: string
  version: string
  description: string
  permissions: string[]
  networkAllowlist: string[]
  commands: PluginSubmissionCommandSummary[]
}

export interface PluginSubmissionPackageSummary {
  sourceType: string
  installMode: string
  sha256: string
  fileCount: number
  byteSize: number
  riskLevel: string
  requiresReview: boolean
}

export interface PluginSubmissionSignatureSummary {
  status: string
  label: string
  signer: string
  algorithm?: string
  errors?: string[]
}

export interface PluginSubmissionValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export type PluginSubmissionChecklistStatus = 'pass' | 'fail' | 'warn'

export interface PluginSubmissionChecklistItem {
  id: string
  label: string
  status: PluginSubmissionChecklistStatus
  evidence: string
}

export interface PluginSubmissionReport {
  generatedAt: string
  sourcePath: string
  requireSignature: boolean
  readyForHumanReview: boolean
  decision: PluginSubmissionDecision
  validation: PluginSubmissionValidation
  plugin: PluginSubmissionPluginSummary
  package: PluginSubmissionPackageSummary
  signature: PluginSubmissionSignatureSummary
  permissionDiff: PluginPermissionDiff
  blockStatus: CatalogReviewState
  checklist: PluginSubmissionChecklistItem[]
  reviewerActions: string[]
}

export interface PluginSubmissionPrPacket {
  generatedAt: string
  title: string
  summary: string
  sourcePath: string
  readyForHumanReview: boolean
  decision: PluginSubmissionDecision
  plugin: PluginSubmissionPluginSummary
  package: PluginSubmissionPackageSummary
  signature: PluginSubmissionSignatureSummary
  validation: PluginSubmissionValidation
  checklist: PluginSubmissionChecklistItem[]
  reviewerActions: string[]
  body: string
  assignees: string[]
  labels: string[]
}

export interface PluginSubmissionBundleFiles {
  report: string
  pr: string
  summary: string
}

export interface PluginSubmissionBundleSummary {
  generatedAt: string
  sourcePath: string
  outputDir: string
  readyForHumanReview: boolean
  decision: PluginSubmissionDecision
  plugin: PluginSubmissionPluginSummary
  package: PluginSubmissionPackageSummary
  signature: PluginSubmissionSignatureSummary
  validation: PluginSubmissionValidation
  files: PluginSubmissionBundleFiles
  nextSteps: string[]
}

export interface PluginSubmissionBundleValidationSummary {
  filesPresent: number
  filesTotal: number
  readyForHumanReview: boolean
  decision: PluginSubmissionDecision | ''
  requireReady: boolean
}

export interface PluginSubmissionBundleValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  summary: PluginSubmissionBundleValidationSummary
}

export interface PluginMaintainerApprovalFiles {
  markdown: string
  json: string
}

export interface PluginMaintainerApprovalPluginSummary {
  id: string
  name: string
  version: string
}

export interface PluginMaintainerApprovalPackageSummary {
  sha256: string
}

export interface PluginMaintainerApprovalRecord {
  generatedAt: string
  reviewer: string
  decision: PluginMaintainerApprovalDecision
  notes: string
  sourceBundleDir: string
  plugin: PluginMaintainerApprovalPluginSummary
  package: PluginMaintainerApprovalPackageSummary
  submissionDecision: PluginSubmissionDecision
  approvalReady: boolean
  files: PluginMaintainerApprovalFiles
}

export interface PluginMaintainerApprovalValidationSummary {
  approved: boolean
  approvalReady: boolean
  requireApproved: boolean
}

export interface PluginMaintainerApprovalValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  summary: PluginMaintainerApprovalValidationSummary
}

export interface PluginSubmissionSourcePlugin {
  id: string
  name: string
  version: string
  permissions: string[]
  networkAllowlist: string[]
}

export interface PluginSubmissionSourceValidation {
  ok: boolean
  warnings: string[]
  errors: string[]
  riskLevel: string
}

export interface PluginSubmissionPackageValidation extends PluginSubmissionSourceValidation {
  sha256: string
}

export interface PluginSubmissionRehearsalSubmissionSection {
  bundleDir: string
  bundle: PluginSubmissionBundleSummary
  bundleValidation: PluginSubmissionBundleValidationResult
}

export interface PluginSubmissionRehearsalApprovalSection {
  record: PluginMaintainerApprovalRecord
  validation: PluginMaintainerApprovalValidationResult
}

export interface PluginSubmissionRehearsalFiles {
  readme: string
  checklist: string
  commands: string
  summary: string
}

export interface PluginRealWorldSubmissionRehearsalSummary {
  generatedAt: string
  outputDir: string
  sourcePath: string
  sourcePlugin: PluginSubmissionSourcePlugin
  sourceValidation: PluginSubmissionSourceValidation
  packagePath: string
  packageValidation: PluginSubmissionPackageValidation
  submission: PluginSubmissionRehearsalSubmissionSection
  approval: PluginSubmissionRehearsalApprovalSection
  files: PluginSubmissionRehearsalFiles
}

export interface PluginRemoteSourceArchiveProvenance {
  kind: 'https-archive'
  archiveUrl: string
  finalUrl: string
  archiveSha256: string
  archiveByteSize: number
  pluginPath: string
  archivePluginPath: string
  archiveRootPrefix: string
  extractedFileHashes: Record<string, string>
  downloadedAt: string
}

export interface PluginRemoteSourceSubmissionRehearsalFiles extends PluginSubmissionRehearsalFiles {
  provenance: string
}

export interface PluginRemoteSourceSubmissionRehearsalSummary {
  generatedAt: string
  outputDir: string
  sourceArchive: PluginRemoteSourceArchiveProvenance
  sourcePlugin: PluginSubmissionSourcePlugin
  sourceValidation: PluginSubmissionSourceValidation
  packagePath: string
  packageValidation: PluginSubmissionPackageValidation
  submission: PluginSubmissionRehearsalSubmissionSection
  approval: PluginSubmissionRehearsalApprovalSection
  files: PluginRemoteSourceSubmissionRehearsalFiles
}

export type PluginCommunitySourceRelation = 'independent-third-party' | 'external-community' | 'unknown'

export interface PluginCommunitySourceMetadata {
  kind: 'community-source'
  url: string
  sourceLabel: 'community'
  sourceRelation: PluginCommunitySourceRelation
  submitter: string
  independenceNotes: string
}

export interface PluginCommunitySourceEvidenceApprovalSummary {
  reviewer: string
  decision: PluginMaintainerApprovalDecision
  approvalReady: boolean
}

export interface PluginCommunitySourceEvidenceArtifact {
  generatedAt: string
  communitySource: PluginCommunitySourceMetadata
  communityEvidenceReady: boolean
  sourceArchive: PluginRemoteSourceArchiveProvenance
  sourcePlugin: PluginSubmissionSourcePlugin
  approval: PluginCommunitySourceEvidenceApprovalSummary
  boundaries: string[]
}

export interface PluginCommunitySourceRemoteRehearsalFiles {
  summary: string
  readme: string
  checklist: string
  commands: string
  provenance: string
}

export interface PluginCommunitySourceSubmissionEvidenceFiles {
  readme: string
  checklist: string
  commands: string
  communityEvidence: string
  summary: string
}

export interface PluginCommunitySourceSubmissionEvidenceSummary {
  generatedAt: string
  outputDir: string
  communitySource: PluginCommunitySourceMetadata
  communityEvidenceReady: boolean
  sourceArchive: PluginRemoteSourceArchiveProvenance
  sourcePlugin: PluginSubmissionSourcePlugin
  sourceValidation: PluginSubmissionSourceValidation
  packagePath: string
  packageValidation: PluginSubmissionPackageValidation
  submission: PluginSubmissionRehearsalSubmissionSection
  approval: PluginSubmissionRehearsalApprovalSection
  remoteSourceRehearsal: PluginCommunitySourceRemoteRehearsalFiles
  boundaries: string[]
  files: PluginCommunitySourceSubmissionEvidenceFiles
}

export type PluginCommunitySourceInvitationStatus = 'invitation-draft-ready'
export type PluginCommunitySourceInvitationContactState = 'not-sent'

export interface PluginCommunitySourceInvitationTarget {
  author: string
  url: string
}

export interface PluginCommunitySourceInvitationFiles {
  summary: string
  readme: string
  message: string
  checklist: string
}

export interface PluginCommunitySourceInvitationSummary {
  generatedAt: string
  outputDir: string
  status: PluginCommunitySourceInvitationStatus
  nextAction: 'send-invitation-and-wait-for-compatible-plugin-json-package'
  contactState: PluginCommunitySourceInvitationContactState
  target: PluginCommunitySourceInvitationTarget
  candidateContext: string
  requestedCapabilities: string[]
  maintainer: string
  boundaries: string[]
  files: PluginCommunitySourceInvitationFiles
}

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

export interface CreatorAssetsInspectFramesRequest {
  relativePath: string
  actionId: string
}

export interface CreatorAssetsInspectFramesResult {
  actionId: string
  folderName: string
  inspection: ActionFrameInspection
}

export interface CreatorAssetsInspectFramesResponse {
  ok: boolean
  result: CreatorAssetsInspectFramesResult
}

export interface CreatorAssetsImportFramesRequest {
  relativePath: string
  actionId: string
  label?: string
}

export interface CreatorAssetsImportFramesResponse {
  ok: boolean
  actions: ActionsConfigViewState
  importedAction?: ActionEntry
}

export interface CreatorAssetsPickFramesRequest {
  actionId: string
  label?: string
}

export interface CreatorAssetsPickFramesCanceledResponse {
  ok: boolean
  canceled: true
}

export type CreatorAssetsPickFramesInspectResponse = CreatorAssetsPickFramesCanceledResponse | {
  ok: boolean
  canceled: false
  result: CreatorAssetsInspectFramesResult
}

export type CreatorAssetsPickFramesImportResponse = CreatorAssetsPickFramesCanceledResponse | {
  ok: boolean
  canceled: false
  actions: ActionsConfigViewState
  importedAction?: ActionEntry
}

export interface CreatorPackManifestView {
  id: string
  displayName: string
  version: string
  source: string
  provenance: Pick<PetPackProvenance, 'sourceUrl' | 'assetAuthor' | 'license' | 'licenseUrl'>
}

export interface CreatorPackManifestMutationRequest {
  displayName?: string
  version?: string
  provenance?: Partial<Pick<PetPackProvenance, 'sourceUrl' | 'assetAuthor' | 'license' | 'licenseUrl'>>
}

export interface CreatorPackManifestReadResponse {
  ok: boolean
  manifest: CreatorPackManifestView
}

export interface CreatorPackManifestMutationResult {
  ok: boolean
  validation?: {
    ok: boolean
    errors: string[]
    warnings: string[]
    manifest: CreatorPackManifestView | null
  }
  manifest?: CreatorPackManifestView
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

export interface PluginCleanupEvidenceReport {
  generatedAt: string
  ok: boolean
  phase: number
  platform: string
  signal: string
  cleanupAttempted: boolean
  rootPid: number
  rootExited: boolean
  rootExitCode: number | null
  rootSignal: string
  descendantPidsBefore: number[]
  liveDescendantPidsAfter: number[]
  descendantsExited: boolean
  claimBoundary: string
  warnings: string[]
  files?: {
    json: string
    markdown: string
  }
}

export type PluginCleanupEvidenceCheckStatus = 'pass' | 'fail' | 'pending' | 'blocked'

export interface PluginCleanupEvidenceValidationSummary {
  passed: number
  total: number
  cleanupReady: boolean
}

export interface PluginCleanupEvidenceValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  summary: PluginCleanupEvidenceValidationSummary
}

export interface PluginCleanupEvidenceChecklistReport {
  schemaVersion: string
  generatedAt: string
  source: string
  environment: {
    platform: string
    arch: string
    node: string
    machine: string
    runner: string
    evidence: string
  }
  scenario: {
    pluginId: string
    hostApp: string
    notes: string
  }
  checks: Array<{
    id: string
    status: PluginCleanupEvidenceCheckStatus
    evidence: string
    notes?: string
  }>
}

export interface PluginCleanupEvidenceArchiveFile {
  role: string
  path: string
  exists: boolean
  bytes: number
  sha256: string
  error?: string
}

export interface PluginCleanupEvidenceCollectedFile {
  role: string
  file: string
  path: string
  bytes: number
  sha256: string
}

export interface PluginCleanupEvidenceArchiveManifest {
  generatedAt: string
  ok: boolean
  cleanupReady: boolean
  archive: {
    archiveDir: string
    outputPath: string
  }
  files: PluginCleanupEvidenceArchiveFile[]
  collector: {
    path: string
    conservativeWording: boolean
    avoidsPassShortcut: boolean
  }
  evidence: {
    evidenceDir: string
    requiredFiles: string[]
    requiredFilesPresent: boolean
    files: PluginCleanupEvidenceCollectedFile[]
  }
  report: {
    path: string
    schemaVersion: string
    generatedAt: string
    source: string
    environment: Partial<PluginCleanupEvidenceChecklistReport['environment']>
    scenario: Partial<PluginCleanupEvidenceChecklistReport['scenario']>
    structuralValidation: PluginCleanupEvidenceValidationResult
    readinessValidation: PluginCleanupEvidenceValidationResult
  }
  errors: string[]
  warnings: string[]
}

export interface PluginCleanupEvidenceCollectorRun {
  startedAt: string
  finishedAt: string
  ok: boolean
  command: string[]
  cwd: string
  timeoutMs: number
  reportPath: string
  evidenceDir: string
  exitCode: number | null
  signal: string
  error: string
  stdoutPath: string
  stderrPath: string
  runPath: string
}

export interface PluginCleanupEvidenceRunResult {
  ok: boolean
  archiveDir: string
  reportPath: string
  collectorPath: string
  evidenceDir: string
  manifestPath: string
  collectorRun: PluginCleanupEvidenceCollectorRun
  manifest: PluginCleanupEvidenceArchiveManifest
}

export interface PackagedPluginCleanupRuntimeStepEvidence {
  requested: boolean
  stopRequested: boolean
  exitConfirmed: boolean
  treeCleanupAttempted?: boolean
  processGroupCleanupAttempted?: boolean
  forceStopAttempted?: boolean
  transcriptPath: string
}

export interface PackagedPluginCleanupRuntimeArtifact {
  schemaVersion: number
  generatedAt: string
  pluginId: string
  hostApp: string
  cleanupReady?: boolean
  error?: string
  setup: PackagedPluginCleanupRuntimeStepEvidence
  command: PackagedPluginCleanupRuntimeStepEvidence
  service: PackagedPluginCleanupRuntimeStepEvidence
  logPath?: string
}

export interface PackagedPluginCleanupEvidenceRunResult {
  ok: boolean
  archiveDir: string
  reportPath: string
  collectorPath: string
  evidenceDir: string
  manifestPath: string
  runtimeArtifactPath: string
  updatedReport: PluginCleanupEvidenceChecklistReport
  reportValidation: PluginCleanupEvidenceValidationResult
  manifest: PluginCleanupEvidenceArchiveManifest
  errors: string[]
}

export type DesktopPickerSmokeCheckStatus = 'pass' | 'fail' | 'pending' | 'blocked'

export interface DesktopPickerValidationSummary {
  passed: number
  total: number
  smokeReady?: boolean
  officialReady?: boolean
}

export interface DesktopPickerValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  summary: DesktopPickerValidationSummary
}

export interface DesktopPickerEvidenceFile {
  file: string
  path?: string
  bytes: number
  sha256: string
}

export interface DesktopPickerArtifactFile {
  name: string
  size: number
}

export interface DesktopPickerSmokeReportArtifact {
  version: string
  releaseDir: string
  appPath: string
  installer: string
  zip: string
  latestYml: string
  files: DesktopPickerArtifactFile[]
  signed: boolean
  signatureStatus?: string
  signatureEvidence?: string
  authenticodeStatus?: string
  authenticodeEvidence?: string
}

export interface DesktopPickerSmokeReportEnvironment {
  osRelease: string
  machine: string
  runner: string
  evidence: string
}

export interface DesktopPickerSmokeReportFixture {
  pluginPackage: string
  frameFolder: string
  petPack: string
}

export interface DesktopPickerSmokeCheck {
  id: string
  status: DesktopPickerSmokeCheckStatus
  evidence: string
  notes: string
}

export interface DesktopPickerSmokeReport {
  platform: string
  arch: string
  generatedAt: string
  source: string
  environment: DesktopPickerSmokeReportEnvironment
  artifact: DesktopPickerSmokeReportArtifact
  fixture: DesktopPickerSmokeReportFixture
  checks: DesktopPickerSmokeCheck[]
}

export interface DesktopPickerEvidenceSummaryEvidenceSection {
  evidenceDir: string
  presentFiles: DesktopPickerEvidenceFile[]
  presentCount: number
}

export interface DesktopPickerReportArtifactSummary {
  version: string
  appPath: string
  installer: string
  zip: string
  latestYml: string
  signed: boolean
  signatureStatus: string
  authenticodeStatus: string
}

export interface DesktopPickerReportCheckSummary {
  total: number
  present: number
  counts: Record<DesktopPickerSmokeCheckStatus, number> & Record<string, number>
  byStatus: Record<DesktopPickerSmokeCheckStatus, string[]> & Record<string, string[]>
}

export interface DesktopPickerEvidenceReportSummary {
  reportPath: string
  platform: string
  arch: string
  generatedAt: string
  artifact: DesktopPickerReportArtifactSummary
  fixtures: JsonObject
  checks: DesktopPickerReportCheckSummary
  structuralValidation: DesktopPickerValidationResult
  readinessValidation: DesktopPickerValidationResult
}

export interface DesktopPickerEvidenceReportError {
  reportPath: string
  error: string
}

export type DesktopPickerEvidenceReport =
  | DesktopPickerEvidenceReportSummary
  | DesktopPickerEvidenceReportError

export interface DesktopPickerEvidenceSummary {
  generatedAt: string
  requireSigned: boolean
  ok: boolean
  releaseReady: boolean
  evidence: DesktopPickerEvidenceSummaryEvidenceSection
  report: DesktopPickerEvidenceReport | null
  errors: string[]
  warnings: string[]
}

export interface DesktopPickerArchiveManifest {
  generatedAt: string
  requireSigned: boolean
  ok: boolean
  releaseReady: boolean
  archive: {
    archiveDir: string
    outputPath: string
  }
  files: ReleaseEvidenceArchiveFile[]
  evidence: {
    evidenceDir: string
    ok: boolean
    files: DesktopPickerEvidenceFile[]
  }
  summary: {
    path: string
    format: '' | 'markdown' | 'json'
    matchesComputedSummary: boolean
  }
  report: {
    path: string
    platform: string
    arch: string
    generatedAt: string
    structuralValidation: DesktopPickerValidationResult
    readinessValidation: DesktopPickerValidationResult
  }
  errors: string[]
  warnings: string[]
}

export type WindowsSmokeCheckStatus = 'pass' | 'fail' | 'pending' | 'blocked'

export interface WindowsSmokeValidationSummary {
  passed: number
  total: number
  smokeReady?: boolean
  officialReady?: boolean
}

export interface WindowsSmokeValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  summary: WindowsSmokeValidationSummary
}

export interface WindowsSmokeEvidenceFile {
  file: string
  bytes: number
  sha256: string
}

export interface WindowsSmokeArtifactFile {
  name: string
  size: number
}

export interface WindowsSmokeReportEnvironment {
  windowsVersion: string
  machine: string
  runner: string
  evidence: string
}

export interface WindowsSmokeReportArtifact {
  version: string
  installer: string
  zip: string
  latestYml: string
  blockmaps: string[]
  files: WindowsSmokeArtifactFile[]
  signed: boolean
  authenticodeStatus: string
  authenticodeEvidence: string
}

export interface WindowsSmokeCheck {
  id: string
  status: WindowsSmokeCheckStatus
  evidence: string
  notes: string
}

export interface WindowsSmokeReport {
  platform: 'win32'
  arch: string
  generatedAt: string
  source: string
  environment: WindowsSmokeReportEnvironment
  artifact: WindowsSmokeReportArtifact
  checks: WindowsSmokeCheck[]
}

export interface WindowsSmokeEvidenceBundleSummary {
  evidenceDir: string
  requiredFiles: string[]
  presentFiles: WindowsSmokeEvidenceFile[]
  presentCount: number
  requiredCount: number
  signed: boolean
}

export interface WindowsSmokeReportArtifactSummary {
  version: string
  installer: string
  zip: string
  latestYml: string
  signed: boolean
  authenticodeStatus: string
}

export interface WindowsSmokeReportCheckSummary {
  total: number
  present: number
  counts: Record<WindowsSmokeCheckStatus, number> & Record<string, number>
  byStatus: Record<WindowsSmokeCheckStatus, string[]> & Record<string, string[]>
}

export interface WindowsSmokeEvidenceReportSummary {
  reportPath: string
  platform: string
  arch: string
  generatedAt: string
  artifact: WindowsSmokeReportArtifactSummary
  checks: WindowsSmokeReportCheckSummary
  structuralValidation: WindowsSmokeValidationResult
  readinessValidation: WindowsSmokeValidationResult
}

export interface WindowsSmokeEvidenceReportError {
  reportPath: string
  error: string
}

export type WindowsSmokeEvidenceReport =
  | WindowsSmokeEvidenceReportSummary
  | WindowsSmokeEvidenceReportError

export interface WindowsSmokeEvidenceSummary {
  generatedAt: string
  requireSigned: boolean
  ok: boolean
  releaseReady: boolean
  evidence: WindowsSmokeEvidenceBundleSummary
  report: WindowsSmokeEvidenceReport | null
  errors: string[]
  warnings: string[]
}

export interface WindowsSmokeArchiveManifest {
  generatedAt: string
  requireSigned: boolean
  ok: boolean
  releaseReady: boolean
  archive: {
    archiveDir: string
    outputPath: string
  }
  files: ReleaseEvidenceArchiveFile[]
  evidence: {
    evidenceDir: string
    ok: boolean
    files: WindowsSmokeEvidenceFile[]
    signed: boolean
  }
  summary: {
    path: string
    format: '' | 'markdown' | 'json'
    matchesComputedSummary: boolean
  }
  report: {
    path: string
    platform: string
    arch: string
    generatedAt: string
    structuralValidation: WindowsSmokeValidationResult
    readinessValidation: WindowsSmokeValidationResult
  }
  errors: string[]
  warnings: string[]
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

export interface ImageGenerationCloudConfigViewState {
  provider: string
  baseUrl: string
  model: string
  apiKeyRef: string
  organization: string
  project: string
  hasApiKey: boolean
  apiKeyPreview: string
  apiKeyLabel: string
}

export interface ImageGenerationLocalConfigViewState {
  endpoint: string
  healthUrl: string
  model: string
  timeoutMs: number
  maxConcurrentJobs: number
}

export interface ImageGenerationConfigViewState {
  defaultBackend: 'fixture' | 'cloud' | 'local'
  cloud: ImageGenerationCloudConfigViewState
  local: ImageGenerationLocalConfigViewState
}

export interface ImageGenerationSaveApiKeyResult {
  apiKeyRef: string
  hasApiKey: boolean
  apiKeyPreview: string
}

export interface ImageGenerationHealthCheckResult {
  ok: boolean
  backend: 'fixture' | 'cloud' | 'local'
  code: string
  message: string
}

export interface ImageGenerationHealthCheckRequest {
  backend?: 'fixture' | 'cloud' | 'local'
}

export interface ImageGenerationOutputRef {
  dataRelativePath: string
  mimeType: string
  sha256: string
}

export interface ImageGenerationRequest {
  backend?: 'fixture' | 'cloud' | 'local'
  prompt: string
  output: {
    dataDir?: string
    dataRelativeDir: string
  }
  constraints: {
    width: number
    height: number
    transparent: boolean
  }
}

export interface ImageGenerationResult {
  ok: boolean
  backend: 'fixture' | 'cloud' | 'local'
  model: string
  generatedAt?: string
  outputs: ImageGenerationOutputRef[]
  usage?: {
    estimatedCostUsd?: number
  }
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

export type PackagedRuntimeSmokeCheckStatus = 'pass' | 'fail' | 'pending' | 'blocked'

export interface PackagedRuntimeSmokeValidationSummary {
  passed: number
  total: number
  smokeReady?: boolean
  officialReady?: boolean
}

export interface PackagedRuntimeSmokeValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  summary: PackagedRuntimeSmokeValidationSummary
}

export interface PackagedRuntimeArtifactFile {
  name: string
  size: number
}

export interface PackagedRuntimeArtifactSummary {
  version: string
  releaseDir: string
  appPath: string
  installer: string
  zip: string
  latestYml: string
  files: PackagedRuntimeArtifactFile[]
  signed: boolean
  signatureStatus?: string
  signatureEvidence?: string
  authenticodeStatus?: string
  authenticodeEvidence?: string
}

export interface PackagedRuntimeEnvironmentSummary {
  osRelease: string
  machine: string
  runner: string
  evidence: string
}

export interface PackagedRuntimeFixtures {
  builtInPacks: Record<string, string>
  pluginPackage: string
  petPackZip: string
  invalidPackage: string
}

export interface PackagedRuntimeLinkedEvidence {
  desktopPickerSmokeReport: string
  desktopPickerSmokeRunbook: string
  screenshots: string[]
  recordings: string[]
}

export interface PackagedRuntimeSmokeCheck {
  id: string
  status: PackagedRuntimeSmokeCheckStatus
  evidence: string
  notes: string
}

export interface PackagedRuntimeSmokeReport {
  platform: string
  arch: string
  generatedAt: string
  source: string
  environment: PackagedRuntimeEnvironmentSummary
  artifact: PackagedRuntimeArtifactSummary
  fixtures: PackagedRuntimeFixtures
  linkedEvidence: PackagedRuntimeLinkedEvidence
  checks: PackagedRuntimeSmokeCheck[]
}

export interface PackagedRuntimeSmokeStateLaunch {
  ok: boolean
  pid: number
}

export interface PackagedRuntimeSmokeStateWindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PackagedRuntimeSmokeStateWindow {
  ok: boolean
  visible?: boolean
  focused?: boolean
  bounds?: PackagedRuntimeSmokeStateWindowBounds
  transparent?: boolean
  alwaysOnTop?: boolean
}

export interface PackagedRuntimeSmokeStateRendererSprite {
  visible: boolean
  width: number
  height: number
  backgroundImage: string
}

export interface PackagedRuntimeSmokeStateRendererBubble {
  visible: boolean
  text: string
}

export interface PackagedRuntimeSmokeStateRendererAction {
  current?: string
  firstPosition?: string
  secondPosition?: string
  advanced: boolean
  requested?: string
}

export interface PackagedRuntimeSmokeStateRenderer {
  ok: boolean
  bodyBackground?: string
  htmlBackground?: string
  transparentBackground?: boolean
  sprite?: PackagedRuntimeSmokeStateRendererSprite
  bubble?: PackagedRuntimeSmokeStateRendererBubble
  action?: PackagedRuntimeSmokeStateRendererAction
}

export interface PackagedRuntimeSmokeStatePackSpriteSize {
  width: number
  height: number
}

export interface PackagedRuntimeSmokeStatePack {
  id: string
  ok: boolean
  actionCount: number
  defaultAction?: string
  spriteVisible?: boolean
  spriteSize?: PackagedRuntimeSmokeStatePackSpriteSize
  error?: string
}

export interface PackagedRuntimeSmokeStateCheckEvidence {
  status: PackagedRuntimeSmokeCheckStatus
  evidence?: string
  notes?: string
}

export interface PackagedRuntimeSmokeStateFinalState {
  ok: boolean
  activePackId?: string
  error?: string
}

export interface PackagedRuntimeSmokeState {
  launch: PackagedRuntimeSmokeStateLaunch
  window: PackagedRuntimeSmokeStateWindow
  renderer: PackagedRuntimeSmokeStateRenderer
  packs: PackagedRuntimeSmokeStatePack[]
  pluginPicker?: PackagedRuntimeSmokeStateCheckEvidence
  petPicker?: PackagedRuntimeSmokeStateCheckEvidence
  invalidPackage?: PackagedRuntimeSmokeStateCheckEvidence
  finalState: PackagedRuntimeSmokeStateFinalState
}

export interface PackagedRuntimeSmokeEvidence {
  schemaVersion: number
  sessionId: string
  generatedAt: string
  appPath: string
  state: PackagedRuntimeSmokeState
  screenshotPath?: string
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

export interface MacosReleaseEvidenceCommand {
  command: string
  args: string[]
  exitCode: number
  ok: boolean
  stdout: string
  stderr: string
  content: string
}

export interface MacosReleaseEvidenceSummary {
  generatedAt: string
  ok: boolean
  releaseReady: boolean
  appPath: string
  outputDir: string
  statuses: {
    codesign: MacosReleaseEvidenceStatus
    notarization: MacosReleaseEvidenceStatus
    gatekeeper: MacosReleaseEvidenceStatus
  }
  files: {
    codesign: string
    notarization: string
    gatekeeper: string
    markdownSummary: string
    jsonSummary: string
  }
  evidenceFiles: ReleaseEvidenceArchiveFile[]
  commands: MacosReleaseEvidenceCommand[]
  warnings: string[]
}

export interface MacosReleaseEvidenceArtifactArchiveFile {
  role: string
  fileName: string
  sourcePath: string
  archivedPath: string
  bytes: number
  sha256: string
  status?: MacosReleaseEvidenceStatus
  releaseReady?: boolean
}

export interface MacosReleaseEvidenceArtifactArchiveManifest {
  generatedAt: string
  ok: boolean
  macosEvidenceReady: boolean
  archive: {
    archiveDir: string
    outputPath: string
  }
  source: {
    artifactDir: string
    artifactName: string
    releaseTag: string
    workflowRunUrl: string
  }
  files: MacosReleaseEvidenceArtifactArchiveFile[]
  warnings: string[]
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
  importCursor: () => Promise<CursorImportResult>
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
  getImageGenerationConfig: () => Promise<ImageGenerationConfigViewState>
  saveImageGenerationConfig: (config: Partial<ImageGenerationConfigViewState>) => Promise<ImageGenerationConfigViewState>
  saveImageGenerationApiKey: (apiKey: string) => Promise<ImageGenerationSaveApiKeyResult>
  clearImageGenerationApiKey: () => Promise<ImageGenerationSaveApiKeyResult>
  checkImageGenerationHealth: (payload?: ImageGenerationHealthCheckRequest) => Promise<ImageGenerationHealthCheckResult>
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
  inspectPluginGithubRepository: (repositoryUrl: string) => Promise<PluginPackageInspectionResult>
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
