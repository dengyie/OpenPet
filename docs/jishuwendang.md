# OpenPet 开发文档

> 最后更新：2026-06-28
> 当前版本：`v1.0.1-rc.3`
> 角色：OpenPet 的中文主开发文档，负责解释代码结构、开发流程、测试策略和当前工程边界。

## 1. 这份文档负责什么

这份文档是维护者和新开发者进入仓库后的第一份详细开发资料。它只回答四类问题：

1. 代码现在是怎么组织的。
2. 新功能应该落到哪个边界。
3. 日常开发、调试、测试该怎么跑。
4. 当前哪些能力已经落地，哪些还是明确未完成。

它不是阶段历史，也不是 release 证据归档。那些内容分别放在：

- `docs/HANDOFF.md`：继续当前工作的接力说明。
- `docs/development-summary.md`：英文短摘要。
- `docs/openpet-current-todo-architecture.md`：按架构边界维护的当前 TODO。
- `docs/phases/` 与 `docs/reviews/`：历史实施记录与 review 结论。

## 2. 开发入口

### 启动与构建

```bash
npm start
npm run dev:control-center
npm run build:control-center
```

- `npm start`：先构建 Control Center，再启动 Electron；这是最重要的主流程。
- `npm run dev:control-center`：只启动 Control Center 的 Vite 开发服务。
- `npm run build:control-center`：验证前端可构建。

### 测试与校验

```bash
npm run test:core
npm run test:core:all
npm run test:tools
npm test
npm run test:control-center
npm run check:syntax
```

- `npm run test:core`：主进程、service、renderer、shared、pet-pack、examples、control-center 的 Node 回归。
- `npm run test:core:all`：`test:core` 加 Playwright Control Center UI 基线。
- `npm run test:tools`：release / evidence / scaffold / 维护工具链测试。
- `npm test`：全量 Node 原生测试。
- `npm run test:control-center`：Control Center Playwright 用例。
- `npm run check:syntax`：`node --check` + `tsc --noEmit` + `vite build`。

### 资源生成

```bash
npm run generate-sprites
```

- 从 `cat_anime/flames/` 重新生成精灵图和动作配置。
- 不要手改 `cat_anime/` 的素材组织方式。

## 3. 架构总览

OpenPet 现在不是单窗口 demo，而是一个分层的桌面宠物平台：

```text
main.js
  -> service assembly
  -> ipc registration
  -> pet window / control center / chat surfaces

src/main/services/
  EventBus
    -> SettingsService
    -> ActionService
    -> PetPackService
    -> PetService
    -> AiService / AiTalkService / ImageGenerationModelService
    -> PluginService / PluginInstallService / PluginGithubImportService
    -> LocalHttpService / McpTransportService

src/control-center/
  React + Vite
  Pet / Actions / AI / Plugins / Catalog / Service / About

src/main/pet-pack/
  manifest schema + loader + importer

src/main/plugins/
  plugin manifest policy + official plugins + compatibility helpers
```

### 核心边界

| 边界 | 主要文件 | 负责内容 | 不该做什么 |
| --- | --- | --- | --- |
| 应用组装 | `main.js` | service 依赖装配、生命周期、窗口初始化 | 不堆业务规则 |
| 宠物状态 | `src/main/services/pet-service.js` | 宠物动作、说话、事件、运行时状态 | 不绕过它直接改 renderer 状态 |
| 动作与包 | `action-service.js` `action-import-service.js` `pet-pack-service.js` | 动作配置、帧导入、pet pack 切换和导入 | 不把素材写入权限交给插件 |
| AI 与对话 | `ai-service.js` `ai-talk-service.js` `ai-talk-store.js` | Provider 调用、会话、记忆、诊断 | 不把密钥放到 renderer |
| 图像生成 | `image-generation-model-service.js` | Creator Studio 图像 Provider、输出写入 | 不把 Provider 凭证给插件 |
| 插件宿主 | `plugin-service.js` `plugin-install-service.js` | 插件发现、启停、命令、bridge、creator-tools | 不允许未受控 Node/Electron 访问 |
| 本地服务 | `local-http-service.js` `mcp-transport-service.js` | loopback HTTP / MCP | 不默认暴露公网服务 |
| 控制中心 | `src/control-center/src/` | 所有用户可操作配置界面 | 不偷存主进程机密 |

## 4. 必须保持的工程约束

这些约束在做功能时不能被稀释：

- `PetService` 是宠物状态唯一可信源。
- 所有新的用户配置都必须能在 Control Center 中操作。
- API Key 和其他敏感凭证必须只留在主进程。
- 插件权限必须显式声明，且仍然受宿主白名单和 bridge 约束。
- `npm start` 必须始终可用。
- `cat_anime/` 的既有素材结构不能随意改。
- Local HTTP / MCP 只能是 loopback only，默认关闭。
- Creator Studio 负责提示词、任务、QA、导入请求；宿主负责模型调用、结果写入、最终导入和触发规则持久化。

