# ibot Pet Platform 开发文档

> 目标：把当前单体 Electron 桌宠重构为可扩展的 pet runtime 平台，支持 UI 配置、AI 聊天、动作帧导入、官方能力模块和第三方插件。

## 1. 当前结论

已确认的架构决策：

- `PetService` 是唯一宠物状态源，渲染层只负责显示和交互转发。
- AI 聊天走 provider-agnostic 适配器，不把 API Key 暴露给 renderer 或普通插件。
- 所有配置必须有 UI，用户不需要手动改 JSON、env 或配置文件。
- Control Center 做 web app first，优先嵌入 Electron `BrowserWindow`，后续可开放 `127.0.0.1` 本地网页访问。
- 插件系统采用权限化 SDK，不直接 `require()` 任意本地 JS 获取 Node/Electron 权限。
- 核心能力内置，AI/chat、focus timer、agent status 等可选能力做官方插件或官方模块。
- 重构采用增量迁移，每一步都保持现有桌宠可启动。

## 1.1 执行状态

当前进度：

- Phase 1 Core service layer：已完成基础落地。
- Phase 2 Runtime contract：已完成基础落地。
- Phase 3 Control Center：已完成基础落地。
- Phase 4 AI chat：已完成基础落地。
- Phase 5 Plugin runtime：已完成基础落地。
- Phase 6 Local HTTP/MCP：已完成 HTTP 基础落地，MCP 后置。

Phase 1 已新增：

```text
src/main/services/event-bus.js
src/main/services/settings-service.js
src/main/services/action-service.js
src/main/services/pet-service.js
src/main/runtime/runtime-state.js
tests/services/*.test.js
```

Phase 1 当前范围：

- `main.js` 负责组装 service。
- `src/main/ipc.js` 通过 `PetService` 读取动作和设置。
- 保留现有宠物窗口、preload、renderer、设置 UI 和素材格式。
- 未引入 Control Center、AI、插件和本地 HTTP API。

Phase 2 已新增：

```text
src/main/pet-pack/schema.js
src/main/pet-pack/loader.js
src/main/pet-pack/importer.js
tests/pet-pack/*.test.js
```

Phase 2 当前范围：

- 定义 `pet.json` manifest 归一化规则。
- 支持从 pet pack 目录读取 `pet.json`。
- 支持把当前 `cat_anime/animations.json` legacy 配置包装成 runtime pet pack。
- `ActionService` 内部面向 pet pack，外部仍保持 renderer 需要的旧动画配置形状。
- 已实现 Control Center 的动作帧导入 UI 基础版。

Phase 3 已新增：

```text
control-center-preload.js
src/control-center/index.html
src/control-center/vite.config.js
src/control-center/src/main.jsx
src/control-center/src/styles.css
```

Phase 3 当前范围：

- 引入 Vite/React Control Center。
- `npm start` 会先构建 Control Center，再启动 Electron。
- Electron 设置窗口优先加载 `dist/control-center/index.html`，缺少构建产物时回退旧 `settings.html`。
- Control Center 的 Pet 页面覆盖现有设置项：大小、散步速度、散步时长、气泡时长、开机自启。
- Actions、AI、Plugins、Service、About 页面先保留结构化入口。
- 尚未实现动作帧导入 UI、AI API Key UI、插件配置 UI 和本地 HTTP API。

Phase 4 已新增：

```text
src/main/services/secret-service.js
src/main/services/ai-service.js
tests/services/secret-service.test.js
tests/services/ai-service.test.js
```

Phase 4 当前范围：

- 新增主进程 `SecretService`，API Key 只通过 `apiKeyRef` 关联，Control Center 和 renderer 不拿到明文。
- 新增 provider-agnostic `AiService`，第一版实现 OpenAI-compatible `/chat/completions` 适配。
- `settings.json` 只保存 AI 非敏感配置：enabled、provider、baseUrl、model、apiKeyRef、systemPrompt。
- Control Center 的 AI 页面支持配置保存、API Key 保存、连接测试和简单聊天。
- AI 聊天支持 `conversationId` 维持主进程内存会话上下文。
- AI 回复会通过 `pet:say` 推送给宠物窗口显示气泡。
- 尚未把 AI 做成插件，也未接入动作语义触发；这部分留给 PluginRuntime 和行为编排阶段。

