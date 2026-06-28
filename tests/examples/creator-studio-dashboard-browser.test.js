const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('@playwright/test')
const sharp = require('sharp')

const { createCreatorStudioServer } = require('../../examples/plugins/creator-studio/service/studio-service')
const { createMinimalWebp } = require('../../examples/plugins/creator-studio/lib/fake-hatch-pet')
const { createRun, readRun, updateRunStatus, writeRun } = require('../../examples/plugins/creator-studio/lib/run-store')

const openDashboardServer = async (dataDir) => {
  const dashboardPath = path.join(__dirname, '../../examples/plugins/creator-studio/web/dashboard/index.html')
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server
}

const openDashboardPage = async (server) => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  return { browser, page }
}

const waitForGeneratedOutput = async (page, outputLabel) => {
  await page.waitForFunction((expectedStatus) => {
    const statusText = document.querySelector('#status-line')?.textContent || ''
    const approveButton = document.querySelector('#approve-button')
    return statusText.includes(expectedStatus) && approveButton && !approveButton.disabled
  }, `Generated ${outputLabel} output`)
}

const writeSolidPng = async (targetPath, { width, height, background }) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background
    }
  }).png().toFile(targetPath)
}

const seedImportedActionRun = async (dataDir) => {
  const run = createRun({
    dataDir,
    input: {
      prompt: '新增一个自定义动作：害羞转圈，点击后轻轻转一圈。',
      originalPrompt: '新增一个自定义动作：害羞转圈，点击后轻轻转一圈。',
      backend: 'local',
      generationTask: {
        mode: 'single-action',
        actions: [{
          actionId: 'shy-spin',
          name: '害羞转圈',
          motionPrompt: '先缩起来，再轻轻转一圈。',
          loop: false,
          frameCount: 1,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }]
      }
    },
    now: () => '2026-06-27T01:00:00.000Z'
  })
  const runDir = path.join(dataDir, 'runs', run.runId)
  const framesDir = path.join(runDir, 'frames', 'actions', 'shy-spin')
  const qaDir = path.join(runDir, 'qa')
  const baseDir = path.join(runDir, 'frames', 'base')
  await writeSolidPng(path.join(framesDir, '0001.png'), {
    width: 192,
    height: 208,
    background: { r: 255, g: 182, b: 145, alpha: 1 }
  })
  await writeSolidPng(path.join(qaDir, 'action-frame-contact-sheet.png'), {
    width: 192,
    height: 208,
    background: { r: 255, g: 220, b: 205, alpha: 1 }
  })
  await writeSolidPng(path.join(baseDir, '0001.png'), {
    width: 512,
    height: 512,
    background: { r: 250, g: 200, b: 160, alpha: 1 }
  })
  fs.writeFileSync(path.join(qaDir, 'action-frame-validation.json'), `${JSON.stringify({
    ok: true,
    loop: false,
    warnings: [],
    playback: {
      frameDurationsMs: [160]
    }
  }, null, 2)}\n`)
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'imported',
    patch: {
      taskStatus: 'confirmed',
      currentStep: 'imported',
      reviewStatus: 'approved',
      importStatus: 'imported',
      importedActionId: 'shy-spin',
      triggerProposalSubmission: {
        ok: true,
        proposal: {
          id: 'proposal:click:shy-spin:dashboard'
        }
      },
      artifacts: {
        generatedImage: {
          ok: true,
          backend: 'local',
          model: 'local-custom-sprite-v2',
          generatedAt: '2026-06-27T01:01:00.000Z',
          outputs: [{
            dataRelativePath: `runs/${run.runId}/frames/base/0001.png`,
            mimeType: 'image/png',
            sha256: 'dashboard-imported-action-sha'
          }]
        },
        actionFrames: {
          actionId: 'shy-spin',
          name: '害羞转圈',
          framesDir,
          qa: path.join(qaDir, 'action-frame-validation.json'),
          contactSheet: path.join(qaDir, 'action-frame-contact-sheet.png'),
          frameCount: 1,
          frameWidth: 192,
          frameHeight: 208,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }
      }
    },
    now: () => '2026-06-27T01:02:00.000Z'
  })
  return run
}

const seedLegacyImportedActionRunWithoutTask = async (dataDir) => {
  const run = await seedImportedActionRun(dataDir)
  const persisted = readRun({ dataDir, runId: run.runId })
  const { generationTask: _generationTask, ...legacyImportedRun } = persisted
  writeRun({
    dataDir,
    run: {
      ...legacyImportedRun,
      taskStatus: 'not_started',
      currentStep: 'imported'
    }
  })
  return run
}

const seedImportedFailedActionRun = async (dataDir) => {
  const run = createRun({
    dataDir,
    input: {
      prompt: '新增一个自定义动作：害羞转圈，点击后轻轻转一圈。',
      originalPrompt: '新增一个自定义动作：害羞转圈，点击后轻轻转一圈。',
      backend: 'local',
      generationTask: {
        mode: 'single-action',
        actions: [{
          actionId: 'shy-spin',
          name: '害羞转圈',
          motionPrompt: '先缩起来，再轻轻转一圈。',
          loop: false,
          frameCount: 1,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }]
      }
    },
    now: () => '2026-06-27T01:05:00.000Z'
  })
  const runDir = path.join(dataDir, 'runs', run.runId)
  const framesDir = path.join(runDir, 'frames', 'actions', 'shy-spin')
  const qaDir = path.join(runDir, 'qa')
  const baseDir = path.join(runDir, 'frames', 'base')
  await writeSolidPng(path.join(framesDir, '0001.png'), {
    width: 192,
    height: 208,
    background: { r: 240, g: 180, b: 150, alpha: 1 }
  })
  await writeSolidPng(path.join(qaDir, 'action-frame-contact-sheet.png'), {
    width: 192,
    height: 208,
    background: { r: 255, g: 230, b: 215, alpha: 1 }
  })
  await writeSolidPng(path.join(baseDir, '0001.png'), {
    width: 512,
    height: 512,
    background: { r: 240, g: 205, b: 170, alpha: 1 }
  })
  fs.writeFileSync(path.join(qaDir, 'action-frame-validation.json'), `${JSON.stringify({
    ok: true,
    loop: false,
    warnings: [],
    playback: {
      frameDurationsMs: [160]
    }
  }, null, 2)}\n`)
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'imported',
    patch: {
      taskStatus: 'confirmed',
      currentStep: 'imported',
      reviewStatus: 'approved',
      importStatus: 'imported',
      importedActionId: 'shy-spin',
      triggerProposalSubmission: {
        ok: false,
        error: 'proposal write failed via OPENPET_BRIDGE_TOKEN=bridge-secret at /Users/mango/private/proposal.json from http://127.0.0.1:8787/creator/trigger-proposals/submit'
      },
      artifacts: {
        generatedImage: {
          ok: true,
          backend: 'local',
          model: 'local-custom-sprite-v2',
          generatedAt: '2026-06-27T01:06:00.000Z',
          outputs: [{
            dataRelativePath: `runs/${run.runId}/frames/base/0001.png`,
            mimeType: 'image/png',
            sha256: 'dashboard-imported-failed-action-sha'
          }]
        },
        actionFrames: {
          actionId: 'shy-spin',
          name: '害羞转圈',
          framesDir,
          qa: path.join(qaDir, 'action-frame-validation.json'),
          contactSheet: path.join(qaDir, 'action-frame-contact-sheet.png'),
          frameCount: 1,
          frameWidth: 192,
          frameHeight: 208,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }
      }
    },
    now: () => '2026-06-27T01:07:00.000Z'
  })
  return run
}

const seedBlockedActionReviewRun = async (dataDir) => {
  const run = createRun({
    dataDir,
    input: {
      prompt: '新增一个自定义动作：害羞转圈，点击后轻轻转一圈。',
      originalPrompt: '新增一个自定义动作：害羞转圈，点击后轻轻转一圈。',
      backend: 'local',
      generationTask: {
        mode: 'single-action',
        actions: [{
          actionId: 'shy-spin',
          name: '害羞转圈',
          motionPrompt: '先缩起来，再轻轻转一圈。',
          loop: false,
          frameCount: 1,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }]
      }
    },
    now: () => '2026-06-28T01:20:00.000Z'
  })
  const runDir = path.join(dataDir, 'runs', run.runId)
  const framesDir = path.join(runDir, 'frames', 'actions', 'shy-spin')
  const qaDir = path.join(runDir, 'qa')
  const baseDir = path.join(runDir, 'frames', 'base')
  await writeSolidPng(path.join(framesDir, '0001.png'), {
    width: 192,
    height: 208,
    background: { r: 248, g: 185, b: 150, alpha: 1 }
  })
  await writeSolidPng(path.join(qaDir, 'action-frame-contact-sheet.png'), {
    width: 192,
    height: 208,
    background: { r: 255, g: 228, b: 210, alpha: 1 }
  })
  await writeSolidPng(path.join(baseDir, '0001.png'), {
    width: 512,
    height: 512,
    background: { r: 242, g: 198, b: 162, alpha: 1 }
  })
  fs.writeFileSync(path.join(qaDir, 'action-frame-validation.json'), `${JSON.stringify({
    ok: false,
    actionId: 'shy-spin',
    frameCount: 1,
    frameWidth: 192,
    frameHeight: 208,
    frames: [{
      fileName: '0001.png',
      width: 192,
      height: 208,
      visiblePixels: 0
    }],
    warnings: ['Frame 0001.png has no visible pixels.'],
    playback: {
      frameDurationsMs: [160]
    },
    repairs: [{
      fileName: '0001.png',
      reason: 'Visible pixels dropped to zero after regeneration.'
    }],
    contactSheetRelativePath: `runs/${run.runId}/qa/action-frame-contact-sheet.png`
  }, null, 2)}\n`)
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'ready_for_review',
    patch: {
      taskStatus: 'confirmed',
      currentStep: 'review',
      reviewStatus: 'pending',
      artifacts: {
        generatedImage: {
          ok: true,
          backend: 'local',
          model: 'local-custom-sprite-v2',
          generatedAt: '2026-06-28T01:21:00.000Z',
          outputs: [{
            dataRelativePath: `runs/${run.runId}/frames/base/0001.png`,
            mimeType: 'image/png',
            sha256: 'dashboard-blocked-action-sha'
          }]
        },
        actionFrames: {
          actionId: 'shy-spin',
          name: '害羞转圈',
          framesDir,
          qa: path.join(qaDir, 'action-frame-validation.json'),
          contactSheet: path.join(qaDir, 'action-frame-contact-sheet.png'),
          frameCount: 1,
          frameWidth: 192,
          frameHeight: 208,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }
      }
    },
    now: () => '2026-06-28T01:21:30.000Z'
  })
  return run
}

