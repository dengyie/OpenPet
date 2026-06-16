# OpenPet Review TODO 设计文档

> 日期：2026-06-16
> 基线：Phase 41 开发状态
> 范围：把全项目 review 后的 TODO 收敛成可执行设计。本文只定义后续怎么补齐短板，不升级平台发布承诺。

## 1. 当前目标定位

OpenPet 已经从单体桌宠演进为本地优先的 Electron 桌宠平台：主进程托管服务层，`PetService` 作为宠物状态唯一事实源，Control Center 承载配置和审查入口，pet pack、插件、AI 行为、Local HTTP/MCP、发布证据工具和 TypeScript 迁移框架都已经成形。

后续目标不是继续堆功能，而是完成产品化闭环：

- 证明打包后的桌宠窗口、透明渲染、动作播放和原生选择器真实可用。
- 让 macOS / Windows 发布口径只跟签名和烟测证据绑定。
- 让 pet pack 和插件生态具备可审查、可复现、可回滚的生命周期。
- 让 AI 行为能从产品界面解释、复放和导出诊断。
- 让 TypeScript 覆盖跨进程、manifest、settings、catalog、evidence 这些高漂移边界。
- 让 README、HANDOFF、project context 和路线图不再互相重复或冲突。

## 2. 差距表

| 领域 | 当前状态 | 需要补齐 |
|------|----------|----------|
| Pet Pack | 已支持 legacy 资产、OpenPet pack、Codex pet 目录/zip 导入、内置 packs、用户 pack 导出、来源和冲突摘要 | 用真实 packaged app 证明导入、导出、重装、切换和渲染路径 |
| AI 行为解释 | 已有行为编排、冷却、fallback、近期 decision 存储；Phase 41 增加 viewer/replay/export/clear | 完成 review、提交并保持导出诊断的隐私边界 |
| 打包运行证据 | 已有 packaged runtime / desktop picker 报告和校验工具 | 填入真实 macOS app bundle 运行证据，覆盖透明模型回归 |
| 签名发布证据 | 已有 release checklist、archive manifest 和 Windows 策略 | 归档 macOS 签名/公证/Gatekeeper 证据；Windows 继续等待真实签名烟测 |
| 插件作者体验 | 已有权限模型、隔离 runner、示例插件、校验、审核包、PR/workflow 工具 | 一命令脚手架、第三方提交演练、教程入口和 secret 策略一致性 |
| TypeScript 边界 | 已有 IPC 常量、共享 contracts、Control Center view contracts、API facade、Control Center hooks、Pane prop surfaces、service/catalog/plugin/pet pack mutation main-process Control Center adapters 和 `typecheck` | 继续扩展到 About adapters 和 high-drift service boundaries |
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

- 新作者不读内部源码也能 scaffold、run、validate、package、create submission bundle。
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
| P1 | 插件作者体验 | 生态扩展前必须让作者路径可复现、可审查。 |
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
- 插件作者能完成 scaffold -> validate -> package -> submission bundle 的完整路径。
- TypeScript 覆盖最容易漂移的共享数据边界、hook 状态边界、Pane props 边界和首批主进程 Control Center payload 边界。
- 活文档短、准、一致，历史阶段文档只承担审计作用。
