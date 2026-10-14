const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('live development docs describe the current Shell/sidecar/backend call chain', () => {
  const sources = [
    read('AGENTS.md'),
    read('README.md'),
    read('docs/development-workflow.md'),
    read('docs/development-summary.md'),
    read('docs/refactor/02-architecture.md'),
    read('docs/refactor/09-repo-state.md')
  ].join('\n')

  for (const token of [
    'apps/desktop/src/sidecar',
    'services/backend',
    'packages/contracts',
    'createSidecarRuntimeCoordinator',
    'spawnSidecar',
    'services/backend/index.js'
  ]) assert.ok(sources.includes(token), token)
})

test('Chinese development guide reflects the current Shell/sidecar/backend ownership', () => {
  const guide = read('docs/jishuwendang.md')
  for (const token of [
    'createOpenPetRuntime()',
    'createSidecarRuntimeCoordinator()',
    'spawnSidecar()',
    'services/backend/index.js',
    'services/backend/routes/registry.js',
    'packages/contracts/',
    'settings-persistence-queue.js',
    '140 个 IPC',
    '120 个已注册 REST 路由',
    '119 个 API 文档行',
    '方法级矩阵'
  ]) assert.ok(guide.includes(token), token)
  assert.match(guide, /迁移仍在进行中，`src\/main\/` 不是历史目录/)
  assert.match(guide, /没有通用服务端去重或结果缓存/)
  assert.doesNotMatch(guide, /最后更新：2026-07-05/)
})

test('live maintainer docs expose the current migration slice and gate prerequisite', () => {
  const todo = read('docs/TODO.md')
  const handoff = read('docs/HANDOFF.md')
  const context = JSON.parse(read('docs/project-context.json'))

  assert.match(todo, /createSettingsPersistenceQueue|FIFO deferred persistence/)
  assert.match(todo, /Job cancellation and recovery/)
  assert.match(todo, /build:contracts/)
  assert.match(handoff, /createSettingsPersistenceQueue/)
  assert.match(handoff, /Job cancellation and recovery/)
  assert.match(handoff, /build:contracts/)
  assert.match(context.currentFacts.join('\n'), /createSettingsPersistenceQueue/)
  assert.match(context.currentFacts.join('\n'), /Job cancellation and recovery/)
  assert.match(context.currentFacts.join('\n'), /build:contracts/)

  assert.match(todo, /140 IPC channels[\s\S]*120 registered REST routes[\s\S]*119 documented/)
  assert.match(handoff, /Provider credentials are Shell-owned[\s\S]*in-memory copy/)
  assert.ok(context.validation.commands.includes('npm run build:contracts'))
  assert.ok(context.validation.commands.includes('npm run check:api-contract'))
})

test('migration docs distinguish registered routes from target and blocked rows', () => {
  const api = read('docs/refactor/03-api-contract.md')
  const repoState = read('docs/refactor/09-repo-state.md')
  const plan = read('docs/superpowers/plans/2026-10-04-openpet-development-plan.md')

  assert.match(api, /120 条已注册路由.*119 条路由行/)
  assert.match(api, /settings\/cursor\/import.*原生选择器和文件导入由 Shell 持有/)
  assert.match(api, /settings\/preview-scale.*验证 0.5–1.5 缩放值/)
  assert.match(api, /settings\/schema.*返回版本化可写路径/)
  assert.match(api, /五条 Settings 路由均已注册/)
  assert.match(api, /未进入 registry 的路由属于目标或 blocked 能力/)
  assert.match(repoState, /120 条已注册路由、119 条文档路由行/)
  assert.match(plan, /140 IPC \(45 retained Shell \+ 95 migration\)/)
  assert.match(plan, /120\/119 registered\/documented REST rows/)
  assert.match(plan, /Task 6 status: no candidate is safe to delete/)
})

test('API docs do not present unregistered Creator routes as shipped', () => {
  const api = read('docs/refactor/03-api-contract.md')
  assert.match(api, /Creator Studio[\s\S]*当前状态：未装配/)
  assert.match(api, /\/creator\/sprites\/evaluate.*blocked：未装配/)
  assert.match(api, /\/creator\/workflows\/\{id\}\/run.*目标：Job；未装配/)
  assert.doesNotMatch(api, /\/creator\/sprites\/evaluate.*✅/)
})

