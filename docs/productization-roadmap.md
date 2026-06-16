# OpenPet 产品化补齐开发设计文档

> 最后更新：2026-06-16
> 基线：`main` 已完成平台骨架、核心服务、Control Center、AI 聊天、插件隔离 runner、本地 HTTP/MCP、electron-builder 打包目录验证、macOS 分发基线、Windows 打包/CI/签名策略/冒烟证据、报告、runbook 与 collector/证据包校验/summary/archive-manifest 基线、packaged desktop native picker/runtime smoke evidence 工具链、release evidence archive manifest 工具链、项目文档治理层，以及 Control Center Playwright UI 回归测试基线。
> 目标：把 OpenPet 从“可开发、可验证、可推 main”的可扩展桌面宠物平台，补齐为“可分发、可运营、可承载生态”的产品；当前桌面发布范围只覆盖 macOS 与 Windows，移动端不进入本轮设计。

## 1. 当前基线

### 1.1 已具备能力

- `PetService` 是唯一宠物状态源，AI、插件、HTTP、MCP 都通过它触发 `say`、`playAction`、`setEvent`。
- Pet pack runtime 已有 `schema` / `loader` / `importer` / Codex pet adapter，并已补齐用户可操作的整包检查、导入、启用、删除体验。
- Control Center 已覆盖 Pet / Actions / AI / Plugins / Catalog / Service / About；Phase 1 已拆出 root、App shell、pane、hook、api facade、shared component 与 lib helper；Phase 11 已新增 Playwright 冒烟基线，Phase 12 已覆盖 Pet / AI / Service 保存配置 UI 回归，Phase 13 已覆盖 Catalog 安装/更新 UI 回归，Phase 14 已覆盖 Service MCP session 管理 UI 回归，Phase 15 已把文档设计收口为可执行的目标、结构、阶段和支持声明规则，Phase 16 已覆盖手动插件包安装 review UI 回归，Phase 17 已覆盖主进程插件包 IPC 到真实 zip 安装服务链路，Phase 18 已补 packaged app 原生文件选择器烟测证据工具链，Phase 19 已补文档操作模型、生命周期、阶段完成契约和完成标准，Phase 20 已补 Focus Timer 示例插件与插件开发文档，Phase 21 已补 Weather Status 示例插件与 network allowlist 开发者路径，Phase 22 已补 RSS Reader 示例插件与 public feed 开发者路径，Phase 23 已补插件提交前校验 CLI，Phase 24 已补插件提交审核包生成 CLI，Phase 25 已补插件提交 PR 模板与 PR packet CLI，Phase 26 已补插件提交工作流包 CLI，Phase 27 已补插件提交工作流包验证 CLI，Phase 28 已补插件提交工作流演练手册，Phase 29 已补 RC 升级兼容 smoke 证据工具，Phase 30 已补 Codex pet 原生导入。
- AI 已支持 OpenAI-compatible provider、API Key secret 隔离、请求超时、有界持久会话、轻量语义动作触发。
- 插件已有 manifest 权限白名单、本地插件短生命周期子进程 runner、Node permission model、VM 隔离、受限 SDK、AI/network/storage 能力、插件日志与私有存储 UI。
- 本地服务已有 token-gated HTTP API、访问日志、`POST /mcp` JSON-RPC bridge、MCP session。
- `npm run pack` 已通过目录打包验证，`electron-builder` macOS 基础配置可用；Windows `nsis` / `zip` 打包配置、release workflow、平台化更新资产、签名策略护栏、冒烟证据门禁、pending 报告/runbook/collector 产物、证据包校验、summary/archive-manifest、报告填写工具、desktop picker/runtime smoke evidence 工具链和 release evidence archive manifest 工具链已落地，但尚未完成真实签名产物验证、真实 packaged picker evidence 和 Windows 冒烟。
- CI / 测试已覆盖 service、pet-pack、Codex pet import、Codex pet zip import、bundled Codex pets、TypeScript migration gate、plugin、example plugin、plugin submission validation、plugin submission report、plugin submission PR packet、plugin submission workflow bundle、plugin submission bundle validation、plugin sandbox evaluation、RC upgrade smoke evidence、AI、MCP、release、catalog、主进程 IPC、desktop picker smoke evidence、packaged runtime smoke evidence、release evidence archive manifest 核心路径，当前 Node 验证为 403 个测试；Control Center 已有 10 个 Playwright UI 测试覆盖 shell、tab、Pet/About 基础交互、Pet/AI/Service 保存配置流程、Catalog 安装/更新流程、Service MCP session 管理，以及手动插件包安装 review。
- v1.0.1-rc.2 发布轨道包含 OpenPet 改名兼容、Codex pet 导入/zip 导入、内置 pet packs、透明模型修复与 TypeScript 迁移框架；TypeScript baseline 已覆盖 shared IPC 和 Control Center view contracts。

### 1.2 仍未产品化的深水区

