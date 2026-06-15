const { getLegacyPetAnimations, loadLegacyPetPack } = require('../pet-pack/loader')
const path = require('path')
const { pathToFileURL } = require('url')

const emptyConfig = {
  defaultAction: '',
  clickAction: '',
  actions: []
}

const emptyPetPack = {
  rootPath: '',
  manifest: {
    schemaVersion: 1,
    id: 'empty',
    displayName: 'Empty',
    version: '1.0.0',
    ...emptyConfig
  },
  source: {
    type: 'empty'
  }
}

const createActionService = ({ petPackService, loadPetPack, loadLegacyAnimations = getLegacyPetAnimations, projectRoot = path.join(__dirname, '..', '..', '..') }) => {
  let cachedPetPack = null

  const getPetPack = () => {
    if (cachedPetPack) return cachedPetPack
    try {
      if (loadPetPack) {
        cachedPetPack = loadPetPack()
        return cachedPetPack
      }
      if (petPackService) {
        cachedPetPack = petPackService.getActivePetPack()
        return cachedPetPack
      }
      cachedPetPack = {
        ...loadLegacyPetPack({
          id: 'legacy-cat',
          displayName: 'Legacy Cat',
          getPetAnimations: loadLegacyAnimations
        }),
        rootPath: projectRoot
      }
      return cachedPetPack
    } catch (error) {
      console.error('Failed to load pet pack:', error)
    }
    return emptyPetPack
  }

  const getConfig = () => {
    const petPack = getPetPack()
    const config = petPack.manifest || emptyConfig
    const spriteRoot = petPack.rootPath || projectRoot
    return {
      defaultAction: config.defaultAction || '',
      clickAction: config.clickAction || '',
      actions: Array.isArray(config.actions) ? config.actions.map((action) => ({
        ...action,
        sprite: action.sprite
          ? pathToFileURL(path.join(spriteRoot, action.sprite)).toString()
          : ''
      })) : []
    }
  }

  const listActions = () => getConfig().actions

  const getAction = (actionId) => listActions().find((action) => action.id === actionId) || null

  const getPreviewConfig = () => {
    const config = getConfig()
    return {
      ...config,
      actions: config.actions.map((action) => ({
        ...action,
        previewSprite: action.sprite || ''
      }))
    }
  }

  const reload = () => {
    cachedPetPack = null
    return getConfig()
  }

  return { getPetPack, getConfig, getPreviewConfig, listActions, getAction, reload }
}

module.exports = { createActionService }
