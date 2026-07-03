const { runCommand } = require('./command-io')
const { writeCodexHookPlan } = require('./codex-hook-plan')

runCommand(async (context) => {
  const plan = writeCodexHookPlan(context)
  return {
    installed: false,
    manualRequired: true,
    message: 'Codex hook instructions were generated. OpenPet did not modify ~/.codex automatically.',
    ...plan
  }
})
