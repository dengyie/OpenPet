const { sanitizeCreativeBrief } = require('./openpet-prompt-builder')

const PROMPT_BUILDER_VERSION = 1

const normalizeActionText = (value, fallback = '') => sanitizeCreativeBrief(value || fallback)

const formatList = (items, fallback) => {
  const values = Array.isArray(items)
    ? items.map((item) => sanitizeCreativeBrief(item)).filter(Boolean)
    : []
  return (values.length ? values : fallback).map((item) => `- ${item}`).join('\n')
}

const buildCharacterAnchorPrompt = ({ characterBrief = '', referenceRole = 'composite-reference-board' } = {}) => {
  const brief = sanitizeCreativeBrief(characterBrief)
  return {
    role: 'character-anchor',
    version: PROMPT_BUILDER_VERSION,
    warnings: [],
    prompt: [
      'Create one character anchor view for OpenPet.',
      `Reference role: ${sanitizeCreativeBrief(referenceRole)}.`,
      'The source image is the highest identity authority.',
      'If the written description conflicts with the reference image, follow the reference image.',
      'Use the reference board for identity and pose guidance only; do not copy the board layout, text, labels, panels, borders, or background into the output.',
      '',
      'Identity lock:',
      'Preserve the exact visible pet identity from the reference image.',
      'Preserve character type, face shape, eyes, eye shape, eye color, markings, fur or material texture, accessories, body proportions, head-to-body ratio, silhouette, lighting, rendering medium, and source visual style.',
      'Do not redesign, simplify, replace, cartoonify, change species, change outfit, or invent a different pet unless the user explicitly requested that transformation.',
      '',
      'Output contract:',
      'Create one full-body centered pet source image.',
      'Use a clean transparent-friendly cutout with 8-12% safe padding.',
      'No sprite sheet, no model sheet, no poster, no collage, no multi-pose image, no text, no watermark, no props, no scene background, no floor, no cast shadow.',
      '',
      brief ? `User pet description: ${brief}.` : 'User pet description: none.'
    ].join('\n')
  }
}

const buildActionAnchorPrompt = ({
  characterBrief = '',
  referenceRole = 'character-anchor',
  action = {}
} = {}) => {
  const actionId = normalizeActionText(action.actionId, 'action')
  const actionName = normalizeActionText(action.name, actionId)
  const motionPrompt = normalizeActionText(action.motionPrompt, actionName)
  const animationType = normalizeActionText(action.animationType, 'stationary_loop')
  const brief = sanitizeCreativeBrief(characterBrief)
  return {
    role: 'action-anchor',
    version: PROMPT_BUILDER_VERSION,
    actionId,
    warnings: [],
    prompt: [
      'Create one action anchor view for OpenPet.',
      `Reference role: ${sanitizeCreativeBrief(referenceRole)}.`,
      'The source image is the highest identity authority.',
      'If the written description conflicts with the reference image, follow the reference image.',
      '',
      `Action ID: ${actionId}`,
      `Action name: ${actionName}`,
      `Motion intent: ${motionPrompt}`,
      `Animation type: ${animationType}`,
      brief ? `User pet description: ${brief}.` : '',
      '',
      'Identity and style lock:',
      'Keep the same character identity, face, eyes, markings, fur or material texture, accessories, proportions, silhouette, lighting, rendering medium, and source visual style as the character anchor.',
      'Do not redesign the pet, add a new outfit, change species, add props, add scene elements, or change camera angle.',
      '',
      'Action anchor contract:',
      'Show clear action key-pose guidance, not a final sprite sheet.',
      'Keep a stable lower-center root and unchanged body scale.',
      'Keep the moving parts clearly separated enough for OpenPet local synthesis or row generation.',
      'For stationary actions, body, head, feet/base, and face remain locked while only the target limb changes.',
      '',
      'Animated parts:',
      formatList(action.animatedParts, ['the requested moving part']),
      '',
      'Locked parts:',
      formatList(action.lockedParts, ['head', 'torso', 'feet/base', 'face', 'identity markings']),
      '',
      'Negative prompt: different character, changed face, changed eyes, changed markings, changed proportions, extra limbs, missing limbs, props, scene background, floor, shadows, text, labels, watermark, motion blur, sprite sheet grid.'
    ].filter(Boolean).join('\n')
  }
}

module.exports = {
  buildActionAnchorPrompt,
  buildCharacterAnchorPrompt
}
