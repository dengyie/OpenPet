# OpenPet Review TODO 设计文档

> 日期：2026-06-16
> 基线：Phase 41 开发状态
> 范围：把全项目 review 后的 TODO 收敛成可执行设计。本文只定义后续怎么补齐短板，不升级平台发布承诺。

## 1. 当前目标定位

OpenPet 已经从单体桌宠演进为本地优先的 Electron 桌宠平台：主进程托管服务层，`PetService` 作为宠物状态唯一事实源，Control Center 承载配置和审查入口，pet pack、插件、AI 行为、Local HTTP/MCP、发布证据工具和 TypeScript 迁移框架都已经成形。

后续目标不是继续堆功能，而是完成产品化闭环：

- 证明打包后的桌宠窗口、透明渲染、动作播放和原生选择器真实可用。
- 让 macOS / Windows 发布口径只跟签名和烟测证据绑定。
- 让 pet pack 和本地扩展生态具备可审查、可复现、可回滚的生命周期。
- 让 AI 行为能从产品界面解释、复放和导出诊断。
- 让 TypeScript 覆盖跨进程、manifest、settings、catalog、evidence 这些高漂移边界。
- 让 README、HANDOFF、project context 和路线图不再互相重复或冲突。

## 2. 差距表

| 领域 | 当前状态 | 需要补齐 |
|------|----------|----------|
| Pet Pack | 已支持 legacy 资产、OpenPet pack、Codex pet 目录/zip 导入、内置 packs、用户 pack 导出、来源和冲突摘要 | 用真实 packaged app 证明导入、导出、重装、切换和渲染路径 |
| AI 行为解释 | 已有行为编排、冷却、fallback、近期 decision 存储；Phase 41 增加 viewer/replay/export/clear | 完成 review、提交并保持导出诊断的隐私边界 |
| 打包运行证据 | 已有 packaged runtime / desktop picker 报告和校验工具 | 填入真实 macOS app bundle 运行证据，覆盖透明模型回归 |
| 签名发布证据 | 已有 release checklist、archive manifest、macOS 证据采集命令和 Windows 策略 | 用真实官方 artifact 归档 macOS 签名/公证/Gatekeeper 证据；Windows 继续等待真实签名烟测 |
| 扩展作者体验 | 已有 legacy SDK runner、示例、校验、审核包、PR/workflow 工具、developer-first local extension 文档边界、显式 setup execution、`entries.commands` compatibility runtime 与声明式短进程执行、显式 HTTP/HTTPS dashboard opening、显式 service start/stop、手动 loopback service health check、运行中服务的宿主周期健康策略、最新命令结果摘要、短时 bridge 访问、best-effort process-group cleanup、覆盖 service/setup/declaration-command stop path 的 host-owned process-tree fallback、cleanup evidence report/updater/collector/archive/runner、packaged-app cleanup evidence runner、本地 scaffold、existing-plugin submission rehearsal、remote-source submission rehearsal，以及 community-source submission evidence 工具链 | runtime 继续补齐真实独立第三方社区来源归档证据与更广的真实宿主归档证据 |
| TypeScript 边界 | 已有 IPC 常量、共享 contracts、Control Center view contracts、API facade、Control Center hooks、Pane prop surfaces、service/catalog/plugin/pet pack/About/update/actions main-process Control Center adapters、plugin extension entry contracts、完整 release evidence archive / signed closure report contracts 和 `typecheck` | 继续扩展到 high-drift service/evidence/report boundaries |
| 文档收敛 | 阶段文档、review 文档和活文档完整 | 压缩重复状态文档，让当前事实只有少数入口维护 |

## 3. 设计原则

1. **证据先于声明**：README、About、release notes、checklist 只能写已有证据能支撑的内容。
2. **Control Center 优先**：用户可见配置、审查、导出、清理和诊断入口优先放进 Control Center。
3. **契约先于重写**：TypeScript 优先约束数据边界，不做一次性主进程 TS/ESM 大迁移。
4. **生命周期优先于一次性导入**：pet pack 和插件都要有 inspect、install、update、export、review、audit 路径。
5. **安全措辞保持保守**：插件只能称为权限限制和隔离执行，不能称为绝对安全。
6. **遗留资产稳定**：不改变 `cat_anime/` 结构；新能力在 pet-pack runtime 上叠加。
7. **活文档短而准**：README 面向用户，HANDOFF 面向继续开发，project context 面向机器读取，phase/review 文档作为历史审计。

