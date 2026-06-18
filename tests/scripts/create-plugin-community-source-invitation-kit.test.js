const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  createPluginCommunitySourceInvitationKit,
  parseArgs
} = require('../../scripts/create-plugin-community-source-invitation-kit')

test('parseArgs accepts community-source invitation options', () => {
  const options = parseArgs([
    '--target-author', 'Example Maintainer',
    '--target-url', 'https://github.com/example/openpet-plugin',
    '--candidate-context', 'Maintainer expressed interest in a desktop pet plugin.',
    '--requested-capabilities', 'weather pet-action pet-dialogue',
    '--maintainer', 'OpenPet Maintainer',
    '--output-dir', 'docs/release-evidence/plugin-community-source-invitation-kit/session-a',
    '--json'
  ])

  assert.equal(options.targetAuthor, 'Example Maintainer')
  assert.equal(options.targetUrl, 'https://github.com/example/openpet-plugin')
  assert.equal(options.candidateContext, 'Maintainer expressed interest in a desktop pet plugin.')
  assert.deepEqual(options.requestedCapabilities, ['weather', 'pet-action', 'pet-dialogue'])
  assert.equal(options.maintainer, 'OpenPet Maintainer')
  assert.equal(options.outputDir, 'docs/release-evidence/plugin-community-source-invitation-kit/session-a')
  assert.equal(options.json, true)
})

test('parseArgs rejects unsafe or empty invitation input', () => {
  assert.throws(() => parseArgs(['--target-author']), /--target-author requires a value/)
  assert.throws(() => parseArgs([]), /Target author is required/)
  assert.throws(
    () => parseArgs(['--target-author', 'Example', '--target-url', 'http://example.test/plugin']),
    /Target URL must use https:/
  )
  assert.throws(
    () => parseArgs(['--target-author', 'Example', '--requested-capabilities', 'weather,pet_action']),
    /Requested capability must use lowercase letters, numbers, and hyphens/
  )
  assert.throws(() => parseArgs(['--nope']), /Unexpected argument/)
})

test('createPluginCommunitySourceInvitationKit writes conservative invitation artifacts', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-invitation-'))
  const summary = createPluginCommunitySourceInvitationKit({
    targetAuthor: 'Example Maintainer',
    targetUrl: 'https://github.com/example/openpet-plugin',
    candidateContext: 'Maintainer expressed interest in a desktop pet plugin.',
    requestedCapabilities: ['weather', 'pet-action', 'pet-dialogue'],
    maintainer: 'OpenPet Maintainer',
    outputDir,
    now: () => new Date('2026-06-18T23:59:00.000Z')
  })

  assert.equal(summary.generatedAt, '2026-06-18T23:59:00.000Z')
  assert.equal(summary.status, 'invitation-draft-ready')
  assert.equal(summary.nextAction, 'send-invitation-and-wait-for-compatible-plugin-json-package')
  assert.equal(summary.target.author, 'Example Maintainer')
  assert.deepEqual(summary.requestedCapabilities, ['weather', 'pet-action', 'pet-dialogue'])
  assert.equal(fs.existsSync(summary.files.summary), true)
  assert.equal(fs.existsSync(summary.files.readme), true)
  assert.equal(fs.existsSync(summary.files.message), true)
  assert.equal(fs.existsSync(summary.files.checklist), true)

  const message = fs.readFileSync(summary.files.message, 'utf-8')
  assert.match(message, /OpenPet welcomes third-party extension authors/)
  assert.match(message, /weather/)
  assert.match(message, /Phase 100 intake/)
  assert.match(message, /does not approve, install, run, sign, publish, or trust/i)

  const checklist = fs.readFileSync(summary.files.checklist, 'utf-8')
  assert.match(checklist, /Invitation sent/)
  assert.match(checklist, /Compatible `plugin.json` package received/)
  assert.match(checklist, /Phase 104 discovery report updated or linked/)
})

test('createPluginCommunitySourceInvitationKit can omit target URL without claiming contact', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-community-invitation-no-url-'))
  const summary = createPluginCommunitySourceInvitationKit({
    targetAuthor: 'Example Community',
    requestedCapabilities: ['pet-dialogue'],
    outputDir,
    now: () => new Date('2026-06-19T00:01:00.000Z')
  })

  assert.equal(summary.target.url, '')
  assert.equal(summary.status, 'invitation-draft-ready')
  assert.equal(summary.contactState, 'not-sent')

  const readme = fs.readFileSync(summary.files.readme, 'utf-8')
  assert.match(readme, /This kit is a draft invitation packet/)
  assert.match(readme, /It does not prove an invitation was sent/)
})
