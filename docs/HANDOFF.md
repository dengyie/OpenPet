# ibot 项目交接文档

> 最后更新：2026-06-11 | 分支：`codex/pet-service-phase-1`
> PR：https://github.com/dengyie/ibot/pull/1 (draft)

---

## 项目概述

Electron 桌面宠物平台。一只透明背景的猫咪站在桌面上，支持拖拽、散步、动作播放、右键设置面板。

经过 6 个阶段的增量重构，已转型为可扩展的 pet runtime 平台：

- 底层 Service 层（EventBus → SettingsService → ActionService → PetService）
- Pet pack 运行时契约（schema / loader / importer）
- Vite + React Control Center（替代旧设置面板）
- AI 聊天（OpenAI-compatible，API Key 安全存储）
- 权限化插件系统（官方 Basic Behavior 已验证 SDK）
- 本地 HTTP API（loopback only）

所有配置通过 UI 操作，用户不需要手动编辑 JSON 文件。

---

## 测试与验收

```bash
npm test                  # 47 tests, all pass
npm run build:control-center  # Vite build pass
npm run generate-sprites  # CLI works
npm run check:syntax      # all JS syntax pass
```

---

## 文件地图

### 入口点

```
main.js                         # Electron 主进程入口，组装所有 service
preload.js                      # 宠物窗口 preload（contextBridge 暴露 API）
renderer.js                     # 宠物窗口渲染逻辑（动画、拖拽、散步）
index.html                      # 宠物窗口 HTML
control-center-preload.js       # Control Center preload
settings.html                   # 旧设置面板（Control Center 构建产物缺失时回退）
settings-preload.js             # 旧设置面板 preload
settings-renderer.js            # 旧设置面板渲染逻辑
```

### Service 层 (`src/main/services/`)

| 文件 | 职责 |
|------|------|
| `event-bus.js` | 进程内 pub/sub 事件总线 |
| `settings-service.js` | 设置读写 + 预览 + 变更通知 |
| `action-service.js` | 动作配置读取，封装 pet pack 到旧动画配置的转换 |
| `pet-service.js` | 唯一宠物状态源：say/playAction/setEvent |
| `secret-service.js` | API Key 安全存储（0600 权限，renderer 不可见明文） |
| `ai-service.js` | provider-agnostic AI 聊天，OpenAI-compatible 实现 |
| `plugin-service.js` | 插件发现、启用/禁用、命令运行 |
| `local-http-service.js` | 本地 loopback HTTP API（token-gated status/say/action/event） |
| `action-import-service.js` | 动作帧文件夹导入、配置更新、删除 |
| `sprite-generator.js` | 精灵图生成 + 帧文件夹检验（`inspectFrameFolder` + `readFrameMetadata`） |

### Runtime (`src/main/runtime/`)

| 文件 | 职责 |
|------|------|
| `runtime-state.js` | 不可变 snapshot + 订阅 |

### Pet Pack (`src/main/pet-pack/`)

| 文件 | 职责 |
|------|------|
| `schema.js` | pet.json manifest 归一化（action kind 推导） |
| `loader.js` | 从目录加载 pet pack / 包装 legacy 配置 |
| `importer.js` | 从 actions 创建 pet pack manifest |

### 插件 (`src/main/plugins/`)

| 文件 | 职责 |
|------|------|
| `manifest.js` | 插件 manifest 归一化 + 权限白名单 |
| `official/basic-behavior.js` | 官方 Basic Behavior 插件（验证 SDK） |

### 核心模块 (`src/main/`)

| 文件 | 职责 |
|------|------|
| `ipc.js` | 所有 IPC handler 注册（依赖注入） |
| `window.js` | 窗口创建（宠物窗口 + Control Center） |
| `screen.js` | 屏幕工作区钳制 |
| `animations.js` | legacy 动画配置读取（- 计划合并到 pet-pack/loader.js） |
| `settings.js` | 设置磁盘读写 + 默认值 + macOS 登录项（- 与 settings-service.js 有职责重叠，计划合并） |

### Control Center (`src/control-center/`)

```
src/control-center/
├── index.html                     # 入口 HTML
├── vite.config.js                 # Vite 配置（React + 构建到 dist/）
└── src/
    ├── main.jsx                   # React 主应用
    └── styles.css                 # 所有样式
```

Control Center 页面（Tab 式导航）：
- **Pet**：缩放、散步速度、散步时长、气泡时长、开机自启
- **Actions**：动作列表、导入帧文件夹、删除、设置默认/点击动作
- **AI**：provider 配置、API Key、连接测试、聊天窗口
- **Plugins**：插件列表、启用/禁用、运行命令
- **Service**：本地 HTTP 服务启停、端口配置、状态显示
- **About**：占位

### 共享模块

| 文件 | 职责 |
|------|------|
| `src/shared/ipc-channels.js` | 所有 IPC 通道名常量 |

---

## 架构设计

### 进程模型

