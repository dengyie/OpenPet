const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, '../../', relativePath), 'utf8')

test('creator pane renders the mandatory canonical identity review contract', () => {
  const source = read('src/control-center/src/panes/CreatorPane.tsx')
  assert.match(source, /awaiting_identity_review/)
  assert.match(source, /canonical-candidates/)
  assert.match(source, /creator-identity-review/)
  assert.match(source, /candidateId/)
  assert.match(source, /sha256/)
  assert.match(source, /接受此身份候选|接受 canonical identity/)
  assert.match(source, /重新生成身份候选|retryCreatorIdentity/)
})

test('creator pane renders selected, duplicate-alternate, and unusable paid identity assets with retry guidance', () => {
  const source = read('src/control-center/src/panes/CreatorPane.tsx')
  assert.match(source, /identity-generation-failed/)
  assert.match(source, /身份候选生成失败/)
  assert.match(source, /passingCandidateCount/)
  assert.match(source, /selected-anchor/)
  assert.match(source, /duplicate-alternate/)
  assert.match(source, /unusable/)
  assert.match(source, /duplicateOfCandidateId/)
  assert.match(source, /付费|已保留/)
  assert.match(source, /acceptancePending/)
  assert.match(source, /重新生成身份候选/)
  assert.match(source, /creator-retry-identity-candidates/)
})

test('creator pane exposes recovery bundle guidance for idle failure', () => {
  const source = read('src/control-center/src/panes/CreatorPane.tsx')
  assert.match(source, /recovery-required/)
  assert.match(source, /creator-export-recovery/)
  assert.match(source, /资产恢复包|恢复包/)
  assert.match(source, /保留|付费资产|坏资产/)
})

test('creator pane gives archived paid retry assets their own review surface', () => {
  const source = read('src/control-center/src/panes/CreatorPane.tsx')
  assert.match(source, /repair-archive/)
  assert.match(source, /creator-repair-assets/)
  assert.match(source, /历史重试资产|历史付费产物/)
  assert.match(source, /archivedPromptAssets/)
  assert.match(source, /查看历史提示词/)
  assert.match(source, /复制历史提示词/)
  assert.match(source, /重新生成|资产审查台/)
})

test('identity acceptance is hash-bound through shared API and IPC', () => {
  const contracts = read('src/shared/openpet-contracts.ts')
  const channels = read('src/shared/ipc-channels.js')
  const channelsTs = read('src/shared/ipc-channels.ts')
  const preload = read('control-center-preload.js')
  const ipc = read('src/main/ipc/register-creator-ipc.js')
  const hook = read('src/control-center/src/hooks/useCreatorPane.ts')
  for (const source of [contracts, channels, channelsTs, preload, ipc, hook]) {
    assert.match(source, /accept.*identity|ACCEPT_IDENTITY|acceptCreatorIdentity/i)
  }
  assert.match(contracts, /sha256: string/)
  assert.match(preload, /CREATOR_ACCEPT_IDENTITY/)
  assert.match(ipc, /acceptCreatorIdentity/)
  assert.match(hook, /acceptCreatorIdentity/)
})

test('public quality-first diagnostics expose candidates and next action without absolute paths', () => {
  const service = read('src/main/services/creator-workflow-service.js')
  assert.match(service, /canonicalCandidates/)
  assert.match(service, /nextAction/)
  assert.match(service, /candidateRecordRelativePath|relativePath/)
  assert.match(service, /awaiting_identity_review/)
  assert.match(service, /recovery-required/)
  assert.match(service, /stripPreviewDataUrlsFromValue|sanitizeProgressReason/)
})