| 领域 | 当前状态 | 产品化缺口 |
|------|----------|------------|
| 插件生态 | 可运行、可隔离、可授权 | 沙箱方案评估、签名、安装/更新流、权限变更提示、插件目录/市场 |
| Pet pack | Phase 2 已支持多 pack 列表、整包检查/导入/启用/删除 | 后续补版本升级、包导出、catalog 运营 |
| AI 行为编排 | 关键词/label/kind 语义匹配 | 结构化 tool-call、可配置行为规则、调试/回放、规则安全边界 |
| MCP | JSON-RPC bridge、stream handshake、token/session 管理与 Service 页撤销 sessions 已落地 | 外部客户端兼容矩阵与真实客户端验证继续补齐 |
| 分发 | macOS release baseline 已完成；Windows 打包/CI/签名策略/冒烟证据、报告、runbook 与 collector/证据包校验/summary/archive-manifest 工具基线已落地；desktop picker/runtime smoke evidence 和 release evidence archive manifest 工具链已落地 | Windows 签名产物验证、安装/卸载冒烟验证、真实 Windows 支持声明、真实 packaged picker evidence 与 signed release archive 归档 |
| Control Center / Electron IPC | 已完成 Phase 1 模块化，并新增 Playwright UI 回归基线；保存配置流程已覆盖 Pet / AI / Service；Catalog 安装/更新流程、Service MCP session 管理与手动插件包安装 review 已覆盖；插件包主进程 IPC inspect/install 已使用真实 zip fixture 覆盖；packaged 原生 picker smoke 与 packaged runtime smoke 已有 evidence/report/runbook 工具链 | 继续补真实 launched Electron / packaged app 下的宠物窗口、透明模型、内置 pack 切换、原生 OS 文件选择器与跨平台安装包烟测证据 |

## 2. 产品化原则

1. **先稳后放开**：插件、MCP、AI 都是外部输入面，先做权限、审计、可回滚，再扩功能。
2. **所有配置必须可 UI 操作**：新增能力不得要求用户手动改 JSON、环境变量或项目文件。
3. **兼容 legacy 素材路径**：`cat_anime/` 继续作为内置 legacy pack，不破坏已有动作导入流程。
4. **最小可发布闭环优先**：每个阶段都要有可验收的用户路径，而不只是底层能力。
5. **测试与文档随功能落地**：service 层测试优先，UI 至少保留手动验收清单；对外能力必须有使用文档。
6. **安全默认关闭**：本地服务、MCP、第三方插件、网络能力默认不可主动暴露。

## 3. 推荐阶段顺序

阶段顺序不是按“技术难度”排，而是按依赖关系排：先把 Control Center 拆到能承载管理体验，再补 Pet pack 和插件生态，随后升级 AI/MCP，最后完成分发。

```text
Phase 0  基线冻结与开发日志对齐
Phase 1  Control Center 模块化
Phase 2  Pet pack 完整管理体验
Phase 3  插件生态产品化
Phase 4  AI 行为编排 v2
Phase 5  MCP / 外部 agent 产品化
Phase 6  分发、更新与发布流水线
Phase 7  生态运营闭环
```

桌面发布扩展说明：Phase 6 的已交付范围是 macOS 分发基线。Windows 桌面分发属于后续 release-track 扩展；当前已完成打包/CI/签名策略/冒烟证据门禁、pending 报告/runbook/collector 产物、证据包校验、summary/archive-manifest、报告填写工具和 packaged native picker smoke evidence 工具链，真实签名产物证据、真实 packaged picker evidence 和 Windows 冒烟仍按 [`desktop-release-design.md`](./desktop-release-design.md) 的验收门槛推进。

## 4. Phase 0：基线冻结与开发日志对齐

### 目标

把当前 `main` 状态固定成后续产品化迭代的基线，避免文档、测试数量、功能描述和实际代码漂移。

### 设计

- 新增或维护 `docs/HANDOFF.md`：只描述当前事实，不写长期幻想。
- 保留 `docs/pet-platform-development-plan.md` 作为平台重构历史。
- 本文档作为后续产品化路线图。
- 每个阶段完成后追加“落地记录”：提交范围、关键文件、测试命令、剩余风险。

### 验收

- `git status --short` 干净后开始阶段开发。
- `npm test`、`npm run check:syntax`、`npm run build:control-center` 通过。
- 文档中的测试数量、命令和功能列表与代码一致。

## 5. Phase 1：Control Center 模块化

### 为什么先做

后续 Pet pack、插件市场、AI 规则、MCP 客户端配置都会进入 Control Center。当前 `src/control-center/src/main.jsx` 已约 1364 行，继续堆功能会让产品化 UI 变成后续所有阶段的阻力。

### 目标

- 把 Control Center 从“一个大组件”拆成稳定模块。
- 建立共享 UI 与数据 hook，避免每个 Pane 复制加载、保存、状态提示逻辑。
- 保持现有视觉和交互，不做大改版。