## 5. 目录速览

```text
main.js
preload.js
renderer.js
control-center-preload.js

src/main/
  ipc.js
  window.js
  services/
  plugins/
  pet-pack/
  pet-chat/

src/control-center/src/
  api/
  components/
  hooks/
  lib/
  panes/

src/shared/
  ipc-channels.js
  ipc-channels.ts
  openpet-contracts.ts

tests/
  main/
  services/
  shared/
  pet-pack/
  plugins/
  examples/
  control-center/
  scripts/
  release/

examples/plugins/
assets/pet-packs/
docs/
```

## 6. 关键业务面应该怎么理解

### 6.1 宠物与动作

- 宠物窗口负责渲染，不负责保存真状态。
- 动作配置来源于当前 active pet pack。
- 导入动作时，宿主负责校验帧数、像素约束、精灵图生成和配置写入。
- 触发提案现在已经有完整宿主闭环：
  - 可提交到 `triggerProposalInbox`
  - 可持久化
  - 可在 Actions pane 审核
  - `click` 可直接应用到 `clickAction`
  - `manual` / `unbound` 只做确认
  - Creator Studio 已批准导入的动作会把生成的 `triggerProposal` 自动入队
  - `random` / `state` / `event` 仍然缺 durable host schema/editor

### 6.2 AI 与聊天

- 聊天 Provider 配置采用 draft / active 分离。
- 保存与测试连接是两个动作，测试使用已保存配置。
- AI Talk 负责 persona、history、memory，不应该再在 renderer 里复制一套对话逻辑。
- 桌宠气泡聊天和桌面聊天窗口应该共享同一个会话脑，而不是各自演化。

### 6.3 Creator Studio

- Creator Studio 不是宿主内建页面，而是当前插件体系上的一条能力链。
- 插件负责任务编排、提示词构造、QA 和导入决策。
- 宿主负责：
  - Provider 密钥
  - 图像生成请求
  - 输出写盘
  - action / pet-pack 导入
  - trigger proposal 入队和最终审核

### 6.4 插件系统

- 插件支持显式 `entries.setup`、`entries.commands`、`entries.services`。
- declaration-only command 通过短生命周期 bridge 访问有限宿主能力。
- creator-tools 目前覆盖：
  - action 读取 / 校验 / 受限写入
  - package-local frame inspect / import
  - 用户批准的 picker frame inspect / import
  - active installed user pack manifest workflow
- 插件现在依然不是“完全沙箱”；它只是被显式约束、审计和最小能力暴露。

## 7. 测试策略

### 核心流程必须有测试

以下流转属于强约束，改动时必须补或改测试：

- `npm start` 可启动
- Control Center 能构建并打开
- 设置保存与应用
- 动作导入、动作配置保存、trigger proposal 审核
- pet pack 导入 / 切换 / 删除
- AI Provider 保存、测试、脱敏诊断
- 插件安装、启停、命令执行、service 健康检查与清理
- Creator Studio 导入闭环
- loopback HTTP / MCP 默认关闭与显式启用

### 非核心测试的取舍

- 工具链脚本测试保留在 `tests/scripts/` 和 `tests/release/`。
- 纯文案、纯布局、纯展示辅助函数不需要机械地堆测试。
- 如果某个测试只是在重复更高层已经稳定覆盖的路径，可以删减。

## 8. 当前已知重点缺口

当前文档层面已经明确的工程缺口只有这些高优先项：

1. `random` / `state` / `event` 触发规则还没有宿主持久化 schema 与编辑器。
2. Windows 仍未达到真实签名与真实 smoke evidence 意义上的 release-ready。
3. Creator Studio 的用户流仍偏命令驱动，Dashboard-first 体验还需要继续收敛。
4. 气泡聊天与桌面聊天的最终主次关系还需要继续产品化收口。

这份文档不维护长期愿景列表；更完整的待办请看 `docs/openpet-current-todo-architecture.md`。

## 9. 文档维护规则

如果你改了下面内容，请同步更新对应文档：

| 变更内容 | 至少更新这些文档 |
| --- | --- |
| 服务职责、IPC 边界、开发命令 | `docs/jishuwendang.md` |
| 当前可用能力、验证基线、主要风险 | `docs/development-summary.md` |
| 当前接手信息、继续工作的导读 | `docs/HANDOFF.md` |
| 当前 TODO 和下一里程碑边界 | `docs/openpet-current-todo-architecture.md` |
| 历史实施与 review 结论 | `docs/phases/` 与 `docs/reviews/` |

优先保持一份文档说清一个主题，不要把同一段大篇幅现状复制到四五个文件里。

## 10. 建议阅读顺序

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/HANDOFF.md`
4. `docs/jishuwendang.md`
5. `docs/development-summary.md`
6. `docs/openpet-current-todo-architecture.md`

如果只是继续一个具体里程碑，再补读对应的 `docs/phases/`、`docs/reviews/`、`docs/superpowers/specs/` 即可。
