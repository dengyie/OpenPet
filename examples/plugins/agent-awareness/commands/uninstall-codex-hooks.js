const { runCommand } = require('./command-io')
const { writeCodexHookRemovalPlan } = require('./codex-hook-plan')

runCommand(async (context) => ({
  removed: false,
  manualRequired: true,
  message: 'Codex hook removal instructions were generated. Remove any hook command you added manually.',
  ...writeCodexHookRemovalPlan(context)
}))