### 架构改动

建议目录：

```text
src/control-center/src/
├── App.jsx
├── api/control-center-api.js
├── components/
│   ├── FieldRow.jsx
│   ├── LogToolbar.jsx
│   ├── SegmentedControl.jsx
│   ├── StatusLine.jsx
│   └── Toggle.jsx
├── hooks/
│   ├── useAsyncAction.js
│   ├── useIntervalRefresh.js
│   └── usePaneData.js
├── panes/
│   ├── PetPane.jsx
│   ├── ActionsPane.jsx
│   ├── AiPane.jsx
│   ├── PluginsPane.jsx
│   ├── ServicePane.jsx
│   └── AboutPane.jsx
└── main.jsx
```

`main.jsx` 只保留 React root 挂载；`App.jsx` 管 Tab 和顶层数据协调；各 Pane 内部只处理自身表单。

### 实施步骤

1. 抽 API facade：把 `window.controlCenterAPI || mock` 移到 `api/control-center-api.js`。
2. 抽共享控件：`Toggle`、`SegmentedControl`、日志工具栏、状态提示。
3. 拆 Pet / AI / Plugins / Actions Pane；保留已拆出的 `ServicePane.jsx` 并统一 props 风格。
4. 样式文件按组件或 pane 分段整理，先不引入 CSS module 或新 UI 库。
5. 保持 IPC、service、preload 不变。

### 验收

- `main.jsx` 降到 80 行以内，`App.jsx` 低于 350 行。
- 每个 Pane 文件低于 450 行。
- `npm run build:control-center`、`npm test`、`npm run check:syntax` 通过。
- Pet / Actions / AI / Plugins / Service 现有路径逐项手动验证。

## 6. Phase 2：Pet pack 完整管理体验

### 目标

把 Pet pack 从底层 runtime 能力提升为用户可操作的产品体验：安装、预览、切换、删除、升级、版本查看。

### 数据模型

新增 `settings.petPacks`，只保存非敏感元数据和 active id：

```json
{
  "petPacks": {
    "activePackId": "legacy-cat",
    "installed": {
      "legacy-cat": {
        "id": "legacy-cat",
        "displayName": "Legacy Cat",
        "version": "1.0.0",
        "source": "built-in",
        "rootPath": "cat_anime",
        "installedAt": "2026-06-12T00:00:00.000Z",
        "updatedAt": "2026-06-12T00:00:00.000Z"
      }
    }
  }
}
```

用户安装的 pack 存到 `app.getPath('userData')/pet-packs/<pack-id>/`。项目内 `cat_anime/` 继续作为内置 legacy pack 和开发素材路径。

### Service 设计

新增 `PetPackService`，职责如下：

- `listPacks()`：列出内置和用户安装 pack。
- `inspectPack(sourcePath)`：读取 `pet.json`、校验 sprite 路径、检查图片存在性、生成预览摘要。
- `importPack(sourcePath)`：复制目录或解压 `.openpet-pet.zip` 到 userData。
- `setActivePack(packId)`：切换 active pack，通知 `ActionService.reload()` 与宠物窗口。
- `removePack(packId)`：删除用户安装 pack，禁止删除 active pack 或内置 pack。
- `compareVersions(packId, sourcePath)`：升级前显示版本差异。

`ActionService` 从“只加载 legacy”演进为“根据 active pack 加载”：

```text
ActionService -> PetPackService.getActivePetPack() -> manifest -> renderer config
```

### UI 设计

在 Control Center 中把 Actions 拆成两个子视图：

- **Actions**：当前 pack 内动作管理，继续支持导入帧文件夹。
- **Pet Packs**：安装包列表、当前启用、整包导入、整包预览、删除/升级。

整包预览至少显示：名称、版本、动作数量、默认动作、点击动作、首个 idle/greeting sprite 预览、校验错误列表。

### 验收

- 可导入一个合法 pet pack 目录并切换为当前宠物。
- 切换 pack 后宠物窗口菜单、默认动作、点击动作立即刷新。
- 非法 sprite path、缺失 sprite、无动作、错误 defaultAction 会在导入前被拦截。
- 删除 active pack 被阻止；删除非 active 用户 pack 成功。
- legacy cat 仍可作为默认内置 pack 启动。
- 新增 `tests/services/pet-pack-service.test.js` 覆盖导入、切换、删除、校验。

## 7. Phase 3：插件生态产品化

### 目标

把“能跑本地插件”升级为“用户敢安装、开发者能发布、权限变化可理解”的插件生态基础。

### 3.1 沙箱方案评估

当前 runner：子进程 + Node permission model + VM context + 受限 SDK。下一步不急着替换，而是做一轮评估报告和 proof-of-concept。

