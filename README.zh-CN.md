<div align="center">

# 🐾 OpenPet

**一个可扩展、可分发、可运营的 Electron 桌面宠物平台**

[![Tests](https://img.shields.io/badge/tests-236%20node%20%2B%202%20ui-success)](./tests)
[![Build](https://img.shields.io/badge/build-passing-success)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.1--rc.1-blue.svg)](./package.json)

[English](./README.md) | [简体中文](./README.zh-CN.md)

[功能特性](#功能特性) • [快速开始](#快速开始) • [开发文档](#开发文档) • [插件开发](#插件开发) • [贡献指南](#贡献指南)

</div>

---

## 🌟 项目简介

**OpenPet** 是一个 Electron 桌面宠物平台，从单体桌宠演化为可扩展的 pet runtime 平台。一只透明背景的猫咪站在桌面上，支持拖拽、散步、动作播放，并可通过插件、AI、HTTP API 进行扩展。

### 核心亮点

- 🎨 **精灵图动画系统** - 支持自定义动作帧导入
- 🤖 **AI 聊天集成** - OpenAI 兼容，语义触发宠物动作
- 🧩 **插件生态系统** - 权限隔离的插件 SDK，支持第三方扩展
- 📦 **Pet Pack 管理** - 多宠物包支持，一键安装
- 🌐 **HTTP API + MCP** - 本地 API 支持外部 agent 集成
- 🎛️ **Control Center** - React + Vite 控制面板，所有配置可视化
- 🚀 **桌面分发轨道** - macOS 分发基线；Windows 打包/CI/签名策略/冒烟证据、报告、runbook 与 collector/证据包校验/summary/archive-manifest 工具基线已落地，release-ready 门槛仍未完成

---

## ✨ 功能特性

### 🎨 宠物动画

- **透明背景宠物窗口** - 桌面上的可爱猫咪
- **拖拽移动** - 随意放置在屏幕任意位置
- **自动散步** - 在屏幕边界内随机移动
- **动作播放** - 支持自定义动作序列
- **气泡对话** - 显示文字消息
- **帧动画导入** - 从文件夹导入有序图像序列

### 🤖 AI 集成

- **OpenAI 兼容 API** - 支持 OpenAI / Azure / 兼容端点
- **API Key 安全存储** - 0600 权限，renderer 不可见
- **持久会话历史** - 有界对话上下文
- **语义动作触发** - AI 回复自动触发对应宠物动作
- **结构化行为编排** - tool-call + dry-run + cooldown
- **可配置规则** - actionId 白名单、触发规则

### 🧩 插件系统

- **权限白名单** - `pet:say` / `ai:chat` / `network` / `storage`
- **隔离运行** - Node permission model + VM 隔离 + 短生命周期
- **受限 SDK** - 不暴露 `require` / `process` / Electron
- **配置 schema** - 动态表单（string/number/boolean/enum）
- **私有存储** - 64KB/插件 + 16KB/value 配额
- **Catalog 目录** - 浏览、安装、更新插件
- **Blocklist 治理** - 本地黑名单拦截风险包

### 📦 Pet Pack 管理

- **Manifest schema** - `pet.json` 定义宠物包
- **整包管理** - 检查、导入、启用、删除
- **Legacy 兼容** - 内置 cat_anime/ 作为 legacy-cat
- **用户安装目录** - `<userData>/pet-packs/`
- **Catalog 浏览** - 一键安装第三方 pet pack

### 🌐 HTTP API + MCP

- **Loopback only** - 仅 `127.0.0.1` / `localhost` / `::1`
- **Token-gated** - 所有 mutating 操作需 token
- **RESTful API** - `GET /api/status` / `POST /api/pet/say`
- **MCP JSON-RPC bridge** - `POST /mcp`
- **Session 管理** - TTL + revoke
- **访问日志** - 持久化（不记录 token）
- **默认关闭** - UI 启停、端口配置

### 🎛️ Control Center

- **Pet 页** - 缩放、散步速度、气泡时长、开机自启
- **Actions 页** - 动作列表、导入帧文件夹、pet pack 管理
- **AI 页** - provider 配置、API Key、连接测试、聊天窗口
- **Plugins 页** - 插件列表、启用/禁用、运行命令、日志查看
- **Catalog 页** - 插件/pet pack 目录、安装/更新、权限审查、blocklist
- **Service 页** - HTTP 服务启停、MCP endpoint、访问日志
- **About 页** - 版本信息、更新检查

---

## 🚀 快速开始

### 环境要求

- **Node.js**: >= 18.x
- **npm**: >= 9.x
- **操作系统**: macOS 已验证；Windows 打包/CI/签名策略/冒烟证据、报告、runbook 与 collector/证据包校验/summary/archive-manifest 工具基线已落地但尚未 release-ready；Linux / 移动端不在当前发布范围

### 安装

```bash
# 克隆仓库
git clone https://github.com/dengyie/OpenPet.git
cd OpenPet

# 安装依赖
npm install

# 启动开发模式
npm start
```

### 开发命令

```bash
npm start                    # 构建 Control Center + 启动 Electron
npm run dev:control-center   # Control Center 热重载 (http://127.0.0.1:5173)
npm test                     # 运行 Node 测试（236 个测试）
npm run test:control-center  # 运行 Control Center Playwright 冒烟测试
npm run check:syntax         # JS 语法验证
npm run generate-sprites     # 从 cat_anime/flames/ 重新生成 sprite sheets
npm run pack                 # electron-builder 目录打包
npm run dist                 # 生成当前宿主平台安装包（macOS 已验证：DMG/ZIP）
```

---

## 📖 开发文档

### 主要文档

- **[CHANGELOG.md](./CHANGELOG.md)** - 版本记录与发布说明
- **[project-documentation-design.md](./docs/project-documentation-design.md)** - 项目目标、文档分层、支持声明规则与更新 playbook
- **[HANDOFF.md](./docs/HANDOFF.md)** - 项目交接文档
- **[jishuwendang.md](./docs/jishuwendang.md)** - 技术文档（中文）
- **[productization-roadmap.md](./docs/productization-roadmap.md)** - 产品化路线图
- **[project-status-review.md](./docs/project-status-review.md)** - 项目全面评估报告
- **[desktop-release-design.md](./docs/desktop-release-design.md)** - macOS + Windows 桌面分发设计
- **[release-checklist.md](./docs/release-checklist.md)** - 发布操作清单与 Windows 证据门禁

### 架构文档

- **[pet-platform-development-plan.md](./docs/pet-platform-development-plan.md)** - 平台重构历史
- **[mcp-usage.md](./docs/mcp-usage.md)** - MCP 使用文档
- **[plugin-sandbox-evaluation.md](./docs/plugin-sandbox-evaluation.md)** - 插件沙箱评估

### Phase 开发文档

- [Phase 1 - Control Center 模块化](./docs/phases/phase-1-control-center-modularization.md)
- [Phase 2 - Pet pack 管理](./docs/phases/phase-2-pet-pack-management.md)
- [Phase 3 - 插件生态产品化](./docs/phases/phase-3-plugin-ecosystem.md)
- [Phase 4 - AI 行为编排](./docs/phases/phase-4-ai-behavior-orchestration.md)
- [Phase 5 - MCP transport 产品化](./docs/phases/phase-5-mcp-agent-productization.md)
- [Phase 6 - 分发与 release pipeline](./docs/phases/phase-6-distribution-release.md)
- [Phase 7 - 生态 catalog 运营闭环](./docs/phases/phase-7-ecosystem-operations.md)
- [Phase 8 - Windows 桌面分发落地](./docs/phases/phase-8-windows-desktop-release.md)
- [Phase 9 - 项目文档治理完善](./docs/phases/phase-9-project-documentation-governance.md)
- [Phase 10 - 项目文档设计加固](./docs/phases/phase-10-project-documentation-design-hardening.md)
- [Phase 11 - Control Center 前端自动化基线](./docs/phases/phase-11-control-center-frontend-automation.md)

---

## 🧩 插件开发

### 插件结构

```
my-plugin/
├── plugin.json              # 插件 manifest
└── main.js                  # 插件入口
```

### plugin.json 示例

```json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "A sample plugin",
  "author": "Your Name",
  "openpetApiVersion": "1.x",
  "permissions": ["pet:say", "ai:chat"],
  "networkAllowlist": ["https://api.example.com"],
  "commands": [
    {
      "id": "greet",
      "name": "Greet",
      "description": "Say hello"
    }
  ],
  "configSchema": {
    "message": {
      "type": "string",
      "default": "Hello!",
      "description": "Greeting message"
    }
  }
}
```

### main.js 示例

```javascript
// 插件入口，导出命令处理函数
module.exports = {
  async greet(ctx) {
    const message = await ctx.config.get('message');
    await ctx.pet.say(message);
  }
};
```

### 可用 SDK API

```javascript
// 宠物操作
await ctx.pet.say(text);
await ctx.pet.playAction(actionId);
await ctx.pet.setEvent(event);

// 配置读写
const value = await ctx.config.get(key);
await ctx.config.set(key, value);

// 私有存储（需 storage 权限）
const data = await ctx.storage.get(key);
await ctx.storage.set(key, value);
await ctx.storage.remove(key);
await ctx.storage.clear();

// AI 聊天（需 ai:chat 权限）
const reply = await ctx.ai.chat(conversationId, userMessage);

// 网络请求（需 network 权限 + allowlist）
const response = await ctx.network.fetch(url, options);
```

### 插件开发指南

1. 创建插件目录：`<userData>/plugins/<plugin-id>/`
2. 编写 `plugin.json` 和 `main.js`
3. 在 Control Center → Plugins 页启用插件
4. 运行命令测试

更多详情参见 [plugin-sandbox-evaluation.md](./docs/plugin-sandbox-evaluation.md)

---

## 🏗️ 架构概览

### 进程模型

```
┌───────────────────────────────────────────────┐
│                  Main Process                 │
│  main.js 组装所有 service                     │
│                                               │
│  ┌──────────────────────────────────────┐     │
│  │  Service Layer (19 services)         │     │
│  │  EventBus → SettingsService          │     │
│  │       ↓                              │     │
│  │  ActionService → PetService          │     │
│  │       ↓           ↓          ↓       │     │
│  │  AiService    PluginService  LocalHttp│    │
│  └──────────────────────────────────────┘     │
└──────────────┬────────────────────────────────┘
               │ IPC (contextBridge)
    ┌──────────┴──────────┐
    │                     │
┌───┴──────────────┐ ┌───┴──────────────┐
│ Pet Window       │ │ Control Center   │
│ (renderer.js)    │ │ (React + Vite)   │
└──────────────────┘ └──────────────────┘
```

### Service 层

- **event-bus.js** - 进程内 pub/sub 事件总线
- **settings-service.js** - 设置读写 + 预览 + 变更通知
- **pet-service.js** - 唯一宠物状态源（say/playAction/setEvent）
- **action-service.js** - 动作配置读取，封装 pet pack
- **pet-pack-service.js** - Pet pack 列表、检查、导入、启用、删除
- **ai-service.js** - Provider-agnostic AI 聊天
- **behavior-orchestrator-service.js** - 结构化 AI 行为规则
- **plugin-service.js** - 插件发现、启用、命令运行、隔离 runner
- **plugin-install-service.js** - 插件包 inspect、安装、更新、卸载
- **catalog-service.js** - 生态 catalog 加载、下载、hash 校验
- **ecosystem-policy.js** - Blocklist 策略
- **local-http-service.js** - Loopback HTTP API
- **mcp-transport-service.js** - MCP JSON-RPC bridge
- **about-service.js** - 版本信息、更新检查
- 其他 service...

---

## 🧪 测试

项目使用 **Node 原生 test runner** 覆盖 service / release 路径，当前 **236 个测试全部通过**；同时新增 **Playwright Control Center 冒烟基线**，当前 2 个 UI 测试通过。

```bash
npm test                     # 运行 Node 测试
npm run test:control-center  # 运行 Control Center 冒烟测试
npm run check:syntax         # 语法检查
npm run build:control-center # Control Center 构建验证
```

测试覆盖：
- ✅ Service / release 门禁覆盖（32 个测试文件）
- ✅ Control Center shell / tab / Pet / About 冒烟覆盖（2 个 Playwright 测试）
- ✅ Pet pack schema / loader / importer
- ✅ 插件 manifest / runner / SDK
- ✅ AI service / behavior orchestrator
- ✅ HTTP API / MCP transport
- ✅ Catalog service / ecosystem policy
- ✅ 恶意输入测试（路径穿越、超大 body、非法 schema）

---

## 🤝 贡献指南

欢迎贡献代码、插件、pet pack 或文档！

### 开发流程

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 提交 Pull Request

### 代码规范

- 使用 Node 原生 test runner 编写测试
- Service 层必须有单元测试
- 遵循现有代码风格
- UI 或共享行为变更提交前运行 `npm test`、`npm run test:control-center` 和 `npm run check:syntax`

### 插件提交

1. 在 `catalog/openpet-catalog.json` 中添加插件条目
2. 提供插件源码或下载链接
3. 提交 PR 说明插件功能和权限

---

## 🗺️ 路线图

### v1.0.1-rc.1（当前版本）✅

- ✅ 项目与仓库改名为 OpenPet
- ✅ 保留旧版 `appData/ibot` 用户数据兼容
- ✅ OpenPet MCP/API/插件命名与 legacy alias
- ✅ RC 验证与版本记录
- ✅ Control Center Playwright 冒烟基线

### v1.0 ✅

- ✅ Control Center 模块化
- ✅ Pet pack 管理
- ✅ 插件生态产品化
- ✅ AI 行为编排
- ✅ MCP transport 产品化
- ✅ macOS 分发与 release pipeline
- ✅ 生态 catalog 运营闭环

### v1.1（规划中）

- ⚡ Windows 签名产物验证与冒烟验证
- ⚡ 扩展 Control Center 自动化，覆盖插件安装 review 与保存配置流程
- ⚡ 更多示例插件（天气、番茄钟、RSS）
- ⚡ 插件开发教程视频
- ⚡ 用户反馈收集与迭代

### v2.0（未来）

- ⚡ 远端 marketplace 后端
- ⚡ 用户评分/评论系统
- ⚡ 更强的插件沙箱（SES / utilityProcess）
- ⚡ 多宠物同时显示
- ⚡ 宠物间交互

---

## 📄 许可证

MIT License - 详见 [LICENSE](./LICENSE) 文件

---

## 🙏 致谢

感谢所有贡献者和社区成员的支持！

---

## 📧 联系方式

- **GitHub Issues**: [https://github.com/dengyie/OpenPet/issues](https://github.com/dengyie/OpenPet/issues)
- **作者**: OpenPet contributors

---

<div align="center">

**⭐ 如果你喜欢这个项目，请给我们一个 Star！ ⭐**

Made with ❤️ by the OpenPet team

</div>
