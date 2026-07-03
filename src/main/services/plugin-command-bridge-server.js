const http = require('http')
const {
  createPluginBridgeKey,
  createPluginBridgeRunId,
  createPluginBridgeToken,
  createPluginRuntimeBridgeServer,
  PLUGIN_BRIDGE_HOST
} = require('./plugin-runtime-bridge-server')

const MAX_PLUGIN_BRIDGE_BODY_BYTES = 1024 * 1024

const ROUTE_PATTERN = /^\/plugins\/bridge\/([^/]+)\/([^/]+)\/([^/]+)(\/context|\/pet\/say|\/pet\/action|\/pet\/event|\/creator\/actions|\/creator\/actions\/validate|\/creator\/actions\/apply|\/creator\/trigger-proposals\/submit|\/creator\/pack-manifest|\/creator\/pack-manifest\/validate|\/creator\/pack-manifest\/apply|\/creator\/assets\/inspect-frames|\/creator\/assets\/import-frames|\/creator\/assets\/pick-frames\/inspect|\/creator\/assets\/pick-frames\/import|\/creator\/pet-pack\/inspect-output|\/creator\/pet-pack\/import-output|\/creator\/model-settings|\/creator\/model-health-check|\/creator\/model-image-generate)$/

const READ_ONLY_ROUTES = new Map([
  ['/context', 'context'],
  ['/creator/actions', 'creatorActionsRead'],
  ['/creator/pack-manifest', 'creatorPackManifestRead'],
  ['/creator/model-settings', 'creatorModelSettingsRead']
])

const JSON_ROUTES = new Map([
  ['/pet/say', 'petSay'],
  ['/pet/action', 'petAction'],
  ['/pet/event', 'petEvent'],
  ['/creator/actions/validate', 'creatorActionsValidate'],
  ['/creator/actions/apply', 'creatorActionsApply'],
  ['/creator/trigger-proposals/submit', 'creatorTriggerProposalSubmit'],
  ['/creator/pack-manifest/validate', 'creatorPackManifestValidate'],
  ['/creator/pack-manifest/apply', 'creatorPackManifestApply'],
  ['/creator/assets/inspect-frames', 'creatorAssetsInspectFrames'],
  ['/creator/assets/import-frames', 'creatorAssetsImportFrames'],
  ['/creator/assets/pick-frames/inspect', 'creatorAssetsPickFramesInspect'],
  ['/creator/assets/pick-frames/import', 'creatorAssetsPickFramesImport'],
  ['/creator/pet-pack/inspect-output', 'creatorPetPackInspectOutput'],
  ['/creator/pet-pack/import-output', 'creatorPetPackImportOutput'],
  ['/creator/model-health-check', 'creatorModelHealthCheck'],
  ['/creator/model-image-generate', 'creatorModelImageGenerate']
])

const createPluginCommandBridgeServer = ({
  appendLog = () => {},
  commandBridgeRuntimes,
  createServer = http.createServer,
  host = PLUGIN_BRIDGE_HOST,
  maxBodyBytes = MAX_PLUGIN_BRIDGE_BODY_BYTES
} = {}) => {
  if (!commandBridgeRuntimes) throw new Error('commandBridgeRuntimes is required')
  const bridgeServer = createPluginRuntimeBridgeServer({
    appendLog,
    bridgeRuntimes: commandBridgeRuntimes,
    createServer,
    host,
    jsonRoutes: JSON_ROUTES,
    maxBodyBytes,
    readOnlyRoutes: READ_ONLY_ROUTES,
    routePattern: ROUTE_PATTERN
  })
  return {
    close: bridgeServer.close,
    createBridgeBaseUrl: ({ pluginId, commandId, runId }) => bridgeServer.createBridgeBaseUrl({
      pluginId,
      runtimeId: commandId,
      runId
    }),
    ensureStarted: bridgeServer.ensureStarted,
    unrefWhenIdle: bridgeServer.unrefWhenIdle
  }
}

module.exports = {
  createPluginBridgeKey,
  createPluginBridgeRunId,
  createPluginBridgeToken,
  createPluginCommandBridgeServer,
  PLUGIN_BRIDGE_HOST
}
