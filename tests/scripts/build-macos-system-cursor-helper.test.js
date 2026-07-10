const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  buildMacosSystemCursorHelper,
  resolveSwiftTarget
} = require('../../scripts/build-macos-system-cursor-helper')

test('macOS system cursor helper build skips non-macOS hosts', () => {
  let execCalls = 0
  const result = buildMacosSystemCursorHelper({
    platform: 'linux',
    execFileSyncImpl: () => { execCalls += 1 }
  })

  assert.deepEqual(result, { built: false, skipped: true, reason: 'unsupported-platform' })
  assert.equal(execCalls, 0)
})

test('macOS system cursor helper build compiles the current architecture into build/native', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-helper-build-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sourceDir = path.join(root, 'native', 'macos-system-cursor')
  fs.mkdirSync(sourceDir, { recursive: true })
  fs.writeFileSync(path.join(sourceDir, 'OpenPetSystemCursor.swift'), 'import AppKit\n')
  const calls = []

  const result = buildMacosSystemCursorHelper({
    platform: 'darwin',
    arch: 'arm64',
    projectRoot: root,
    execFileSyncImpl: (command, args) => {
      calls.push({ command, args })
      const outputPath = args[args.indexOf('-o') + 1]
      fs.writeFileSync(outputPath, 'binary')
    }
  })

  assert.equal(result.built, true)
  assert.equal(result.skipped, false)
  assert.equal(result.outputPath, path.join(root, 'build', 'native', 'arm64', 'OpenPetSystemCursor'))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, 'xcrun')
  assert.equal(calls[0].args.includes('swiftc'), true)
  assert.equal(calls[0].args.includes('arm64-apple-macos12.0'), true)
  assert.equal(fs.statSync(result.outputPath).mode & 0o111, 0o111)
})

test('resolveSwiftTarget rejects unsupported build architectures', () => {
  assert.equal(resolveSwiftTarget('x64'), 'x86_64-apple-macos12.0')
  assert.equal(resolveSwiftTarget('arm64'), 'arm64-apple-macos12.0')
  assert.throws(() => resolveSwiftTarget('ia32'), /Unsupported macOS helper architecture/)
})

