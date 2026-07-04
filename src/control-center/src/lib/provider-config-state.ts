import type {
  AiConfigViewState,
  ImageGenerationConfigViewState
} from '../../../shared/openpet-contracts'
import {
  cloneAiConfig,
  cloneImageGenerationConfig
} from './defaults.ts'

const mergePreservedAiDraft = ({
  draftConfig,
  savedConfig
}: {
  draftConfig: AiConfigViewState
  savedConfig: AiConfigViewState
}): AiConfigViewState => cloneAiConfig({
  ...draftConfig,
  apiKeyRef: savedConfig.apiKeyRef,
  hasApiKey: savedConfig.hasApiKey,
  modelCatalog: savedConfig.modelCatalog,
  vision: {
    ...draftConfig.vision,
    apiKeyRef: savedConfig.vision.apiKeyRef,
    hasApiKey: savedConfig.vision.hasApiKey,
    modelCatalog: savedConfig.vision.modelCatalog,
    effectiveProvider: savedConfig.vision.effectiveProvider,
    effectiveBaseUrl: savedConfig.vision.effectiveBaseUrl,
    effectiveModel: savedConfig.vision.effectiveModel,
    effectiveHasApiKey: savedConfig.vision.effectiveHasApiKey
  }
})

const mergePreservedImageGenerationDraft = ({
  draftConfig,
  savedConfig
}: {
  draftConfig: ImageGenerationConfigViewState
  savedConfig: ImageGenerationConfigViewState
}): ImageGenerationConfigViewState => cloneImageGenerationConfig({
  ...draftConfig,
  apiKeyRef: savedConfig.apiKeyRef,
  hasApiKey: savedConfig.hasApiKey,
  apiKeyPreview: savedConfig.apiKeyPreview,
  apiKeyLabel: savedConfig.apiKeyLabel,
  modelCatalog: savedConfig.modelCatalog
})

export const applySavedAiConfigState = ({
  draftConfig,
  savedConfig,
  preserveDraft
}: {
  draftConfig: AiConfigViewState
  savedConfig: AiConfigViewState
  preserveDraft: boolean
}) => ({
  config: preserveDraft
    ? mergePreservedAiDraft({ draftConfig, savedConfig })
    : cloneAiConfig(savedConfig),
  activeConfig: cloneAiConfig(savedConfig)
})

export const applySavedImageGenerationConfigState = ({
  draftConfig,
  savedConfig,
  preserveDraft
}: {
  draftConfig: ImageGenerationConfigViewState
  savedConfig: ImageGenerationConfigViewState
  preserveDraft: boolean
}) => ({
  imageGenerationConfig: preserveDraft
    ? mergePreservedImageGenerationDraft({ draftConfig, savedConfig })
    : cloneImageGenerationConfig(savedConfig),
  activeImageGenerationConfig: cloneImageGenerationConfig(savedConfig)
})
