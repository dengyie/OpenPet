const test = require('node:test')
const assert = require('node:assert/strict')

const { applyNavigationLock } = require('../../src/main/window')

// Minimal stand-in for a BrowserWindow's webContents. applyNavigationLock
// registers handlers we can then invoke with crafted URLs to assert which
// navigations are blocked vs allowed.
const createMockWebContents = () => {
  const handlers = {}
  return {
    on: (event, handler) => { handlers[event] = handler },
    setWindowOpenHandler: (handler) => { handlers.windowOpen = handler },
    emit: (event, ...args) => handlers[event]?.(...args),
    callOpen: () => handlers.windowOpen?.({ url: '' }),
    hasHandler: (event) => Boolean(handlers[event])
  }
}

test('navigation lock only allows the configured entry document', () => {
  const wc = createMockWebContents()
  applyNavigationLock(
    { webContents: wc },
    '/app/dist/control-center/index.html'
  )

  const blocked = []
  const blockedUrls = [
    'http://evil.example.com/',
    'https://evil.example.com/x',
    'javascript:alert(1)',
    'file:///tmp/attacker-controlled.html',
    'file:///app/index.html'
  ]
  for (const url of blockedUrls) {
    const event = { preventDefault: () => blocked.push(url) }
    wc.emit('will-navigate', event, url)
  }
  assert.deepEqual(blocked, blockedUrls)

  const allowed = []
  for (const url of [
    'file:///app/dist/control-center/index.html',
    'file:///app/dist/control-center/index.html?tab=ai#provider'
  ]) {
    wc.emit('will-navigate', { preventDefault: () => allowed.push(url) }, url)
  }
  assert.deepEqual(allowed, [])
})

// data: 曾经在白名单里，因为 build-missing 兜底页用的是 data:text/html。
// 但那些兜底页都走主进程 loadURL，不触发 will-navigate；留着白名单只会让
// 渲染进程侧的 XSS 把自己导航到攻击者构造的文档上，而那个文档仍然持有
// 本窗口的 preload 桥。
test('navigation lock blocks data: navigations from the renderer', () => {
  const wc = createMockWebContents()
  applyNavigationLock({ webContents: wc }, '/app/index.html')

  const blocked = []
  const dataUrls = [
    'data:text/html,<script>window.openpet</script>',
    'data:text/html;charset=utf-8,%3Cscript%3E1%3C/script%3E'
  ]
  for (const url of dataUrls) {
    wc.emit('will-navigate', { preventDefault: () => blocked.push(url) }, url)
  }
  assert.deepEqual(blocked, dataUrls)
})

test('navigation lock fails closed when no entry document is configured', () => {
  const { pathToFileURL } = require('node:url')
  const wc = createMockWebContents()
  applyNavigationLock({ webContents: wc })

  let blocked = false
  wc.emit('will-navigate', {
    preventDefault: () => { blocked = true }
  }, pathToFileURL(process.cwd()).toString())

  assert.equal(blocked, true)
})

test('navigation lock denies all window.open and webview attachment', () => {
  const wc = createMockWebContents()
  applyNavigationLock({ webContents: wc }, '/app/index.html')

  assert.deepEqual(wc.callOpen(), { action: 'deny' })

  const prevented = []
  wc.emit('will-attach-webview', { preventDefault: () => prevented.push('webview') })
  assert.deepEqual(prevented, ['webview'])
})

// 静态守卫：新增窗口时最容易漏掉导航加固，而漏掉的代价是把 preload 桥
// 交给远端页面。这里对所有创建 BrowserWindow 的主进程文件做源码级检查，
// 要求每个文件要么调用 applyNavigationLock，要么自己覆盖三个出口。
test('every main-process window applies navigation hardening', () => {
  const fs = require('fs')
  const path = require('path')
  const mainDir = path.join(__dirname, '..', '..', 'src', 'main')
  const files = fs.readdirSync(mainDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ name, source: fs.readFileSync(path.join(mainDir, name), 'utf8') }))
    .filter(({ source }) => /new (session\.)?BrowserWindow\(/.test(source))

  assert.ok(files.length >= 4, `expected to find window-creating files, found ${files.length}`)

  const unhardened = files.filter(({ name, source }) => {
    if (name === 'packaged-creator-studio-ui-e2e-runner.js') return false
    if (source.includes('applyNavigationLock(')) return false
    return !(
      source.includes("on('will-navigate'") &&
      source.includes('setWindowOpenHandler') &&
      source.includes("on('will-attach-webview'")
    )
  }).map(({ name }) => name)

  assert.deepEqual(unhardened, [])
})
