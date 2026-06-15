# OpenPet TODO 落地设计文档

> 日期：2026-06-16
> 基线：`v1.0.1-rc.2`
> 范围：把当前整体 review 得出的剩余 TODO 转成后续可执行设计。本文不改变现有 release readiness 声明；没有证据支撑的能力仍不得写成已完成。

## 1. 目标

OpenPet 的主体目标已经达成：它不再是单窗口桌宠，而是一个 Electron 桌宠平台。后续 TODO 的目标不是重做架构，而是补齐正式产品还缺的证据、开发体验和生命周期能力。

本文把剩余工作拆成六条主线：

1. Release evidence：证明 macOS / Windows 桌面发布路径真实可用。
2. Packaged runtime smoke：证明打包后的桌宠窗口、透明模型、内置 pet pack 和原生 picker 真实可用。
3. TypeScript migration：把迁移从框架推进到共享契约和 Control Center 边界。
4. Plugin ecosystem：让第三方插件从“能运行”变成“能开发、能审核、能提交”。
5. Pet pack lifecycle：让宠物资产从“能导入”变成“能导出、能升级、来源可审计”。
6. AI behavior debugging：让 AI 行为触发可解释、可回放、可排错。

## 2. 当前判断

### 已完成的基础

- `PetService` 是宠物状态唯一入口。
- Control Center 已覆盖主要配置面板。
- Pet pack runtime 已支持 legacy cat、OpenPet pack、Codex pet directory、Codex pet zip 和内置 packs。
- 插件系统已有权限白名单、安装 review、隔离 runner、storage、network allowlist、日志和 submission tooling。
- AI API key 已隔离在主进程 secret store。
- 本地 HTTP / MCP 已 loopback-only、token-gated、默认关闭。
- 当前验证基线包含 Node tests、Control Center Playwright tests、TypeScript typecheck 和 syntax check。

### 仍需补齐的短板

- Windows 只有工具链和证据模板，不能声明 release-ready。
- macOS signed / notarized 证据还需要归档成可审计材料。
- Packaged app 下宠物透明模型、内置 pack 切换、原生 picker 等真实路径还缺结构化 smoke evidence。
- TypeScript 迁移仍在边界迁移阶段，主进程服务和 Control Center API facade 还未全面类型化。
- 插件生态缺少明确 secrets 决策、脚手架和真实第三方 submission rehearsal。
- Pet pack 缺少 export、overwrite / upgrade 策略、license / source provenance。
- AI 行为编排已有执行能力，但缺少用户可见的 decision viewer 和 replay。

## 3. 设计原则

1. **证据优先**：README、release notes、About 页只能声明已经有证据支撑的能力。
2. **契约优先**：TypeScript 先迁移共享 payload、manifest、settings、catalog、evidence summary，再考虑大规模文件改写。
3. **打包路径优先**：桌宠的核心体验必须在 packaged app 中验证，不能只依赖 dev server 或 demo API。
4. **安全边界显式化**：插件、AI、HTTP、MCP 的新增能力必须能在 manifest、Control Center review、日志或 evidence 中被看见。
5. **用户配置进 UI**：新增用户可调能力必须进入 Control Center，不依赖手动改 JSON。
6. **文档少而准**：live docs 写当前事实，phase / review docs 写历史，机器入口写 `docs/project-context.json`。

## 4. TODO 主线设计

### A. Release Evidence Hardening

**目标**：把发布声明从“工具链存在”推进到“有证据可审计”。

**改动范围**：

- `docs/desktop-release-design.md`
- `docs/release-checklist.md`
- `docs/release-evidence/`
- release evidence collector / validator scripts
- GitHub release workflow 和 artifact manifest

**设计要点**：

- macOS evidence 必须包含签名、公证、Gatekeeper、安装启动、透明宠物窗口、About 更新检查。
- Windows evidence 必须包含 signed installer、signed zip、安装 / 卸载、启动、透明窗口、插件 runner、原生 picker。
- Windows 通过前，公开文档只能写 build / CI / signing-policy baseline，不能写 release-ready。

**验收标准**：

- macOS signed / notarized packaged app evidence 归档。
- Windows evidence report 在真实签名产物通过前保持 not release-ready。
- release checklist 能直接定位证据文件和验证命令。

### B. Packaged App Runtime Smoke

