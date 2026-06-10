const fs = require('fs')
const path = require('path')
const { normalizePetPackManifest } = require('./schema')

const PET_MANIFEST_FILE = 'pet.json'

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
    actions: config.actions
  })

  return {
    rootPath: process.cwd(),
    manifest,
    source: {
      type: 'legacy-cat-anime'
    }
  }
}

module.exports = { PET_MANIFEST_FILE, loadPetPackFromDirectory, loadLegacyPetPack }
