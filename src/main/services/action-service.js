const { loadLegacyPetPack } = require('../pet-pack/loader')

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

const createActionService = ({ getPetAnimations, loadPetPack }) => {
  const getPetPack = () => {
    try {
      if (loadPetPack) return loadPetPack()
      if (getPetAnimations) {
        return loadLegacyPetPack({
          id: 'legacy-cat',
          displayName: 'Legacy Cat',
          getPetAnimations
        })
      }
    } catch (error) {
      console.error('Failed to load pet pack:', error)
    }
    return emptyPetPack
  }

  const getConfig = () => {
    const config = getPetPack().manifest || emptyConfig
    return {
      defaultAction: config.defaultAction || '',
      clickAction: config.clickAction || '',
      actions: Array.isArray(config.actions) ? config.actions : []
    }
  }

  const listActions = () => getConfig().actions

  const getAction = (actionId) => listActions().find((action) => action.id === actionId) || null

  return { getPetPack, getConfig, listActions, getAction }
}

module.exports = { createActionService }