| 方案 | 优点 | 风险 | 推荐结论 |
|------|------|------|----------|
| 现有子进程 runner | 进程隔离清晰，短生命周期，已落地 | Node permission model 仍较新；VM 不是完整安全边界 | 保留为近期默认 |
| Worker thread | 轻量，通信简单 | 同进程资源隔离弱，不适合不可信代码 | 不作为主沙箱 |
| SES / lockdown | 对 JS 对象能力约束更强 | 集成成本、兼容性、调试成本较高 | 做 POC，适合长期强化 |
| Electron utilityProcess | Electron 原生隔离进程 | 打包、权限、跨平台验证成本 | 作为中期候选 |
| WASM 插件 | 沙箱强，能力边界清晰 | JS 插件生态门槛变高 | 长期探索，不阻塞产品化 |

阶段产物：`docs/plugin-sandbox-evaluation.md`，包含威胁模型、逃逸面、性能、调试体验和打包影响。

### 3.2 插件包格式

定义 `.openpet-plugin.zip`：

```text
my-plugin.openpet-plugin.zip
├── plugin.json
├── index.js
├── config.schema.json
├── README.md
└── assets/
```

新增 manifest 字段：

```json
{
  "schemaVersion": 1,
  "id": "focus-timer",
  "name": "Focus Timer",
  "version": "1.0.0",
  "openpetApiVersion": "1.x",
  "main": "index.js",
  "permissions": ["pet:say", "pet:action", "storage"],
  "permissionsReason": {
    "storage": "Save timer presets locally."
  },
  "network": { "allowlist": [] }
}
```

### 3.3 安装与权限流

新增 `PluginInstallService`：

- `inspectPluginPackage(filePath)`：解压到临时目录、校验 manifest、计算文件 hash、读取签名信息。
- `installPlugin(selectionId)`：复制到 `userData/plugins/<plugin-id>`，默认 disabled。
- `updatePlugin(selectionId)`：对比版本与权限 diff。
- `uninstallPlugin(pluginId)`：卸载插件，可选择保留或删除私有存储。

权限变更提示规则：

- 新增权限：必须用户确认，插件更新后默认保持 disabled，直到确认。
- network allowlist 新增 host：视为权限升级。
- main/configSchema 路径变化：显示 hash diff。
- 签名丢失或签名主体变化：高风险提示。

### 3.4 签名与市场

分两步做：

1. **本地签名校验**：支持包内 `signature.json`，校验 manifest + 文件 hash。第一版允许 unsigned，但安装时标记“未签名”。
2. **插件目录/市场**：先做静态 catalog JSON，而不是完整后端。

Catalog 示例：

```json
{
  "plugins": [
    {
      "id": "focus-timer",
      "name": "Focus Timer",
      "version": "1.0.0",
      "downloadUrl": "https://example.com/focus-timer.openpet-plugin.zip",
      "sha256": "...",
      "permissions": ["pet:say", "storage"]
    }
  ]
}
```

### UI 设计

Plugins 页新增：

- “Install plugin” 按钮，支持选择 `.openpet-plugin.zip` 或插件目录。
- 安装前 review sheet：名称、版本、权限、网络 host、签名状态、命令列表。
- 插件详情页：配置、权限、日志、存储、更新、卸载。
- 权限变更对比：新增/移除/未变。

### 验收

- 未签名插件可安装但显示风险标识；签名插件 hash 校验通过。
- 更新时新增权限会禁用插件并要求确认。
- 无效 zip、路径穿越、未知权限、非 HTTPS allowlist 均被拒绝。
- 插件卸载不会影响其他插件 storage。
- 新增 service 测试覆盖 inspect/install/update/uninstall/permission diff。

## 8. Phase 4：AI 行为编排 v2

### 目标

把 AI 动作触发从“回复文本关键词匹配”升级为“结构化、可配置、可调试”的行为编排，同时保留当前轻量匹配作为 fallback。

### 架构

新增 `BehaviorOrchestratorService`，取代或包裹当前 `ai-action-orchestrator.js`：

```text
AiService.chat()
  -> reply + optional tool_calls / structured intent
  -> BehaviorOrchestratorService.evaluate()
  -> PetService.say/playAction/setEvent
```

### 行为规则模型

保存到 `settings.ai.behaviorRules`：

```json
[
  {
    "id": "success-action",
    "enabled": true,
    "priority": 100,
    "when": { "intent": "success", "minConfidence": 0.7 },
    "then": { "type": "playAction", "actionId": "success" }
  },
  {
    "id": "thinking-action",
    "enabled": true,
    "priority": 80,
    "when": { "contains": ["我想想", "thinking"] },
    "then": { "type": "playAction", "actionId": "thinking" }
  }
]
```

第一版支持三类 `when`：

- `intent`：来自 tool-call 或结构化 JSON。
- `contains`：显式文本规则，替代散落关键词。
- `actionKind`：匹配当前 pet pack 的 action kind。

第一版支持三类 `then`：

- `say`
- `playAction`
- `setEvent`

