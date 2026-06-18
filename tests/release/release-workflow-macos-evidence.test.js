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

test('macOS release workflow skips signing gates and release evidence while paused', () => {
  const workflow = readWorkflow()
  const lines = workflow.split(/\r?\n/)
  const buildIndex = lineIndex(lines, /name: Build unsigned macOS test distribution/)
  const publishAssetsIndex = lineIndex(lines, /name: Publish GitHub Release assets/)

  assert.ok(buildIndex < publishAssetsIndex, 'unsigned macOS test artifacts should be built before release asset publishing')
  assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY: false/)
  assert.doesNotMatch(workflow, /name: Inspect signing secrets/)
  assert.doesNotMatch(workflow, /name: Build signed distribution/)
  assert.doesNotMatch(workflow, /name: Create macOS release evidence/)
  assert.doesNotMatch(workflow, /name: Upload macOS release evidence/)
  assert.doesNotMatch(workflow, /APPLE_ID/)
  assert.doesNotMatch(workflow, /openpet-macos-release-evidence/)
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

test('Windows release workflow builds unsigned test assets without smoke evidence upload', () => {
  const workflow = readWorkflow()
  const lines = workflow.split(/\r?\n/)
  const buildIndex = lineIndex(lines, /name: Build unsigned Windows test distribution/)
  const markUnsignedIndex = lineIndex(lines, /name: Mark unsigned Windows test assets/)
  const publishAssetsIndex = lineIndex(lines.slice(markUnsignedIndex + 1), /name: Publish GitHub Release assets/) + markUnsignedIndex + 1

  assert.ok(buildIndex < markUnsignedIndex, 'Windows artifacts should be built before unsigned labeling')
  assert.ok(markUnsignedIndex < publishAssetsIndex, 'Windows artifacts should be labeled before release upload')
  assert.match(workflow, /npm run prepare-windows-release-assets/)
  assert.doesNotMatch(workflow, /WINDOWS_CSC_LINK/)
  assert.doesNotMatch(workflow, /WINDOWS_CSC_KEY_PASSWORD/)
  assert.doesNotMatch(workflow, /name: Inspect Windows signing secrets/)
  assert.doesNotMatch(workflow, /name: Create pending Windows smoke report/)
  assert.doesNotMatch(workflow, /windows-smoke-evidence-/)
})
