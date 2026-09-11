const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const pluginServicePath = path.join(repoRoot, 'apps', 'desktop', 'src', 'services', 'plugin-service.js')
const pluginDevelopmentDocPath = path.join(repoRoot, 'docs', 'plugin-development.md')
const pluginRulesDocPath = path.join(repoRoot, 'docs', 'plugin-ecosystem-rules.md')

const readText = (filePath) => fs.readFileSync(filePath, 'utf-8')

const extractRoutePermissionsFromService = () => {
  const source = readText(pluginServicePath)
  const matches = Array.from(source.matchAll(
    /(\w+): async(?:\s*\([^)]*\))?\s*=>\s*\{\s*assertPermission\(plugin\.manifest,\s*'([^']+)'\)/g
  ))

  const handlerToRoute = {
    creatorActionsRead: '/creator/actions',
    creatorActionsValidate: '/creator/actions/validate',
    creatorActionsApply: '/creator/actions/apply',
    creatorTriggerProposalSubmit: '/creator/trigger-proposals/submit',
    creatorPackManifestRead: '/creator/pack-manifest',
    creatorPackManifestValidate: '/creator/pack-manifest/validate',
    creatorPackManifestApply: '/creator/pack-manifest/apply',
    creatorAssetsInspectFrames: '/creator/assets/inspect-frames',
    creatorAssetsImportFrames: '/creator/assets/import-frames',
    creatorAssetsPickFramesInspect: '/creator/assets/pick-frames/inspect',
    creatorAssetsPickFramesImport: '/creator/assets/pick-frames/import',
    creatorPetPackInspectOutput: '/creator/pet-pack/inspect-output',
    creatorPetPackImportOutput: '/creator/pet-pack/import-output',
    creatorModelSettingsRead: '/creator/model-settings',
    creatorModelHealthCheck: '/creator/model-health-check',
    creatorModelImageGenerate: '/creator/model-image-generate',
    petSay: '/pet/say',
    petAction: '/pet/action',
    petEvent: '/pet/event'
  }

  const routePermissions = new Map()
  for (const [, handlerName, permission] of matches) {
    const route = handlerToRoute[handlerName]
    if (route) routePermissions.set(route, permission)
  }
  return routePermissions
}

test('plugin bridge author docs describe the implemented bridge permissions for trigger proposals and model generation', () => {
  const routePermissions = extractRoutePermissionsFromService()
  const pluginDevelopmentDoc = readText(pluginDevelopmentDocPath)
  const pluginRulesDoc = readText(pluginRulesDocPath)

  assert.equal(
    routePermissions.get('/creator/trigger-proposals/submit'),
    'trigger-proposals:write',
    'Expected trigger proposal submit route to require trigger-proposals:write'
  )
  assert.equal(
    routePermissions.get('/creator/model-settings'),
    'model:image-generate',
    'Expected creator model settings route to require model:image-generate'
  )
  assert.equal(
    routePermissions.get('/creator/model-health-check'),
    'model:image-generate',
    'Expected creator model health-check route to require model:image-generate'
  )
  assert.equal(
    routePermissions.get('/creator/model-image-generate'),
    'model:image-generate',
    'Expected creator model image generation route to require model:image-generate'
  )

  assert.match(
    pluginDevelopmentDoc,
    /`trigger-proposals:write`[\s\S]*trigger proposal/i,
    'Expected plugin-development.md to document trigger-proposals:write for creator workflows'
  )
  assert.match(
    pluginDevelopmentDoc,
    /`model:image-generate`[\s\S]*host-managed provider flow/i,
    'Expected plugin-development.md to document model:image-generate as a host-managed provider flow'
  )
  assert.match(
    pluginRulesDoc,
    /model settings reads, health checks, and bounded image generation through `model:image-generate`/i,
    'Expected plugin-ecosystem-rules.md to tie model bridge access to model:image-generate'
  )
})