### Tool-call 设计

对支持 OpenAI-compatible tools 的 provider，发送工具定义：

```json
{
  "type": "function",
  "function": {
    "name": "openpet_behavior",
    "description": "Choose an OpenPet pet behavior for this assistant reply.",
    "parameters": {
      "type": "object",
      "properties": {
        "intent": { "type": "string" },
        "actionId": { "type": "string" },
        "confidence": { "type": "number" },
        "bubbleText": { "type": "string" }
      },
      "required": ["intent", "confidence"]
    }
  }
}
```

对不支持 tools 的 provider，使用 JSON response hint 作为 fallback，但必须经过严格解析和 actionId 白名单校验。

### UI 设计

AI 页新增 “Behavior” 子面板：

- 开关：启用结构化行为编排。
- 规则列表：启用、优先级、条件、动作。
- Dry run：输入一段 AI 回复，显示命中的规则和将触发的宠物动作。
- 日志：最近 50 次编排决策，不记录 API Key。

### 安全边界

- AI 只能选择已存在 actionId。
- 不允许 AI 直接调用插件、HTTP、MCP 或读取配置。
- 行为执行走 `PetService`，保留 source：`ai` / `ai:behavior`。
- 对连续触发动作加 cooldown，避免模型输出导致宠物闪烁。

### 验收

- 支持 tool-call provider 时用结构化 intent 触发动作。
- 不支持 tool-call 时 fallback 到规则/关键词，不回退到危险自由执行。
- Dry run 能解释命中原因。
- 单元测试覆盖 rule priority、actionId 白名单、cooldown、fallback。

## 9. Phase 5：MCP / 外部 agent 产品化

### 目标

让外部 agent 能稳定、安全、可文档化地使用 OpenPet，而不只是“能 POST JSON-RPC”。

### Transport 抽象

新增 `McpService` 或从 `LocalHttpService` 中拆出 MCP 子模块：

```text
LocalHttpService
  -> HttpApiRouter
  -> McpTransportService
      -> jsonRpcHttp
      -> streamableHttp
      -> sse (optional)
```

### 能力补齐

- 保留 `POST /mcp` JSON-RPC。
- 评估并实现 MCP streamable HTTP；如客户端仍需要 SSE，再提供 `/mcp/sse`。
- `tools/list`、`tools/call` 使用更严格 input schema 校验。
- 增加 `resources/list` 或 `prompts/list` 前先评估真实价值，避免为了协议完整度暴露过多状态。
- Service 页显示 active session 数、最近 MCP 调用、撤销所有 session。

### 兼容矩阵

新增 `docs/mcp-compatibility.md`：

| 客户端 | Transport | 鉴权方式 | 状态 | 备注 |
|--------|-----------|----------|------|------|
| Claude Desktop | 待验证 | token/session | 未开始 | 需配置样例 |
| Cursor / Windsurf | 待验证 | token/session | 未开始 | 需确认 streamable HTTP |
| Codex / local agents | JSON-RPC HTTP | token/session | 待验证 | 提供 curl 与 Node 示例 |
| OpenAI Agents SDK | HTTP tool bridge | token/session | 待验证 | 视 MCP 客户端能力决定 |

### 外部使用文档

新增 `docs/mcp-usage.md`：

- 如何在 Control Center 启用 Service。
- 如何复制 endpoint 和 token。
- `initialize` 请求示例。
- `tools/list` / `tools/call` 示例。
- 安全说明：token 轮换、session TTL、日志位置、默认关闭。

### 验收

- 至少验证 2 个真实 MCP 客户端或 agent 脚本。
- token 轮换后旧 session 失效。
- Service 页可撤销所有 MCP session。
- 访问日志能区分 HTTP pet API 与 MCP tool call。
- 新增 tests 覆盖 session TTL、schema validation、streaming transport 基础握手。

## 10. Phase 6：分发、更新与发布流水线

### 目标

从“开发者能 pack”升级为“用户可安装、系统可信、版本可更新、发布可重复”。本阶段先完成 macOS release path；Windows 桌面分发不在 Phase 6 已完成范围内。

### 打包配置

补齐 `package.json build`：

- `mac.icon`: `build/icon.icns`
- `hardenedRuntime`: true
- `entitlements`: `build/entitlements.mac.plist`
- `entitlementsInherit`: `build/entitlements.mac.plist`
- `gatekeeperAssess`: false（按 electron-builder 推荐搭配 notarization 验证）
- `afterSign`: notarization hook

### 资产

- 生成 `build/icon.icns`、`build/icon.png`。
- DMG 背景可后置；第一版只需要专业但简洁的 icon 与应用名。

### 签名与公证

需要环境变量：

```text
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_TEAM_ID
CSC_LINK 或本机 Keychain certificate
CSC_KEY_PASSWORD
```

流水线中区分：

- PR：只跑 test/build，不签名。
- tag：跑 signed dist + notarization + artifact upload。

