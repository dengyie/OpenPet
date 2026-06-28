const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { pathToFileURL } = require('node:url')

let toCommandResultPreview

test.before(async () => {
  ;({ toCommandResultPreview } = await import(pathToFileURL(path.resolve(__dirname, '../../src/control-center/src/lib/plugin-command-result.mjs')).href))
})

test('toCommandResultPreview prefers structured result message and keeps output snippets', () => {
  const preview = toCommandResultPreview({
    ok: true,
    pluginId: 'weather-declaration',
    commandId: 'announce',
    exitCode: 0,
    stdout: '{"ok":true}',
    stderr: 'warmup',
    result: {
      ok: true,
      message: 'Command completed',
      petSay: 'hello'
    }
  })

  assert.deepEqual(preview, {
    pluginId: 'weather-declaration',
    commandId: 'announce',
    exitCode: 0,
    message: 'Command completed',
    stdout: '{"ok":true}',
    stderr: 'warmup',
    resultText: '{"ok":true,"message":"Command completed","petSay":"hello"}',
    details: []
  })
})

test('toCommandResultPreview summarizes Creator Studio run results', () => {
  const preview = toCommandResultPreview({
    ok: true,
    pluginId: 'openpet.creator-studio',
    commandId: 'import-approved-pet',
    exitCode: 0,
    stdout: '',
    stderr: '',
    result: {
      ok: true,
      message: 'Imported run 2026-06-19-creator-studio-pet-008',
      run: {
        runId: '2026-06-19-creator-studio-pet-008',
        status: 'imported',
        currentStep: 'imported',
        importedPackId: 'creator-studio-pet',
        artifacts: {
          outputDir: '/tmp/openpet/runs/2026-06-19-creator-studio-pet-008/outputs',
          bundle: '/tmp/openpet/runs/2026-06-19-creator-studio-pet-008/outputs/creator-studio-pet.codex-pet.zip'
        }
      },
      imported: {
        pack: {
          id: 'creator-studio-pet'
        }
      }
    }
  })

  assert.deepEqual(preview.details, [
    { label: 'Run', value: '2026-06-19-creator-studio-pet-008' },
    { label: '状态', value: 'imported' },
    { label: '步骤', value: 'imported' },
    { label: '已导入 Pack', value: 'creator-studio-pet' },
    { label: '输出目录', value: '/tmp/openpet/runs/2026-06-19-creator-studio-pet-008/outputs' },
    { label: '导出包', value: '/tmp/openpet/runs/2026-06-19-creator-studio-pet-008/outputs/creator-studio-pet.codex-pet.zip' }
  ])
})

test('toCommandResultPreview summarizes Creator Studio action import results', () => {
  const preview = toCommandResultPreview({
    ok: true,
    pluginId: 'openpet.creator-studio',
    commandId: 'import-approved-action',
    exitCode: 0,
    stdout: '',
    stderr: '',
    result: {
      ok: true,
      message: 'Imported action shy-spin from run run-demo-action-123',
      run: {
        runId: 'run-demo-action-123',
        status: 'imported',
        currentStep: 'imported',
        importedActionId: 'shy-spin',
        artifacts: {
          actionFrames: {
            framesDir: '/tmp/openpet/runs/run-demo-action-123/frames/actions/shy-spin'
          }
        }
      },
      triggerProposalSubmission: {
        ok: true,
        proposal: {
          id: 'proposal:click:shy-spin:test'
        }
      }
    }
  })

  assert.deepEqual(preview.details, [
    { label: 'Run', value: 'run-demo-action-123' },
    { label: '状态', value: 'imported' },
    { label: '步骤', value: 'imported' },
    { label: '已导入动作', value: 'shy-spin' },
    { label: '动作目录', value: '/tmp/openpet/runs/run-demo-action-123/frames/actions/shy-spin' },
    { label: '触发建议', value: '已提交 · proposal:click:shy-spin:test' }
  ])
})

test('toCommandResultPreview redacts sensitive Creator Studio trigger handoff failures', () => {
  const preview = toCommandResultPreview({
    ok: true,
    pluginId: 'openpet.creator-studio',
    commandId: 'import-approved-action',
    exitCode: 0,
    stdout: '',
    stderr: '',
    result: {
      ok: true,
      message: 'Imported action shy-spin from run run-demo-action-456',
      run: {
        runId: 'run-demo-action-456',
        status: 'imported',
        currentStep: 'imported',
        importedActionId: 'shy-spin',
        artifacts: {
          actionFrames: {
            framesDir: '/tmp/openpet/runs/run-demo-action-456/frames/actions/shy-spin'
          }
        }
      },
      triggerProposalSubmission: {
        ok: false,
        error: 'proposal write failed via OPENPET_BRIDGE_TOKEN=bridge-secret at /Users/mango/private/proposal.json from http://127.0.0.1:8787/creator/trigger-proposals/submit'
      }
    }
  })

  assert.equal(preview.details.find((detail) => detail.label === '触发建议')?.value.includes('bridge-secret'), false)
  assert.equal(preview.details.find((detail) => detail.label === '触发建议')?.value.includes('/Users/mango/private/proposal.json'), false)
  assert.equal(preview.details.find((detail) => detail.label === '触发建议')?.value.includes('127.0.0.1:8787'), false)
  assert.match(preview.details.find((detail) => detail.label === '触发建议')?.value || '', /\[redacted-token\]/i)
  assert.match(preview.details.find((detail) => detail.label === '触发建议')?.value || '', /\[redacted-path\]/i)
  assert.match(preview.details.find((detail) => detail.label === '触发建议')?.value || '', /\[redacted-local-url\]/i)
  assert.equal(preview.resultText.includes('bridge-secret'), false)
  assert.equal(preview.resultText.includes('/Users/mango/private/proposal.json'), false)
  assert.equal(preview.resultText.includes('127.0.0.1:8787'), false)
})

test('toCommandResultPreview summarizes missing Creator Studio trigger handoff records', () => {
  const preview = toCommandResultPreview({
    ok: true,
    pluginId: 'openpet.creator-studio',
    commandId: 'import-approved-action',
    exitCode: 0,
    stdout: '',
    stderr: '',
    result: {
      ok: true,
      message: 'Imported action shy-spin from run run-demo-action-789',
      run: {
        runId: 'run-demo-action-789',
        status: 'imported',
        currentStep: 'imported',
        importedActionId: 'shy-spin',
        artifacts: {
          actionFrames: {
            framesDir: '/tmp/openpet/runs/run-demo-action-789/frames/actions/shy-spin'
          }
        }
      }
    }
  })

  assert.deepEqual(preview.details, [
    { label: 'Run', value: 'run-demo-action-789' },
    { label: '状态', value: 'imported' },
    { label: '步骤', value: 'imported' },
    { label: '已导入动作', value: 'shy-spin' },
    { label: '动作目录', value: '/tmp/openpet/runs/run-demo-action-789/frames/actions/shy-spin' },
    { label: '触发建议', value: '未保存交接记录 · no trigger proposal handoff record was saved' }
  ])
})
