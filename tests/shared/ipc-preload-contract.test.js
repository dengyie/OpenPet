const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const { IPC } = require('../../src/shared/ipc-channels')

const projectRoot = path.join(__dirname, '..', '..')

const PRELOAD_FILES = [
  'preload.js',
  'control-center-preload.js',
  path.join('src', 'main', 'pet-chat-preload.js'),
  path.join('src', 'main', 'pet-bubble-chat-preload.js')
]

const readPreloadSource = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf-8')

const extractIpcObjectLiteral = (source, relativePath) => {
  const start = source.indexOf('const IPC =')
  assert.notEqual(start, -1, `${relativePath} must declare a local IPC object`)
  const objectStart = source.indexOf('{', start)
  assert.notEqual(objectStart, -1, `${relativePath} IPC declaration must be an object literal`)
  const objectEnd = source.indexOf('\n}', objectStart)
  assert.notEqual(objectEnd, -1, `${relativePath} IPC declaration must close on its own line`)
  return source.slice(objectStart, objectEnd + 2)
}

const parsePreloadIpc = (relativePath) => {
  const source = readPreloadSource(relativePath)
  const literal = extractIpcObjectLiteral(source, relativePath)
  return vm.runInNewContext(`(${literal})`, Object.create(null), {
    timeout: 1000,
    filename: `${relativePath}:IPC`
  })
}

const collectIpcReferences = (source) => (
  [...source.matchAll(/\bIPC\.([A-Z0-9_]+)/g)].map((match) => match[1])
)

test('preload IPC channel copies match the shared main-process IPC contract', () => {
  for (const relativePath of PRELOAD_FILES) {
    const source = readPreloadSource(relativePath)
    const localIpc = parsePreloadIpc(relativePath)
    const referencedKeys = new Set(collectIpcReferences(source))

    for (const [key, channel] of Object.entries(localIpc)) {
      assert.equal(IPC[key], channel, `${relativePath} IPC.${key} must match shared channel`)
    }

    for (const key of referencedKeys) {
      assert.ok(Object.hasOwn(localIpc, key), `${relativePath} references IPC.${key} without declaring it locally`)
      assert.ok(Object.hasOwn(IPC, key), `${relativePath} references IPC.${key} missing from shared contract`)
    }
  }
})