const seedImportedFullPetRun = async (dataDir) => {
  const run = createRun({
    dataDir,
    input: {
      petName: 'Imported Review Cat',
      petId: 'imported-review-cat',
      prompt: '生成一只完整的新桌宠。',
      originalPrompt: '生成一只完整的新桌宠。',
      backend: 'cloud',
      generationTask: {
        mode: 'full-pet',
        targetPet: 'new',
        styleSource: 'textOnly',
        characterBrief: '一只已经导入完成、等待最终复核的桌宠。',
        actions: [{
          actionId: 'idle',
          name: 'Idle',
          motionPrompt: 'soft breathing and a tiny tail sway',
          loop: true,
          frameCount: 12,
          triggerProposal: { type: 'state', binding: 'idle' }
        }]
      }
    },
    now: () => '2026-06-27T01:10:00.000Z'
  })
  const runDir = path.join(dataDir, 'runs', run.runId)
  const outputDir = path.join(runDir, 'outputs')
  const qaDir = path.join(runDir, 'qa')
  const baseDir = path.join(runDir, 'frames', 'base')
  await writeSolidPng(path.join(baseDir, '0001.png'), {
    width: 1024,
    height: 1024,
    background: { r: 255, g: 194, b: 120, alpha: 1 }
  })
  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'spritesheet.webp'), createMinimalWebp())
  fs.writeFileSync(path.join(outputDir, 'pet.json'), `${JSON.stringify({
    id: 'imported-review-cat',
    displayName: 'Imported Review Cat',
    spritesheetPath: 'spritesheet.webp'
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(qaDir, 'atlas-validation.json'), `${JSON.stringify({
    ok: true,
    width: 1536,
    height: 1872,
    visiblePixels: 8200,
    warnings: []
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(qaDir, 'source-image-validation.json'), `${JSON.stringify({
    ok: true,
    sourceRelativePath: `runs/${run.runId}/frames/base/0001.png`,
    width: 1024,
    height: 1024,
    visiblePixels: 6400,
    warnings: []
  }, null, 2)}\n`)
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'imported',
    patch: {
      taskStatus: 'confirmed',
      currentStep: 'imported',
      reviewStatus: 'approved',
      importStatus: 'imported',
      importedPackId: 'imported-review-cat',
      activatedPackId: 'imported-review-cat',
      artifacts: {
        outputDir,
        petJson: path.join(outputDir, 'pet.json'),
        spritesheet: path.join(outputDir, 'spritesheet.webp'),
        qa: path.join(qaDir, 'atlas-validation.json'),
        sourceImageQa: path.join(qaDir, 'source-image-validation.json'),
        generatedImage: {
          ok: true,
          backend: 'cloud',
          model: 'gpt-image-2',
          generatedAt: '2026-06-27T01:11:00.000Z',
          outputs: [{
            dataRelativePath: `runs/${run.runId}/frames/base/0001.png`,
            mimeType: 'image/png',
            sha256: 'dashboard-imported-full-pet-sha'
          }]
        }
      }
    },
    now: () => '2026-06-27T01:12:00.000Z'
  })
  return run
}

const seedLegacyImportedFullPetRunWithoutTask = async (dataDir) => {
  const run = await seedImportedFullPetRun(dataDir)
  const persisted = readRun({ dataDir, runId: run.runId })
  const { generationTask: _generationTask, ...legacyImportedRun } = persisted
  writeRun({
    dataDir,
    run: {
      ...legacyImportedRun,
      taskStatus: 'not_started',
      currentStep: 'imported'
    }
  })
  return run
}

const seedImportedFullPetRunWithSourceMismatch = async (dataDir) => {
  const run = await seedImportedFullPetRun(dataDir)
  const runDir = path.join(dataDir, 'runs', run.runId)
  const baseDir = path.join(runDir, 'frames', 'base')
  const qaDir = path.join(runDir, 'qa')

  await writeSolidPng(path.join(baseDir, '0002.png'), {
    width: 1024,
    height: 1024,
    background: { r: 120, g: 194, b: 255, alpha: 1 }
  })

  fs.writeFileSync(path.join(qaDir, 'source-image-validation.json'), `${JSON.stringify({
    ok: true,
    sourceRelativePath: `runs/${run.runId}/frames/base/0002.png`,
    width: 1024,
    height: 1024,
    visiblePixels: 6400,
    warnings: []
  }, null, 2)}\n`)

  return run
}

const seedImportedActionRunWithoutTriggerSubmission = async (dataDir) => {
  const run = createRun({
    dataDir,
    input: {
      prompt: 'Imported action without recorded trigger proposal submission.',
      originalPrompt: 'Imported action without recorded trigger proposal submission.',
      backend: 'provider',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        actions: [{
          actionId: 'missing-trigger-record',
          name: 'Missing Trigger Record',
          motionPrompt: 'wave once',
          loop: false,
          frameCount: 1,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }]
      }
    },
    now: () => '2026-06-27T01:13:00.000Z'
  })
  const runDir = path.join(dataDir, 'runs', run.runId)
  const framesDir = path.join(runDir, 'frames', 'actions', 'missing-trigger-record')
  const qaDir = path.join(runDir, 'qa')
  const baseDir = path.join(runDir, 'frames', 'base')
  await writeSolidPng(path.join(framesDir, '0001.png'), {
    width: 192,
    height: 208,
    background: { r: 222, g: 185, b: 150, alpha: 1 }
  })
  await writeSolidPng(path.join(qaDir, 'action-frame-contact-sheet.png'), {
    width: 192,
    height: 208,
    background: { r: 255, g: 234, b: 214, alpha: 1 }
  })
  await writeSolidPng(path.join(baseDir, '0001.png'), {
    width: 512,
    height: 512,
    background: { r: 244, g: 206, b: 170, alpha: 1 }
  })
  fs.writeFileSync(path.join(qaDir, 'action-frame-validation.json'), `${JSON.stringify({
    ok: true,
    loop: false,
    warnings: [],
    playback: {
      frameDurationsMs: [160]
    }
  }, null, 2)}\n`)
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'imported',
    patch: {
      taskStatus: 'confirmed',
      currentStep: 'imported',
      reviewStatus: 'approved',
      importStatus: 'imported',
      importedActionId: 'missing-trigger-record',
      artifacts: {
        generatedImage: {
          ok: true,
          backend: 'provider',
          model: 'gpt-image-2',
          generatedAt: '2026-06-27T01:14:00.000Z',
          outputs: [{
            dataRelativePath: `runs/${run.runId}/frames/base/0001.png`,
            mimeType: 'image/png',
            sha256: 'dashboard-imported-missing-trigger-record-sha'
          }]
        },
        actionFrames: {
          actionId: 'missing-trigger-record',
          name: 'Missing Trigger Record',
          framesDir,
          qa: path.join(qaDir, 'action-frame-validation.json'),
          contactSheet: path.join(qaDir, 'action-frame-contact-sheet.png'),
          frameCount: 1,
          frameWidth: 192,
          frameHeight: 208,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }
      }
    },
    now: () => '2026-06-27T01:15:00.000Z'
  })
  return run
}

const seedLegacyFailedRunWithoutTask = (dataDir) => {
  const run = createRun({
    dataDir,
    input: {
      prompt: 'Legacy failed provider run should allow retry.',
      originalPrompt: 'Legacy failed provider run should allow retry.',
      backend: 'cloud',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        actions: [{
          actionId: 'legacy-failed-retry',
          name: 'Legacy Failed Retry',
          motionPrompt: 'placeholder',
          loop: false,
          frameCount: 12,
          triggerProposal: { type: 'manual' }
        }]
      }
    },
    now: () => '2026-06-28T09:30:00.000Z'
  })
  const failedRun = updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'failed',
    patch: {
      taskStatus: 'confirmed',
      currentStep: 'generate',
      reviewStatus: 'pending',
      importStatus: 'not-imported',
      backendStatus: {
        backend: 'provider',
        state: 'failed',
        message: 'Provider queue overloaded',
        updatedAt: '2026-06-28T09:31:00.000Z'
      },
      recovery: {
        canRetryGeneration: true,
        backend: {
          backend: 'provider',
          state: 'failed'
        },
        failureKind: 'provider',
        failureReason: 'Provider queue overloaded',
        guidance: 'Review the provider failure details, then retry generation on this same run when the backend is ready.',
        qaFocus: 'No QA artifacts were produced before the generation failure.'
      },
      error: 'Provider queue overloaded'
    },
    now: () => '2026-06-28T09:31:00.000Z'
  })
  const { generationTask: _generationTask, ...legacyFailedRun } = failedRun
  writeRun({
    dataDir,
    run: {
      ...legacyFailedRun,
      backend: 'cloud',
      input: {
        ...failedRun.input,
        backend: 'cloud'
      }
    }
  })
  return run
}

