const fs = require('fs')
const path = require('path')
const { isCodexPetManifest, normalizeCodexPetManifest } = require('./codex-pet')
const { normalizePetPackManifest } = require('./schema')

const PET_MANIFEST_FILE = 'pet.json'
const LEGACY_DEFAULT_FRAME_COUNT = 1
const LEGACY_DEFAULT_FRAME_MS = 100
const LEGACY_DEFAULT_FRAME_SIZE = 1
const LEGACY_ANIMATIONS_PATH = path.join(__dirname, '..', '..', '..', 'cat_anime', 'animations.json')

const withLegacyActionDefaults = (action = {}) => ({
  ...action,
  frameCount: action.frameCount || LEGACY_DEFAULT_FRAME_COUNT,
  frameMs: action.frameMs || LEGACY_DEFAULT_FRAME_MS,
  frameWidth: action.frameWidth || LEGACY_DEFAULT_FRAME_SIZE,
  frameHeight: action.frameHeight || LEGACY_DEFAULT_FRAME_SIZE
})

const loadPetPackFromDirectory = (rootPath) => {
  const manifestPath = path.join(rootPath, PET_MANIFEST_FILE)
  const rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  const isCodexPet = isCodexPetManifest(rawManifest)
  const manifest = isCodexPet
    ? normalizeCodexPetManifest(rawManifest, { rootPath })
    : normalizePetPackManifest(rawManifest)
  return {
    rootPath,
    manifest,
    source: {
      type: isCodexPet ? 'codex-pet' : 'directory',
      path: rootPath
    }
  }
}

const loadLegacyPetPack = ({ id = 'legacy-cat', displayName = 'Legacy Cat', getPetAnimations }) => {
  const config = getPetAnimations()
  const manifest = normalizePetPackManifest({
    id,
    displayName,
    defaultAction: config.defaultAction,
    clickAction: config.clickAction,
    actions: Array.isArray(config.actions) ? config.actions.map(withLegacyActionDefaults) : [],
    ...(Array.isArray(config.triggerProposalInbox) ? { triggerProposalInbox: config.triggerProposalInbox } : {}),
    ...(Array.isArray(config.triggerRules) ? { triggerRules: config.triggerRules } : {})
  })

  return {
    rootPath: process.cwd(),
    manifest,
    source: {
      type: 'legacy-cat-anime'
    }
  }
}

const getLegacyPetAnimations = ({ configPath = LEGACY_ANIMATIONS_PATH } = {}) => {
  try {
    if (!fs.existsSync(configPath)) {
      return { defaultAction: '', clickAction: '', actions: [] }
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return {
      defaultAction: config.defaultAction || '',
      clickAction: config.clickAction || '',
      actions: Array.isArray(config.actions) ? config.actions : [],
      ...(Array.isArray(config.triggerProposalInbox) ? { triggerProposalInbox: config.triggerProposalInbox } : {}),
      ...(Array.isArray(config.triggerRules) ? { triggerRules: config.triggerRules } : {})
    }
  } catch (error) {
    console.error('Failed to load legacy animations config:', error)
    return { defaultAction: '', clickAction: '', actions: [] }
  }
}

module.exports = {
  LEGACY_ANIMATIONS_PATH,
  PET_MANIFEST_FILE,
  getLegacyPetAnimations,
  loadPetPackFromDirectory,
  loadLegacyPetPack,
  withLegacyActionDefaults
}
