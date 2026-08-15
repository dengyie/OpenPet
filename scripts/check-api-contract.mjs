#!/usr/bin/env node
/**
 * check:api-contract —— M0 门禁(docs/refactor/03-api-contract.md §9 第 3 条)
 *
 * 现在就能跑,不依赖尚未存在的路由注册表。它做两类事:
 *
 *   A. 逐字对账 —— 把 docs/refactor/03-api-contract.md 里的枚举与
 *      packages/contracts/src/*.ts 里的枚举比对,任一侧多写或漏写都报错。
 *      对账六项:事件名、事件归属 topic、topic 清单、Job kind、Job 状态、错误码。
 *
 *   B. 重算文档里的算术 —— §3 通道去向总表的行内等式与总计。
 *      01 篇曾出现「合计 153」而实际应为 154 的错误,靠人眼没看出来。
 *
 * 退出码 1 表示对账失败。M1 起再补两项硬检查:
 *   - 后端实际注册的路由 vs 契约路由表
 *   - src/shared/ipc-channels.ts 的通道盘点数 vs §3 的 154
 *
 * 用法:node scripts/check-api-contract.mjs
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const DOC_PATH = "docs/refactor/03-api-contract.md"

const problems = []
const passes = []
const todos = []

const fail = (scope, message) => problems.push(`[${scope}] ${message}`)

function readText(rel) {
  try {
    return readFileSync(join(ROOT, rel), "utf8")
  } catch {
    fail("fs", `读不到 ${rel}`)
    return ""
  }
}

/** 抽 `export const NAME = [ ... ] as const` 里的字符串成员 */
function constArray(source, file, name) {
  const marker = `export const ${name} = [`
  const start = source.indexOf(marker)
  if (start === -1) {
    fail("contracts", `${file} 里找不到 ${marker}`)
    return []
  }
  const end = source.indexOf("] as const", start)
  if (end === -1) {
    fail("contracts", `${file} 的 ${name} 缺少 "] as const" 收尾`)
    return []
  }
  return quoted(source.slice(start + marker.length, end))
}

/** 抽 `"key": "value",` 形式的映射(要求冒号后恰好一个空格) */
function constRecord(source, file, name) {
  const start = source.indexOf(`export const ${name}`)
  if (start === -1) {
    fail("contracts", `${file} 里找不到 export const ${name}`)
    return {}
  }
  const end = source.indexOf("\n}", start)
  const body = source.slice(start, end === -1 ? source.length : end)
  const out = {}
  for (const m of body.matchAll(/"([^"]+)": "([^"]+)"/g)) out[m[1]] = m[2]
  return out
}

const quoted = (text) => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1])
const backticked = (text) => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1])

/** 从文档切出一节:标题行之后,到下一个 # 标题之前 */
function section(doc, headingPrefix) {
  const lines = doc.split("\n")
  const start = lines.findIndex((l) => l.startsWith(headingPrefix))
  if (start === -1) {
    fail("doc", `${DOC_PATH} 里找不到小节「${headingPrefix}」`)
    return ""
  }
  let end = lines.length
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith("#")) {
      end = i
      break
    }
  }
  return lines.slice(start + 1, end).join("\n")
}

const isSeparatorRow = (t) =>
  [...t].every((ch) => ch === "|" || ch === "-" || ch === ":" || ch === " " || ch === "\t")

/** markdown 表格 -> 数据行(已剔除表头行与分隔行),每行是 cell 数组 */
function tableRows(text) {
  const rows = []
  for (const line of text.split("\n")) {
    const t = line.trim()
    if (!t.startsWith("|")) continue
    if (isSeparatorRow(t)) continue
    const inner = t.endsWith("|") ? t.slice(1, -1) : t.slice(1)
    rows.push(inner.split("|").map((c) => c.trim()))
  }
  return rows.slice(1)
}

const toNumber = (cell) => Number(cell.split("*").join("").trim())
const missingFrom = (a, b) => a.filter((x) => !b.includes(x))

function compare(label, fromDoc, fromCode) {
  const missing = missingFrom(fromDoc, fromCode)
  const extra = missingFrom(fromCode, fromDoc)
  if (missing.length) fail("drift", `${label}:文档有、契约无 -> ${missing.join("、")}`)
  if (extra.length) fail("drift", `${label}:契约有、文档无 -> ${extra.join("、")}`)
  if (!missing.length && !extra.length) passes.push(`${label} 一致(${fromDoc.length} 项)`)
}

// ---------------------------------------------------------------------------

const doc = readText(DOC_PATH)
const envelopeSrc = readText("packages/contracts/src/envelope.ts")
const jobsSrc = readText("packages/contracts/src/jobs.ts")
const eventsSrc = readText("packages/contracts/src/events.ts")

// --- A1. SSE 事件名与归属 topic --------------------------------------------

const docEventNames = []
const docEventTopic = {}
for (const cells of tableRows(section(doc, "### 事件目录"))) {
  const topic = backticked(cells[0] ?? "")[0]
  for (const name of backticked(cells[1] ?? "")) {
    docEventNames.push(name)
    if (topic) docEventTopic[name] = topic
  }
}
compare("SSE 事件名", docEventNames, constArray(eventsSrc, "events.ts", "EVENT_NAMES"))

const codeEventTopic = constRecord(eventsSrc, "events.ts", "EVENT_TOPIC")
for (const [name, topic] of Object.entries(docEventTopic)) {
  const actual = codeEventTopic[name]
  if (actual === undefined) fail("drift", `EVENT_TOPIC 缺少 ${name} 的归属`)
  else if (actual !== topic) fail("drift", `${name} 归属不一致:文档 ${topic},契约 ${actual}`)
}
if (!problems.some((p) => p.includes("EVENT_TOPIC") || p.includes("归属"))) {
  passes.push(`事件 -> topic 归属一致(${Object.keys(docEventTopic).length} 项)`)
}

