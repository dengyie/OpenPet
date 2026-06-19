const path = require('path')
const { execFileSync } = require('child_process')

const parsePosixProcessRows = (output = '') => output
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/)
    if (!match) return null
    return {
      pid: Number(match[1]),
      ppid: Number(match[2]),
      command: match[3]
    }
  })
  .filter(Boolean)

const normalizePathForMatch = (value) => path.resolve(value || '').replace(/\\/g, '/')

const isElectronCommand = (command = '') => (
  /Electron(\.app|\.exe)?/i.test(command)
  || /electron[\\/\s]/i.test(command)
)

const isElectronMainProcess = (command = '') => (
  isElectronCommand(command)
  && !/Electron Helper/i.test(command)
  && !/\s--type=/.test(command)
)

const commandMatchesProject = (command, projectRoot, userDataPath = '') => {
  const normalizedProjectRoot = normalizePathForMatch(projectRoot)
  const normalizedCommand = String(command || '').replace(/\\/g, '/')
  if (normalizedCommand.includes(normalizedProjectRoot)) return true
  if (userDataPath && normalizedCommand.includes(normalizePathForMatch(userDataPath))) return true
  if (/\/OpenPet\/node_modules\/electron\//.test(normalizedCommand)) return true
  return normalizedCommand.includes(`${normalizedProjectRoot}/node_modules/electron`)
}

const findOpenPetDevInstancePids = ({ rows = [], projectRoot, userDataPath = '', currentPid = process.pid } = {}) => rows
  .filter((row) => row.pid > 0)
  .filter((row) => row.pid !== currentPid)
  .filter((row) => isElectronMainProcess(row.command))
  .filter((row) => commandMatchesProject(row.command, projectRoot, userDataPath))
  .map((row) => row.pid)

const readPosixProcesses = ({ execFileSyncImpl = execFileSync } = {}) => {
  const output = execFileSyncImpl('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf-8' })
  return parsePosixProcessRows(output)
}

const runCleanupDevInstances = ({
  projectRoot = path.resolve(__dirname, '..'),
  userDataPath = path.join(process.env.HOME || '', 'Library', 'Application Support', 'ibot'),
  currentPid = process.pid,
  execFileSyncImpl = execFileSync,
  killImpl = process.kill
} = {}) => {
  const rows = readPosixProcesses({ execFileSyncImpl })
  const killedPids = findOpenPetDevInstancePids({ rows, projectRoot, userDataPath, currentPid })

  for (const pid of killedPids) {
    try {
      killImpl(pid, 'SIGTERM')
    } catch (_) {
      // A stale process may exit between ps and kill; startup can continue.
    }
  }

  return { killedPids }
}

if (require.main === module) {
  try {
    const result = runCleanupDevInstances()
    if (result.killedPids.length > 0) {
      console.log(`OpenPet dev cleanup: terminated stale pid(s) ${result.killedPids.join(', ')}`)
    }
  } catch (error) {
    console.warn(`OpenPet dev cleanup skipped: ${error.message}`)
  }
}

module.exports = {
  findOpenPetDevInstancePids,
  parsePosixProcessRows,
  runCleanupDevInstances
}