**目标**：证明用户实际下载的 app 能显示桌宠，而不是只证明服务和 UI 测试通过。

**改动范围**：

- packaged smoke scripts
- `docs/release-evidence/`
- pet window runtime observation
- Control Center pet pack switch path
- native picker smoke report

**设计要点**：

- smoke report 记录宠物窗口创建、透明背景、sprite 可见、气泡可见、动作播放。
- 覆盖 `legacy-cat`、`doro`、`duodong`、`chispa`。
- 覆盖插件 zip picker、pet zip picker、取消选择、非法包提示。
- 把“模型透明只能看到对话框”列为回归项。

**验收标准**：

- 每个内置 pack 都有一次 packaged app 渲染证据。
- 切换 pack 后 ActionService / renderer 刷新路径有证据。
- 原生 picker evidence 不再停留在 pending template。

### C. TypeScript Contract Migration

**目标**：让 TypeScript 先守住跨进程和跨模块边界，降低后续演进漂移。

**改动范围**：

- `src/shared/`
- `src/control-center/src/api/`
- `src/control-center/src/hooks/`
- `src/control-center/src/lib/`
- `tsconfig.json`
- `tests/shared/`

**设计要点**：

- 共享契约覆盖 settings、AI config、service runtime、actions config、pet packs、catalog、plugin review、about/update、release evidence summary。
- Control Center defaults、API facade、hooks 逐步消费共享类型。
- 主进程先通过 JSDoc 或局部 `.ts` helper 使用契约，不急于整体 ESM 化。
- `npm run typecheck` 必须保持在常规验证链路中。

**验收标准**：

- 新增 IPC / settings / manifest 边界必须有共享类型。
- `npm run typecheck` 能捕获 Control Center view contract drift。
- `npm start`、`npm test`、`npm run test:control-center`、`npm run check:syntax` 保持通过。

### D. Plugin Ecosystem Upgrade

**目标**：让第三方作者可以从模板创建插件、通过本地校验、生成审核包，并完成一次真实 submission rehearsal。

**改动范围**：

- plugin manifest schema
- plugin install / review service
- plugin submission scripts
- `docs/plugin-development.md`
- `docs/plugin-submission-workflow-playbook.md`
- catalog governance docs

**设计要点**：

- 先做 plugin secrets 产品决策：
  - 若支持，必须是 scoped plugin secret capability，密钥只在主进程。
  - 若不支持，validator 和 docs 明确禁止插件配置保存 secrets。
- 增加 `create-openpet-plugin` 或等价脚手架，至少生成 basic、network、storage 三类模板。
- 做 SES / Electron `utilityProcess` POC，和当前 child process + Node permission model 做对比。
- 用一个真实第三方插件走完整 submission bundle、review packet、PR body、bundle validation。

**验收标准**：

- 插件作者能从模板到 submission bundle 走完命令化路径。
- secrets 决策在 docs、validator、Control Center review 中一致。
- sandbox POC 给出短期保留方案和中期演进建议。

### E. Pet Pack Lifecycle

**目标**：让宠物资产生态可维护、可迁移、来源可审计。

**改动范围**：

- `src/main/pet-pack/`
- `src/main/services/pet-pack-service.js`
- Control Center Actions / Pet Packs UI
- pack manifest schema
- catalog pack entries
- pet pack tests

**设计要点**：

- 增加 `.openpet-pet.zip` export。
- 定义 overwrite、upgrade、downgrade、same-version reinstall 行为。
- manifest 增加 provenance、license、sourceUrl、assetAuthor。
- Control Center 显示动作列表、默认动作、点击动作、spritesheet 信息、校验结果。
- 内置 packs 先补齐来源和 license 元数据，再考虑远端 catalog 推广。

**验收标准**：

- 已安装 pack 可导出并重新导入。
- 版本覆盖行为在 UI review 中明确展示。
- 内置资产来源和 license 状态可被审计。

### F. AI Behavior Debugging

**目标**：让用户和维护者能解释 AI 为什么触发某个动作。

**改动范围**：

- `src/main/services/behavior-orchestrator-service.js`
- AI pane behavior section
- settings schema
- behavior logs
- AI service tests

**设计要点**：

- Control Center 增加 decision viewer，展示最近规则命中、actionId、cooldown、fallback。
- 增加 replay / dry-run：输入 AI reply 或 behavior intent，显示会触发什么。
- action whitelist UI 明确标识可触发动作和危险配置。
- 行为日志支持导出和清理，但不得包含 API key 或完整敏感 prompt。