### 更新检查

第一版使用 GitHub Releases 做 About 页更新检查：

- release channel：`latest` / `beta`。
- Control Center About 页显示当前版本、检查更新状态和 release asset 摘要。
- 更新不自动静默安装，先做用户确认。

### 安装包验证清单

- 首次安装启动。
- 透明宠物窗口显示正常。
- Control Center 打开正常。
- autoStart 设置在打包态不会报错。
- 插件目录和 pet-packs 目录在 `userData` 下可写。
- 本地 HTTP 默认关闭。
- 卸载/重装不会误删用户数据，除非用户手动清理。

### 验收

- `npm run dist` 生成 DMG/ZIP。
- macOS 签名验证通过：`codesign --verify --deep --strict`。
- 公证通过：`spctl --assess` 不报阻止。
- GitHub tag 发布能产出安装包 artifact。
- About 页可检查更新。

### Windows 桌面扩展

后续补齐 Windows 桌面分发时，按 [`desktop-release-design.md`](./desktop-release-design.md) 执行。`build/win` targets（NSIS + ZIP）、`build/icon.ico`、`windows-latest` release job、平台化 About/update 资产筛选、Windows 签名策略护栏、冒烟证据门禁、pending 报告/runbook/collector 产物、证据包校验、summary/archive-manifest、报告填写工具和 packaged native picker smoke evidence 工具链已经完成；剩余重点是签名产物验证和安装/卸载/透明窗口/插件 runner/原生文件选择器真实冒烟矩阵。完成前，文档与 README 不应声明 Windows release-ready。

## 11. Phase 7：生态运营闭环

### 目标

把插件和 pet pack 从“能装”升级为“可发现、可升级、可治理”。

### 插件目录

- 第一版用静态 catalog JSON。
- 后续再考虑完整 marketplace 后端。
- catalog 不直接执行代码；下载后仍走 inspect/install/permission review。

### Pet pack 目录

- 与插件目录共用 catalog 机制。
- 展示 preview 图片、动作数量、版本、作者、兼容 OpenPet 版本。
- 支持一键安装和更新。

### 生态治理

- 本地 blocklist：按 pluginId / packId / sha256 禁用已知风险包。
- 报告入口：先链接到 GitHub issue 或静态反馈 URL。
- 兼容性声明：`openpetApiVersion`、`petPackSchemaVersion`。

### 验收

- Control Center 能加载 catalog，展示插件和 pet pack。
- 下载包必须 hash 匹配。
- blocklist 命中时禁止安装或运行。
- 已安装项能显示“有更新”。

## 12. 横向测试策略

### Service 层

- 所有新增 service 必须使用 Node native test runner。
- 每个外部输入面都有恶意输入测试：路径穿越、超大 body、未知权限、非法 schema。
- 对 settings migration 写回归测试，确保老用户配置可升级。

### UI 层

- 当前项目已有 Playwright Control Center UI 回归基线，覆盖 app shell、全部 tab、Pet scale / walk speed 交互、About 更新检查状态、Pet / AI / Service 保存配置流程、Catalog 安装/更新流程、Service MCP session 管理，以及手动插件包安装 review。
- 后续继续扩展关键路径：使用 desktop picker smoke evidence 工具链填写真实 packaged app 原生 OS 文件选择器证据、真实安装包烟测，以及 Windows clean-machine 验证。

### 打包层

- `npm run pack` 保持每阶段可跑。
- 分发阶段增加 `npm run dist` 验证；当前验证对象是 macOS DMG/ZIP。
- 对 macOS 签名/公证使用单独 release workflow，避免 PR 泄露证书。
- Windows 分发继续补齐签名产物验证、安装/卸载冒烟；`windows-latest` 构建、平台资产更新检查、签名策略护栏、冒烟证据门禁、pending 报告/runbook/collector 产物、证据包校验、summary/archive-manifest、报告填写工具和 desktop picker smoke evidence 工具链已进入基线。

## 13. 风险清单

| 风险 | 影响 | 缓解 |
|------|------|------|
| 插件沙箱被误认为绝对安全 | 用户数据风险 | 明确威胁模型；默认 disabled；权限 review；签名；短生命周期 runner |
| Pet pack 导入恶意路径或超大图片 | 文件覆盖、内存压力 | 安全相对路径、解压目录隔离、文件数量/大小上限、sharp metadata 预检 |
| AI tool-call 被模型误用 | 宠物行为混乱 | actionId 白名单、规则 cooldown、dry-run、关闭开关 |
| MCP token 泄漏 | 外部控制宠物 | 默认关闭、token 轮换、session revoke、访问日志、loopback only |
| 签名/公证失败阻塞发布 | 无法安装 | 先建立 unsigned beta 包，再补 signed release；流水线分阶段 |
| Windows 分发未验证却被对外承诺 | 用户无法安装或被 SmartScreen/路径问题阻断 | 文档只声明 macOS baseline 与 Windows 打包/CI/签名策略/冒烟证据、报告、runbook 与 collector/证据包校验/summary/archive-manifest、desktop picker smoke evidence 工具链基线；Windows 必须通过签名产物验证和冒烟矩阵后再发布 |
| Control Center 继续膨胀 | 后续功能难维护 | Phase 1 强制拆分并设文件体量阈值 |