// --- A2. topic 清单 --------------------------------------------------------

const topicsLine = doc.split("\n").find((l) => l.includes("的全量可选值"))
if (!topicsLine) fail("doc", "§5 里找不到 topics 全量可选值那一行")
const docTopics = topicsLine ? backticked(topicsLine).filter((t) => t !== "topics") : []
compare("SSE topic 清单", docTopics, constArray(eventsSrc, "events.ts", "SSE_TOPICS"))

// 事件目录里出现的 topic 必须都在 topic 清单里
for (const topic of new Set(Object.values(docEventTopic))) {
  if (!docTopics.includes(topic)) fail("doc", `事件目录用了未登记的 topic:${topic}`)
}

// --- A3. Job kind 与状态 ---------------------------------------------------

compare("Job kind", backticked(section(doc, "### 6.3 ")), constArray(jobsSrc, "jobs.ts", "JOB_KINDS"))

const statusLine = section(doc, "### 6.2 ")
  .split("\n")
  .find((l) => {
    const tokens = backticked(l)
    return tokens.includes("queued") && tokens.includes("interrupted")
  })
if (!statusLine) fail("doc", "§6.2 里找不到 status 枚举那一行")
const docStatuses = statusLine ? backticked(statusLine).filter((s) => s !== "status") : []
compare("Job 状态", docStatuses, constArray(jobsSrc, "jobs.ts", "JOB_STATUSES"))

// --- A4. 错误码 ------------------------------------------------------------

const docErrorCodes = [
  ...new Set(backticked(section(doc, "### 2.3 ")).filter((t) => /^[A-Z][A-Z0-9_]+$/.test(t))),
]
compare("错误码", docErrorCodes, constArray(envelopeSrc, "envelope.ts", "ERROR_CODES"))

// --- B. §3 通道去向总表的算术 ---------------------------------------------

let sumTotal = 0
let sumKept = 0
let sumMoved = 0
let declared = null

for (const cells of tableRows(section(doc, "## 3. "))) {
  const nums = [toNumber(cells[1] ?? ""), toNumber(cells[2] ?? ""), toNumber(cells[3] ?? "")]
  if (nums.some((n) => !Number.isFinite(n))) continue
  const label = (cells[0] ?? "").split("*").join("").trim()
  if (label.includes("合计")) {
    declared = nums
    continue
  }
  if (nums[1] + nums[2] !== nums[0]) {
    fail("math", `§3「${label}」行:留 ${nums[1]} + 迁 ${nums[2]} != 通道数 ${nums[0]}`)
  }
  sumTotal += nums[0]
  sumKept += nums[1]
  sumMoved += nums[2]
}

if (declared === null) {
  fail("doc", "§3 通道表里找不到「合计」行")
} else {
  const labels = ["通道数", "留 IPC", "迁 HTTP"]
  const computed = [sumTotal, sumKept, sumMoved]
  let ok = true
  for (let i = 0; i < 3; i += 1) {
    if (declared[i] !== computed[i]) {
      fail("math", `§3 合计「${labels[i]}」写 ${declared[i]},逐行相加得 ${computed[i]}`)
      ok = false
    }
  }
  if (sumKept + sumMoved !== sumTotal) {
    fail("math", `§3 留 ${sumKept} + 迁 ${sumMoved} != 合计 ${sumTotal}`)
    ok = false
  }
  if (ok) passes.push(`§3 通道表算术自洽(${sumTotal} = ${sumKept} 留 + ${sumMoved} 迁)`)
}

// --- 尚未硬化的检查 --------------------------------------------------------

let routeRows = 0
for (let i = 1; i <= 10; i += 1) {
  const body = doc.split("\n")
  const idx = body.findIndex((l) => l.startsWith(`### 4.${i} `))
  if (idx === -1) continue
  let end = body.length
  for (let j = idx + 1; j < body.length; j += 1) {
    if (body[j].startsWith("#")) {
      end = j
      break
    }
  }
  routeRows += tableRows(body.slice(idx + 1, end).join("\n")).length
}
todos.push(`§4 路由表共 ${routeRows} 行;后端路由注册表尚未存在,M1 起改为硬检查`)

try {
  const channelsSrc = readFileSync(join(ROOT, "src/shared/ipc-channels.ts"), "utf8")
  const literals = new Set(quoted(channelsSrc).filter((s) => s.includes(":")))
  todos.push(
    `src/shared/ipc-channels.ts 含冒号的字符串字面量 ${literals.size} 个,§3 盘点 ${sumTotal} 个;` +
      "字面量形状确认后改为硬检查",
  )
} catch {
  todos.push("读不到 src/shared/ipc-channels.ts,跳过通道盘点比对")
}

// --- 输出 ------------------------------------------------------------------

for (const p of passes) console.log(`  ok    ${p}`)
for (const t of todos) console.log(`  todo  ${t}`)

if (problems.length > 0) {
  console.error(`\ncheck:api-contract 失败,共 ${problems.length} 处:`)
  for (const p of problems) console.error(`  x     ${p}`)
  console.error("\n改契约与改文档必须同时进行 —— 见 docs/refactor/03-api-contract.md §9。")
  process.exitCode = 1
} else {
  console.log(`\ncheck:api-contract 通过(${passes.length} 项对账,${todos.length} 项待硬化)`)
}