const seedLegacyReadyForReviewActionRunWithoutTask = async (dataDir) => {
  const run = await seedImportedActionRun(dataDir)
  const qaPath = path.join(dataDir, 'runs', run.runId, 'qa', 'action-frame-validation.json')
  fs.writeFileSync(qaPath, `${JSON.stringify({
    ok: true,
    actionId: 'shy-spin',
    frameCount: 1,
    frameWidth: 192,
    frameHeight: 208,
    frames: [{
      fileName: '0001.png',
      width: 192,
      height: 208,
      visiblePixels: 3200
    }],
    warnings: [],
    repairs: [],
    playback: {
      frameDurationsMs: [160]
    }
  }, null, 2)}\n`)
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'ready_for_review',
    patch: {
      taskStatus: 'confirmed',
      currentStep: 'review',
      reviewStatus: 'pending',
      importStatus: 'not-imported',
      triggerProposalSubmission: undefined,
      importedActionId: ''
    },
    now: () => '2026-06-28T09:40:00.000Z'
  })
  const persisted = readRun({ dataDir, runId: run.runId })
  const { generationTask: _generationTask, ...legacyReviewRun } = persisted
  writeRun({
    dataDir,
    run: {
      ...legacyReviewRun,
      input: {
        ...persisted.input,
        backend: 'local'
      }
    }
  })
  return run
}

