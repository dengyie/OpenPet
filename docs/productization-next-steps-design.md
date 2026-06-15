# OpenPet 后续产品化补齐设计文档

> 日期：2026-06-16
> 基线：`v1.0.1-rc.2`
> 范围：把当前项目 review 得出的 TODO 收束为后续阶段设计。本文是下一轮产品化工作的路线图，不改变当前 release readiness 声明。

## 1. 目标

OpenPet 当前已经完成从单体桌宠到 Electron 桌宠平台的主体转型。下一阶段目标不是继续堆功能，而是把已经具备的平台能力补到更接近正式产品的状态：

- 发布证据可信，尤其是 macOS signed/notarized 与 Windows signed smoke evidence。
- 桌宠渲染、Pet pack、插件包、原生文件选择器等真实 packaged app 路径可验证。
- TypeScript 迁移先从共享契约开始，降低后续功能演进成本。
- 插件生态从“能跑示例”升级为“第三方作者能安全开发、提交和迭代”。
- Pet pack 生态具备来源、版本、导出和升级能力。
- AI 行为编排可解释、可调试、可回放。
- 文档继续分层：人读的短，程序读的准，证据文档可审计。

## 2. 当前基线判断

### 已达成

- 主进程由 `main.js` 装配服务，应用逻辑集中在 `src/main/services/`。
- `PetService` 仍是 `say` / `playAction` / `setEvent` 的唯一状态入口。
- Control Center 已覆盖 Pet / Actions / AI / Plugins / Catalog / Service / About。
- Pet pack runtime 已支持 legacy cat、OpenPet pack、Codex pet directory、Codex pet zip 和内置 read-only packs。
- 插件已有 manifest 校验、安装/更新 review、权限白名单、隔离 runner、私有 storage、network allowlist、日志和 submission tooling。
- AI 已支持 OpenAI-compatible provider、主进程 secret store、会话历史和行为编排。
- 本地 HTTP/MCP 已 loopback-only、token-gated、默认关闭并带访问日志。
- 当前验证基线为 `npm test` 319/319、`npm run test:control-center` 9/9、`npm run typecheck`、`npm run check:syntax` 通过。

### 仍未完成

- macOS release 还缺正式 signed/notarized 证据闭环。
- Windows 只有打包、CI、签名策略和 smoke evidence 工具链基线，尚未 release-ready。
- Packaged Electron 的真实宠物窗口渲染、透明度、内置 Pet pack 切换还缺自动化或结构化证据。
- TypeScript 迁移仍是框架和示例阶段，核心契约尚未迁移。
- 插件生态还缺 secrets 决策、更强沙箱评估、真实第三方 submission rehearsal 和脚手架。
- Pet pack 还缺导出、升级/降级策略、来源/license 元数据和更强 UI 预览。
- AI 行为规则缺少面向用户和维护者的 debugger/replay。
- 文档仍有部分长文档重复历史状态，后续需要继续瘦身和分层。

## 3. 设计原则

1. **先证据，后声明**
   README 和 release notes 只能声明已有证据支撑的能力。Windows 不因为工具链存在就写成 release-ready。

2. **先契约，后迁移**
   TypeScript 不从大文件重写开始，而是先迁移 IPC、settings、manifest、catalog 等共享边界。

3. **先 packaged path，后体验扩展**
   桌宠平台最核心的是真实桌面运行效果。渲染、透明窗口、内置模型、原生选择器要优先有 packaged app 证据。

4. **生态能力必须可审核**
   插件和 Pet pack 的新增能力都要能在 manifest、Control Center review、日志或 evidence 中被看见。

5. **文档分层，不再堆叙事**
   README 面向用户，`docs/project-context.json` 面向程序，release evidence 面向审计，phase/review 面向历史。

## 4. 推荐阶段

### Phase A：Release Evidence Hardening

目标：把 macOS 和 Windows release readiness 从“有配置/工具链”推进到“有结构化证据”。

工作内容：

- 完成 macOS signed/notarized 构建验证。
- 归档 Gatekeeper、签名、公证、安装启动和更新检查证据。
- 在 Windows 上生成 signed installer 和 zip，补齐 Authenticode、安装/卸载、SmartScreen/reputation、启动 smoke。
- 将证据写入 `docs/release-evidence/`，并用现有 validator 校验。

验收：

- macOS release evidence 可证明 signed/notarized packaged app 能安装、启动、显示宠物窗口。
- Windows evidence 在通过前继续显示 not release-ready。
- README 和 release checklist 的平台声明与证据一致。

### Phase B：Packaged App Runtime Smoke

目标：补齐真实桌宠运行路径的验证，避免只验证 Control Center demo API。

工作内容：

- 增加 packaged app smoke report，用于记录宠物窗口是否创建、透明背景是否存在、气泡是否渲染、动作是否播放。
- 对 `legacy-cat`、`doro`、`duodong`、`chispa` 逐一记录可见性和切换结果。
- 把原生文件选择器 smoke 工具链用于插件 zip、pet zip、取消选择、非法包提示。
- 记录透明模型回归检查，避免“只看到对话框”的问题复发。

验收：

- 每个内置 pet pack 都有至少一次 packaged app 渲染证据。
- 切换 pack 后 `ActionService` / pet renderer 刷新路径可证明。
- 原生 picker 报告不再只停留在 pending template。

### Phase C：TypeScript Contract Migration

目标：降低后续开发成本，同时保持 Electron CommonJS 启动路径稳定。

工作内容：

- 新增或迁移共享类型：IPC payload、settings、AI config、plugin manifest、pet pack manifest、catalog item、release evidence summary。
- Control Center API facade 和 hooks 使用这些共享类型。
- 主进程服务先消费 JSDoc/TS 声明或局部 `.ts` helper，不急于整体 ESM 化。
- `npm run typecheck` 保持在 `check:syntax` 内。

