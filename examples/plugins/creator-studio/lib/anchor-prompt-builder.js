const { sanitizeCreativeBrief } = require('./openpet-prompt-builder')
const { getActionSheetLayout, normalizeFrameCount } = require('./action-sheet-layout')
const {
  buildActionFramePlan,
  getKeyframePoseInstruction,
  inferAnimationType,
  isWavingAction,
  resolvePrimaryAnimatedPart
} = require('./action-semantics')

const PROMPT_BUILDER_VERSION = 2

const normalizeActionText = (value, fallback = '') => sanitizeCreativeBrief(value || fallback)

const formatList = (items, fallback) => {
  const values = Array.isArray(items)
    ? items.map((item) => sanitizeCreativeBrief(item)).filter(Boolean)
    : []
  return (values.length ? values : fallback).map((item) => `- ${item}`).join('\n')
}

const buildKeyframeContractLines = ({ action, frameCount }) => {
  return buildActionFramePlan({ action, frameCount })
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
      'Species lock: keep the same species, animal type, or object category visible in the source image. If the source is a cat, output the same cat; never output a dog, corgi, fox, mascot, or different animal.',
      'Accessory lock: Do not add a collar, scarf, bell, bow, tag, clothing, jewelry, prop, or outfit element unless it is clearly visible in the source image or explicitly requested by the user.',
      'Do not redesign, simplify, replace, cartoonify, change species, change outfit, or invent a different pet unless the user explicitly requested that transformation.',
      '',
      'Output contract:',
      'Create one full-body centered pet source image.',
      'Use a neutral front-facing identity pose by default, with the pet standing or sitting naturally and all identity features visible.',
      'When the reference board contains Front, Side, Back, Sitting, Standing, Paw Up, Running, Stretching, or other labeled panels, the front and sitting identity views are the identity authority.',
      'Do not choose action pose panels such as paw up, waving, running, stretching, walking, lying down, or crouched/loaf as the canonical character anchor unless the user explicitly requested that exact base pose.',
      'Use a clean transparent-friendly cutout with 8-12% safe padding.',
      'No sprite sheet, no model sheet, no poster, no collage, no multi-pose image, no text, no watermark, no props, no scene background, no floor, no cast shadow.',
      '',
      brief ? `User pet description: ${brief}.` : 'User pet description: none.'
    ].join('\n')
  }
}