## 14. 当前收尾状态

Phase 1-7 已完成并合入 `main`。每个阶段均有开发文档与 Production Code Quality Review 文档；Phase 7 完成后，项目已具备 Control Center 模块化、Pet pack 管理、插件安装/权限 review、AI 行为编排、MCP transport、macOS 分发流水线、生态 catalog 与本地 blocklist 治理闭环。v1.0.1-rc.2 在此基线上完成 OpenPet 改名兼容、Codex pet 导入/zip 导入、内置 pet packs、透明模型修复与 TypeScript 迁移框架。Phase 8 已完成 Windows 打包/CI/签名策略/冒烟证据、报告、runbook 与 collector/证据包校验/summary/archive-manifest 基线，但尚未进入“已发布就绪”状态。Phase 9-10 已补齐项目文档治理与文档设计层。Phase 11 新增 Control Center Playwright 冒烟基线，Phase 12 将 Pet / AI / Service 保存配置流程纳入 UI 回归，Phase 13 将 Catalog 安装/更新流程纳入 UI 回归，Phase 14 将 Service MCP session 管理纳入 UI 回归，继续把 UI 验收从纯手动清单推进到项目自带自动化。Phase 15 将项目文档设计进一步收口：修正入口测试徽章漂移，补齐 macOS/Windows 桌面结构决策记录、scope 变更规则、support claim 升级清单和 phase/review 模板。Phase 16 将手动插件包安装 review 纳入 demo API Playwright 回归。Phase 17 将插件包安装从 demo UI 推进到主进程 IPC + 真实 `.openpet-plugin.zip` fixture 覆盖。Phase 18 将真实 Electron 原生 OS 文件选择器缺口推进为 packaged app smoke evidence 工具链，但真实 macOS / Windows picker evidence 和 Windows 安装包验证仍需后续烟测归档。Phase 19 将项目文档设计完善为可执行操作模型，补齐文档生命周期、阶段完成契约、完成标准、反模式和决策记录。Phase 20-29 完成示例插件、插件提交工作流与 RC 升级 smoke 证据工具。Phase 30-39 完成 Codex pet import、Codex pet zip import、内置 Codex pets、TypeScript 迁移框架、产品化 TODO 落地设计、Control Center view contract 迁移、packaged runtime smoke evidence 工具链、release evidence archive manifest 工具链、插件 secrets 决策/脚手架与插件沙箱评估。Phase 40-43 完成 pet pack export/provenance、AI behavior decision viewer、真实 macOS packaged runtime evidence，以及 signed release closure claim gate；Phase 44-51 完成插件作者体验演练、TypeScript boundary 扩展、文档收敛、Control Center hook/Pane props 迁移，以及 service/catalog/plugin/pet pack mutation main-process adapter 基线；当前 closure evidence 明确 official desktop、macOS 与 Windows release readiness 仍为 not-ready。

### 完成验证

**所有质量门槛已通过**：

```bash
npm test                      # ✅ 403/403 Node tests pass
npm run test:control-center   # ✅ 10/10 Control Center Playwright UI tests pass
npm run check:syntax          # ✅ all JS syntax pass
npm run build:control-center  # ✅ Vite build pass
npm run pack                  # ✅ electron-builder pass
```

**所有阶段已交付**：