test('handoff and architecture docs keep closed infrastructure gaps closed', () => {
  const architecture = read('docs/refactor/02-architecture.md')
  const handoff = read('docs/refactor/14-handoff.md')
  assert.match(architecture, /缺口 G11 已关闭/)
  assert.match(architecture, /file-backed.*journal_mode='wal'/)
  assert.match(handoff, /缺口 G1 已关闭/)
  assert.match(handoff, /缺口 G11:file-backed WAL 未验证.*已关闭/)
  assert.match(handoff, /未显式进入 CI.*已关闭/)
  assert.doesNotMatch(handoff, /缺口 G1.*仍保持 ⏳/)
})

test('API docs do not present unregistered Creator routes as shipped', () => {
  const api = read('docs/refactor/03-api-contract.md')
  assert.match(api, /Creator Studio[\s\S]*当前状态：未装配/)
  assert.match(api, /\/creator\/sprites\/evaluate.*blocked：未装配/)
  assert.match(api, /\/creator\/workflows\/\{id\}\/run.*目标：Job；未装配/)
  assert.doesNotMatch(api, /\/creator\/sprites\/evaluate.*✅/)
})

test('handoff and architecture docs keep closed infrastructure gaps closed', () => {
  const architecture = read('docs/refactor/02-architecture.md')
  const handoff = read('docs/refactor/14-handoff.md')
  assert.match(architecture, /缺口 G11 已关闭/)
  assert.match(architecture, /file-backed.*journal_mode='wal'/)
  assert.match(handoff, /缺口 G1 已关闭/)
  assert.match(handoff, /缺口 G11:file-backed WAL 未验证.*已关闭/)
  assert.match(handoff, /未显式进入 CI.*已关闭/)
  assert.doesNotMatch(handoff, /缺口 G1.*仍保持 ⏳/)
})

test('historical refactor entry points route maintainers to live docs', () => {
  const start = read('docs/refactor/00-START-HERE.md')
  const currentState = read('docs/refactor/01-current-state.md')

  assert.match(start, /迁移执行参考，不是当前唯一任务队列/)
  assert.match(start, /development-workflow\.md/)
  assert.match(start, /npm run build:contracts/)
  assert.match(start, /npm run check:channel-retirement/)
  assert.match(currentState, /历史快照，不作为当前代码事实/)
})

test('development plan names production lifecycle and deletion boundaries', () => {
  const plan = read('docs/superpowers/plans/2026-10-04-openpet-development-plan.md')
  for (const token of [
    'createSettingsMutationCoordinator',
    'runner.run/cancel/shutdown',
    'recoverJobs',
    'shell-client.request',
    'runtime-coordinator.start/stop',
    'npm run check:channel-retirement',
    'No deletion is proposed without import/call-site/test/build reachability proof'
  ]) assert.ok(plan.includes(token), token)
})

