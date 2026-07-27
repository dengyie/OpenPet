/**
 * 共享原子 JSON 写入工具回归。
 *
 * writeJsonAtomic 曾在 settings.js、ai-talk-store.js、hatch-pet-agent-store.js、
 * system-cursor-service.js 各自维护私有拷贝；此测试锁定共享实现的核心契约：
 * - tmp+rename 原子替换，写出内容带末尾换行；
 * - 自动创建父目录；
 * - 写入失败时清理临时文件并向调用方抛错（不吞失败）。
 */
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { writeJsonAtomic } = require('../../src/main/json-file-utils')

test('writeJsonAtomic writes formatted JSON with trailing newline', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-json-utils-'))
  const target = path.join(dir, 'value.json')
  writeJsonAtomic(target, { a: 1, b: ['x'] })
  const raw = fs.readFileSync(target, 'utf-8')
  assert.strictEqual(raw, `${JSON.stringify({ a: 1, b: ['x'] }, null, 2)}\n`)
})

test('writeJsonAtomic creates missing parent directories', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-json-utils-'))
  const target = path.join(dir, 'nested', 'deep', 'value.json')
  writeJsonAtomic(target, { ok: true })
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf-8')), { ok: true })
})

test('writeJsonAtomic replaces existing content atomically', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-json-utils-'))
  const target = path.join(dir, 'value.json')
  writeJsonAtomic(target, { version: 1 })
  writeJsonAtomic(target, { version: 2 })
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf-8')), { version: 2 })
  const leftovers = fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'))
  assert.deepStrictEqual(leftovers, [], '不应留下临时文件')
})

test('writeJsonAtomic propagates write failure and cleans up the temp file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-json-utils-'))
  // 目标路径是一个已存在的目录：rename 文件到目录会失败。
  const target = path.join(dir, 'value.json')
  fs.mkdirSync(target)
  assert.throws(() => writeJsonAtomic(target, { boom: true }))
  const leftovers = fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'))
  assert.deepStrictEqual(leftovers, [], '失败后应清理临时文件')
})

test('writeJsonAtomic rejects unserializable values without touching the target', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpet-json-utils-'))
  const target = path.join(dir, 'value.json')
  writeJsonAtomic(target, { keep: true })
  const cyclic = {}
  cyclic.self = cyclic
  assert.throws(() => writeJsonAtomic(target, cyclic))
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf-8')), { keep: true })
})