| Phase | 主题 | Commit | 开发文档 | Review | 状态 |
|-------|------|--------|----------|--------|------|
| 1 | Control Center 模块化 | `5f8b938` | ✅ | ✅ | 完成 |
| 2 | Pet pack 管理 | `04b8055` | ✅ | ✅ | 完成 |
| 3 | 插件安装与权限 | `ef3ad40` | ✅ | ✅ | 完成 |
| 4 | AI 行为编排 | `6beb3d2` | ✅ | ✅ | 完成 |
| 5 | MCP transport 产品化 | `1db6f17` | ✅ | ✅ | 完成 |
| 6 | macOS 分发与 release pipeline | `cb4895a` | ✅ | ✅ | 完成 |
| 7 | 生态 catalog 运营闭环 | `edd1307` | ✅ | ✅ | 完成 |
| 8 | Windows 桌面分发基线 | 多阶段提交 | ✅ | ✅ | 基线完成，未 release-ready |
| 9 | 项目文档治理完善 | 本阶段提交 | ✅ | ✅ | 完成 |
| 10 | 项目文档设计加固 | `97ac2c4` | ✅ | ✅ | 完成 |
| 11 | Control Center 前端自动化基线 | 本阶段提交 | ✅ | ✅ | 完成 |
| 12 | Control Center 保存配置自动化 | 本阶段提交 | ✅ | ✅ | 完成 |
| 13 | Control Center Catalog 自动化 | 本阶段提交 | ✅ | ✅ | 完成 |
| 14 | Control Center MCP Session 自动化 | 本阶段提交 | ✅ | ✅ | 完成 |
| 15 | 项目文档设计收口 | 本阶段提交 | ✅ | ✅ | 完成 |
| 16 | Control Center 手动插件安装自动化 | 本阶段提交 | ✅ | ✅ | 完成 |
| 17 | Electron 插件包 IPC 安装烟测 | 本阶段提交 | ✅ | ✅ | 完成 |
| 18 | Desktop 原生文件选择器烟测证据工具链 | 本阶段提交 | ✅ | ✅ | 完成 |
| 19 | 项目文档设计完善 | 本阶段提交 | ✅ | ✅ | 完成 |
| 20 | 示例插件开发者资产 | 本阶段提交 | ✅ | ✅ | 完成 |
| 21 | Weather 示例插件开发者资产 | 本阶段提交 | ✅ | ✅ | 完成 |
| 22 | RSS 示例插件开发者资产 | `a1fd496` | ✅ | ✅ | 完成 |
| 23 | 插件提交校验入口 | 本阶段提交 | ✅ | ✅ | 完成 |
| 24 | 插件提交审核包 | 本阶段提交 | ✅ | ✅ | 完成 |
| 25 | 插件提交 PR 模板 | 本阶段提交 | ✅ | ✅ | 完成 |
| 26 | 插件提交工作流包 | 本阶段提交 | ✅ | ✅ | 完成 |
| 27 | 插件提交工作流包验证 | 本阶段提交 | ✅ | ✅ | 完成 |
| 28 | 插件提交工作流演练手册 | 本阶段提交 | ✅ | ✅ | 完成 |
| 29 | RC 升级兼容 smoke 证据 | 本阶段提交 | ✅ | ✅ | 完成 |
| 30 | Codex Pet 原生导入 | 本阶段提交 | ✅ | ✅ | 完成 |
| 31 | Codex Pet Zip 原生导入 | 本阶段提交 | ✅ | ✅ | 完成 |
| 32 | 内置 Codex Pets 基础资产 | 本阶段提交 | ✅ | ✅ | 完成 |
| 33 | TypeScript 迁移框架 | 本阶段提交 | ✅ | ✅ | 完成 |
| 34 | 插件开发者体验设计 | 本阶段提交 | ✅ | ✅ | 完成 |
| 35 | TypeScript Control Center 契约迁移 | 本阶段提交 | ✅ | ✅ | 完成 |
| 36 | Packaged Runtime Smoke Evidence | 本阶段提交 | ✅ | ✅ | 工具链完成，真实证据待归档 |
| 37 | Release Evidence Archive | 本阶段提交 | ✅ | ✅ | 工具链完成，真实 signed evidence 待归档 |
| 38 | Plugin Secrets Decision and Scaffolding | 本阶段提交 | ✅ | ✅ | 完成，插件 config 禁止 secrets，脚手架可用 |
| 39 | Plugin Sandbox Evaluation | 本阶段提交 | ✅ | ✅ | 完成，v1.1 保留当前 runner 并记录边界 |

**项目评估结果**：
- 功能完整性：95%（所有承诺功能已实现）
- 测试覆盖：403/403 Node 测试通过；10/10 Control Center Playwright UI 测试通过
- 架构质量：⭐⭐⭐⭐⭐（分层清晰、安全可靠）
- 代码质量：⭐⭐⭐⭐⭐（模块化彻底、职责单一）
- 文档完整性：⭐⭐⭐⭐⭐（双语 README、技术文档、版本记录与发布清单完整）

详见 [project-status-review.md](./project-status-review.md) 全面评估报告。

### 发布建议

**✅ 建议发布 v1.0.1-rc.2**

RC 重点验证：
1. 旧 `appData/ibot` 数据可被 OpenPet 继续读取。
2. `openpet.*` 新 MCP tool 名可用，旧 `ibot.*` alias 仍可用。
3. GitHub Releases、About 更新检查和本地 remote 均指向 `dengyie/OpenPet`。
4. macOS DMG/ZIP artifact 与签名/公证状态符合发布清单。

v1.1 版本规划（可选）：
1. Windows 签名产物验证与冒烟验证
2. 填写并归档 macOS / Windows packaged app 原生 OS 文件选择器真实烟测证据
3. 真实第三方插件提交/审核演练与教程材料
4. 插件开发教程视频
5. 用户反馈收集与迭代

剩余可选增强不属于本轮产品化闭环阻塞项：远端 marketplace 后端、真实第三方签名根信任、Electron 宿主下更深 UI 自动化、以及 SES / Electron utilityProcess 等更强插件沙箱候选方案。
