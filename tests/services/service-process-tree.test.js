const test = require('node:test')
const assert = require('node:assert/strict')

const { createServiceProcessTree } = require('../../apps/desktop/src/services/service-process-tree')

test('service process tree lists posix descendants recursively', () => {
  const calls = []
  const tree = createServiceProcessTree({
    platform: 'darwin',
    execFileSyncImpl: (file, args, options) => {
      calls.push({ file, args, options })
      return `
        100 1
        200 100
        300 200
        250 100
        999 2
      `
    }
  })

  const descendants = tree.listServiceDescendantPids(100)

  assert.deepEqual(calls, [{
    file: 'ps',
    args: ['-axo', 'pid=,ppid='],
    options: { encoding: 'utf-8' }
  }])
  assert.deepEqual(descendants, [200, 250, 300])
})

test('service process tree lists windows descendants recursively', () => {
  const calls = []
  const tree = createServiceProcessTree({
    platform: 'win32',
    execFileSyncImpl: (file, args, options) => {
      calls.push({ file, args, options })
      return JSON.stringify([
        { ProcessId: 100, ParentProcessId: 1 },
        { ProcessId: 220, ParentProcessId: 100 },
        { ProcessId: 330, ParentProcessId: 220 },
        { ProcessId: 221, ParentProcessId: 100 },
        { ProcessId: 990, ParentProcessId: 9 }
      ])
    }
  })

  const descendants = tree.listServiceDescendantPids(100)

  assert.deepEqual(calls, [{
    file: 'powershell.exe',
    args: [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'
    ],
    options: { encoding: 'utf-8', windowsHide: true }
  }])
  assert.deepEqual(descendants, [220, 221, 330])
})

test('service process tree signals posix descendants before the root pid', () => {
  const signals = []
  const tree = createServiceProcessTree({
    platform: 'linux',
    execFileSyncImpl: () => `
      100 1
      200 100
      250 100
      300 200
    `,
    killProcessImpl: (pid, signal) => {
      signals.push({ pid, signal })
      return true
    }
  })

  const result = tree.signalServiceProcessTree(100, 'SIGTERM')

  assert.equal(result, true)
  assert.deepEqual(signals, [
    { pid: 200, signal: 'SIGTERM' },
    { pid: 250, signal: 'SIGTERM' },
    { pid: 300, signal: 'SIGTERM' },
    { pid: 100, signal: 'SIGTERM' }
  ])
})

test('service process tree treats an exited descendant as already stopped', () => {
  const signals = []
  const tree = createServiceProcessTree({
    platform: 'linux',
    execFileSyncImpl: () => `
      100 1
      200 100
      300 100
    `,
    killProcessImpl: (pid, signal) => {
      signals.push({ pid, signal })
      if (pid === 200) {
        const error = new Error('process already exited')
        error.code = 'ESRCH'
        throw error
      }
      return true
    }
  })

  assert.equal(tree.signalServiceProcessTree(100, 'SIGTERM'), true)
  assert.deepEqual(signals, [
    { pid: 200, signal: 'SIGTERM' },
    { pid: 300, signal: 'SIGTERM' },
    { pid: 100, signal: 'SIGTERM' }
  ])
})

test('service process tree treats an exited root as already stopped', () => {
  const tree = createServiceProcessTree({
    platform: 'linux',
    execFileSyncImpl: () => '100 1\n',
    killProcessImpl: (pid) => {
      assert.equal(pid, 100)
      const error = new Error('process already exited')
      error.code = 'ESRCH'
      throw error
    }
  })

  assert.equal(tree.signalServiceProcessTree(100), false)
})

test('service process tree propagates non-ESRCH signal errors', () => {
  const permissionError = Object.assign(new Error('operation not permitted'), { code: 'EPERM' })
  const tree = createServiceProcessTree({
    platform: 'linux',
    execFileSyncImpl: () => '100 1\n',
    killProcessImpl: () => { throw permissionError }
  })

  assert.throws(
    () => tree.signalServiceProcessTree(100),
    (error) => error === permissionError
  )
})

test('service process tree uses taskkill for windows force-stop', () => {
  const calls = []
  const tree = createServiceProcessTree({
    platform: 'win32',
    execFileSyncImpl: (file, args, options) => {
      calls.push({ file, args, options })
      return ''
    }
  })

  const result = tree.signalServiceProcessTree(100, 'SIGKILL')

  assert.equal(result, true)
  assert.deepEqual(calls, [{
    file: 'taskkill',
    args: ['/PID', '100', '/T', '/F'],
    options: { stdio: 'ignore', windowsHide: true }
  }])
})

test('service process tree ignores invalid root pid values', () => {
  let called = false
  const tree = createServiceProcessTree({
    execFileSyncImpl: () => {
      called = true
      return ''
    }
  })

  assert.deepEqual(tree.listServiceDescendantPids(0), [])
  assert.deepEqual(tree.listServiceDescendantPids('abc'), [])
  assert.equal(tree.signalServiceProcessTree(0), false)
  assert.equal(tree.signalServiceProcessTree('abc'), false)
  assert.equal(called, false)
})