## 4. 七个工作流

### 4.1 Pet Pack

目标是把 pet pack 从“能导入”推进到“能审查、导出、重装和证明可运行”。

设计要点：

- 保持 `.openpet-pet.zip` 用户 pack 导出能力。
- 保持 provenance 字段：`sourceUrl`、`assetAuthor`、`license`、`licenseUrl`、`importedAt`、`originalFormat`。
- 保持版本冲突语义：新安装、同版本重装、升级、降级、重复 ID、内置 pack 冲突。
- Control Center 必须在破坏性覆盖前展示来源、版本和冲突摘要。
- packaged runtime smoke 要覆盖导出后重导入并渲染的路径。

验收标准：

- 用户 pack 可以导出为可重导入的 `.openpet-pet.zip`。
- 内置 pack 导出有清晰拒绝原因或后续重新定义分发规则。
- 冲突判断稳定并有测试覆盖。
- 至少一个导出 pack 在 packaged app 中完成重导入和渲染证据。

### 4.2 AI 行为解释

目标是让用户和维护者能解释一次 AI 回复为什么触发动作、未触发动作、进入冷却、fallback 或被阻止。

设计要点：

- Control Center AI 页展示近期 behavior decisions。
- 每条 decision 展示输入摘要、匹配规则、动作、冷却、fallback、blocked/disabled 原因和时间。
- 支持按 decision id replay，也支持后续扩展为 dry-run 输入。
- 支持导出 redacted diagnostics 和清空历史。
- 导出内容不能包含 API key、完整 prompt 或敏感原文。

验收标准：

- 用户能从 Control Center 解释一条 AI 行为决策。
- replay 输出能说明 action / fallback / blocked 结果。
- 导出诊断通过 redaction 测试。
- clear history 不破坏 AI 配置。

### 4.3 打包运行证据

目标是证明真实打包产物里的桌宠体验有效，而不是只证明 dev 模式有效。

设计要点：

- 使用 `npm run pack` 后的 app bundle 运行 smoke。
- 证据覆盖 pet window 创建、透明背景、可见 sprite pixels、speech bubble、动作播放、内置 pack 切换。
- 原生选择器覆盖 plugin zip、pet zip、cancel、invalid package。
- 报告进入 release evidence archive，并由 validator 校验。

验收标准：

- 每个内置 pack 至少有一条 packaged rendering evidence。
- 透明模型回归变成必测项。
- picker 报告区分真实 pass/fail 和 pending placeholder。
- archive manifest 在证据缺失时失败。

### 4.4 签名发布证据

目标是让发布就绪声明和平台支持声明绑定到真实签名证据。

设计要点：

- macOS 归档 `codesign --verify --deep --strict`、notarization accepted、Gatekeeper assessment、下载后首次启动、About 更新检查。
- Windows 归档 Authenticode、clean-machine install、launch、透明 pet window、native picker、plugin runner、uninstall、SmartScreen/reputation 观察。
- Windows 在签名烟测证据通过前继续明确写为 not release-ready。
- release archive manifest 对证据文件做 hash 和分类。

验收标准：

- macOS 对外发布声明有签名、公证、Gatekeeper 和启动证据链接。
- Windows 任一关键证据缺失或失败时，README / release docs 不得升级支持口径。
- release archive manifest 能校验必需证据集。

### 4.5 插件作者体验

目标是在不放宽沙箱和权限模型的前提下，让第三方作者能按固定路径完成创建、验证、打包和提交。

设计要点：

- 保持当前 child process + Node permission model + VM runner 作为 v1.1 基线。
- 增强脚手架：pet command、network allowlist、private storage、AI-assisted 示例。
- 脚手架输出 README、验证命令、打包命令和提交 checklist。
- 至少跑一次第三方风格 submission rehearsal。
- secret-like plugin config 继续拒绝，除非后续显式设计 main-process-only secret capability。

