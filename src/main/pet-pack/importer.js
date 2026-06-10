const { normalizePetPackManifest } = require('./schema')

const createPetPackManifestFromActions = ({ id, displayName, version, defaultAction, clickAction, actions }) => {
  return normalizePetPackManifest({
    id,
    displayName,
    version,
    defaultAction,
    clickAction,
    actions
  })
}

module.exports = { createPetPackManifestFromActions }