**验收标准**：

- 用户能解释一次 AI 行为触发链路。
- 保存规则前可 dry-run。
- 日志脱敏有测试覆盖。

## 5. 优先级

| Priority | 工作 | 原因 |
|----------|------|------|
| P0 | macOS signed/notarized evidence | 直接影响公开 release 可信度 |
| P0 | Windows signed smoke evidence | Windows 未通过前不能声明 release-ready |
| P1 | Packaged app runtime smoke | 直接覆盖桌宠核心体验和透明模型回归 |
| P1 | TypeScript contract migration | 降低 IPC、settings、manifest、UI facade 漂移 |
| P1 | Plugin secrets decision | 插件生态继续扩展前必须明确安全边界 |
| P2 | Plugin scaffolding + submission rehearsal | 提升第三方作者路径可信度 |
| P2 | Pet pack export / provenance | 让资产生态可维护 |
| P2 | AI behavior replay / debugger | 提升 AI 行为可解释性 |
| P3 | Remote marketplace backend | 有价值，但不阻塞当前产品化闭环 |
| P3 | Multi-pet / complex desktop interactions | 属于体验扩展，不应抢占证据和契约工作 |

## 6. 推荐阶段拆分

### Phase 35：TypeScript Control Center Contracts

把共享 view contracts 接入 Control Center defaults、API facade 和 hooks。该阶段只迁移边界，不重写 UI。

### Phase 36：Packaged Runtime Smoke Evidence

补 packaged app smoke report，覆盖宠物窗口、透明背景、内置 pack 切换和原生 picker。

### Phase 37：Release Evidence Archive

归档 macOS signed / notarized evidence，并让 Windows evidence report 在未通过前明确标记 not release-ready。

### Phase 38：Plugin Secrets Decision And Scaffolding

完成 secrets 产品决策，补插件脚手架，更新 validator、docs 和 submission workflow。

### Phase 39：Pet Pack Export And Provenance

补 pack export、版本覆盖策略和来源 / license 元数据。

### Phase 40：AI Behavior Replay

补 behavior decision viewer、dry-run / replay、日志导出和脱敏测试。

## 7. 阶段完成契约

每个阶段都必须交付以下内容：

- 一份 `docs/phases/phase-XX-*.md`。
- 一份 `docs/reviews/phase-XX-*-review.md`。
- 对应测试或证据文件。
- 必要的 live docs 更新，只更新当前事实。
- 至少运行：

```bash
npm run typecheck
npm run check:syntax
```

按改动范围追加：

```bash
npm test
npm run test:control-center
npm run pack
```

涉及发布声明时还必须追加 release evidence validator。

## 8. 不做事项

- 不把 Windows 写成 release-ready，直到真实签名和 smoke evidence 通过。
- 不把插件沙箱描述成绝对安全。
- 不让 API key 进入 renderer 或普通插件。
- 不改动 `cat_anime/` 既有素材结构。
- 不为了 TypeScript 迁移一次性改写 Electron 主进程模块系统。
- 不为 marketplace 提前引入后端，除非本地 catalog 和 submission rehearsal 已经跑通。

## 9. 读者路径

- 当前状态：`docs/HANDOFF.md`
- 产品化路线：`docs/productization-next-steps-design.md`
- 本文 TODO 落地设计：`docs/productization-todo-design.md`
- 发布门禁：`docs/desktop-release-design.md`、`docs/release-checklist.md`
- 插件路径：`docs/plugin-development.md`、`docs/plugin-submission-workflow-playbook.md`
- 历史审计：`docs/phases/`、`docs/reviews/`

## 10. 成功标准

后续 TODO 完成后，OpenPet 应满足以下状态：

- macOS release 有签名、公证、安装和运行证据。
- Windows support wording 与真实签名 smoke evidence 完全一致。
- 打包后的桌宠窗口、透明模型、内置 packs 和原生 picker 有可复查证据。
- 新增跨边界能力都有 TypeScript contract 或等价类型声明。
- 第三方插件作者可以按模板、校验、审核包、PR packet 完成提交。
- Pet pack 可以导出、重新导入、升级，并能审计来源。
- AI 行为触发可以在 Control Center 中解释和 replay。
