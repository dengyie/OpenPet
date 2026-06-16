<div align="center">

# OpenPet

一个带 Control Center、AI 聊天、插件、宠物包和本地 Agent API 的 Electron 桌面宠物平台。

[![Tests](https://img.shields.io/badge/tests-446%20node%20%2B%2010%20ui-success)](./tests)
[![Build](https://img.shields.io/badge/build-passing-success)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.1--rc.2-blue.svg)](./package.json)

[English](./README.md) | [简体中文](./README.zh-CN.md)

</div>

OpenPet 会把一只小宠物放在你的桌面上。它能走动、说话、播放动作、切换宠物包，也可以通过 AI 回复触发行为，并通过面向开发者的本地扩展生态继续成长。

当前发布轨道优先验证 macOS。Windows 的打包和证据工具已经在仓库里，但在真实签名安装包和冒烟报告归档前，不声明 Windows release-ready。

## 能做什么

- 透明桌宠窗口，支持拖拽、散步、动作播放和气泡对话。
- React + Vite Control Center，覆盖 Pet、Actions、AI、Plugins、Catalog、Service、About。
- Pet pack runtime，兼容 legacy cat、动作帧文件夹、`.codex-pet.zip`，以及 `pet.json` + `spritesheet.webp` 的 Codex pet atlas。
- 内置 `doro`、`duodong`、`chispa` 三个只读宠物包。
- OpenAI 兼容聊天，API Key 只保存在主进程 secret store。
- 面向开发者的本地扩展模型，当前兼容 legacy SDK，并支持显式 command、dashboard、service 控制、校验、日志、catalog 安装和卸载流程。
- 可选的本地 HTTP / MCP API，仅 loopback，默认关闭。
- 渐进式 TypeScript 迁移基线，已覆盖共享 contracts 和 Control Center API facade。

## 快速开始

要求：

- Node.js 18 或更新版本
- npm 9 或更新版本
- 当前已验证的打包路径为 macOS

```bash
git clone https://github.com/dengyie/OpenPet.git
cd OpenPet
npm install
npm start
```

常用命令：

```bash
npm start                    # 构建 Control Center 并启动 Electron
npm run dev:control-center   # Control Center 热重载：http://127.0.0.1:5173
npm test                     # Node 测试
npm run test:control-center  # Playwright UI 回归
npm run typecheck            # TypeScript no-emit 检查
npm run check:syntax         # Node 语法 + typecheck + Control Center build
npm run pack                 # electron-builder 目录打包
npm run dist                 # 在 macOS 生成 DMG/ZIP
```

## 项目结构

OpenPet 由桌宠渲染窗口、Electron 主进程和内嵌 Control Center 组成。

```text
main.js
  组装 service 和 Electron 生命周期

src/main/services/
  EventBus -> SettingsService -> ActionService -> PetService
                                      |-> AiService
                                      |-> PluginService
                                      |-> LocalHttpService / MCP

src/control-center/
  Electron 内嵌的 React + Vite 控制台

src/main/pet-pack/
  pet.json schema、loader、importer、Codex atlas adapter
```

几个不能破坏的约束：

- `PetService` 是宠物状态唯一事实源。
- 面向用户的新配置必须能在 Control Center 操作。
- API Key 不暴露给 renderer。
- 第三方扩展是本地软件：OpenPet 应展示扩展声明并管理生命周期、日志和卸载流程，但不应宣称能完整沙箱化任意本地进程。
- 不改动既有 `cat_anime/` 素材结构。

## 宠物包

OpenPet 支持：

- `cat_anime/` 内置 legacy cat。
- 用户导入的动作帧文件夹。
- 带 `pet.json` 的 OpenPet pet pack。
- 包含 `pet.json` 和 `spritesheet.webp` 的 Codex-compatible pet 目录。
- Codex pet zip 包。
- `assets/pet-packs/` 下的内置只读宠物包。

手动添加新动作时，把有透明通道的有序帧放到 `cat_anime/flames/<action>/`，然后运行：

```bash
npm run generate-sprites
```

日常使用建议直接从 Control Center -> Actions -> Pet Packs 导入。

## 扩展开发

OpenPet 使用统一的第三方包模型：扩展。出于兼容性，包清单文件仍叫 `plugin.json`。宿主现在可以规范化并审查 `entries.setup`、`entries.commands`、`entries.services`、`entries.dashboards`、`manifest`、`config` 和 `assets` 声明；JavaScript 兼容包可以通过现有 runner 暴露 `entries.commands`。已启用插件可以从 Control Center 显式运行声明的 setup entry、打开声明的 HTTP/HTTPS dashboard、启动或停止声明的 service entry，并手动检查声明的 loopback service health endpoint。Setup 和 service 命令启动不经过 shell 展开，service 不会自动启动，setup 不会在 install 或 enable 时自动执行，停止 service 时会尽力清理进程组，health check 不会后台轮询；bridge flow、通用 shell command execution 和硬性的完整进程树清理保证仍属于后续 runtime 工作。

当前 legacy SDK 示例在宿主运行时追上新模型前仍然有参考价值：

- [Focus Timer](./examples/plugins/focus-timer/)：storage 和宠物发言。
- [Weather Status](./examples/plugins/weather-status/)：legacy network allowlist。
- [RSS Reader](./examples/plugins/rss-reader/)：公开 feed 拉取和缓存播报。

目标扩展结构：

```text
my-extension/
  plugin.json
  config.schema.json   # 可选
  commands/
  service/
  web/
  assets/
```

当前校验和提交工具仍沿用历史上的 `plugin` 命令名：

```bash
npm run validate:plugin -- <plugin-dir-or-zip>
npm run create-plugin-submission-bundle -- <plugin-dir-or-zip> --output-dir plugin-submission-bundle
npm run validate-plugin-submission-bundle -- plugin-submission-bundle --require-ready
```

完整流程见 [plugin-development.md](./docs/plugin-development.md)、[plugin-submission-workflow-playbook.md](./docs/plugin-submission-workflow-playbook.md) 和 [plugin-ecosystem-rules.md](./docs/plugin-ecosystem-rules.md)。其中生态规则文档说明生命周期、透明声明、兼容策略和诚实的安全边界。

## 文档

- [CHANGELOG.md](./CHANGELOG.md)：版本记录。
- [docs/development-summary.md](./docs/development-summary.md)：当前开发摘要。
- [docs/HANDOFF.md](./docs/HANDOFF.md)：维护交接文档。
- [docs/plugin-ecosystem-rules.md](./docs/plugin-ecosystem-rules.md)：扩展生态边界、生命周期规则和三方作者指导。
- [docs/project-context.json](./docs/project-context.json)：给程序/代理读取的紧凑项目上下文。
- [docs/project-documentation-design.md](./docs/project-documentation-design.md)：文档规则和支持声明口径。
- [docs/desktop-release-design.md](./docs/desktop-release-design.md) 与 [docs/release-checklist.md](./docs/release-checklist.md)：桌面发布证据门禁。
- [docs/phases/](./docs/phases/) 与 [docs/reviews/](./docs/reviews/)：历史阶段记录。

## 验证基线

当前本地基线：

```bash
npm test                     # 456/456 Node tests
npm run test:control-center  # 10/10 Playwright tests
npm run typecheck            # TypeScript no-emit checks
npm run check:syntax         # syntax + typecheck + Control Center build
```

## 许可证

MIT，见 [LICENSE](./LICENSE)。