验收标准：

- 新作者不读内部源码也能 scaffold、run、validate、package、create submission bundle，维护者也能补一份独立 approval record。
- 示例覆盖主要权限类型。
- submission rehearsal 产出 Markdown 和 JSON 审核材料。
- 文档不宣称插件拥有无限制能力或绝对安全。

### 4.6 TypeScript 边界

目标是把 TS 用在最容易漂移的数据边界上，而不是为了迁移而迁移。

设计要点：

- 扩展 shared contracts：pet pack manifest/provenance/conflict、plugin manifest/review summary、catalog entry、AI behavior setting/decision、local service state、packaged runtime evidence、release archive summary。
- Control Center API facade、hooks、Pane props、main-process adapters、defaults、demo fixtures 和测试消费这些 contracts。
- 主进程继续保持 CommonJS 稳定；必要处用 JSDoc 或小型 typed helper 降低风险。

验收标准：

- `npm run typecheck` 覆盖真实产品数据路径。
- IPC payload 变化需要同步 contract。
- demo API fixture 与生产 payload shape 一致。
- `npm start`、`npm test`、`npm run test:control-center`、`npm run check:syntax` 保持通过。

### 4.7 文档收敛

目标是保留审计记录，但减少活文档漂移。

设计要点：

- README 保持用户视角和保守平台声明。
- `docs/HANDOFF.md` 只保留当前状态、下一步、验证命令和工作区风险。
- `docs/project-context.json` 作为机器可读事实源。
- `docs/phases/` 和 `docs/reviews/` 作为历史记录，不反复改写。
- 长篇 status / roadmap 中重复的测试数量、支持口径和下一步说明要收敛到 live docs。

验收标准：

- 新贡献者能从 README -> HANDOFF -> project context -> 设计文档在 5 分钟内定位当前状态。
- 测试数量、平台支持、release readiness、下一阶段目标不冲突。
- 人读文档像维护中的工程文档，不像阶段转录稿。

## 5. 执行优先级

| 优先级 | 工作 | 原因 |
|--------|------|------|
| P0 | 打包运行证据 | 直接证明桌宠核心体验在真实产物中可用。 |
| P0 | 签名发布证据 | 决定 macOS / Windows 对外支持口径和用户信任。 |
| P1 | 扩展作者体验 | 生态扩展前必须让作者路径可复现、可审查，并且安全口径诚实。 |
| P1 | TypeScript 边界 | 降低 IPC、manifest、settings、UI fixture 漂移风险。 |
| P1 | Pet Pack | Phase 40 已完成核心能力，后续作为 catalog 和 release smoke 的约束。 |
| P2 | AI 行为解释 | Phase 41 已实现主要能力，后续重点是 review、提交和隐私边界维护。 |
| P2 | 文档收敛 | 应在证据、插件和 TS 事实稳定后做最终压缩。 |

## 6. 阶段安排与验收

