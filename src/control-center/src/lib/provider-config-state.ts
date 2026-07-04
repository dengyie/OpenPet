import type {
  AiConfigViewState,
  ImageGenerationConfigViewState
} from '../../../shared/openpet-contracts'

export const applySavedAiConfigState = ({
  draftConfig,
  savedConfig,
  preserveDraft
}: {
  draftConfig: AiConfigViewState
  savedConfig: AiConfigViewState
  preserveDraft: boolean
}) => ({
  config: preserveDraft ? draftConfig : savedConfig,
  activeConfig: savedConfig
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
  imageGenerationConfig: preserveDraft ? draftConfig : savedConfig,
  activeImageGenerationConfig: savedConfig
})