Phase 5 已新增：

```text
src/main/plugins/manifest.js
src/main/plugins/official/basic-behavior.js
src/main/services/plugin-service.js
tests/plugins/manifest.test.js
tests/services/plugin-service.test.js
```

Phase 5 当前范围：

- 定义插件 manifest 归一化与权限白名单。
- 支持扫描用户数据目录下的本地插件 manifest：`<userData>/plugins/<plugin-id>/plugin.json`。
- 本地第三方插件第一版只发现和展示，不执行任意 JS。
- 新增官方 `Basic Behavior` 插件，用受限 SDK 验证 `ctx.pet.say()` 命令链路。
- 插件启用状态保存到 `settings.plugins.enabled`，可在 Control Center 的 Plugins 页启停。
- Control Center 的 Plugins 页显示插件来源、权限、命令，并可运行官方插件命令。
- 坏的本地 manifest 会被隔离跳过，不阻塞其他插件加载。
- `PetService.say()` 成为 AI 和插件触发气泡的统一入口。
- 尚未实现第三方插件沙箱、配置 schema 表单、插件日志面板和插件存储。

Phase 6 已新增：

```text
src/main/services/local-http-service.js
tests/services/local-http-service.test.js
```

Phase 6 当前范围：

- 新增本地 HTTP 服务，默认关闭，只允许绑定 loopback：`127.0.0.1`、`localhost`、`::1`。
- Control Center 的 Service 页面支持启停、端口配置、运行状态和当前端点展示。
- `settings.localHttp` 保存非敏感服务配置：enabled、host、port。
- 已提供最小 HTTP API：
  - `GET /api/status`
  - `POST /api/pet/say`
  - `POST /api/pet/action`
  - `POST /api/pet/event`
- HTTP API 统一走 `PetService` intent，不直接操作 renderer。
- `PetService.playAction()` 会推送到宠物窗口切换动作。
- `PetService.setEvent()` 第一版映射为气泡消息，后续可扩展为完整 runtime event。
- MCP bridge 暂不实现，等本地 HTTP API 和插件权限模型更稳定后再接。

Actions 导入已新增：

```text
src/main/services/sprite-generator.js
src/main/services/action-import-service.js
tests/services/sprite-generator.test.js
tests/services/action-import-service.test.js
```

Actions 导入当前范围：

- 将 `scripts/generate-sprites.js` 的核心逻辑抽成 `SpriteGenerator` 服务，CLI 和 UI 共用同一套生成规则。
- Control Center 的 Actions 页面显示当前动作、默认动作、点击动作、帧数和尺寸。
- 用户可填写 action id / 显示名称，点击导入后选择一个动作帧文件夹。
- 导入会复制帧到 `cat_anime/flames/<action-id>/`，重新生成 `cat_anime/sprites/*.png` 和 `cat_anime/animations.json`。
- 导入完成后主进程刷新 `ActionService` 缓存，并通知宠物窗口重新加载动作菜单和默认动作。
- Actions 页面可配置默认动作和点击动作。
- Actions 页面可删除动作，删除会移除 `cat_anime/flames/<action-id>/` 和对应 sprite。
- action id 只允许字母、数字、下划线和连字符，防止路径穿越。
- 尚未实现动作预览器、动作重命名和导入前逐帧校验报告。

## 2. 参考方向

调研过的相关项目：