| 阶段 | 主题 | 优先级 | 状态 | 验收标准 |
|------|------|--------|------|----------|
| Phase 40 | Pet Pack Export and Provenance | P1 | 已完成 | 用户 pack 可导出重导入；provenance 与冲突摘要稳定；Control Center 可审查；测试覆盖服务和 IPC。 |
| Phase 41 | AI Behavior Decision Viewer | P2 | 已完成 | Control Center 可查看、replay、导出 redacted diagnostics、清空 decisions；redaction 和 UI smoke 测试通过；production review 已完成。 |
| Phase 42 | Real Packaged Runtime Evidence | P0 | 已完成自动 runtime evidence | 打包 app 自动证据覆盖透明窗口、sprite、speech bubble、动作播放、pack 切换和最终状态恢复；validator 通过；native picker 与 signed release evidence 仍进入 Phase 43+。 |
| Phase 43 | Signed Release Evidence Closure | P0 | 已完成 claim gate | signed release closure report 已归档当前 `not-ready` 事实；缺签名、公证、Windows signed smoke、native picker 或 Windows runtime evidence 时继续禁止 official release-ready 口径。 |
| Phase 44 | Plugin Author Experience | P1 | 已完成 rehearsal | minimal/network/storage/AI scaffold 均可验证；一命令 author rehearsal 产出 README、commands、checklist、AI 插件 zip 和 ready submission bundle；secret 策略仍保持 public config only。 |
| Phase 45 | TypeScript Boundary Expansion | P1 | 已完成 boundary expansion | contracts 覆盖 actions/pet/plugin/catalog/AI/service/evidence/release；Control Center API facade 与 demo fixture 消费；typecheck 和回归测试通过。 |
| Phase 46 | Documentation Consolidation | P2 | 已完成 live-doc 收敛 | README、HANDOFF、project-context、roadmap/status 事实一致；重复状态说明已压缩；平台支持和测试数量无冲突。 |
| Phase 47 | TypeScript Hook Boundary Migration | P1 | 已完成 hook boundary migration | 7 个 Control Center hooks、download helper 和 renderer error helper 已迁移为 TS；初始化失败路径可见；typecheck、syntax/build、UI smoke 和 Node tests 通过。 |
| Phase 48 | Control Center Pane Prop Surfaces | P1 | 已完成 pane prop surfaces | 7 个 Control Center Panes、支撑组件和 constants 已迁移为 TS/TSX；hooks 使用 `satisfies XxxPaneProps` 对接 Pane props；typecheck、syntax/build、UI smoke 和 Node tests 通过。 |
| Phase 49 | Main Process Control Center Adapters | P1 | 已完成首批 main-process adapters | Service status 与 Catalog blocklist result 使用 `@ts-check` adapter 消费 shared contracts；adapter/IPC 测试补齐；typecheck、syntax/build、UI smoke 和 Node tests 通过。 |
| Phase 50 | Plugin Mutation Control Center Adapter | P1 | 已完成 plugin mutation adapter | 插件 install/update/uninstall 返回结构使用 `@ts-check` adapter 消费 shared contracts；`storageRemoved` 契约补齐；adapter/IPC 测试补齐；typecheck、syntax/build、UI smoke 和 Node tests 通过。 |
| Phase 51 | Pet Pack Mutation Control Center Adapter | P1 | 已完成 pet pack mutation adapter | Pet pack import/set-active/remove 返回结构使用 `@ts-check` adapter 消费 shared contracts；set-active 动画通知语义保留；adapter/IPC 测试补齐；typecheck、syntax/build、UI smoke 和 Node tests 通过。 |
| Phase 52 | About Update Control Center Adapter | P1 | 已完成 About/update adapter | About info 与 update-check 返回结构使用 `@ts-check` adapter 消费 shared contracts；未配置 update payload 默认值补齐；adapter/IPC 测试补齐；typecheck、syntax/build、UI smoke 和 Node tests 通过。 |
| Phase 53 | Actions Control Center Adapter | P1 | 已完成 actions adapter | 动作导入、保存配置、删除动作返回结构使用 `@ts-check` adapter 消费 shared contracts；内部 service result 不再越过 renderer 边界；adapter/IPC 测试补齐；typecheck、syntax/build、UI smoke 和 Node tests 通过。 |
| Phase 54 | Release Evidence Contracts | P1 | 已完成 release evidence contracts | Release evidence archive manifest 与 signed release closure report 的完整输出结构进入 shared contracts；type fixture 和生成器测试补齐；typecheck、syntax/build、UI smoke 和 Node tests 通过。 |
| Phase 55 | Extension Ecosystem Docs | P1 | 已完成 extension docs | 作者入口和生态规则改为 developer-first local extension model；legacy SDK runner 标记为兼容路径；README 英中入口同步；安全口径明确不宣称完整 sandbox。 |
| Phase 56 | Extension Command Entries Runtime | P1 | 已完成 command entries runtime | `entries.commands` 可在带 `main` 的 JavaScript compatibility 包中通过现有 runner 执行；service entries 仍作为声明暴露；dashboard runtime 由 Phase 57 接续。 |
| Phase 57 | Plugin Dashboard Opening | P1 | 已完成 dashboard opening | Control Center 展示 extension entry 声明；已启用插件可显式打开声明的 HTTP/HTTPS dashboard；service/setup/health/shell execution 仍不执行。 |
| Phase 58 | Plugin Service Lifecycle | P1 | 已完成 service lifecycle | 已启用插件可从 Control Center 显式 start/stop 声明的 service entry；有 runtime state 和日志；不 auto-start，不做 shell expansion；setup/health/bridge/进程树清理在后续阶段继续补齐。 |
| Phase 59 | Plugin Service Health Checks | P1 | 已完成 service health checks | 已启用插件可从 Control Center 手动检查声明的 loopback health endpoint；有 runtime health state 和日志；不后台轮询，不 auto-start；setup/bridge/进程树清理在后续阶段继续补齐。 |
| Phase 60 | Plugin Setup Status and Service Cleanup | P1 | 已完成 setup status + best-effort cleanup | Setup entry 可见但不执行；Service stop/disable/app quit 尝试 process-group `SIGTERM`，失败时回退 child kill；仍不宣称完整 sandbox、硬性 descendant termination、setup execution/bridge/通用 shell execution。 |
| Phase 61 | Plugin Setup Execution | P1 | 已完成显式 setup execution | 已启用且未被策略阻止的 local plugin 可从 Control Center 显式运行 setup；记录 final status 和日志；不 install/enable 自动执行，不 shell expansion，不注入 bridge，不宣称硬性进程树清理。 |
| Phase 62 | Plugin Command Process Execution | P1 | 已完成声明式 command process execution | 仅声明本地 `entries.commands` 可从 Control Center 显式运行短生命周期进程；stdin JSON context、timeout、cwd symlink guard、无 shell expansion、日志和最终 stdout JSON result 已覆盖；不 install/enable 自动执行，不注入 bridge，不提供任意 shell 控制台。 |
| Phase 63 | Plugin Command Result UX | P1 | 已完成 command result UX | Plugins pane 会显示最近一次命令结果摘要、exit code、JSON 预览和 stdout/stderr snippets；仍不引入持久历史或更重的 orchestration。 |
| Phase 64 | Plugin Command Bridge | P1 | 已完成 short-lived bridge access | Declaration-only commands 会收到短时 bridge URL/token，可显式调用 pet.say / pet.action / pet.event 并读取 bounded context；仍不引入持久历史、renderer bridge 或更重的 orchestration。 |
| Phase 68 | Plugin Service Exit-Confirmed Stop | P1 | 已完成 exit-confirmed stop semantics | Declaration-only service entries 在收到 stop/disable/app-shutdown 清理后保持 `stopping`，直到 child exit 确认后才进入 `stopped`；日志会区分 stop requested 与 confirmed stopped；仍不宣称硬性 descendant termination。 |
| Phase 69 | Plugin Service Force Stop | P1 | 已完成 bounded force-stop cleanup | Declaration-only service entries 在 grace period 内未退出时会触发一次 host-side force stop；最终 forced-stop 结果仍落在现有 `failed` 契约；setup / command cleanup 仍未同步升级。 |
| Phase 70 | Plugin Setup and Command Cleanup Parity | P1 | 已完成 stop-intent parity | Setup runtime 会在 disable/app-shutdown cleanup 时先进入 `stopping`，Declaration-only command cleanup 会先记录 stop requested 再在 exit 确认后终结；两条路径继续保持 direct-child best effort，不升级为 service 的 process-group / force-stop 契约。 |
| Phase 71 | Plugin Service Periodic Health Policy | P1 | 已完成 host-managed periodic health policy | 已声明 health URL 的运行中 service 可从 Control Center 启用宿主周期健康检查；策略持久化在 OpenPet settings，不属于插件 manifest；不 auto-start，不做 remote health checks，不扩展 scheduler/notification 语义。 |
| Phase 72 | Plugin Service Process-Tree Hardening | P1 | 已完成 service-only process-tree fallback | 仅对 declaration-only service entries 增加宿主 process-tree fallback；当 process-group stop / force-stop 失败时，会先尝试 tree cleanup，再回退 direct-child kill。 |
| Phase 73 | Plugin Setup and Command Process-Tree Hardening | P1 | 已完成 setup/command process-tree fallback | Setup 与 Declaration-only command cleanup 现在也会先尝试宿主 process-tree cleanup，再回退 direct-child kill；仍不升级为 service 的 process-group / force-stop 契约。 |
| Phase 74 | Plugin Maintainer Approval Rehearsal | P1 | 已完成 maintainer approval rehearsal | Ready submission bundle 现在可生成独立 maintainer approval Markdown/JSON；author rehearsal 会显式指向 maintainer follow-up；approval 仍是人工审查结论，不是签名、发布或运行安全证明。 |
| Phase 75 | Plugin Real-World Submission Rehearsal | P1 | 已完成 existing-plugin rehearsal | `weather-status` 示例插件现在有本地 package -> submission bundle -> maintainer approval 归档证据；该证据不声明外部社区来源、签名信任、发布或运行安全。 |
| Phase 76 | Plugin Remote-Source Submission Rehearsal | P1 | 已完成 remote-source rehearsal | `weather-status` 现在有 archive URL/final URL/archive SHA-256/archive size/plugin path/file hashes -> package -> submission bundle -> maintainer approval 归档证据；该证据不声明真实外部社区采用、签名信任、发布或运行安全。 |
| Phase 77 | macOS Release Evidence Capture | P0 | 已完成 evidence capture tooling | `create-macos-release-evidence` 可生成 `macos-codesign.txt`、`macos-notarization.txt`、`macos-gatekeeper.txt` 和摘要；它只证明证据已采集，不替代真实签名、公证和 Gatekeeper 通过结果。 |
| Phase 78 | macOS Release Evidence Artifact | P0 | 已完成 workflow evidence artifact | macOS release workflow 现在上传 `openpet-macos-release-evidence-<tag>` Actions artifact；证据不混入公开 Release 下载资产，也不替代 readiness gate。 |
| Phase 79 | macOS Release Evidence Archive | P0 | 已完成 artifact archive handoff | `create-macos-release-evidence-archive` 可把下载后的 workflow evidence artifact 复制进永久 archive，并记录 provenance/hash/status；它只证明 artifact 被留存，不替代 release archive / signed closure readiness gate。 |
| Phase 80 | Plugin Creator-Tools Action Bridge | P1 | 已完成 creator-tools first slice | declaration-only creator-tools commands 现在可声明 `runtime` / `creator-tools` / `hybrid` profile，接收宿主 data/cache/log 目录，并通过短时 bridge 读取、校验和应用 bounded action 配置更新；仍不开放原始文件写入或更宽的资产生成接口。 |
| Phase 81 | Windows Smoke Archive Release Gate | P0 | 已完成 Windows archive gate | release archive manifest 和 signed closure report 现在要求 reviewed Windows smoke archive manifest 匹配归档的 Windows smoke report 路径和 SHA-256；仍不声称真实 Windows release-ready。 |
| Phase 82 | Plugin Creator-Tools Asset Inspection | P1 | 已完成 creator-tools asset inspection | declaration-only creator-tools commands 现在可通过 `assets:inspect` 和短时 bridge 检查插件包内 action frame folder；路径 traversal / symlink escape 会被拒绝；仍不开放 sprite generation、任意目录读取或原始文件写入。 |
| Phase 83 | Plugin Creator-Tools Sprite Import | P1 | 已完成 creator-tools sprite import | declaration-only creator-tools commands 现在可通过 `assets:generate` 和短时 bridge 导入插件包内 action frame folder 并由宿主生成 sprite/action config；有 frame/pixel 限额；仍不开放任意目录导入、插件自选输出路径、pet-pack 写入或原始文件写入。 |
| Phase 84 | Plugin Creator-Tools Pack Manifest Workflow | P1 | 已完成 pack manifest workflow | declaration-only creator-tools commands 可通过短时 bridge 读写 active installed user pack manifest metadata；仍不开放 built-in pack edits、任意 pack targeting、action-field edits 或 general pet-pack writes。 |
| Phase 85 | Plugin Creator-Tools Picker Import | P1 | 已完成 user-approved picker import | declaration-only creator-tools commands 可通过宿主原生 picker 检查/导入用户批准的外部 frame folder；插件不会收到 selected path、raw filesystem grants 或 plugin-selected output paths。 |
| Phase 86 | Plugin Cleanup Evidence Reports | P1 | 已完成 cleanup evidence reports | Maintainers 可生成 controlled-host cleanup evidence artifact，并创建/校验结构化 cleanup readiness reports；仍不声称 universal process-tree cleanup guarantees。 |
| Phase 87 | Plugin Cleanup Evidence Report Updater | P1 | 已完成 cleanup evidence updater | Maintainers 可通过 validation-first CLI 增量更新 cleanup evidence report metadata 和 required checks，避免手写 JSON；runtime cleanup guarantees 不变。 |
| Phase 88 | Plugin Cleanup Evidence Collector | P1 | 已完成 cleanup evidence collector | Maintainers 可生成 POSIX helper，写出 manual checklist 和 updater command notes；helper 不执行 cleanup、不预设 pass、不证明 readiness。 |
| Phase 89 | Plugin Cleanup Evidence Archive Manifest | P1 | 已完成 cleanup evidence archive manifest | Maintainers 可为 report、collector、collected evidence directory 生成 hash manifest；archive validity 与 cleanup readiness 分离，runtime cleanup guarantees 不变。 |
| Phase 90 | Plugin Cleanup Evidence Runner | P1 | 已完成 cleanup evidence runner | Maintainers 可执行 report -> collector -> archive 链路；stdout/stderr/run metadata 会入 archive hash，cleanup readiness 仍由 reviewed report 决定。 |
| Phase 98 | Packaged App Plugin Cleanup Evidence | P1 | 已完成 packaged cleanup evidence runner | Maintainers 可启动 packaged OpenPet app session，驱动 fixture setup / declaration-command / service cleanup，并把观察到的行为映射进既有 cleanup report；不自动声称 fallback、force-stop 或 universal cleanup readiness。 |
| Phase 99 | Plugin Community-Source Submission Evidence | P1 | 已完成 community-source evidence tooling | Maintainers 可在 remote-source rehearsal 之上记录 community source URL、submitter、source relation 和 independence notes；unknown relation 允许保留 provenance 但不会升级为 ready，且不自动声称 signing/publication/runtime trust。 |