test('development plan records the verified Catalog install vertical slice without closing Task 5', () => {
  const plan = read('docs/superpowers/plans/2026-10-04-openpet-development-plan.md')
  assert.match(plan, /Verified vertical slice: Catalog install/)
  for (const token of [
    'useCatalogPane.onInstallSelection()',
    'registerCatalogRoutes()',
    'runtime.catalog.installSelection()',
    'createCatalogService.request',
    'catalog.request reverse channel',
    'createOpenPetRuntime.onCatalogRequest()',
    'createCatalogSidecarBridge.handle()',
    'Shell catalogService.installSelection()',
    'reloadAndSendAnimations()/refreshTriggerRuleRuntime()',
    'resolveCatalogInstallJob()',
    'tests/backend/runtime-bindings.test.js',
    'Catalog\'s install retry, outage, resource locking,',
    'finalizing cancellation, event ordering, and Shell bridge boundaries now have'
  ]) assert.ok(plan.includes(token), token)
	assert.match(plan, /## Task 5: Backend Domains Before UI[\s\S]*?- \[x\] Trace the shipped route-to-domain-to-side-effect path/)
})

test('development plan records method-level ownership and evidence boundaries for every Task 5 domain', () => {
  const plan = read('docs/superpowers/plans/2026-10-04-openpet-development-plan.md')
  for (const token of [
    '### 5.1 Settings',
    'createSettingsStore.patch/read/invalidate',
    '### 5.2 Actions',
    'createActionService.list/get/updateConfig/remove/inspectFrames/reinspect/importFrames/runImportFrames/clearSelection/previewProposal/submitProposal/acceptProposal/rejectProposal/updateRule/deleteRule',
    '### 5.3 Pet packs',
    'createPetPackService.list/get/inspect/clearSelection/activate/remove/import/export/runImport/runExport',
    '### 5.4 Catalog',
    'catalog.install` has `MAX_ATTEMPTS_BY_KIND = 2`',
    '### 5.5 Plugins',
    'createPluginService.list/get/inspectInstall/commitInstall/install/inspectGithub/commitGithubInstall/installGithub/remove/start/stop/status/setEnabled/setNativeExecutionApproved',
    '### 5.6 AI / images',
    'createAiService.getConfig/saveConfig/saveProviderApiKey/clearProviderApiKey/prepareGeneratedImage/commitGeneratedImage',
		'focused success, validation, dependency-failure, retryability, event, and terminal-state regressions'
  ]) assert.ok(plan.includes(token), token)
  assert.match(plan, /Current status \| \*\*implemented for the Actions vertical slice; Task 5 remains partial\*\*/)
  assert.match(plan, /Current status \| \*\*partial\*\* \|/)
})

test('AI migration docs keep shipped facades, remaining IPC, and partial status aligned', () => {
  const plan = read('docs/superpowers/plans/2026-10-04-openpet-development-plan.md')
  const api = read('docs/refactor/03-api-contract.md')
  const ledger = read('docs/refactor/15-channel-retirement.md')
  assert.match(plan, /AI pane state without overwriting the PetService main conversation snapshot/)
  assert.match(plan, /Current status \| \*\*partial\*\*[\s\S]*Remaining AI legacy IPC is chat-window state/)
  assert.match(api, /当前 AI 目标路由均已进入运行时 registry。Control Center 运行时已将配置、密钥、Persona、Memory、聊天、对话、Trace、行为配置\/规则\/dry-run\/replay\/export\/clear 及图片配置\/密钥\/健康\/模型探测接入 Backend/)
  assert.match(ledger, /\| Current cutover \| 82 \|/)
  assert.match(ledger, /\| Current blocked \| 18 \|/)
  assert.match(ledger, /\| `hatch-pet-agent:save-config` \| `cutover:ai` \|/)
  assert.match(ledger, /\| `ai-behavior:replay-decision` \| `cutover:ai` \|/)
})

test('development plan locks the plugin install transient-input and resource-lock boundary', () => {
  const plan = read('docs/superpowers/plans/2026-10-04-openpet-development-plan.md')
  const review = read('docs/reviews/2026-10-04-development-docs-review.md')
  const task = read('docs/refactor/13-tasks-m3.md')
  for (const token of [
    'githubInstallInput',
    'normalizePluginGithubRepositoryUrl()',
    'pluginGithubResourceKey()',
    'createJobDispatcher',
    'takePrivateInput()',
    'forgetPrivateInput()',
    'resolvePrivatePluginInput()',
    'jobs.input_json`, HTTP Job responses, logs, and evidence retain only the redacted summary',
    'recoverJobs()',
    'never automatically replayed',
  ]) assert.ok(plan.includes(token), token)
  assert.match(plan, /`canRetry\(\)` and\s+the repository's public `canRetry` projection/)
  for (const token of [
    '插件安装 Job 的脱敏输入丢失导致真实安装链路无法执行',
    '真实 `POST /plugins/install`、`POST /plugins/install/github`',
    'resolvePrivatePluginInput()',
    '缺失 transient input 返回不可重试的 `409 CONFLICT`',
    '重启时的 redacted plugin install/command Job 标为 `interrupted`'
  ]) assert.ok(review.includes(token), token)
  assert.ok(task.includes('"github:{owner}/{repo}"'))
})

test('plugin plan records the completed declared HTTP operation matrix', () => {
  const todo = read('docs/TODO.md')
  const handoff = read('docs/HANDOFF.md')
  const plan = read('docs/superpowers/plans/2026-10-04-openpet-development-plan.md')
  assert.match(todo, /Plugin route tests pass \*\*24\/24\*\* and Backend passes \*\*387\/387\*\*/)
  assert.ok(handoff.includes('Plugin routes pass **24/24**, Backend **387/387**'))
  assert.match(plan, /complete success and missing-domain dependency matrix/)
  assert.match(plan, /Plugin HTTP accepted-operation coverage is now complete/)
  assert.match(plan, /native picker\/dashboard behavior/)
})

test('API docs describe the current idempotency boundary instead of promising server-side dedupe', () => {
  const api = read('docs/refactor/03-api-contract.md')
  assert.match(api, /服务端是否去重必须按端点确认/)
  assert.match(api, /没有通用的幂等键存储、请求去重或结果重放机制/)
  assert.match(api, /retry: false/)
  assert.doesNotMatch(api, /幂等 \| 所有写操作支持可选 `Idempotency-Key` 头/)
})

test('migration docs keep current bridge counts and gate workflow', () => {
  const guide = read('docs/refactor/08-agent-guide.md')
  const state = read('docs/refactor/09-repo-state.md')
  const task = read('docs/refactor/11-tasks-m1-http.md')
  const handoff = read('docs/refactor/14-handoff.md')

  assert.match(guide, /backendToShellSchema.*18/)
  assert.match(guide, /SHELL_TO_BACKEND_TYPES.*15/)
  assert.match(guide, /npm run build:contracts/)
  assert.match(guide, /npm run check:docs-drift/)
  assert.match(state, /backendToShellSchema.*18 项/)
  assert.match(state, /shellToBackendSchema.*15 项/)
  assert.match(task, /历史 T12 缺口，已落地/)
  assert.match(handoff, /G2（历史记录）/)
  assert.doesNotMatch(guide, /提交前自己跑三条门禁/)
  assert.doesNotMatch(task, /T12 没落地,本卡做不了/)
})

test('historical roadmap and spike records cannot reopen closed infrastructure gaps', () => {
  const roadmap = read('docs/refactor/06-roadmap.md')
  const spike = read('docs/refactor/07-spike.md')

  assert.match(roadmap, /状态：历史迁移路线图/)
  assert.match(roadmap, /D4[\s\S]*✅ 已验证[\s\S]*缺口 G11 已关闭/)
  assert.match(spike, /状态：历史 spike 记录/)
  assert.match(spike, /历史 spike.*未证明 file-backed WAL[\s\S]*后续.*sqlite-driver.test.js.*验证 WAL/)
  assert.match(spike, /缺口 G11 已关闭/)
  assert.doesNotMatch(roadmap, /G11 尚须以 file-backed DB 验证/)
})

test('historical task cards point to the current Control Center path and current route authority', () => {
  const m1 = read('docs/refactor/11-tasks-m1-http.md')
  const m2 = read('docs/refactor/12-tasks-m2.md')
  const m3 = read('docs/refactor/13-tasks-m3.md')

  for (const doc of [m1, m2, m3]) assert.match(doc, /历史/)
  assert.ok(m1.includes('PUT /service/config` 缺口已由 T16 落地'))
  assert.ok(m2.includes('当前 Control Center 实际目录是 `src/control-center/`'))
  assert.ok(m3.includes('不存在 `apps/control-center/`'))
  assert.doesNotMatch(m2, /apps\/control-center\/src\//)
  assert.doesNotMatch(m3, /apps\/control-center\/src\//)
})

test('target architecture tree is explicitly separated from the current checkout', () => {
  const architecture = read('docs/refactor/02-architecture.md')
  assert.match(architecture, /目标 monorepo 形态/)
  assert.match(architecture, /当前 Electron 入口仍是根目录 `main.js`/)
  assert.ok(architecture.includes('Control Center 仍在 `src/control-center/`'))
})

test('frontend and shutdown docs distinguish current behavior from target behavior', () => {
  const architecture = read('docs/refactor/02-architecture.md')
  const frontend = read('docs/refactor/05-frontend.md')

  assert.match(architecture, /\{ type: 'shutdown' \}/)
  assert.match(architecture, /stopSidecar\(\{ graceMs \}\).*不把 `graceMs` 传给 Backend/)
  assert.doesNotMatch(architecture, /\{\s*type:\s*['"]shutdown['"],\s*graceMs/)

  for (const token of [
    'MSW 尚未接管',
    '没有 2s 定时轮询 fallback',
    '尚未全部迁移到 `useQuery`',
    '该文件不是可确认的废弃内容'
  ]) assert.ok(frontend.includes(token), token)
})

test('Catalog plan records the current Job-result and event boundaries', () => {
  const plan = read('docs/superpowers/plans/2026-10-04-openpet-development-plan.md')
  assert.match(plan, /Successful `installSelection\(\)`, `addBlocklistEntry\(\)`, and `removeBlocklistEntry\(\)` mutations now publish the same event/)
  assert.match(plan, /`prepareInstall\(\)` and `clearSelection\(\)` remain selection bookkeeping and do not publish/)
  assert.match(plan, /The payload is `\{ updatedAt, at \}`/)
  assert.match(plan, /`useCatalogPane` subscribes to `useSse\(\['catalog'\]\)`/)
  assert.match(plan, /de-duplicates by SSE event id, and re-reads `\/catalog`/)
  assert.match(plan, /malformed mutation results fail with `INTERNAL` and do not publish/)
  assert.match(plan, /overlapping reads are sequence-guarded so only the newest response commits/)
  assert.match(plan, /Job terminal results still own install progress\/result rendering/)
  assert.match(plan, /`catalog\.install` has `MAX_ATTEMPTS_BY_KIND = 2`/)
  assert.match(plan, /Shell request failures map to `BACKEND_UNAVAILABLE` and never publish `catalog\.refreshed`/)
  assert.match(plan, /Duplicate `catalog-selection:<selectionId>` jobs are rejected by the SQLite active-resource constraint/)
  assert.match(plan, /`createRunner\(\)\.finalize\(\)` rejects cancellation with 423/)
})

test('Catalog API contract documents mutation event payload and boundaries', () => {
  const api = read('docs/refactor/03-api-contract.md')
  assert.match(api, /`catalog\.refreshed`.*`\{ updatedAt: string, at: number \}`/)
  assert.match(api, /`installSelection\(\)`、`addBlocklistEntry\(\)`、`removeBlocklistEntry\(\)` 成功完成/)
  assert.match(api, /`prepareInstall\(\)`、`clearSelection\(\)` 只改变选择 bookkeeping，不发布/)
  assert.match(api, /不替代 `job\.succeeded`\/`job\.failed` 的安装结果/)
})

test('Catalog implementation and review record the current event/cache behavior', () => {
  const catalog = read('services/backend/domains/catalog.js')
  const pane = read('src/control-center/src/hooks/useCatalogPane.ts')
  const review = read('docs/reviews/2026-10-04-development-docs-review.md')
  assert.match(catalog, /const publishCatalogRefresh = \(result\)/)
  assert.match(catalog, /const installSelection = async \(selectionId\) => publishCatalogRefresh/)
  assert.match(catalog, /const addBlocklistEntry = async \(entry\) => publishCatalogRefresh/)
  assert.match(catalog, /const removeBlocklistEntry = async \(entry\) => publishCatalogRefresh/)
  assert.match(catalog, /catalogFromMutationResult/)
  assert.match(pane, /useSse\(\['catalog'\]\)/)
  assert.match(pane, /catalog\.refreshed/)
  assert.match(pane, /lastCatalogEventIdRef/)
  assert.match(pane, /catalogRefreshSequenceRef/)
  assert.match(review, /当前阶段已落地：`installSelection\(\)`、`addBlocklistEntry\(\)`、`removeBlocklistEntry\(\)`/)
  assert.match(review, /Shell outage、重复资源键断言/)
  assert.match(review, /一次 retry、预算耗尽和事件顺序断言/)
})