- [OpenPets](https://github.com/alvinunreal/openpets)：桌宠 runtime、MCP/CLI/agent hooks、插件权限和安全消息边界。
- [OpenPet](https://github.com/X-T-E-R/OpenPet)：本地桌宠 runtime、HTTP API、MCP/CLI 控制、Codex-compatible pet package。
- [Convai Desktop Pet](https://github.com/AkshitIreddy/convai-desktop-pet)：AI 桌宠、API Key 配置、多角色和动作状态。
- Codex pet contract：`${CODEX_HOME}/pets/<pet-name>/pet.json + spritesheet.webp`，固定 8x9 atlas，可作为兼容导入/导出目标。

对 ibot 的启发：

- 运行时协议要比 UI 更稳定。
- 宠物窗口不应直接拥有业务状态。
- AI、agent integration、插件都应通过同一套 pet service API 控制宠物。
- 动作帧输入是导入体验，运行时应使用稳定的 pet pack manifest。
- 插件必须有权限、限流、配置 schema 和错误隔离。

## 3. 目标架构

```text
Electron Main Process
├── Runtime Kernel
│   ├── PetService
│   ├── ActionService
│   ├── SettingsService
│   ├── SecretService
│   ├── AiService
│   ├── PluginRuntime
│   └── EventBus
│
├── Window Layer
│   ├── PetWindow
│   └── ControlCenterWindow
│
├── Interface Layer
│   ├── Electron IPC
│   ├── Local HTTP API (later)
│   └── MCP bridge (later)
│
└── Storage Layer
    ├── settings.json
    ├── pet packs
    ├── plugin state
    └── secret store

Renderer Processes
├── Pet Renderer
│   └── subscribes to runtime snapshot and sends user intents
└── Control Center
    └── web app for all configuration and diagnostics
```

## 4. Core Services

### 4.1 PetService

职责：

- 保存当前宠物运行状态。
- 接收外部 intent，例如 `say`、`playAction`、`setEvent`、`move`。
- 合并来自 UI、AI、插件、未来 HTTP/MCP 的宠物控制请求。
- 向渲染层发布 `PetSnapshot`。

建议接口：

```js
petService.getSnapshot()
petService.say({ text, ttlMs, source })
petService.playAction({ actionId, source })
petService.setEvent({ type, message, ttlMs, source })
petService.setMovement({ walking, direction, source })
petService.subscribe(listener)
```

### 4.2 ActionService

职责：

- 加载当前 pet pack。
- 注册动作、校验动作、选择默认动作和点击动作。
- 兼容现有 `cat_anime/animations.json`。
- 供插件和 AI 通过语义触发动作。

建议接口：

```js
actionService.listActions()
actionService.getAction(actionId)
actionService.play(actionId)
actionService.importFrames({ sourceDir, petId, actionId })
actionService.validatePetPack(petPath)
```

### 4.3 SettingsService

职责：

- 管理非敏感配置。
- 提供 schema 和默认值。
- 负责读写、迁移、通知变更。

不应保存：

- API Key
- token
- 插件私密凭据

### 4.4 SecretService

职责：

- 保存 API Key 等敏感信息。
- 配置文件只保存 `apiKeyRef`。
- renderer 和普通插件不能直接读取明文。

第一版可先实现主进程侧文件加权限保护；后续接 OS keychain。

建议接口：

```js
secretService.setSecret({ id, value, label })
secretService.getSecretValue(id)
secretService.deleteSecret(id)
secretService.listSecretRefs()
```

### 4.5 AiService

职责：

- Provider-agnostic 聊天适配。
- 管理模型、base URL、人格 prompt、聊天开关。
- 只在主进程持有 API Key。

建议配置：

```json
{
  "provider": "openai-compatible",
  "baseUrl": "https://api.example.com/v1",
  "model": "example-model",
  "apiKeyRef": "ai.default",
  "systemPrompt": "You are a desktop pet companion.",
  "enabled": true
}
```

建议接口：

```js
aiService.chat({ petId, message, conversationId })
aiService.getConfig()
aiService.updateConfig(config)
aiService.testConnection()
```

### 4.6 PluginRuntime

职责：

- 发现插件 manifest。
- 校验权限。
- 给插件注入受限 SDK。
- 管理插件配置、状态、命令、错误和限流。

插件不允许直接访问：

- Electron API
- Node `fs`
- 用户 API Key 明文
- 任意网络请求
- DOM

## 5. Pet Pack 与动作层

用户体验：用户在 Control Center 中选择动作帧文件夹，系统自动导入、合成、预览、保存。

运行时格式：使用稳定 pet pack manifest。

建议结构：

```text
pets/<pet-id>/
├── pet.json
├── sprites/
│   ├── idle.png
│   ├── eat.png
│   └── wave.png
└── source/
    └── import-metadata.json
```

建议 `pet.json`：

```json
{
  "id": "cat",
  "displayName": "Cat",
  "version": "1.0.0",
  "defaultAction": "idle",
  "clickAction": "eat",
  "actions": [
    {
      "id": "idle",
      "label": "待机",
      "kind": "idle",
      "loop": true,
      "frameCount": 16,
      "frameMs": 95,
      "frameWidth": 191,
      "frameHeight": 453,
      "sprite": "sprites/idle.png"
    }
  ]
}
```

动作语义建议：

- `idle`：默认待机。
- `click`：点击反馈。
- `greeting`：招呼。
- `thinking`：思考。
- `working`：工作中。
- `waiting`：等待用户输入。
- `success`：完成。
- `failure`：失败。
- `custom`：自定义动作。

Codex 固定 atlas 可作为兼容目标，不强制第一版替换当前水平 sprite 条。

## 6. Control Center

Control Center 是未来主要配置入口，不再要求用户改文件。

建议页面：

```text
Pet
  当前宠物、大小、气泡、散步、点击动作、默认动作

Actions
  动作帧导入、sprite 生成、动作预览、默认/点击动作设置

AI
  provider、base URL、model、API Key、人格 prompt、连接测试、聊天开关

Plugins
  插件列表、启用/禁用、权限、配置表单、插件日志

Service
  本地 API 开关、监听地址、端口、MCP 状态、诊断

About / Logs
  版本、依赖、运行日志、导入错误、插件错误
```

实现建议：

- Phase 1 继续保留现有 `settings.html`。
- Phase 3 引入 Vite/React 管理 UI。
- Control Center 默认只在 Electron 内加载。
- 后续开放 `127.0.0.1` 本地网页访问，默认不监听公网。

## 7. 插件系统

建议插件结构：

```text
plugins/<plugin-id>/
├── plugin.json
├── index.js
└── config.schema.json
```

建议 `plugin.json`：

```json
{
  "id": "focus-timer",
  "name": "Focus Timer",
  "version": "1.0.0",
  "entry": "index.js",
  "permissions": ["pet:say", "pet:action", "storage"],
  "configSchema": "config.schema.json"
}
```

建议 SDK：

```js
export default function activate(ctx) {
  ctx.commands.register({
    id: "start",
    title: "Start Focus Timer",
    handler: async () => {
      await ctx.pet.say("Focus mode started")
      await ctx.pet.playAction("working")
    }
  })
}
```

权限建议：

```text
pet:say       显示气泡
pet:action    播放动作
pet:event     设置状态事件
ai:chat       调用 AI 聊天
storage       使用插件私有存储
network       访问 manifest allowlist 中的 HTTPS host
commands      注册 Control Center 命令
```

官方插件优先：

- `ai-chat`
- `basic-behavior`
- `focus-timer`
- `agent-status`

## 8. 本地服务 API

第一版可只做 Electron IPC。后续加本地 HTTP API。

建议 API：

```http
GET  /api/status
POST /api/pet/say
POST /api/pet/action
POST /api/pet/event
POST /api/pets/import
GET  /api/plugins
POST /api/plugins/:id/enable
POST /api/plugins/:id/config
POST /api/ai/test
POST /api/ai/chat
```

安全规则：

- 默认只监听 `127.0.0.1`。
- 开放浏览器访问时需要本机 session/token。
- 不允许跨域任意网页直接控制宠物。
- 不把 API Key 明文返回给任何 HTTP/renderer/plugin 调用方。

## 9. 增量迁移计划

### Phase 1: Core service layer

目标：不改变 UI 和现有功能，先建立底层服务边界。

新增：

```text
src/main/services/pet-service.js
src/main/services/action-service.js
src/main/services/settings-service.js
src/main/services/event-bus.js
src/main/runtime/runtime-state.js
```

要求：

- 现有宠物窗口可启动。
- 点击、散步、右键菜单、设置保存仍可用。
- IPC handler 改为调用 service，而不是直接散落实现。

验收：

```bash
npm audit
npm run generate-sprites
node --check main.js preload.js renderer.js settings-preload.js settings-renderer.js scripts/generate-sprites.js src/main/*.js src/shared/*.js
```

再做一次 Electron 5 秒 smoke test。

### Phase 2: Runtime contract

目标：定义 pet pack schema，兼容当前 `cat_anime`。

新增：

```text
src/main/pet-pack/schema.js
src/main/pet-pack/loader.js
src/main/pet-pack/importer.js
```

要求：

- 当前 `cat_anime/animations.json` 可作为 legacy source 加载。
- 新 pet pack 可被加载和预览。
- 生成脚本逐步输出 pet pack manifest。

### Phase 3: Control Center

目标：引入 web app first 管理 UI。

新增：

```text
src/control-center/
vite.config.js
```

要求：

- 先替代现有设置窗口。
- 所有现有设置都有 UI。
- AI、Actions、Plugins 页面可以先做空状态和结构。

### Phase 4: AI chat

目标：实现 provider-agnostic AI 聊天。

要求：

- API Key 通过 UI 配置。
- renderer 不接触明文 key。
- 有连接测试。
- 宠物右键菜单或 Control Center 可打开聊天。
- AI 回复可以触发 `say` 和动作。

当前落地：

- 已实现 Control Center 聊天入口。
- 已实现 `say` 气泡触发。
- 动作触发待 Phase 5/行为编排接入。

### Phase 5: Plugin runtime

目标：实现权限化插件运行时。

要求：

- 可发现插件。
- 可在 UI 启用/禁用。
- 可显示权限和配置 schema。
- 插件错误隔离。
- 先运行一个官方插件验证 SDK。

当前落地：

- 已实现 manifest 发现和权限白名单。
- 已实现官方插件命令运行。
- 已实现 Control Center 插件启停和命令运行 UI。
- 第三方插件 JS 执行待隔离 runtime 后再开放。

### Phase 6: Local HTTP/MCP

目标：把 runtime 暴露给本机工具和未来 agent。

要求：

- 默认仅 `127.0.0.1`。
- Control Center 可显示服务状态。
- 提供 `status/say/action/event` 最小 API。
- MCP bridge 后置。

当前落地：

- 已实现本地 HTTP API 和 Control Center Service 页面。
- 默认不启动服务，用户可从 UI 启用。
- 服务固定 loopback，不支持监听公网地址。
- MCP bridge 保持后置。

## 10. 风险与约束

主要风险：

- Electron 42 后窗口和 preload 行为可能有兼容差异。
- 没有现成测试，重构必须小步验证。
- API Key 存储不能放普通设置 JSON。
- 插件系统不能为了快而放开 Node/Electron 权限。
- Control Center 引入前端构建后，需要处理 dev/prod 加载路径。
- 动作帧导入要保留当前用户体验，不要逼用户理解 manifest。

工程约束：

- 每个阶段都要保持 `npm start` 可运行。
- 每个阶段都要有 smoke test。
- 不要一次性把 UI、AI、插件、pet pack 全部重写。
- 当前素材和 `cat_anime` 结构要保留兼容路径。

## 11. 推荐第一步

先做 Phase 1。

第一步改动范围：

- 新增 service 层。
- 将 `main.js` 和 `src/main/ipc.js` 改为依赖 service。
- 不改宠物 UI。
- 不引入 React/Vite。
- 不实现 AI。
- 不实现插件。

完成后再进入 Phase 2 的 pet pack schema。
