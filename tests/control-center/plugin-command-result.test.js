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
