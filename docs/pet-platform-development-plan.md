# ibot Pet Platform 开发文档

> 目标：把当前单体 Electron 桌宠重构为可扩展的 pet runtime 平台，支持 UI 配置、AI 聊天、动作帧导入、官方能力模块和第三方插件。

## 1. 当前结论

已确认的架构决策：

- `PetService` 是唯一宠物状态源，渲染层只负责显示和交互转发。
- AI 聊天走 provider-agnostic 适配器，不把 API Key 暴露给 renderer 或普通插件。
- 所有配置必须有 UI，用户不需要手动改 JSON、env 或配置文件。
- Control Center 做 web app first，优先嵌入 Electron `BrowserWindow`。
- 插件系统采用权限化 SDK，不直接 `require()` 任意本地 JS 获取 Node/Electron 权限。
- 核心能力内置，AI/chat 等可选能力做官方插件或官方模块。
- 重构采用增量迁移，每一步都保持现有桌宠可启动。

## 1.1 执行状态

当前进度：

- Phase 1 Core service layer：已完成落地。
- Phase 2 Runtime contract：已完成落地。
- Phase 3 Control Center：已完成落地。
- Phase 4 AI chat：已完成落地。
- Phase 5 Plugin runtime：已完成落地。
- Phase 6 Local HTTP/MCP：HTTP 基础已完成落地，MCP bridge 后置。

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
- Control Center 全部 6 个 Tab 页面均已实现：Pet / Actions / AI / Plugins / Service / About。

Phase 4 已新增：

```text
src/main/services/secret-service.js
src/main/services/ai-service.js
src/main/services/ai-action-orchestrator.js
tests/services/secret-service.test.js
tests/services/ai-service.test.js
tests/services/ai-action-orchestrator.test.js
```

Phase 4 当前范围：

- 新增主进程 `SecretService`，API Key 只通过 `apiKeyRef` 关联，Control Center 和 renderer 不拿到明文。
- 新增 provider-agnostic `AiService`，第一版实现 OpenAI-compatible `/chat/completions` 适配。
- `settings.json` 保存 AI 非敏感配置与有上限的对话历史：enabled、provider、baseUrl、model、apiKeyRef、systemPrompt、conversations。
- Control Center 的 AI 页面支持配置保存、API Key 保存、连接测试和简单聊天。
- AI 聊天支持 `conversationId` 维持主进程持久会话上下文，并通过独立 IPC 读取历史，不从配置接口泄露。
- AI 回复会通过 `pet:say` 推送给宠物窗口显示气泡，并可按动作 id/label/kind 语义触发对应宠物动作。
- 插件通过 `ctx.ai.chat()` 调用主进程 AiService，API Key 不进入插件进程。

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
- 本地第三方插件通过短生命周期子进程 runner 执行，runner 启用 Node permission model；插件 VM 内不注入 `require` / `process` / Electron / fs，只能通过父进程验证过的受限 SDK 触发宠物能力。
- 新增官方 `Basic Behavior` 插件，用受限 SDK 验证 `ctx.pet.say()` 命令链路。
- 插件启用状态保存到 `settings.plugins.enabled`，可在 Control Center 的 Plugins 页启停。
- Control Center 的 Plugins 页显示插件来源、权限、命令，并可运行官方插件命令。
- 本地插件 `main` 通过短生命周期子进程 runner 执行，runner 启用 Node permission model，只放行 runner 与插件入口文件读取；插件 VM 内不注入 `require` / `process` / Electron / fs，只能通过父进程验证过的受限 SDK 触发宠物能力。
- 插件服务维护最多 200 条持久运行日志，记录启停、命令开始/完成/失败；Plugins 页可筛选、导出和清空日志。
- 坏的本地 manifest 会被隔离跳过，不阻塞其他插件加载。
- `PetService.say()` 成为 AI 和插件触发气泡的统一入口。
- 尚未实现 SES 沙箱和完整 JSON Schema 表单。当前已支持基础 `configSchema` 动态表单（string/number/boolean/enum/default）、`ctx.config.get()`、带 `storage` 权限的 `ctx.storage.get/set/remove/clear()`、带 `ai:chat` 权限的 `ctx.ai.chat()`、带 `network` 权限和 manifest allowlist 的 `ctx.network.fetch()`；服务层限制 storage key、64KB/插件与 16KB/value 配额，网络仅允许 HTTPS allowlist host 并拒绝敏感 header。插件日志已持久化到设置中，Control Center 支持筛选、JSON/CSV 导出、清空日志和清理插件私有存储。

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
- Actions 页面可选择动作并播放 sprite 预览。
- action id 只允许字母、数字、下划线和连字符，防止路径穿越。
- 尚未实现动作重命名和导入前逐帧校验报告。

