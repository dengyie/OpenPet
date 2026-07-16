const {
  DEFAULT_HUMAN_EXAMPLES_PATH,
  createQualityGuidanceSummary,
  loadHumanQualityExamples
} = require('./pet-generation-human-examples')
const {
  createQualityProfileEvidence,
  loadQualityProfile
} = require('./pet-generation-quality-profile')

const normalizeText = (value) => String(value || '').trim()

const loadPetGenerationGovernance = ({ env = process.env } = {}) => {
  const humanRegistry = loadHumanQualityExamples({
    registryPath: normalizeText(env.OPENPET_PET_HUMAN_EXAMPLES_PATH) || DEFAULT_HUMAN_EXAMPLES_PATH
  })
  const qualityProfile = loadQualityProfile({
    profilePath: normalizeText(env.OPENPET_PET_QUALITY_PROFILE_PATH),
    humanRegistry
  })
  return Object.freeze({
    humanRegistry,
    qualityProfile,
    qualityGuidance: createQualityGuidanceSummary(humanRegistry),
    evidence: Object.freeze({
      datasetId: humanRegistry.datasetId,
      exampleCount: humanRegistry.examples.length,
      qualityProfile: createQualityProfileEvidence(qualityProfile)
    })
  })
}

module.exports = {
  loadPetGenerationGovernance
}