验收：

- 新增功能边界必须有类型定义。
- IPC channel 与 payload 的 drift 能被 typecheck 捕获。
- `npm start`、`npm test`、`npm run test:control-center`、`npm run check:syntax` 全部通过。

### Phase D：Plugin Ecosystem Upgrade

目标：让插件生态从“技术上能跑”升级为“第三方作者能安全开发和提交”。

工作内容：

- 做出插件 secrets 产品决策：
  - 如果支持，新增 scoped plugin secret capability，密钥仍只在主进程。
  - 如果不支持，在 docs 和 validator 中明确禁止插件配置保存 secrets。
- 完成 SES / Electron `utilityProcess` 沙箱 POC，对比现有 child process + Node permission model。
- 增加 `create-openpet-plugin` 或等价脚手架，生成最小插件、network 插件、storage 插件模板。
- 做一次真实第三方 submission rehearsal，产出 review packet、PR body、bundle validation 和维护者反馈记录。
- 扩展 catalog governance，明确上架、下架、blocklist、权限变更处理流程。

验收：

- 插件作者可以从模板到 submission bundle 走完一条命令化路径。
- 插件 secrets 决策不再模糊。
- 沙箱评估有明确短期保留方案和中期演进方案。

### Phase E：Pet Pack Lifecycle

目标：把 Pet pack 从导入/启用能力升级为可维护的资产生态。

工作内容：

- 增加 pet pack export，输出 `.openpet-pet.zip`。
- 定义 pack upgrade / downgrade / overwrite 策略。
- 为内置和导入 pack 增加 provenance、license、sourceUrl、assetAuthor 等元数据。
- Control Center 增强预览：动作列表、默认动作、点击动作、spritesheet 信息、校验结果。
- 增加 pack migration notes，避免未来 manifest schema 变化时破坏已安装包。

验收：

- 用户可导出一个已安装 pack 并重新导入。
- 版本覆盖行为明确且有 UI review。
- 内置资产来源和 license 状态可审计。

### Phase F：AI Behavior Debugging

目标：让 AI 行为编排从“能触发动作”升级为可解释、可调试。

工作内容：

- Control Center 增加 behavior decision viewer，展示最近触发、匹配规则、actionId、cooldown、fallback。
- 增加 replay/dry-run 输入：用户粘贴 AI reply 或 behavior intent，查看会触发什么。
- 给 action whitelist 增加更明确的 UI 和危险提示。
- 行为日志支持导出和清理。

验收：

- 用户能解释一次 AI 为什么触发某个动作。
- 规则变更可在保存前 dry-run。
- 行为日志不泄露 API key 或完整敏感 prompt。

### Phase G：Documentation Consolidation

目标：减少重复历史叙事，让后续维护者更快知道“现在该信哪份文档”。

工作内容：

- 保持 README 短而保守，只写当前能力和入口。
- 将 `docs/project-context.json` 作为机器可读事实入口继续维护。
- `docs/HANDOFF.md` 只保留当前状态和下一步，不承载长篇历史。
- `docs/project-status-review.md` 定期快照，不再每个小阶段堆长段落。
- phase/review 文档保持历史审计，不反复重写。

验收：

- 新贡献者可以从 README -> HANDOFF -> project-context -> relevant design doc 找到方向。
- release readiness、test count、platform support 没有多处互相冲突。

## 5. 优先级排序

| Priority | 工作 | 原因 |
|----------|------|------|
| P0 | macOS signed/notarized evidence、Windows signed smoke evidence | 影响公开 release 可信度 |
| P1 | Packaged app runtime smoke | 直接覆盖桌宠核心体验和透明模型回归 |
| P1 | TypeScript contract migration | 降低后续 IPC、manifest、UI facade 漂移 |
| P1 | Plugin secrets decision + sandbox POC | 插件生态继续扩展前必须明确边界 |
| P2 | Pet pack export/upgrade/provenance | 让资产生态可维护 |
| P2 | AI behavior debugger/replay | 提升 AI 行为可解释性 |
| P2 | Documentation consolidation | 降低维护和交接成本 |
| P3 | Remote marketplace、multi-pet、复杂桌面交互 | 有价值但不阻塞当前产品化闭环 |

## 6. 风险和缓解

### 风险：过早宣传 Windows ready

缓解：所有 Windows 支持声明必须链接到 signed smoke evidence。没有 evidence 时只写 tooling baseline。

### 风险：TypeScript 迁移破坏 Electron 启动

缓解：先迁移共享契约和 Control Center API，不动主进程模块系统；每阶段保留 `npm start` 验收。

### 风险：插件能力扩展导致安全边界失控

缓解：新增能力必须 manifest 化、review 化、日志化。secrets、filesystem、background job 都必须单独设计。

### 风险：Pet pack 资产来源不清

缓解：manifest 增加 provenance/license 字段，内置资产先补齐元数据，再考虑远程 catalog 推广。

### 风险：文档继续膨胀

缓解：live docs 只写当前事实；阶段历史留在 phase/review；机器事实写入 `project-context.json`。

## 7. 建议的下一步

建议下一阶段从 Phase B 和 Phase C 开始：

1. 先补 packaged app runtime smoke，直接解决桌宠核心体验和透明模型回归。
2. 同步推进 TypeScript contract migration，把后续所有新功能的边界先稳住。
3. 在这两项稳定后，再做插件 secrets/sandbox 决策和 Pet pack lifecycle。

这个顺序的好处是：先证明用户能看到、能使用、能验证桌宠，再让代码边界变得更适合长期演进。