const buildActionSpriteRowPrompt = ({
  characterBrief = '',
  referenceRole = 'keyframe-action-reference-board',
  action = {}
} = {}) => {
  const actionId = normalizeActionText(action.actionId, 'action')
  const actionName = normalizeActionText(action.name, actionId)
  const motionPrompt = normalizeActionText(action.motionPrompt, actionName)
  const animationType = inferAnimationType(action)
  const frameCount = normalizeFrameCount(action.frameCount || 6)
  const layout = getActionSheetLayout(frameCount)
  const brief = sanitizeCreativeBrief(characterBrief)
  const movingPart = resolvePrimaryAnimatedPart(action)
  return {
    role: 'action-sprite-row',
    version: PROMPT_BUILDER_VERSION,
    actionId,
    frameCount,
    warnings: [],
    prompt: [
      'Create a complete transparent-background OpenPet sprite sheet for one action.',
      `Reference role: ${sanitizeCreativeBrief(referenceRole)}.`,
      'The original user source image is the highest identity authority.',
      'If the written description conflicts with the reference image, follow the reference image.',
      'Use one single local conditioning board as the only image input for this final sprite-sheet request.',
      'This single conditioning board is the only reference image for the final provider call.',
      'The conditioning board is guidance only, not deliverable output.',
      'The conditioning board uses a fixed template: user source main view as highest identity authority, normalized start keyframe, normalized peak keyframe, clear whitespace, safe padding, and a shared lower-center root anchor.',
      'The provider-generated start keyframe and peak/end keyframe appear inside that single conditioning board.',
      'The normalized start keyframe and normalized peak keyframe are provider-generated keyframes and must be treated as motion timing anchors.',
      'Read the user source main view as identity authority and read the normalized start keyframe and normalized peak keyframe as motion timing anchors.',
      'Generate the missing in-between frames with the image model; do not copy keyframes as repeated static cells.',
      'Do not copy reference labels, presentation panels, captions, borders, or background into the output.',
      'Do not copy the conditioning board itself, and do not reinterpret it as a pseudo sprite sheet or model sheet.',
      '',
      `Action ID: ${actionId}`,
      `Action name: ${actionName}`,
      `Motion intent: ${motionPrompt}`,
      `Animation type: ${animationType}`,
      brief ? `User pet description: ${brief}.` : '',
      '',
      'Sprite sheet contract:',
      `Generate exactly ${frameCount} animation frames.`,
      `Arrange the frames in exactly ${layout.columns} columns x ${layout.rows} rows.`,
      'Arrange clean equal-sized cells in reading order from left to right, top to bottom.',
      'Keep all unused grid cells completely empty and transparent.',
      'Put one full-body pet per cell with transparent background and safe padding.',
      'No text, no labels, no borders, no props, no scene background, no floor, no cast shadow, no watermark.',
      '',
      'Identity and anchor lock:',
      'Keep the same character identity, face, eyes, markings, fur or material texture, accessories, proportions, silhouette, lighting, rendering medium, and source visual style as the original user source image.',
      animationType === 'vertical_bounce'
        ? 'Keep the horizontal root, body scale, camera angle, and identity stable while the body follows the planned vertical jump arc and returns to the starting baseline.'
        : 'Keep the body, head, torso, feet/base, and lower-center root anchored in the same position across every frame.',
      animationType === 'locomotion_loop'
        ? 'The complete locomotion cycle must visibly move and reverse the legs, arms, wings, tail, or equivalent locomotion parts; color or texture changes alone are not motion.'
        : `Only the ${movingPart} should move noticeably unless the action explicitly requires whole-body motion.`,
      'Use smooth animation spacing and keep scale, camera angle, outline, and lighting consistent.',
      '',
      'Required keyframes:',
      ...buildKeyframeContractLines({ action, frameCount }),
      '',
      'Animated parts:',
      formatList(action.animatedParts, [movingPart]),
      '',
      'Locked parts:',
      formatList(action.lockedParts, ['head', 'torso', 'feet/base', 'face', 'identity markings']),
      '',
      'Negative prompt: different character, changed species, dog, corgi, fox, mascot, changed face, changed eyes, changed markings, changed proportions, new, extra, changed, or missing collar or other source accessory, changed clothing or jewelry, extra limbs, missing limbs, copied reference board, copied pseudo sprite sheet, copied placeholder repetitions, one large portrait, smaller duplicate beneath portrait, labels, panel borders, sprite sheet grid labels, props, scene background, floor, shadows, watermark, motion blur.'
    ].filter(Boolean).join('\n')
  }
}

