const test = require('node:test')
const assert = require('node:assert/strict')

const {
  findOpenPetDevInstancePids,
  parsePosixProcessRows,
  runCleanupDevInstances
} = require('../../scripts/cleanup-dev-instances')

test('parsePosixProcessRows extracts pid, ppid, and command from ps output', () => {
  assert.deepEqual(parsePosixProcessRows([
    '  123   1 /Applications/Electron.app/Contents/MacOS/Electron .',
    'not-a-pid 1 ignored',
    '  456 123 npm start'
  ].join('\n')), [
    { pid: 123, ppid: 1, command: '/Applications/Electron.app/Contents/MacOS/Electron .' },
    { pid: 456, ppid: 123, command: 'npm start' }
  ])
})

test('findOpenPetDevInstancePids selects old OpenPet dev Electron main processes only', () => {
  const projectRoot = '/Users/mango/project/codex/OpenPet'
  const userDataPath = '/Users/mango/Library/Application Support/ibot'
  const rows = [
    { pid: 100, ppid: 1, command: `/Users/mango/project/codex/OpenPet/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron ${projectRoot}` },
    { pid: 101, ppid: 1, command: `/Users/mango/project/codex/OpenPet/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron . --inspect` },
    { pid: 102, ppid: 1, command: '/Applications/Slack.app/Contents/MacOS/Slack' },
    { pid: 103, ppid: 1, command: '/tmp/other/OpenPet/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron /tmp/other/OpenPet' },
    { pid: 104, ppid: 1, command: `/Users/mango/project/codex/OpenPet/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron . --user-data-dir=${userDataPath}` },
    { pid: 105, ppid: 1, command: `/Users/mango/project/codex/OpenPet/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=renderer --user-data-dir=${userDataPath} --app-path=/Users/mango/project/codex/OpenPet` },
    { pid: 106, ppid: 1, command: '/Users/mango/.codex/worktrees/4a4a/OpenPet/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .' },
    { pid: 999, ppid: 1, command: `/Users/mango/project/codex/OpenPet/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron ${projectRoot}` }
  ]

  assert.deepEqual(findOpenPetDevInstancePids({
    rows,
    projectRoot,
    userDataPath,
    currentPid: 999
  }), [100, 101, 103, 104, 106])
})

test('runCleanupDevInstances sends SIGTERM only to selected old dev instances', () => {
  const killed = []
  const output = [
    '  100   1 /repo/OpenPet/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron /repo/OpenPet',
    '  200   1 /Applications/OtherElectron.app/Contents/MacOS/Electron /elsewhere'
  ].join('\n')

  const result = runCleanupDevInstances({
    projectRoot: '/repo/OpenPet',
    userDataPath: '/Users/mango/Library/Application Support/ibot',
    currentPid: 300,
    execFileSyncImpl: () => output,
    killImpl: (pid, signal) => killed.push({ pid, signal })
  })

  assert.deepEqual(result, { killedPids: [100] })
  assert.deepEqual(killed, [{ pid: 100, signal: 'SIGTERM' }])
})