## 2. 参考方向

调研过的相关项目：

- **Windows 经典桌面宠物**（如 eSheep、Shimeji）：透明窗口 + 精灵图动画 + 简单交互。
- **Rive / Lottie**：矢量动画运行时，适合表现力强的宠物动画。
- **vscode-pets**：VS Code 插件宠物，采用 sprite 动画 + 随机行为。
- **Bongo Cat**：键盘/鼠标映射的桌面猫咪，娱乐性强。
- **Virtual Desktop Pet (Android)**：状态机驱动的桌面宠物，可参考其行为建模。
- **MCP (Model Context Protocol)**：适合把宠物状态暴露给 AI agent 的工具协议。

## 3. 核心概念

### 3.1 Pet Pack

一个 pet pack 是自包含的宠物素材包：

```
my-pet/
├── pet.json            # manifest
├── sprites/            # 精灵图
├── frames/             # 原始帧（可选）
└── config.schema.json  # 配置 schema（可选）
```

pet.json 示例：

```json
{
  "name": "My Pet",
  "version": "1.0.0",
  "actions": [
    {
      "id": "idle",
      "label": "待机",
      "kind": "idle",
      "sprite": "sprites/idle.png",
      "frameCount": 16,
      "frameWidth": 128,
      "frameHeight": 128,
      "frameMs": 100
    }
  ],
  "defaultAction": "idle",
  "clickAction": "greet"
}
```

### 3.2 Plugin Manifest

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "A plugin for ibot",
  "main": "index.js",
  "permissions": ["pet:say", "pet:action", "storage", "ai:chat", "network"],
  "configSchema": "config.schema.json",
  "network": {
    "allowlist": ["api.example.com"]
  }
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
      const ai = await ctx.ai.chat({ message: "给我一句鼓励", conversationId: "focus" })
      const response = await ctx.network.fetch("https://api.example.com/status")
      await ctx.pet.say(ai.reply || response.text)
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

第一版已实现本地 HTTP API。

当前 API：

```http
GET  /api/status
POST /api/pet/say
POST /api/pet/action
POST /api/pet/event
```

安全规则：

- 默认只监听 `127.0.0.1`。
- 不允许跨域任意网页直接控制宠物。
- 不把 API Key 明文返回给任何 HTTP/renderer/plugin 调用方。

## 9. 增量迁移计划

### Phase 1: Core service layer

已落地。

### Phase 2: Runtime contract

已落地。

### Phase 3: Control Center

已落地。全部 6 个 Tab 页面均已实现。

### Phase 4: AI chat

已落地。Control Center 聊天入口、`say` 气泡触发已完成。动作触发待行为编排接入。

### Phase 5: Plugin runtime

已落地。manifest 发现和权限白名单、官方插件命令运行、本地插件隔离 runner、Control Center 插件启停 UI、运行日志/错误面板已完成。SES 沙箱可在开放复杂第三方能力前继续强化。

### Phase 6: Local HTTP/MCP

HTTP 基础已落地。Control Center Service 页面完成。默认不启动，从 UI 启用。MCP bridge 保持后置。

## 10. 风险与约束

主要风险：

- 重构必须小步验证（当前已有 106 个测试覆盖全部 service 和 pet-pack/plugin 模块）。
- API Key 存储不能放普通设置 JSON。
- 插件系统不能为了快而放开 Node/Electron 权限。
- Control Center 引入前端构建后，需要处理 dev/prod 加载路径。
- 动作帧导入要保留当前用户体验，不要逼用户理解 manifest。

工程约束：

- 每个阶段都要保持 `npm start` 可运行。
- 每个阶段都要有测试覆盖。
- 不要一次性把 UI、AI、插件、pet pack 全部重写。
- 当前素材和 `cat_anime` 结构要保留兼容路径。