test('creator studio dashboard drives a single-action fixture run to the host import handoff', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-'))
  const dashboardPath = path.join(__dirname, '../../examples/plugins/creator-studio/web/dashboard/index.html')
  const server = createCreatorStudioServer({ dataDir, dashboardPath })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(`http://127.0.0.1:${port}`)
    await page.locator('#prompt-input').fill('新增一个自定义动作：原地打滚，动作要循环。')
    await page.locator('#draft-button').click()

    await page.waitForSelector('[data-answer=\"manual\"]')
    assert.match(await page.locator('#next-step-panel').textContent(), /Answer follow-up/i)

    await page.locator('[data-answer=\"manual\"]').click()
    await page.waitForFunction(() => !document.querySelector('#confirm-button').disabled)
    assert.match(await page.locator('#task-preview').textContent(), /原地打滚/i)

    await page.locator('#confirm-button').click()
    await page.waitForFunction(() => (
      /Task confirmed/.test(document.querySelector('#status-line')?.textContent || '') &&
      !document.querySelector('#generate-button')?.disabled
    ))
    assert.match(await page.locator('#status-line').textContent(), /Task confirmed/i)

    await page.locator('#generate-button').click()
    await waitForGeneratedOutput(page, 'action')
    assert.match(await page.locator('#action-review-panel').textContent(), /Review status/i)
    assert.match(await page.locator('#import-handoff-panel').textContent(), /Review the generated frames, repair any bad frame, then approve the action/i)

    await page.locator('#approve-button').click()
    await page.waitForFunction(() => /Run approved/.test(document.querySelector('#status-line').textContent))

    const handoffText = await page.locator('#import-handoff-panel').textContent()
    const workflowGuidanceText = await page.locator('#workflow-guidance-panel').textContent()
    const actionLaneText = await page.locator('#action-lane-panel').textContent()
    assert.match(await page.locator('#status-line').textContent(), /import-approved-action/i)
    assert.match(handoffText, /Import Approved Action/i)
    assert.match(handoffText, /Control Center -> Plugins/i)
    assert.match(handoffText, /Command ID: import-approved-action/i)
    assert.match(handoffText, /Continue in Control Center at Control Center -> Plugins\./i)
    assert.match(workflowGuidanceText, /Import state: ready \/ Command: import-approved-action/i)
    assert.match(workflowGuidanceText, /Run Import Approved Action from Control Center -> Plugins/i)
    assert.match(workflowGuidanceText, /Continue in Control Center at Control Center -> Plugins\./i)
    assert.match(actionLaneText, /Host-owned action: Import Approved Action/i)
    assert.match(actionLaneText, /Location: Control Center -> Plugins/i)
    assert.match(actionLaneText, /Continue in Control Center at Control Center -> Plugins\./i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard drives a full-pet fixture run to the host import handoff', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-full-pet-'))
  const server = await openDashboardServer(dataDir)
  const port = server.address().port
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.goto(`http://127.0.0.1:${port}`)
    await page.locator('#prompt-input').fill('生成一只完整的新桌宠，要软乎乎的橘猫风格，包含 idle 动作。')
    await page.locator('#draft-button').click()

    await page.waitForFunction(() => !document.querySelector('#confirm-button').disabled)
    assert.match(await page.locator('#task-preview').textContent(), /Character brief/i)
    assert.match(await page.locator('#trigger-panel').textContent(), /Trigger plan/i)

    await page.locator('#confirm-button').click()
    await page.waitForFunction(() => !document.querySelector('#generate-button').disabled)
    assert.match(await page.locator('#status-line').textContent(), /Task confirmed/i)

    await page.locator('#generate-button').click()
    await waitForGeneratedOutput(page, 'pet-pack')
    assert.match(await page.locator('#status-line').textContent(), /Generated pet-pack output/i)
    assert.match(await page.locator('#full-pet-review-panel').textContent(), /Atlas QA/i)
    assert.match(await page.locator('#import-handoff-panel').textContent(), /Review the generated pet-pack output and approve the run before host-owned pet import/i)

    await page.locator('#approve-button').click()
    await page.waitForFunction(() => /Run approved/.test(document.querySelector('#status-line').textContent))

    const handoffText = await page.locator('#import-handoff-panel').textContent()
    const nextStepText = await page.locator('#next-step-panel').textContent()
    const workflowGuidanceText = await page.locator('#workflow-guidance-panel').textContent()
    const actionLaneText = await page.locator('#action-lane-panel').textContent()
    assert.match(await page.locator('#status-line').textContent(), /import-approved-pet/i)
    assert.match(handoffText, /Import Approved Pet/i)
    assert.match(handoffText, /Control Center -> Plugins/i)
    assert.match(handoffText, /Command ID: import-approved-pet/i)
    assert.match(handoffText, /Payload JSON:/i)
    assert.match(handoffText, /"runId":"[^"]+"/i)
    assert.match(handoffText, /Continue in Control Center at Control Center -> Plugins\./i)
    assert.match(nextStepText, /Import Approved Pet/i)
    assert.match(nextStepText, /Continue in Control Center at Control Center -> Plugins\./i)
    assert.match(workflowGuidanceText, /Import state: ready \/ Command: import-approved-pet/i)
    assert.match(workflowGuidanceText, /Run Import Approved Pet from Control Center -> Plugins/i)
    assert.match(workflowGuidanceText, /Continue in Control Center at Control Center -> Plugins\./i)
    assert.match(actionLaneText, /Host-owned action: Import Approved Pet/i)
    assert.match(actionLaneText, /Location: Control Center -> Plugins/i)
    assert.match(actionLaneText, /Continue in Control Center at Control Center -> Plugins\./i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard keeps generated status when secondary run-list refresh fails', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-refresh-failure-'))
  const server = await openDashboardServer(dataDir)
  const port = server.address().port
  const { browser, page } = await openDashboardPage(server)
  let failRunListRefresh = false
  let failedRunListRefreshes = 0

  await page.route('**/api/runs', async (route) => {
    if (failRunListRefresh && route.request().method() === 'GET' && route.request().url().endsWith('/api/runs')) {
      failedRunListRefreshes += 1
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Run list unavailable' })
      })
      return
    }
    await route.continue()
  })

  try {
    await page.goto(`http://127.0.0.1:${port}`)
    await page.locator('#prompt-input').fill('新增一个自定义动作：原地打滚，动作要循环。')
    await page.locator('#draft-button').click()

    await page.waitForSelector('[data-answer="manual"]')
    await page.locator('[data-answer="manual"]').click()
    await page.waitForFunction(() => !document.querySelector('#confirm-button').disabled)

    await page.locator('#confirm-button').click()
    await page.waitForFunction(() => (
      /Task confirmed/.test(document.querySelector('#status-line')?.textContent || '') &&
      !document.querySelector('#generate-button')?.disabled
    ))

    failRunListRefresh = true
    await page.locator('#generate-button').click()
    await waitForGeneratedOutput(page, 'action')
    await new Promise((resolve) => setTimeout(resolve, 50))

    assert.equal(failedRunListRefreshes, 1)
    assert.match(await page.locator('#status-line').textContent(), /Generated action output/i)
    assert.doesNotMatch(await page.locator('#status-line').textContent(), /Run list unavailable/i)
    assert.match(await page.locator('#action-review-panel').textContent(), /Review status/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard surfaces blocked single-action qa before approval', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-blocked-action-'))
  const run = await seedBlockedActionReviewRun(dataDir)
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.waitForFunction(() => document.querySelector('#run-select')?.value?.length > 0)
    await page.locator('#run-select').selectOption(run.runId)
    await page.waitForFunction((expectedRunId) => document.querySelector('#run-select')?.value === expectedRunId, run.runId)

    const reviewText = await page.locator('#action-review-panel').textContent()
    assert.match(reviewText, /QA blocked/i)
    assert.match(reviewText, /Repair or regenerate frames before approval/i)
    assert.match(reviewText, /Frame 0001\.png has no visible pixels/i)
    assert.match(reviewText, /Invalid frames: 1/i)
    assert.match(reviewText, /Repairs logged: 1/i)

    const nextStepText = await page.locator('#next-step-panel').textContent()
    assert.doesNotMatch(nextStepText, /Approve run/i)
    assert.match(nextStepText, /Review and repair frames/i)
    assert.match(nextStepText, /repair buttons in the frame review panel/i)

    const actionLaneText = await page.locator('#action-lane-panel').textContent()
    assert.match(actionLaneText, /Dashboard action: Review and repair frames/i)
    assert.match(actionLaneText, /repair buttons in the frame review panel/i)
    assert.match(actionLaneText, /not directly available from a dashboard button right now/i)

    const checkpointText = await page.locator('#review-checkpoint-panel').textContent()
    assert.match(checkpointText, /Review and repair frames/i)
    assert.match(checkpointText, /Owner: workflow/i)
    assert.match(checkpointText, /Location: Creator Studio/i)
    assert.match(checkpointText, /Review: blocked \/ Import: review-required/i)
    assert.match(checkpointText, /Available in dashboard: no/i)
    assert.match(checkpointText, /Requires host-owned action: no/i)
    assert.match(checkpointText, /Blocked reason: Repair or regenerate frames before approval/i)

    assert.equal(await page.locator('#approve-button').isDisabled(), true)

    const handoffText = await page.locator('#import-handoff-panel').textContent()
    assert.match(handoffText, /QA blocked/i)
    assert.match(handoffText, /repair the bad frames or regenerate the action before approval/i)

    const workflowGuidanceText = await page.locator('#workflow-guidance-panel').textContent()
    assert.match(workflowGuidanceText, /Import state: review-required/i)
    assert.match(workflowGuidanceText, /Review status: blocked/i)
    assert.match(workflowGuidanceText, /Next review action: Review and repair frames -> Creator Studio/i)
    assert.match(workflowGuidanceText, /Blocked reason: Repair or regenerate frames before approval/i)
    assert.match(workflowGuidanceText, /Repair or regenerate frames before approval/i)
    assert.doesNotMatch(workflowGuidanceText, /Review QA and approve the run before host-owned action import/i)

    const snapshotText = await page.locator('#review-snapshot-panel').textContent()
    assert.match(snapshotText, /Snapshot v1/i)
    assert.match(snapshotText, /Review gate: blocked \/ Review status: blocked/i)
    assert.match(snapshotText, /Import: review-required \/ Command: import-approved-action/i)
    assert.match(snapshotText, /Owner: workflow \/ Location: Creator Studio/i)
    assert.match(snapshotText, /Available in dashboard: no \/ Host action: no/i)
    assert.match(snapshotText, /Trigger handoff: not-attempted/i)
    assert.match(snapshotText, /Blocked reason: Repair or regenerate frames before approval/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard shows imported action review completion details', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-imported-action-'))
  await seedImportedActionRun(dataDir)
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.waitForFunction(() => document.querySelector('#run-select')?.value?.length > 0)

    const handoffText = await page.locator('#import-handoff-panel').textContent()
    assert.match(handoffText, /Imported result details/i)
    assert.match(handoffText, /Review location: Actions -> Trigger Proposal Inbox/i)
    assert.match(handoffText, /Follow-up: Review trigger proposal/i)
    assert.match(handoffText, /The action import is complete\. Review the submitted trigger proposal/i)
    assert.match(handoffText, /Continue in Control Center at Actions -> Trigger Proposal Inbox\./i)

    const workflowGuidanceText = await page.locator('#workflow-guidance-panel').textContent()
    assert.match(workflowGuidanceText, /Follow-up: Review trigger proposal/i)
    assert.match(workflowGuidanceText, /Review status: complete/i)
    assert.match(workflowGuidanceText, /Next review action: Review trigger proposal -> Actions -> Trigger Proposal Inbox/i)
    assert.match(workflowGuidanceText, /Actions -> Trigger Proposal Inbox/i)
    assert.match(workflowGuidanceText, /Continue in Control Center at Actions -> Trigger Proposal Inbox\./i)

    const reviewText = await page.locator('#action-review-panel').textContent()
    assert.match(reviewText, /Import completed/i)
    assert.match(reviewText, /Imported action: shy-spin/i)
    assert.match(reviewText, /Actions -> Trigger Proposal Inbox/i)
    assert.match(reviewText, /Follow-up: Review trigger proposal/i)
    assert.match(reviewText, /The action import is complete\. Review the submitted trigger proposal/i)
    assert.match(reviewText, /Continue in Control Center at Actions -> Trigger Proposal Inbox\./i)
    assert.doesNotMatch(reviewText, /QA blocked/i)
    assert.doesNotMatch(reviewText, /Repair or regenerate frames before approval/i)
    assert.doesNotMatch(reviewText, /Repair/i)

    const nextStepText = await page.locator('#next-step-panel').textContent()
    assert.match(nextStepText, /Review trigger proposal/i)
    assert.match(nextStepText, /Actions -> Trigger Proposal Inbox/i)
    assert.match(nextStepText, /Continue in Control Center at Actions -> Trigger Proposal Inbox\./i)

    const actionLaneText = await page.locator('#action-lane-panel').textContent()
    assert.match(actionLaneText, /Host-owned action: Review trigger proposal/i)
    assert.match(actionLaneText, /Actions -> Trigger Proposal Inbox/i)

    const checkpointText = await page.locator('#review-checkpoint-panel').textContent()
    assert.match(checkpointText, /Review trigger proposal/i)
    assert.match(checkpointText, /Owner: host/i)
    assert.match(checkpointText, /Location: Actions -> Trigger Proposal Inbox/i)
    assert.match(checkpointText, /Review: complete \/ Import: imported/i)
    assert.match(checkpointText, /Requires host-owned action: yes/i)
    assert.match(checkpointText, /Imported: yes/i)

    const snapshotText = await page.locator('#review-snapshot-panel').textContent()
    assert.match(snapshotText, /Snapshot v1/i)
    assert.match(snapshotText, /Review gate: complete \/ Review status: complete/i)
    assert.match(snapshotText, /Import: imported \/ Command: import-approved-action/i)
    assert.match(snapshotText, /Owner: host \/ Location: Actions -> Trigger Proposal Inbox/i)
    assert.match(snapshotText, /Available in dashboard: no \/ Host action: yes/i)
    assert.match(snapshotText, /Trigger handoff: submitted/i)
    assert.match(snapshotText, /Imported: yes/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard preserves imported action follow-up for legacy runs without generationTask', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-imported-action-legacy-pre-task-'))
  await seedLegacyImportedActionRunWithoutTask(dataDir)
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.waitForFunction(() => document.querySelector('#run-select')?.value?.length > 0)

    const handoffText = await page.locator('#import-handoff-panel').textContent()
    const reviewText = await page.locator('#action-review-panel').textContent()
    assert.match(handoffText, /Imported result details/i)
    assert.doesNotMatch(handoffText, /Generate and approve a run to unlock host-owned import\./i)
    assert.match(reviewText, /Import completed/i)
    assert.match(reviewText, /Actions -> Trigger Proposal Inbox/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard shows imported action handoff failure details', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-imported-action-failed-'))
  await seedImportedFailedActionRun(dataDir)
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.waitForFunction(() => document.querySelector('#run-select')?.value?.length > 0)

    const handoffText = await page.locator('#import-handoff-panel').textContent()
    assert.match(handoffText, /Imported result details/i)
    assert.match(handoffText, /Review location: Control Center -> Plugins/i)
    assert.match(handoffText, /Follow-up: Review import handoff/i)
    assert.match(handoffText, /proposal write failed/i)
    assert.match(handoffText, /\[redacted-token\]/i)
    assert.match(handoffText, /\[redacted-path\]/i)
    assert.match(handoffText, /\[redacted-local-url\]/i)
    assert.match(handoffText, /Continue in Control Center at Control Center -> Plugins\./i)
    assert.equal(handoffText.includes('bridge-secret'), false)
    assert.equal(handoffText.includes('/Users/mango/private/proposal.json'), false)
    assert.equal(handoffText.includes('127.0.0.1:8787'), false)

    const workflowGuidanceText = await page.locator('#workflow-guidance-panel').textContent()
    assert.match(workflowGuidanceText, /Follow-up: Review import handoff/i)
    assert.match(workflowGuidanceText, /Review status: complete/i)
    assert.match(workflowGuidanceText, /Next review action: Review import handoff -> Control Center -> Plugins/i)
    assert.match(workflowGuidanceText, /Control Center -> Plugins/i)
    assert.match(workflowGuidanceText, /proposal write failed/i)
    assert.match(workflowGuidanceText, /\[redacted-token\]/i)
    assert.match(workflowGuidanceText, /\[redacted-path\]/i)
    assert.match(workflowGuidanceText, /\[redacted-local-url\]/i)
    assert.match(workflowGuidanceText, /Continue in Control Center at Control Center -> Plugins\./i)
    assert.equal(workflowGuidanceText.includes('bridge-secret'), false)
    assert.equal(workflowGuidanceText.includes('/Users/mango/private/proposal.json'), false)
    assert.equal(workflowGuidanceText.includes('127.0.0.1:8787'), false)

    const reviewText = await page.locator('#action-review-panel').textContent()
    assert.match(reviewText, /Import completed/i)
    assert.match(reviewText, /Imported action: shy-spin/i)
    assert.match(reviewText, /Control Center -> Plugins/i)
    assert.match(reviewText, /Follow-up: Review import handoff/i)
    assert.match(reviewText, /proposal write failed/i)
    assert.match(reviewText, /\[redacted-token\]/i)
    assert.match(reviewText, /\[redacted-path\]/i)
    assert.match(reviewText, /\[redacted-local-url\]/i)
    assert.match(reviewText, /Continue in Control Center at Control Center -> Plugins\./i)
    assert.doesNotMatch(reviewText, /QA blocked/i)
    assert.doesNotMatch(reviewText, /Repair or regenerate frames before approval/i)
    assert.doesNotMatch(reviewText, /Repair/i)
    assert.equal(reviewText.includes('bridge-secret'), false)
    assert.equal(reviewText.includes('/Users/mango/private/proposal.json'), false)
    assert.equal(reviewText.includes('127.0.0.1:8787'), false)

    const nextStepText = await page.locator('#next-step-panel').textContent()
    assert.match(nextStepText, /Review import handoff/i)
    assert.match(nextStepText, /Control Center -> Plugins/i)
    assert.match(nextStepText, /Continue in Control Center at Control Center -> Plugins\./i)
    assert.match(nextStepText, /proposal write failed/i)
    assert.match(nextStepText, /\[redacted-token\]/i)
    assert.match(nextStepText, /\[redacted-path\]/i)
    assert.match(nextStepText, /\[redacted-local-url\]/i)
    assert.equal(nextStepText.includes('bridge-secret'), false)
    assert.equal(nextStepText.includes('/Users/mango/private/proposal.json'), false)
    assert.equal(nextStepText.includes('127.0.0.1:8787'), false)

    const actionLaneText = await page.locator('#action-lane-panel').textContent()
    assert.match(actionLaneText, /Host-owned action: Review import handoff/i)
    assert.match(actionLaneText, /Location: Control Center -> Plugins/i)
    assert.match(actionLaneText, /Continue in Control Center at Control Center -> Plugins\./i)
    assert.match(actionLaneText, /proposal write failed/i)
    assert.match(actionLaneText, /\[redacted-token\]/i)
    assert.match(actionLaneText, /\[redacted-path\]/i)
    assert.match(actionLaneText, /\[redacted-local-url\]/i)
    assert.equal(actionLaneText.includes('bridge-secret'), false)
    assert.equal(actionLaneText.includes('/Users/mango/private/proposal.json'), false)
    assert.equal(actionLaneText.includes('127.0.0.1:8787'), false)

    const checkpointText = await page.locator('#review-checkpoint-panel').textContent()
    assert.match(checkpointText, /Review import handoff/i)
    assert.match(checkpointText, /Owner: host/i)
    assert.match(checkpointText, /Location: Control Center -> Plugins/i)
    assert.match(checkpointText, /proposal write failed/i)
    assert.match(checkpointText, /\[redacted-local-url\]/i)
    assert.equal(checkpointText.includes('127.0.0.1:8787'), false)

    const snapshotText = await page.locator('#review-snapshot-panel').textContent()
    assert.match(snapshotText, /Snapshot v1/i)
    assert.match(snapshotText, /Review gate: complete \/ Review status: complete/i)
    assert.match(snapshotText, /Import: imported \/ Command: import-approved-action/i)
    assert.match(snapshotText, /Owner: host \/ Location: Control Center -> Plugins/i)
    assert.match(snapshotText, /Trigger handoff: failed/i)
    assert.match(snapshotText, /proposal write failed/i)
    assert.match(snapshotText, /\[redacted-token\]/i)
    assert.match(snapshotText, /\[redacted-path\]/i)
    assert.match(snapshotText, /\[redacted-local-url\]/i)
    assert.equal(snapshotText.includes('bridge-secret'), false)
    assert.equal(snapshotText.includes('/Users/mango/private/proposal.json'), false)
    assert.equal(snapshotText.includes('127.0.0.1:8787'), false)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard shows imported full-pet review completion details', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-imported-full-pet-'))
  await seedImportedFullPetRun(dataDir)
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.waitForFunction(() => document.querySelector('#run-select')?.value?.length > 0)

    const handoffText = await page.locator('#import-handoff-panel').textContent()
    assert.match(handoffText, /Imported result details/i)
    assert.match(handoffText, /Imported pet pack: imported-review-cat/i)
    assert.match(handoffText, /Follow-up: Review imported result/i)
    assert.match(handoffText, /Review the imported result inside OpenPet/i)
    assert.match(handoffText, /Continue in OpenPet\./i)

    const resultCardText = await page.locator('#import-handoff-panel .notice').last().textContent()
    assert.match(resultCardText, /Follow-up: Review imported result/i)
    assert.match(resultCardText, /Review the imported result inside OpenPet/i)
    assert.match(resultCardText, /Continue in OpenPet\./i)

    const workflowGuidanceText = await page.locator('#workflow-guidance-panel').textContent()
    assert.match(workflowGuidanceText, /Follow-up: Review imported result/i)
    assert.match(workflowGuidanceText, /OpenPet/i)
    assert.match(workflowGuidanceText, /Continue in OpenPet\./i)

    const reviewText = await page.locator('#full-pet-review-panel').textContent()
    assert.match(reviewText, /Import completed/i)
    assert.match(reviewText, /Imported pet pack: imported-review-cat/i)
    assert.match(reviewText, /Activated pack: imported-review-cat/i)
    assert.match(reviewText, /Review location: OpenPet/i)
    assert.match(reviewText, /Follow-up: Review imported result/i)
    assert.match(reviewText, /Review the imported result inside OpenPet/i)
    assert.match(reviewText, /Continue in OpenPet\./i)
    assert.doesNotMatch(reviewText, /QA blocked/i)
    assert.doesNotMatch(reviewText, /Retry generation on this same run before approval or import/i)

    const nextStepText = await page.locator('#next-step-panel').textContent()
    assert.match(nextStepText, /Review imported result/i)
    assert.match(nextStepText, /OpenPet/i)
    assert.match(nextStepText, /Continue in OpenPet\./i)

    const actionLaneText = await page.locator('#action-lane-panel').textContent()
    assert.match(actionLaneText, /Host-owned action: Review imported result/i)
    assert.match(actionLaneText, /Location: OpenPet/i)
    assert.match(actionLaneText, /Continue in OpenPet\./i)

    const checkpointText = await page.locator('#review-checkpoint-panel').textContent()
    assert.match(checkpointText, /Review imported result/i)
    assert.match(checkpointText, /Owner: host/i)
    assert.match(checkpointText, /Location: OpenPet/i)
    assert.match(checkpointText, /Imported: yes/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard preserves imported full-pet follow-up for legacy runs without generationTask', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-imported-full-pet-legacy-pre-task-'))
  await seedLegacyImportedFullPetRunWithoutTask(dataDir)
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.waitForFunction(() => document.querySelector('#run-select')?.value?.length > 0)

    const handoffText = await page.locator('#import-handoff-panel').textContent()
    const reviewText = await page.locator('#full-pet-review-panel').textContent()
    assert.match(handoffText, /Imported pet pack: imported-review-cat/i)
    assert.doesNotMatch(handoffText, /Generate and approve a run to unlock host-owned import\./i)
    assert.match(reviewText, /Import completed/i)
    assert.match(reviewText, /Review location: OpenPet/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard hides stale full-pet source mismatch warnings after import', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-imported-full-pet-mismatch-'))
  await seedImportedFullPetRunWithSourceMismatch(dataDir)
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.waitForFunction(() => document.querySelector('#run-select')?.value?.length > 0)

    const reviewText = await page.locator('#full-pet-review-panel').textContent()
    assert.match(reviewText, /Import completed/i)
    assert.match(reviewText, /Imported pet pack: imported-review-cat/i)
    assert.match(reviewText, /Review location: OpenPet/i)
    assert.doesNotMatch(reviewText, /QA source image does not match the current generated image/i)
    assert.doesNotMatch(reviewText, /QA source reference/i)
    assert.doesNotMatch(reviewText, /Retry generation on this same run before approval or import/i)
    assert.doesNotMatch(reviewText, /0002\.png/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard shows imported action missing trigger handoff record details', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-imported-action-missing-trigger-'))
  await seedImportedActionRunWithoutTriggerSubmission(dataDir)
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.waitForFunction(() => document.querySelector('#run-select')?.value?.length > 0)

    const handoffText = await page.locator('#import-handoff-panel').textContent()
    assert.match(handoffText, /Imported result details/i)
    assert.match(handoffText, /Follow-up: Review import handoff/i)
    assert.match(handoffText, /no trigger proposal handoff record was saved/i)
    assert.match(handoffText, /Continue in Control Center at Control Center -> Plugins\./i)
    assert.equal(handoffText.includes('runs during Import Approved Action'), false)

    const workflowGuidanceText = await page.locator('#workflow-guidance-panel').textContent()
    assert.match(workflowGuidanceText, /Follow-up: Review import handoff/i)
    assert.match(workflowGuidanceText, /Control Center -> Plugins/i)
    assert.match(workflowGuidanceText, /no trigger proposal handoff record was saved/i)
    assert.match(workflowGuidanceText, /Continue in Control Center at Control Center -> Plugins\./i)
    assert.equal(workflowGuidanceText.includes('runs during Import Approved Action'), false)

    const reviewText = await page.locator('#action-review-panel').textContent()
    assert.match(reviewText, /Import completed/i)
    assert.match(reviewText, /Control Center -> Plugins/i)
    assert.match(reviewText, /Follow-up: Review import handoff/i)
    assert.match(reviewText, /no trigger proposal handoff record was saved/i)
    assert.match(reviewText, /Continue in Control Center at Control Center -> Plugins\./i)
    assert.doesNotMatch(reviewText, /QA blocked/i)
    assert.doesNotMatch(reviewText, /Repair or regenerate frames before approval/i)
    assert.doesNotMatch(reviewText, /Repair/i)
    assert.equal(reviewText.includes('runs during Import Approved Action'), false)

    const nextStepText = await page.locator('#next-step-panel').textContent()
    assert.match(nextStepText, /Review import handoff/i)
    assert.match(nextStepText, /no trigger proposal handoff record was saved/i)

    const actionLaneText = await page.locator('#action-lane-panel').textContent()
    assert.match(actionLaneText, /Host-owned action: Review import handoff/i)
    assert.match(actionLaneText, /Control Center -> Plugins/i)
    assert.match(actionLaneText, /Continue in Control Center at Control Center -> Plugins\./i)
    assert.match(actionLaneText, /no trigger proposal handoff record was saved/i)

    const checkpointText = await page.locator('#review-checkpoint-panel').textContent()
    assert.match(checkpointText, /Review import handoff/i)
    assert.match(checkpointText, /Control Center -> Plugins/i)
    assert.match(checkpointText, /no trigger proposal handoff record was saved/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard surfaces full-pet qa source mismatch before approval', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-full-pet-mismatch-'))
  const run = createRun({
    dataDir,
    input: {
      petName: 'Mismatch Dashboard Cat',
      petId: 'mismatch-dashboard-cat',
      prompt: '生成一只完整的新桌宠。',
      originalPrompt: '生成一只完整的新桌宠。',
      backend: 'cloud',
      generationTask: {
        mode: 'full-pet',
        targetPet: 'new',
        styleSource: 'textOnly',
        characterBrief: '一只需要显示 mismatch 提示的桌宠。',
        actions: [{
          actionId: 'idle',
          name: 'Idle',
          motionPrompt: 'neutral idle pose',
          loop: true,
          frameCount: 12,
          triggerProposal: { type: 'state', binding: 'idle' }
        }]
      }
    },
    now: () => '2026-06-27T00:30:00.000Z'
  })
  const outputDir = path.join(dataDir, 'runs', run.runId, 'outputs')
  const qaDir = path.join(dataDir, 'runs', run.runId, 'qa')
  const currentSourceDir = path.join(dataDir, 'runs', run.runId, 'frames', 'base')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.mkdirSync(qaDir, { recursive: true })
  fs.mkdirSync(currentSourceDir, { recursive: true })
  await sharp({
    create: {
      width: 192,
      height: 208,
      channels: 4,
      background: { r: 210, g: 140, b: 80, alpha: 1 }
    }
  }).png().toFile(path.join(currentSourceDir, '0001.png'))
  fs.writeFileSync(path.join(outputDir, 'spritesheet.webp'), createMinimalWebp())
  fs.writeFileSync(path.join(outputDir, 'pet.json'), `${JSON.stringify({
    id: 'mismatch-dashboard-cat',
    displayName: 'Mismatch Dashboard Cat',
    spritesheetPath: 'spritesheet.webp'
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(qaDir, 'atlas-validation.json'), `${JSON.stringify({
    ok: true,
    width: 1536,
    height: 1872,
    visiblePixels: 6400,
    warnings: []
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(qaDir, 'source-image-validation.json'), `${JSON.stringify({
    ok: true,
    sourceRelativePath: `runs/${run.runId}/frames/base/stale-source.png`,
    width: 1024,
    height: 1024,
    visiblePixels: 1000,
    warnings: []
  }, null, 2)}\n`)
  updateRunStatus({
    dataDir,
    runId: run.runId,
    status: 'ready_for_review',
    patch: {
      taskStatus: 'confirmed',
      currentStep: 'review',
      reviewStatus: 'pending',
      artifacts: {
        outputDir,
        petJson: path.join(outputDir, 'pet.json'),
        spritesheet: path.join(outputDir, 'spritesheet.webp'),
        qa: path.join(qaDir, 'atlas-validation.json'),
        sourceImageQa: path.join(qaDir, 'source-image-validation.json'),
        generatedImage: {
          outputs: [{
            mimeType: 'image/png',
            dataRelativePath: `runs/${run.runId}/frames/base/0001.png`
          }]
        }
      }
    },
    now: () => '2026-06-27T00:30:30.000Z'
  })
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.waitForFunction(() => document.querySelector('#run-select')?.value?.length > 0)
    await page.locator('#run-select').selectOption(run.runId)
    await page.waitForFunction((expectedRunId) => document.querySelector('#run-select')?.value === expectedRunId, run.runId)
    const reviewText = await page.locator('#full-pet-review-panel').textContent()
    assert.match(reviewText, /QA source image does not match the current generated image/i)
    assert.match(reviewText, /Retry generation on this same run before approval/i)
    assert.match(reviewText, /stale-source\.png/i)
    assert.match(reviewText, /0001\.png/i)
    await expectRetryButtonLabel(page, 'Retry generation')
    assert.match(await page.locator('#next-step-panel').textContent(), /Retry generation/i)
    assert.equal(await page.locator('#approve-button').isDisabled(), true)
    assert.match(await page.locator('#action-lane-panel').textContent(), /Retry generation before approval/i)
    const handoffText = await page.locator('#import-handoff-panel').textContent()
    assert.match(handoffText, /QA blocked/i)
    assert.match(handoffText, /Retry generation on this same run before approval or import/i)
    const workflowGuidanceText = await page.locator('#workflow-guidance-panel').textContent()
    assert.match(workflowGuidanceText, /Import state: review-required/i)
    assert.match(workflowGuidanceText, /Retry generation on this same run before approval/i)
    assert.doesNotMatch(workflowGuidanceText, /Review the generated pet-pack output and approve the run before host-owned pet import/i)
    const checkpointText = await page.locator('#review-checkpoint-panel').textContent()
    assert.match(checkpointText, /Retry generation/i)
    assert.match(checkpointText, /Owner: dashboard/i)
    assert.match(checkpointText, /Location: Creator Studio dashboard/i)
    assert.match(checkpointText, /Available in dashboard: yes/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard lets users edit a drafted action task before confirmation', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-task-edit-'))
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.locator('#prompt-input').fill('新增一个自定义动作：原地打滚，动作要循环。')
    await page.locator('#draft-button').click()

    await page.waitForSelector('[data-answer="manual"]')
    await page.locator('[data-answer="manual"]').click()
    await page.waitForFunction(() => !document.querySelector('#confirm-button').disabled)

    await page.locator('#task-edit-name').fill('害羞打滚')
    await page.locator('#task-edit-motion').fill('先缩起来，再沿着地面慢慢打滚一圈。')
    await page.locator('#task-edit-loop').selectOption('false')
    await page.locator('#task-edit-trigger').selectOption('manual')
    await page.locator('#save-task-button').click()

    await page.waitForFunction(() => /Task edits saved\./.test(document.querySelector('#status-line').textContent))
    assert.match(await page.locator('#task-preview').textContent(), /害羞打滚/i)
    assert.match(await page.locator('#task-preview').textContent(), /先缩起来，再沿着地面慢慢打滚一圈/i)
    assert.match(await page.locator('#trigger-panel').textContent(), /manual/i)

    await page.locator('#confirm-button').click()
    await page.waitForFunction(() => !document.querySelector('#generate-button').disabled)
    await page.locator('#generate-button').click()
    await waitForGeneratedOutput(page, 'action')

    const reviewText = await page.locator('#action-review-panel').textContent()
    assert.match(reviewText, /害羞打滚/i)
    assert.match(reviewText, /manual/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard lets users edit a drafted full-pet task before confirmation', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-full-pet-task-edit-'))
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.locator('#prompt-input').fill('生成一只完整的新桌宠，要软乎乎的橘猫风格，包含 idle 动作。')
    await page.locator('#draft-button').click()
    await page.waitForFunction(() => !document.querySelector('#confirm-button').disabled)

    await page.locator('#task-edit-character-brief').fill('一只更圆润、奶油橘色、动作更慵懒的新桌宠。')
    await page.locator('#task-edit-name-0').fill('Lazy Idle')
    await page.locator('#task-edit-motion-0').fill('slow breathing with tiny ear flicks and a soft tail sway')
    await page.locator('#task-edit-loop-0').selectOption('true')
    await page.locator('#task-edit-trigger-0').selectOption('state')
    await page.locator('#save-task-button').click()

    await page.waitForFunction(() => /Task edits saved\./.test(document.querySelector('#status-line').textContent))
    const previewText = await page.locator('#task-preview').textContent()
    const triggerText = await page.locator('#trigger-panel').textContent()
    assert.match(previewText, /一只更圆润、奶油橘色、动作更慵懒的新桌宠/i)
    assert.match(previewText, /Lazy Idle/i)
    assert.match(previewText, /slow breathing with tiny ear flicks/i)
    assert.match(triggerText, /state/i)

    await page.locator('#confirm-button').click()
    await page.waitForFunction(() => !document.querySelector('#generate-button').disabled)
    await page.locator('#generate-button').click()
    await waitForGeneratedOutput(page, 'pet-pack')

    const reviewText = await page.locator('#full-pet-review-panel').textContent()
    assert.match(reviewText, /Atlas QA/i)
    assert.match(await page.locator('#status-line').textContent(), /Generated pet-pack output/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard syncs prompt and backend controls when loading existing runs', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-run-sync-'))
  const fixtureRun = createRun({
    dataDir,
    input: {
      prompt: '新增一个自定义动作：原地打滚，动作要循环。',
      originalPrompt: '新增一个自定义动作：原地打滚，动作要循环。',
      backend: 'fixture',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        actions: [{
          actionId: 'roll-loop',
          name: '原地打滚',
          motionPrompt: '原地打滚，动作要循环。',
          loop: true,
          frameCount: 12,
          triggerProposal: { type: 'manual' }
        }]
      }
    },
    now: () => '2026-06-28T08:00:00.000Z'
  })
  createRun({
    dataDir,
    input: {
      prompt: '新增一个自定义动作：害羞转圈，点击后轻轻转一圈。',
      originalPrompt: '新增一个自定义动作：害羞转圈，点击后轻轻转一圈。',
      backend: 'provider',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        actions: [{
          actionId: 'shy-spin',
          name: '害羞转圈',
          motionPrompt: '点击后轻轻转一圈。',
          loop: false,
          frameCount: 16,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }]
      }
    },
    now: () => '2026-06-28T08:05:00.000Z'
  })
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.waitForFunction(() => document.querySelector('#run-select')?.value?.length > 0)
    await page.waitForFunction(() => document.querySelector('#prompt-input')?.value?.includes('害羞转圈'))
    assert.equal(await page.locator('#backend-select').inputValue(), 'provider')

    await page.locator('#run-select').selectOption(fixtureRun.runId)
    await page.waitForFunction((expectedRunId) => document.querySelector('#run-select')?.value === expectedRunId, fixtureRun.runId)
    await page.waitForFunction(() => document.querySelector('#prompt-input')?.value?.includes('原地打滚'))
    assert.equal(await page.locator('#backend-select').inputValue(), 'fixture')
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard normalizes legacy run backends when syncing loaded runs', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-run-sync-legacy-backend-'))
  const legacyCloudRun = createRun({
    dataDir,
    input: {
      prompt: '新增一个自定义动作：云端害羞转圈。',
      originalPrompt: '新增一个自定义动作：云端害羞转圈。',
      backend: 'cloud',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        actions: [{
          actionId: 'legacy-cloud-spin',
          name: '云端害羞转圈',
          motionPrompt: '点击后轻轻转一圈。',
          loop: false,
          frameCount: 16,
          triggerProposal: { type: 'click', binding: 'clickAction' }
        }]
      }
    },
    now: () => '2026-06-28T08:06:00.000Z'
  })
  writeRun({
    dataDir,
    run: {
      ...legacyCloudRun,
      backend: 'cloud',
      input: {
        ...legacyCloudRun.input,
        backend: 'cloud'
      }
    }
  })
  const legacyLocalRun = createRun({
    dataDir,
    input: {
      prompt: '新增一个自定义动作：本地打哈欠。',
      originalPrompt: '新增一个自定义动作：本地打哈欠。',
      backend: 'local',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        actions: [{
          actionId: 'legacy-local-yawn',
          name: '本地打哈欠',
          motionPrompt: '慢慢张嘴打哈欠。',
          loop: false,
          frameCount: 16,
          triggerProposal: { type: 'manual' }
        }]
      }
    },
    now: () => '2026-06-28T08:07:00.000Z'
  })
  writeRun({
    dataDir,
    run: {
      ...legacyLocalRun,
      backend: 'local',
      input: {
        ...legacyLocalRun.input,
        backend: 'local'
      }
    }
  })
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.waitForFunction(() => document.querySelector('#run-select')?.value?.length > 0)
    await page.waitForFunction(() => document.querySelector('#prompt-input')?.value?.includes('本地打哈欠'))
    assert.equal(await page.locator('#backend-select').inputValue(), 'provider')

    await page.locator('#run-select').selectOption(legacyCloudRun.runId)
    await page.waitForFunction((expectedRunId) => document.querySelector('#run-select')?.value === expectedRunId, legacyCloudRun.runId)
    await page.waitForFunction(() => document.querySelector('#prompt-input')?.value?.includes('云端害羞转圈'))
    assert.equal(await page.locator('#backend-select').inputValue(), 'provider')

    await page.locator('#run-select').selectOption(legacyLocalRun.runId)
    await page.waitForFunction((expectedRunId) => document.querySelector('#run-select')?.value === expectedRunId, legacyLocalRun.runId)
    assert.equal(await page.locator('#backend-select').inputValue(), 'provider')
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard syncs legacy pre-task run controls when loading a run without generationTask', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-run-sync-legacy-pre-task-'))
  const standardRun = createRun({
    dataDir,
    input: {
      prompt: '新增一个自定义动作：普通害羞转圈。',
      originalPrompt: '新增一个自定义动作：普通害羞转圈。',
      backend: 'fixture',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        actions: [{
          actionId: 'normal-spin',
          name: '普通害羞转圈',
          motionPrompt: '轻轻转一圈。',
          loop: false,
          frameCount: 12,
          triggerProposal: { type: 'manual' }
        }]
      }
    },
    now: () => '2026-06-28T08:08:00.000Z'
  })
  const legacyPreTaskRun = createRun({
    dataDir,
    input: {
      prompt: 'Legacy pre-task prompt should still sync.',
      originalPrompt: 'Legacy pre-task prompt should still sync.',
      backend: 'cloud',
      generationTask: {
        mode: 'single-action',
        targetPet: 'current',
        styleSource: 'currentPet',
        actions: [{
          actionId: 'legacy-pre-task',
          name: 'Legacy Pre Task',
          motionPrompt: 'placeholder',
          loop: false,
          frameCount: 12,
          triggerProposal: { type: 'manual' }
        }]
      }
    },
    now: () => '2026-06-28T08:09:00.000Z'
  })
  const { generationTask: _generationTask, ...legacyPreTaskRunWithoutTask } = legacyPreTaskRun
  writeRun({
    dataDir,
    run: {
      ...legacyPreTaskRunWithoutTask,
      backend: 'cloud',
      input: {
        ...legacyPreTaskRun.input,
        backend: 'cloud'
      },
      taskStatus: 'not_started',
      currentStep: 'draft'
    }
  })
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.waitForFunction(() => document.querySelector('#run-select')?.value?.length > 0)
    await page.locator('#run-select').selectOption(standardRun.runId)
    await page.waitForFunction((expectedRunId) => document.querySelector('#run-select')?.value === expectedRunId, standardRun.runId)
    await page.waitForFunction(() => document.querySelector('#prompt-input')?.value?.includes('普通害羞转圈'))
    assert.equal(await page.locator('#backend-select').inputValue(), 'fixture')

    await page.locator('#run-select').selectOption(legacyPreTaskRun.runId)
    await page.waitForFunction((expectedRunId) => document.querySelector('#run-select')?.value === expectedRunId, legacyPreTaskRun.runId)
    await page.waitForFunction(() => document.querySelector('#prompt-input')?.value?.includes('Legacy pre-task prompt'))
    assert.equal(await page.locator('#backend-select').inputValue(), 'provider')

    const snapshotText = await page.locator('#run-snapshot-panel').textContent()
    const workflowGuidanceText = await page.locator('#workflow-guidance-panel').textContent()
    const nextStepText = await page.locator('#next-step-panel').textContent()
    const actionLaneText = await page.locator('#action-lane-panel').textContent()
    assert.match(snapshotText, /Legacy pre-task prompt should still sync\./i)
    assert.match(snapshotText, /Backend: provider/i)
    assert.match(snapshotText, /Task: not_started/i)
    assert.match(workflowGuidanceText, /host-owned image Provider/i)
    assert.doesNotMatch(workflowGuidanceText, /Use fixture for workflow QA first/i)
    assert.match(nextStepText, /Start from a natural-language action prompt to draft a Creator Studio task\./i)
    assert.equal(await page.locator('#confirm-button').isDisabled(), true)
    assert.doesNotMatch(actionLaneText, /Dashboard action: Confirm task/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard enables retry generation for failed legacy runs without generationTask', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-legacy-failed-retry-'))
  const run = seedLegacyFailedRunWithoutTask(dataDir)
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.waitForFunction(() => document.querySelector('#run-select')?.value?.length > 0)
    await page.locator('#run-select').selectOption(run.runId)
    await page.waitForFunction((expectedRunId) => document.querySelector('#run-select')?.value === expectedRunId, run.runId)

    const recoveryText = await page.locator('#recovery-panel').textContent()
    assert.match(recoveryText, /Generation failed/i)
    assert.match(recoveryText, /Provider queue overloaded/i)
    assert.equal(await page.locator('#confirm-button').isDisabled(), true)
    assert.equal(await page.locator('#generate-button').isDisabled(), false)
    assert.match(await page.locator('#generate-button').textContent(), /Retry generation/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard enables approval for reviewable legacy action runs without generationTask', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-legacy-review-approve-'))
  const run = await seedLegacyReadyForReviewActionRunWithoutTask(dataDir)
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.waitForFunction(() => document.querySelector('#run-select')?.value?.length > 0)
    await page.locator('#run-select').selectOption(run.runId)
    await page.waitForFunction((expectedRunId) => document.querySelector('#run-select')?.value === expectedRunId, run.runId)

    const reviewText = await page.locator('#action-review-panel').textContent()
    assert.match(reviewText, /Review status: pending/i)
    assert.equal(await page.locator('#confirm-button').isDisabled(), true)
    assert.equal(await page.locator('#generate-button').isDisabled(), true)
    assert.equal(await page.locator('#approve-button').isDisabled(), false)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('creator studio dashboard shows failed generation recovery and retries the same run', { concurrency: false }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-retry-'))
  let generationAttempts = 0
  const bridgeServer = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const payload = body ? JSON.parse(body) : {}
      response.setHeader('Content-Type', 'application/json')
      if (request.url.endsWith('/creator/model-settings')) {
        response.end(JSON.stringify({
          ok: true,
          config: {
            provider: 'openai-compatible',
            baseUrl: 'http://127.0.0.1:7860/v1',
            model: 'local-custom-sprite-v2'
          }
        }))
        return
      }
      if (request.url.endsWith('/creator/model-image-generate')) {
        generationAttempts += 1
        if (generationAttempts === 1) {
          response.statusCode = 503
          response.end(JSON.stringify({ ok: false, error: 'Provider queue overloaded' }))
          return
        }
        const dataRelativePath = `runs/${payload.output.dataRelativeDir.split('/')[1]}/frames/base/0001.png`
        const generatedPath = path.join(dataDir, dataRelativePath)
        fs.mkdirSync(path.dirname(generatedPath), { recursive: true })
        sharp({
          create: {
            width: 96,
            height: 112,
            channels: 4,
            background: { r: 255, g: 170, b: 90, alpha: 1 }
          }
        })
          .png()
          .toFile(generatedPath)
          .then(() => {
            response.end(JSON.stringify({
              ok: true,
              result: {
                ok: true,
                backend: 'provider',
                model: 'local-custom-sprite-v2',
                generatedAt: '2026-06-27T00:00:00.000Z',
                outputs: [{
                  dataRelativePath,
                  mimeType: 'image/png',
                  sha256: 'retry-sha'
                }]
              }
            }))
          })
          .catch((error) => {
            response.statusCode = 500
            response.end(JSON.stringify({ ok: false, error: error.message }))
          })
        return
      }
      response.statusCode = 404
      response.end(JSON.stringify({ ok: false, error: 'Unknown route' }))
    })
  })
  await new Promise((resolve) => bridgeServer.listen(0, '127.0.0.1', resolve))
  const previousBridgeUrl = process.env.OPENPET_BRIDGE_URL
  const previousBridgeToken = process.env.OPENPET_BRIDGE_TOKEN
  process.env.OPENPET_BRIDGE_URL = `http://127.0.0.1:${bridgeServer.address().port}`
  process.env.OPENPET_BRIDGE_TOKEN = 'bridge-token'
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.locator('#backend-select').selectOption('provider')
    await page.locator('#prompt-input').fill('新增一个自定义动作：害羞转圈，点击后轻轻转一圈。')
    await page.locator('#draft-button').click()
    await page.waitForFunction(() => !document.querySelector('#confirm-button').disabled)

    await page.locator('#confirm-button').click()
    await page.waitForFunction(() => !document.querySelector('#generate-button').disabled)
    await page.locator('#generate-button').click()
    await page.waitForFunction(() => /Provider queue overloaded/.test(document.querySelector('#status-line').textContent))

    assert.match(await page.locator('#recovery-panel').textContent(), /Generation failed/i)
    assert.match(await page.locator('#recovery-panel').textContent(), /Provider queue overloaded/i)
    await expectRetryButtonLabel(page, 'Retry generation')

    const runIdBeforeRetry = await page.locator('#run-select').inputValue()
    await page.locator('#generate-button').click()
    await waitForGeneratedOutput(page, 'action')

    const runIdAfterRetry = await page.locator('#run-select').inputValue()
    assert.equal(runIdAfterRetry, runIdBeforeRetry)
    assert.equal(generationAttempts, 2)
    assert.match(await page.locator('#status-line').textContent(), /Generated action output/i)
    assert.match(await page.locator('#action-review-panel').textContent(), /Review status/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
    bridgeServer.closeAllConnections?.()
    await new Promise((resolve) => bridgeServer.close(resolve))
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
  }
})

