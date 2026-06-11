const fs = require('fs')
const path = require('path')
const { normalizePetPackManifest } = require('./schema')

const PET_MANIFEST_FILE = 'pet.json'
const LEGACY_DEFAULT_FRAME_COUNT = 1
const LEGACY_DEFAULT_FRAME_MS = 100
const LEGACY_DEFAULT_FRAME_SIZE = 1

const withLegacyActionDefaults = (action = {}) => ({
  ...action,
  frameCount: action.frameCount || LEGACY_DEFAULT_FRAME_COUNT,
  frameMs: action.frameMs || LEGACY_DEFAULT_FRAME_MS,
  frameWidth: action.frameWidth || LEGACY_DEFAULT_FRAME_SIZE,
  frameHeight: action.frameHeight || LEGACY_DEFAULT_FRAME_SIZE
})

const loadPetPackFromDirectory = (rootPath) => {
  const manifestPath = path.join(rootPath, PET_MANIFEST_FILE)
  const manifest = normalizePetPackManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')))
  return {
    rootPath,
    manifest,
    source: {
      type: 'directory',
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
    actions: Array.isArray(config.actions) ? config.actions.map(withLegacyActionDefaults) : []
  })

  return {
    rootPath: process.cwd(),
    manifest,
    source: {
      type: 'legacy-cat-anime'
    }
  }
}

module.exports = { PET_MANIFEST_FILE, loadPetPackFromDirectory, loadLegacyPetPack, withLegacyActionDefaults }