## 7. 每阶段通用完成标准

每个开发阶段都必须满足：

- 有 `docs/phases/phase-xx-*.md` 开发文档。
- 有 `docs/reviews/phase-xx-*-review.md` production review 文档。
- 只更新事实发生变化的 live docs。
- 新行为有针对性测试。
- 不混入无关重构、格式化或历史文件改写。

通用验证：

```bash
npm test
npm run test:control-center
npm run typecheck
npm run check:syntax
git diff --check
```

按范围追加验证：

```bash
npm run pack
npm run validate-packaged-runtime-smoke-report -- <report>
npm run validate-desktop-picker-smoke-report -- <report>
npm run create-release-evidence-archive-manifest -- <archive-dir>
npm run validate:plugin -- <plugin-dir-or-zip>
npm run create-plugin-submission-bundle -- <plugin-dir-or-zip>
```

## 8. 总体验收

这条 TODO 线完成时，OpenPet 应满足：

- 打包后的透明桌宠、动作播放、speech bubble、pack 切换和 picker 流程都有真实证据。
- macOS 发布声明有签名和公证证据；Windows 声明不超过真实签名烟测结果。
- pet pack 具备导入、导出、来源、冲突审查和运行证据。
- AI 行为能从 Control Center 解释、replay、导出 redacted diagnostics。
- 插件作者和维护者能完成 scaffold -> validate -> package -> submission bundle -> maintainer approval record -> existing-plugin real-world rehearsal -> remote-source rehearsal -> community-source evidence 的完整路径。
- TypeScript 覆盖最容易漂移的共享数据边界、hook 状态边界、Pane props 边界和首批主进程 Control Center payload 边界。
- 活文档短、准、一致，历史阶段文档只承担审计作用。
