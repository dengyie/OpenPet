const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const workflowPath = path.join(__dirname, '../../.github/workflows/release.yml')

const readWorkflow = () => fs.readFileSync(workflowPath, 'utf-8')

const lineIndex = (lines, pattern) => {
  const index = lines.findIndex((line) => pattern.test(line))
  assert.notEqual(index, -1, `Expected workflow to contain ${pattern}`)
  return index
}

const sectionBetween = (lines, startPattern, endPattern) => {
  const start = lineIndex(lines, startPattern)
  const end = lineIndex(lines.slice(start + 1), endPattern) + start + 1
  assert.ok(end > start, `Expected ${endPattern} after ${startPattern}`)
  return lines.slice(start, end)
}

test('macOS release workflow creates and uploads release evidence', () => {
  const workflow = readWorkflow()
  const lines = workflow.split(/\r?\n/)
  const createEvidenceIndex = lineIndex(lines, /name: Create macOS release evidence/)
  const publishAssetsIndex = lineIndex(lines, /name: Publish GitHub Release assets/)
  const uploadEvidenceIndex = lineIndex(lines, /name: Upload macOS release evidence/)

  assert.ok(createEvidenceIndex < publishAssetsIndex, 'macOS evidence should be created before release asset publishing')
  assert.ok(createEvidenceIndex < uploadEvidenceIndex, 'macOS evidence should be uploaded after it is created')
  assert.ok(uploadEvidenceIndex < publishAssetsIndex, 'macOS evidence should be uploaded before public release publishing can fail')
  assert.match(workflow, /npm run create-macos-release-evidence -- --app "\$app_path"/)
  assert.match(workflow, /--skip-codesign --skip-spctl/)
  assert.match(workflow, /release\/macos-release-evidence/)
  assert.match(workflow, /openpet-macos-release-evidence-\$\{\{ steps\.release\.outputs\.tag \}\}/)
})

test('macOS release evidence is not published as a user-facing release asset', () => {
  const lines = readWorkflow().split(/\r?\n/)
  const publishSection = sectionBetween(
    lines,
    /name: Publish GitHub Release assets/,
    /name: Upload artifacts/
  ).join('\n')

  assert.match(publishSection, /release\/\*\.dmg/)
  assert.match(publishSection, /release\/latest-mac\.yml/)
  assert.doesNotMatch(publishSection, /macos-release-evidence/)
})
