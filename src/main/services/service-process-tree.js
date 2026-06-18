const { execFileSync } = require('child_process')

const WINDOWS_PROCESS_TABLE_COMMAND = [
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'
  ]
]

const POSIX_PROCESS_TABLE_COMMAND = [
  'ps',
  ['-axo', 'pid=,ppid=']
]

const normalizePositivePid = (value) => {
  const pid = Number(value)
  return Number.isInteger(pid) && pid > 0 ? pid : 0
}

const collectDescendants = (rows, rootPid) => {
  const childrenByParent = new Map()
  for (const row of rows) {
    if (!childrenByParent.has(row.ppid)) childrenByParent.set(row.ppid, [])
    childrenByParent.get(row.ppid).push(row.pid)
  }

  const descendants = []
  const queue = [rootPid]
  const seen = new Set([rootPid])
  while (queue.length) {
    const parentPid = queue.shift()
    const children = childrenByParent.get(parentPid) || []
    for (const childPid of children) {
      if (seen.has(childPid)) continue
      seen.add(childPid)
      descendants.push(childPid)
      queue.push(childPid)
    }
  }

  return descendants.sort((left, right) => left - right)
}

const parsePosixProcessTable = (output) => String(output || '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => line.split(/\s+/))
  .map(([pidValue, parentPidValue]) => ({
    pid: normalizePositivePid(pidValue),
    ppid: normalizePositivePid(parentPidValue)
  }))
  .filter((row) => row.pid > 0 && row.ppid >= 0)

const parseWindowsProcessTable = (output) => {
  const parsed = JSON.parse(String(output || '[]'))
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows
    .map((row) => ({
      pid: normalizePositivePid(row?.ProcessId),
      ppid: normalizePositivePid(row?.ParentProcessId)
    }))
    .filter((row) => row.pid > 0 && row.ppid >= 0)
}

const createServiceProcessTree = ({
  platform = process.platform,
  execFileSyncImpl = execFileSync,
  killProcessImpl = process.kill
} = {}) => {
  const listServiceDescendantPids = (pid) => {
    const rootPid = normalizePositivePid(pid)
    if (!rootPid) return []

    if (platform === 'win32') {
      const [file, args] = WINDOWS_PROCESS_TABLE_COMMAND
      const output = execFileSyncImpl(file, args, {
        encoding: 'utf-8',
        windowsHide: true
      })
      return collectDescendants(parseWindowsProcessTable(output), rootPid)
    }

    const [file, args] = POSIX_PROCESS_TABLE_COMMAND
    const output = execFileSyncImpl(file, args, { encoding: 'utf-8' })
    return collectDescendants(parsePosixProcessTable(output), rootPid)
  }

  const signalServiceProcessTree = (pid, signal = 'SIGTERM') => {
    const rootPid = normalizePositivePid(pid)
    if (!rootPid) return false

    if (platform === 'win32') {
      const args = ['/PID', String(rootPid), '/T']
      if (signal === 'SIGKILL') args.push('/F')
      execFileSyncImpl('taskkill', args, {
        stdio: 'ignore',
        windowsHide: true
      })
      return true
    }

    const descendants = listServiceDescendantPids(rootPid)
    for (const descendantPid of descendants) {
      killProcessImpl(descendantPid, signal)
    }
    killProcessImpl(rootPid, signal)
    return true
  }

  return { listServiceDescendantPids, signalServiceProcessTree }
}

module.exports = {
  createServiceProcessTree
}
