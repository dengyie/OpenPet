/**
 * Preload IPC 一致性回归。
 *
 * preload 脚本因 Electron 沙盒限制内联维护了一份 IPC 通道常量表（无法 require
 * 项目子目录模块），这份表容易与 src/shared/ipc-channels.js 漂移：
 * - 曾出现 preload 引用 IPC.PET_PLAY_ACTION 但内联表缺失该键，
 *   导致 ipcRenderer.invoke(undefined) 恒定抛错；
 * - 曾出现 contextBridge 暴露对象中重复键（onActivePetPackChanged 定义两次），
 *   后者静默覆盖前者。
 * 本测试静态解析 preload 源码，锁死这两类回归。
 */
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')

const { IPC: SHARED_IPC } = require('../../src/shared/ipc-channels')

const PROJECT_ROOT = path.join(__dirname, '..', '..')
const PRELOAD_FILES = ['preload.js', 'control-center-preload.js']

const readPreload = (fileName) => fs.readFileSync(path.join(PROJECT_ROOT, fileName), 'utf8')

// 提取内联 `const IPC = { ... }` 表的键值对（按出现顺序，含重复项）。
const extractInlineIpcEntries = (source) => {
  const match = source.match(/const IPC = \{([\s\S]*?)\n\}/)
  assert.ok(match, 'preload 应包含内联 const IPC = { ... } 表')
  const entries = []
  for (const line of match[1].split('\n')) {
    const entry = line.match(/^\s*([A-Z][A-Z0-9_]*):\s*'([^']+)'/)
    if (entry) entries.push({ key: entry[1], value: entry[2] })
  }
  assert.ok(entries.length > 0, '内联 IPC 表不应为空')
  return entries
}

// 提取源码中所有 IPC.X 引用。
const extractIpcReferences = (source) => {
  const refs = new Set()
  for (const match of source.matchAll(/\bIPC\.([A-Z][A-Z0-9_]*)/g)) refs.add(match[1])
  return refs
}

// 提取 contextBridge.exposeInMainWorld 暴露对象的顶层属性名（含重复项）。
// preload 代码风格固定为两空格缩进的顶层键，行级匹配足够稳健。
const extractExposedApiKeys = (source) => {
  const match = source.match(/contextBridge\.exposeInMainWorld\([^,]+,\s*\{([\s\S]*)\n\}\)/)
  assert.ok(match, 'preload 应通过 contextBridge.exposeInMainWorld 暴露 API')
  const keys = []
  for (const line of match[1].split('\n')) {
    const entry = line.match(/^ {2}([A-Za-z_$][\w$]*):/)
    if (entry) keys.push(entry[1])
  }
  assert.ok(keys.length > 0, '暴露的 API 对象不应为空')
  return keys
}

const findDuplicates = (items) => {
  const seen = new Set()
  const duplicates = new Set()
  for (const item of items) {
    if (seen.has(item)) duplicates.add(item)
    seen.add(item)
  }
  return [...duplicates]
}

for (const fileName of PRELOAD_FILES) {
  test(`${fileName}: 每个 IPC.X 引用都在内联表中定义`, () => {
    const source = readPreload(fileName)
    const inlineKeys = new Set(extractInlineIpcEntries(source).map((entry) => entry.key))
    const missing = [...extractIpcReferences(source)].filter((key) => !inlineKeys.has(key))
    assert.deepStrictEqual(missing, [], `内联 IPC 表缺失被引用的键：${missing.join(', ')}`)
  })

  test(`${fileName}: 内联表与 src/shared/ipc-channels.js 保持一致`, () => {
    const source = readPreload(fileName)
    for (const { key, value } of extractInlineIpcEntries(source)) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(SHARED_IPC, key),
        `内联键 ${key} 在共享 IPC 表中不存在`
      )
      assert.strictEqual(
        SHARED_IPC[key],
        value,
        `内联键 ${key} 的通道名与共享表不一致`
      )
    }
  })

  test(`${fileName}: 内联表无重复键`, () => {
    const source = readPreload(fileName)
    const duplicates = findDuplicates(extractInlineIpcEntries(source).map((entry) => entry.key))
    assert.deepStrictEqual(duplicates, [], `内联 IPC 表存在重复键：${duplicates.join(', ')}`)
  })

  test(`${fileName}: 暴露的 API 对象无重复键`, () => {
    const source = readPreload(fileName)
    const duplicates = findDuplicates(extractExposedApiKeys(source))
    assert.deepStrictEqual(duplicates, [], `暴露对象存在重复键（后者会静默覆盖前者）：${duplicates.join(', ')}`)
  })
}