const buildActionKeyframePrompt = ({
  characterBrief = '',
  referenceRole = 'source-identity-reference',
  action = {},
  keyframeRole = 'start'
} = {}) => {
  const actionId = normalizeActionText(action.actionId, 'action')
  const actionName = normalizeActionText(action.name, actionId)
  const motionPrompt = normalizeActionText(action.motionPrompt, actionName)
  const brief = sanitizeCreativeBrief(characterBrief)
  const movingPart = resolvePrimaryAnimatedPart(action)
  const animationType = inferAnimationType(action)
  const role = normalizeActionText(keyframeRole, 'start')
  const isStart = /start|first|neutral/i.test(role)
  return {
    role: 'action-keyframe',
    version: PROMPT_BUILDER_VERSION,
    actionId,
    keyframeRole: isStart ? 'start' : 'peak',
    warnings: [],
    prompt: [
      'Create exactly one provider-generated OpenPet action keyframe image.',
      `Reference role: ${sanitizeCreativeBrief(referenceRole)}.`,
      'The original user source image is the highest identity authority.',
      'If the written description conflicts with the reference image, follow the reference image.',
      '',
      `Action ID: ${actionId}`,
      `Action name: ${actionName}`,
      `Motion intent: ${motionPrompt}`,
      `Animation type: ${animationType}`,
      brief ? `User pet description: ${brief}.` : '',
      '',
      isStart
        ? 'Keyframe role: START FRAME. Create the neutral first frame before the action begins.'
        : `Keyframe role: PEAK/END FRAME. Create the clearest action extreme: ${movingPart} reaches the requested motion pose.`,
      getKeyframePoseInstruction({ action, keyframeRole: role }),
      '',
      'Output contract:',
      'One full-body pet only, centered with safe padding.',
      'Transparent-friendly clean cutout; no grid, no sprite sheet, no model sheet, no text, no labels, no border, no props, no scene background, no floor, no shadow.',
      'Keep the same face, eyes, markings, fur or material texture, proportions, silhouette, lighting, rendering medium, and source visual style.',
      '',
      'Negative prompt: different character, changed species, changed face, changed eye color, changed markings, changed proportions, extra limbs, missing limbs, cropped character, text, labels, borders, sprite sheet, model sheet, background scene, floor, shadow, watermark.'
    ].filter(Boolean).join('\n')
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
  const animationType = inferAnimationType(action)
  const brief = sanitizeCreativeBrief(characterBrief)
  return {
    role: 'action-anchor',
    version: PROMPT_BUILDER_VERSION,
    actionId,
    warnings: [],
    prompt: [
      'Create one action anchor view for OpenPet.',
      `Reference role: ${sanitizeCreativeBrief(referenceRole)}.`,
      'The original user source image is the highest identity authority.',
      'If the written description conflicts with the reference image, follow the reference image.',
      'If the reference input is a stitched board, read it as one quality-control board: source identity panels define the pet, action or pose panels are motion guidance only, and any generated intermediate anchor is secondary.',
      '',
      `Action ID: ${actionId}`,
      `Action name: ${actionName}`,
      `Motion intent: ${motionPrompt}`,
      `Animation type: ${animationType}`,
      brief ? `User pet description: ${brief}.` : '',
      '',
      'Identity and style lock:',
      'Keep the same character identity, face, eyes, markings, fur or material texture, accessories, proportions, silhouette, lighting, rendering medium, and source visual style as the original user source image.',
      'Do not average, simplify, recolor, or reinterpret the pet from an intermediate generated anchor if that would conflict with the original source.',
      'Keep the same species, animal type, or object category; if the reference character is a cat, keep it as the same cat.',
      'Do not redesign the pet, add a new outfit, change species, add props, add scene elements, or change camera angle.',
      'Do not add a collar, scarf, bell, bow, tag, clothing, jewelry, prop, or outfit element unless it is already visible in the reference or explicitly requested by the user.',
      '',
      'Action anchor contract:',
      'Show clear action key-pose guidance, not a final sprite sheet.',
      'Keep a stable lower-center root and unchanged body scale.',
      'Keep the moving parts clearly separated enough to guide provider sprite-row generation.',
      'For stationary actions, body, head, feet/base, and face remain locked while only the target limb changes.',
      'For a waving or paw-up action, use a single raised front paw while keeping the other paw, body, head, face, eyes, feet/base, and tail identity stable.',
      '',
      'Animated parts:',
      formatList(action.animatedParts, ['the requested moving part']),
      '',
      'Locked parts:',
      formatList(action.lockedParts, ['head', 'torso', 'feet/base', 'face', 'identity markings']),
      '',
      'Negative prompt: different character, changed species, dog, corgi, fox, mascot, changed face, changed eyes, changed markings, changed proportions, new, extra, changed, or missing collar or other source accessory, changed clothing or jewelry, extra limbs, missing limbs, props, scene background, floor, shadows, text, labels, watermark, motion blur, sprite sheet grid.'
    ].filter(Boolean).join('\n')
  }
}

module.exports = {
  buildActionAnchorPrompt,
  buildActionKeyframePrompt,
  buildActionSpriteRowPrompt,
  buildCharacterAnchorPrompt
}
