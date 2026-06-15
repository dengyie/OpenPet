# Phase 20 开发文档：示例插件开发者资产

> 阶段目标：用一个真实、可运行、纳入测试的本地插件示例降低 OpenPet 插件生态冷启动成本。
> 范围约束：本阶段不改变插件安全边界、不改变 catalog/marketplace 发布模型、不提升 Windows release-ready 声明、不引入移动端范围。

## 1. 背景

OpenPet 的插件 runtime、安装 review、权限白名单、隔离 runner、私有 storage、AI/network SDK 和 Control Center 管理体验已经具备产品化基础。Phase 17 已覆盖主进程插件包 IPC 到真实 zip fixture 的服务链路，Phase 18-19 又补齐了桌面 release 证据工具链和项目文档操作模型。

剩余问题是生态冷启动：开发者虽然能从代码和测试里推断插件写法，但缺少一个可直接阅读、安装和运行的示例插件，也缺少一份独立的插件开发指南来解释 manifest、config schema、SDK、安装 review 和测试入口。

## 2. 目标

- 新增一个本地示例插件，演示当前稳定插件包结构。
- 覆盖 `plugin.json`、`config.schema.json`、命令 handler、`ctx.config.get()`、`ctx.storage.*` 和 `ctx.pet.say()`。
- 用真实 `PluginInstallService` 和 `PluginService` 测试示例插件的 inspect、install、list、run 和 storage 行为。
- 新增插件开发文档，让 README 能指向一个明确的开发者入口。
- 同步活文档中的 Phase 20、测试数量和生态冷启动状态。

## 3. 非目标

- 不新增插件权限，不放宽 manifest 校验或网络 allowlist 规则。
- 不把示例插件加入内置 catalog 或自动发布渠道。
- 不新增 AI/network 示例，避免示例插件要求 API key 或外部网络。
- 不改变第三方插件默认 disabled 的安装策略。
- 不声称 Windows 已 release-ready；Windows 仍需签名产物证据和真实 Windows smoke 验证。
- 不讨论或引入移动端结构。

## 4. 实现记录

新增 `examples/plugins/focus-timer/`：

- `plugin.json`：声明 `openpet.example.focus-timer`、`index.js`、`config.schema.json`、`pet:say` / `storage` 权限，以及 `start` / `reset` 命令。
- `config.schema.json`：声明 `label`、`minutes`、`strictMode` 三个配置项，覆盖 string、number enum 和 boolean 默认值。
- `index.js`：实现 `activate(ctx)`，读取配置、更新私有 storage、调用 `ctx.pet.say()`，并返回结构化命令结果。
- `README.md`：解释示例插件的用途、权限、命令和本地打包方式。

新增 `tests/examples/focus-timer-plugin.test.js`：

- 使用真实 `PluginInstallService.inspectPluginPackage()` 检查示例插件目录。
- 使用真实 `PluginInstallService.installPlugin()` 验证安装后默认 disabled。
- 使用真实 `PluginService.listPlugins()` 和 `PluginService.runCommand()` 验证配置归一化、命令执行、storage 更新和 `pet.say` 事件。

新增 `docs/plugin-development.md`：

- 记录插件包目录结构、manifest 字段、允许权限、入口函数、config schema、SDK、安装 review、打包方式和测试入口。
- 明确 API key 只在主进程 `AiService` 中使用，不进入插件 runner。
- 明确网络只允许 manifest `network.allowlist` 中的 HTTPS host。

更新现有文档和脚本：

- `package.json`：`check:node` 纳入 `examples`，避免示例 JS 漂移。
- `README.md` / `README.zh-CN.md`：补 Focus Timer 示例、插件开发文档链接、Phase 20、测试数量和 roadmap 状态。
- `AGENTS.md`：同步 Node 测试数量。
- `docs/HANDOFF.md`、`docs/jishuwendang.md`、`docs/productization-roadmap.md`、`docs/project-status-review.md`、`docs/project-documentation-design.md`：同步 Phase 20、262 Node 测试、36 个测试文件、示例插件开发者入口和剩余生态风险。

## 5. 文档更新

本阶段把插件生态入口分成两层：

- `README.md` / `README.zh-CN.md` 作为快速入口，指向 Focus Timer 示例和插件开发文档。
- `docs/plugin-development.md` 作为开发者指南，解释当前 runtime 真实支持的 manifest、schema、SDK 和安装 review 行为。

活文档继续保持桌面范围：macOS release baseline complete；Windows tooling/evidence baselines implemented but not release-ready；移动端不在当前范围。

## 6. 验证

计划并执行以下验证：

```bash
node --check examples/plugins/focus-timer/index.js
node --test tests/examples/focus-timer-plugin.test.js
npm test
npm run test:control-center
npm run check:syntax
git diff --check
```

验证结果记录在配套 review 文档中。

## 7. 残留风险

- Focus Timer 是本地 unsigned 示例插件，不证明远端 catalog/marketplace 分发闭环。
- 示例覆盖 `pet:say` 和 `storage`，未覆盖 AI/network 权限的开发者体验。
- 仍需要更多示例插件，例如天气和 RSS，来覆盖网络 allowlist、外部数据解析和更复杂配置。
- 插件沙箱仍是既有短生命周期子进程 runner + Node permission model + VM 隔离，Phase 20 不改变其安全强度。