```
┌───────────────────────────────────────────────┐
│                  Main Process                 │
│  main.js 组装所有 service                     │
│                                               │
│  ┌──────────────────────────────────────┐     │
│  │  Service Layer                       │     │
│  │  EventBus → SettingsService          │     │
│  │       ↓                              │     │
│  │  ActionService → PetService          │     │
│  │       ↓           ↓          ↓       │     │
│  │  AiService    PluginService  LocalHttp│    │
│  │  SecretService  ActionImportService  │     │
│  └──────────────────────────────────────┘     │
│                                               │
│  ┌──────────────────────┐                     │
│  │ IPC Handlers         │                     │
│  │ (ipc.js)             │                     │
│  └──────────────────────┘                     │
└──────────────┬────────────────────────────────┘
               │ contextBridge / IPC
    ┌──────────┴──────────┐
    │                     │
┌───┴──────────────┐ ┌───┴──────────────┐
│ Renderer Process │ │ Control Center   │
│ (宠物窗口)        │ │ (React WebView)  │
└──────────────────┘ └──────────────────┘
```

### 数据流规则

1. **PetService 是唯一状态源** — 所有 pet 操作（say/action/event）必须经过 PetService
2. **API Key 隔离** — 存储在 secrets.json（0600 权限），renderer 和普通插件不可见明文
3. **Control Center 内置** — 通过 Electron IPC 调用主进程 service，不通过网络暴露
4. **插件权限白名单** — 第三方 JS 暂不执行，只支持官方内置插件
5. **增量迁移** — 每阶段都保持 `npm start` 可运行

### 当前安全与兼容契约

- 本地 HTTP 服务默认关闭，只允许 loopback host。
- 启用本地 HTTP 时会生成 `localHttp.token`；所有 mutating endpoints 必须携带 `Authorization: Bearer <token>` 或 `X-ibot-Token`。
- 未带 token 的 `GET /api/status` 只返回 service runtime，不返回完整 pet snapshot。
- 服务切换到新端口时先验证新 server 可监听；失败时保留旧 server。同 host/port 保存时原地更新 token/config，不重启 socket。
- `pet.json` pet pack 使用严格 schema：sprite path 必须是安全相对路径，frameCount/frameMs/frameWidth/frameHeight 必须是有效正整数。
- legacy `cat_anime/animations.json` 会先补兼容默认值再进入严格 schema；缺尺寸的旧动作可加载，但应通过 `npm run generate-sprites` 或 Control Center 导入流程恢复准确帧尺寸。

---

## 当前未提交更改

```
AGENTS.md                               # 文档更新
docs/jishuwendang.md                    # 文档更新
src/main/services/sprite-generator.js   # inspectFrameFolder + readFrameMetadata 重构
tests/services/sprite-generator.test.js  # 帧检验测试
(新增) docs/HANDOFF.md                  # 本交接文档
```

---

## 待办清单

### P1 — 下一阶段核心

- [ ] **插件 next steps**：
  - 第三方 JS 沙箱执行（推荐 Node vm module 或 SES）
  - 插件配置 schema 表单（Control Center Plugins 页根据 manifest 动态生成）
  - 插件日志/错误面板
  - 插件私有存储

- [ ] **AI 行为编排**：
  - 语义动作触发（AI 回复 "你好" → 触发 greeting 动作）
  - 对话历史持久化

- [ ] **本地 HTTP/MCP**：
  - MCP bridge 实现
  - Token/session 保护
  - 访问日志

### P2 — 增强与分发

- [ ] Electron 打包配置（electron-builder）
- [ ] autoStart 在打包后的测试
- [ ] 动作导入帧检验报告（利用 inspectFrameFolder）

### 技术债

- [ ] Control Center main.jsx（971 行）需要拆分为多个组件
- [ ] 旧 settings.html/settings-preload.js/settings-renderer.js 可删除（已完全由 Control Center 替代）
- [ ] `src/main/settings.js` 和 settings-service.js 有职责重叠，可合并
- [ ] `src/main/animations.js` 是 legacy 模块，可合并到 pet-pack/loader.js

---

## 开发工作流

```bash
# 日常开发
npm start                    # 构建 Control Center + 启动 Electron

# 仅启动 Control Center dev server（热更新）
npm run dev:control-center   # http://127.0.0.1:5173

# 测试
npm test                     # 47 tests

# 精灵图生成
npm run generate-sprites     # 扫描 cat_anime/flames/ 生成 sprites/

# 语法检查
npm run check:syntax

# 提交
git add -A
git commit -m "feat: ..."
git push origin codex/pet-service-phase-1
```

### 测试添加流程

1. 在 tests/ 对应子目录新建 xxx.test.js
2. 使用 Node 原生 test runner：`const { test } = require('node:test')`
3. 断言用 `const assert = require('node:assert')`
4. 运行 `npm test` 验证

---

## 重要约束

- 每个阶段 `npm start` 必须保持可用
- 不改动现有 cat_anime/ 素材结构（兼容路径保留）
- 插件不开放 Node/Electron 权限
- API Key 不暴露给 renderer 或普通插件
- 所有新配置必须通过 UI 操作
- 不 revert 他人的未提交更改
- 测试先行，再做实现