test('creator studio dashboard shows full-pet validation recovery and retries the same run', { concurrency: false }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-creator-dashboard-browser-full-pet-retry-'))
  let generationAttempts = 0
  const bridgeServer = http.createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const payload = body ? JSON.parse(body) : {}
      response.setHeader('Content-Type', 'application/json')
      if (request.url.endsWith('/creator/model-settings')) {
        response.end(JSON.stringify({
          ok: true,
          config: {
            provider: 'openai-compatible',
            baseUrl: 'http://127.0.0.1:7860/v1',
            model: 'local-full-pet-v2'
          }
        }))
        return
      }
      if (request.url.endsWith('/creator/model-image-generate')) {
        generationAttempts += 1
        const dataRelativePath = `runs/${payload.output.dataRelativeDir.split('/')[1]}/frames/base/0001.png`
        const generatedPath = path.join(dataDir, dataRelativePath)
        fs.mkdirSync(path.dirname(generatedPath), { recursive: true })
        const background = generationAttempts === 1
          ? { r: 0, g: 0, b: 0, alpha: 0 }
          : { r: 255, g: 196, b: 120, alpha: 1 }
        sharp({
          create: {
            width: 96,
            height: 112,
            channels: 4,
            background
          }
        })
          .png()
          .toFile(generatedPath)
          .then(() => {
            response.end(JSON.stringify({
              ok: true,
              result: {
                ok: true,
                backend: 'provider',
                model: 'local-full-pet-v2',
                generatedAt: '2026-06-27T00:00:00.000Z',
                outputs: [{
                  dataRelativePath,
                  mimeType: 'image/png',
                  sha256: generationAttempts === 1 ? 'invalid-visible-pixels-sha' : 'full-pet-retry-sha'
                }]
              }
            }))
          })
          .catch((error) => {
            response.statusCode = 500
            response.end(JSON.stringify({ ok: false, error: error.message }))
          })
        return
      }
      response.statusCode = 404
      response.end(JSON.stringify({ ok: false, error: 'Unknown route' }))
    })
  })
  await new Promise((resolve) => bridgeServer.listen(0, '127.0.0.1', resolve))
  const previousBridgeUrl = process.env.OPENPET_BRIDGE_URL
  const previousBridgeToken = process.env.OPENPET_BRIDGE_TOKEN
  process.env.OPENPET_BRIDGE_URL = `http://127.0.0.1:${bridgeServer.address().port}`
  process.env.OPENPET_BRIDGE_TOKEN = 'bridge-token'
  const server = await openDashboardServer(dataDir)
  const { browser, page } = await openDashboardPage(server)

  try {
    await page.locator('#backend-select').selectOption('provider')
    await page.locator('#prompt-input').fill('生成一只完整的新桌宠，平时懒懒的，被点击会害羞转圈，偶尔会打哈欠。')
    await page.locator('#draft-button').click()
    await page.waitForFunction(() => !document.querySelector('#confirm-button').disabled)

    await page.locator('#confirm-button').click()
    await page.waitForFunction(() => !document.querySelector('#generate-button').disabled)
    await page.locator('#generate-button').click()
    await page.waitForFunction(() => /Generated image contains no visible pixels/.test(document.querySelector('#status-line').textContent))

    const recoveryText = await page.locator('#recovery-panel').textContent()
    assert.match(recoveryText, /Generation failed/i)
    assert.match(recoveryText, /Generated image contains no visible pixels/i)
    assert.match(recoveryText, /The generated source image was empty/i)
    await expectRetryButtonLabel(page, 'Retry generation')

    const runIdBeforeRetry = await page.locator('#run-select').inputValue()
    await page.locator('#generate-button').click()
    await waitForGeneratedOutput(page, 'pet-pack')

    const runIdAfterRetry = await page.locator('#run-select').inputValue()
    assert.equal(runIdAfterRetry, runIdBeforeRetry)
    assert.equal(generationAttempts, 2)
    assert.match(await page.locator('#status-line').textContent(), /Generated pet-pack output/i)
    assert.match(await page.locator('#full-pet-review-panel').textContent(), /Atlas QA/i)
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
    bridgeServer.closeAllConnections?.()
    await new Promise((resolve) => bridgeServer.close(resolve))
    if (previousBridgeUrl == null) delete process.env.OPENPET_BRIDGE_URL
    else process.env.OPENPET_BRIDGE_URL = previousBridgeUrl
    if (previousBridgeToken == null) delete process.env.OPENPET_BRIDGE_TOKEN
    else process.env.OPENPET_BRIDGE_TOKEN = previousBridgeToken
  }
})

const expectRetryButtonLabel = async (page, label) => {
  await page.waitForFunction((expected) => document.querySelector('#generate-button')?.textContent?.includes(expected), label)
}
