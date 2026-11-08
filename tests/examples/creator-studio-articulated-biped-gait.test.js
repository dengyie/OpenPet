const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')
const { renderArticulatedBipedGait } = require('../../examples/plugins/creator-studio/lib/articulated-biped-gait')

const fixture = async (t) => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-gait-contact-'))
  t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }))
  const sourceBytes = await sharp(Buffer.from('<svg width="300" height="340"><ellipse cx="150" cy="150" rx="88" ry="112" fill="#ffe45d" stroke="#42250d" stroke-width="7"/><ellipse cx="100" cy="283" rx="25" ry="14" fill="#ff9447" stroke="#42250d" stroke-width="7"/><ellipse cx="204" cy="273" rx="25" ry="14" fill="#ff9447" stroke="#42250d" stroke-width="7"/><circle cx="186" cy="100" r="10" fill="#42250d"/><path d="M224 125 L250 139 L225 150Z" fill="#ff9447" stroke="#42250d" stroke-width="6"/></svg>')).png().toBuffer()
  return { outputDir, sourceBytes }
}
const bottomPixel = async (file) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let bottom = -1
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] >= 128) bottom = y
  }
  return bottom
}

for (const motionScale of [1, 0.85]) test(`articulated support feet stay grounded and flight clears the ground at intensity ${motionScale}`, async (t) => {
  const result = await renderArticulatedBipedGait({ ...await fixture(t), motionScale })
  const grounded = await Promise.all([0, 1, 2, 4, 5, 6].map(index => bottomPixel(result.framePaths[index])))
  assert.ok(Math.max(...grounded) - Math.min(...grounded) <= 1, `support feet slide vertically: ${grounded}`)
  for (const index of [3, 7]) assert.ok(await bottomPixel(result.framePaths[index]) < Math.min(...grounded) - 8, 'flight must visibly clear the ground')
})

for (const motionScale of [1, 0.85]) test(`passing and flight legs stay separated with connected equal bones at intensity ${motionScale}`, async (t) => {
  const result = await renderArticulatedBipedGait({ ...await fixture(t), motionScale })
  for (const index of [2, 6]) {
    const { legs } = result.transforms[index]
    assert.ok(Math.abs(legs[0].x - legs[1].x) >= 60 * motionScale, 'passing feet overlap horizontally')
    assert.ok(Math.abs(legs[0].bottomY - legs[1].bottomY) >= 24 * motionScale, 'swing foot must clear the planted support')
  }
  for (const index of [3, 7]) {
    const bottoms = result.transforms[index].legs.map(leg => leg.bottomY)
    assert.ok(Math.max(...bottoms) - Math.min(...bottoms) >= 24 * motionScale, 'flight rear heel must be visibly folded above the reaching foot')
  }
  for (const frame of result.transforms) for (const leg of frame.legs) {
    assert.ok(leg.joints, 'rendered joints must be recorded for audit')
    const { hip, knee, ankle } = leg.joints
    const upper = Math.hypot(knee.x - hip.x, knee.y - hip.y)
    const lower = Math.hypot(ankle.x - knee.x, ankle.y - knee.y)
    assert.ok(Math.abs(upper - lower) < 0.001, `bone lengths differ: ${upper}/${lower}`)
  }
})
