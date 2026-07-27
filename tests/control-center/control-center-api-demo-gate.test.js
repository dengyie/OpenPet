const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const apiSourcePath = path.resolve(__dirname, '../../src/control-center/src/api/control-center-api.ts')
const readApiSource = () => fs.readFileSync(apiSourcePath, 'utf8')

// 静态守卫：demo API 是一份 4.8k 行的全量内存假后端。真机上 preload 桥总会注入，
// 所以走到回退意味着桥加载失败——此时静默返回伪造的设置/宠物包/Provider 健康，
// 比直接失败更糟：用户会在一个永远同步不到主进程的状态上做修改。
//
// 门禁必须写成内联的 import.meta.env.DEV 判断，Vite 才能常量折叠掉该分支并把
// demo 模块整体 tree-shake 出生产包。抽成 isDemoFallbackAllowed() 之类的辅助函数
// 会让常量折叠失效（实测：56 modules / 无 demo chunk 退回 57 modules / 92.4kB chunk），
// 门禁在运行时仍然生效但产物里仍然带着这份假后端。
test('demo control center backend stays gated behind an inlined import.meta.env.DEV check', () => {
  const source = readApiSource()

  const demoImportLine = source
    .split('\n')
    .find((line) => line.includes("import('./demo-control-center-api.ts')"))
  assert.ok(demoImportLine, 'expected a dynamic import of the demo Control Center API')

  assert.match(
    source,
    /if \(!import\.meta\.env\?\.DEV\) throw/,
    'demo fallback must be gated by an inlined `if (!import.meta.env?.DEV) throw` guard'
  )

  const guardIndex = source.indexOf('if (!import.meta.env?.DEV) throw')
  const demoImportIndex = source.indexOf("import('./demo-control-center-api.ts')")
  assert.ok(
    guardIndex >= 0 && guardIndex < demoImportIndex,
    'the DEV guard must run before the demo module is imported'
  )
})

// 订阅类方法没有可以 reject 的调用方，门禁生效时必须静默失败而不是抛进
// unhandled rejection —— 后者会在控制中心加载失败时再叠一层噪音错误。
test('gated subscription fallback cannot raise an unhandled rejection', () => {
  const source = readApiSource()
  const subscribeBlock = source.slice(source.indexOf("if (property === 'onSettingsChanged')"))

  assert.match(
    subscribeBlock.slice(0, subscribeBlock.indexOf('return () => {')),
    /\.catch\(\(\) => \{\}\)/,
    'the onSettingsChanged demo fallback must swallow the gated rejection'
  )
})
