# OpenPet 开发小结

> 最后更新：2026-06-15
> 当前阶段：Phase 23 已完成
> 当前分支：`main`
> 最新阶段提交：本阶段提交

本文是 OpenPet 当前开发进度的快照版小结。更完整的目标、架构、支持声明和验收规则以 [`project-documentation-design.md`](./project-documentation-design.md)、[`HANDOFF.md`](./HANDOFF.md)、[`productization-roadmap.md`](./productization-roadmap.md) 和 [`project-status-review.md`](./project-status-review.md) 为准。

## 1. 当前总体状态

OpenPet 已从单体桌宠应用演进为一个 Electron 桌面宠物平台。当前范围聚焦 macOS 与 Windows 桌面端，不包含移动端。

已完成：

- v1.0 产品化基线。
- v1.0.1-rc.1 的 OpenPet 改名、GitHub 仓库迁移和旧 `ibot` userData 升级兼容准备。
- macOS 分发基线。
- Windows 打包、CI、签名策略、冒烟证据、报告、runbook、collector、证据包校验、summary/archive-manifest 与 packaged native picker smoke evidence 工具基线。
- Control Center Playwright UI 回归基线。
- 主进程插件包 IPC 到真实 `.openpet-plugin.zip` 的 inspect/install 烟测。
- 三个可运行示例插件：Focus Timer、Weather Status、RSS Reader。
- 插件提交前本地校验入口：`npm run validate:plugin -- <plugin-dir-or-zip>`。

仍需保持谨慎口径：

- Windows 不能声明 release-ready，直到完成真实签名产物证据、SmartScreen/reputation 验证和真实 Windows 冒烟验证。
- packaged app 原生 OS 文件选择器已有证据工具链，但真实 macOS / Windows 证据仍需归档。
- 插件生态已有示例资产和提交前校验入口，但真实第三方审核演练、教程和社区流程还未闭环。

## 2. 阶段开发总览

### Phase 1-7：核心产品化闭环

| Phase | 主题 | 结果 |
|-------|------|------|
| 1 | Control Center 模块化 | React + Vite Control Center 拆分为 shell、panes、hooks、api facade、shared components 与 lib helper。 |
| 2 | Pet pack 管理 | 建立 pet pack manifest、loader、importer、整包检查、导入、启用、删除和 legacy cat 包兼容。 |
| 3 | 插件生态产品化 | 建立插件权限白名单、安装 review、隔离 runner、SDK、配置 schema、私有 storage 和默认 disabled 安装策略。 |
| 4 | AI 行为编排 | 增加结构化 behavior tool-call、action 白名单、cooldown、dry-run 和最近决策日志。 |
| 5 | MCP transport 产品化 | 拆出 MCP transport service，补 session TTL、Service 页 session 管理、tool schema 校验和日志路径。 |
| 6 | 分发与 release pipeline | 完成 macOS 打包、公证脚本、GitHub release workflow、About 更新检查和发布清单。 |
| 7 | 生态 catalog 运营闭环 | 建立 catalog、hash 校验、本地 blocklist、权限 diff review 和 plugin/pet pack 安装路径。 |

### Phase 8-19：发布、自动化与文档治理加固

| Phase | 主题 | 结果 |
|-------|------|------|
| 8 | Windows 桌面分发基线 | 补 Windows build config、CI、签名策略、冒烟证据门禁、报告、runbook、collector、summary 和 archive manifest 基线；仍未 release-ready。 |
| 9 | 项目文档治理完善 | 补齐文档入口、状态说明、阶段记录和治理口径。 |
| 10 | 项目文档设计加固 | 加固项目目标锚点、桌面结构决策、support claim 升级规则和模板。 |
| 11 | Control Center 前端自动化基线 | 建立 Playwright smoke baseline，覆盖 app shell、tab 和基础交互。 |
| 12 | Control Center 保存配置自动化 | 覆盖 Pet、AI、Service 保存配置路径。 |
| 13 | Control Center Catalog 自动化 | 覆盖 Catalog 插件安装、插件更新和 pet pack 安装路径。 |
| 14 | Control Center MCP Session 自动化 | 覆盖 Service tab MCP session 展示、撤销和 token 轮换失效。 |
| 15 | 项目文档设计收口 | 收口文档目标、结构、阶段和支持声明规则。 |
| 16 | Control Center 手动插件安装自动化 | 将手动插件包安装 review 纳入 demo API Playwright 回归。 |
| 17 | Electron 插件包 IPC 安装烟测 | 用真实 zip fixture 覆盖主进程 `plugins:inspect-package` / `plugins:install` 链路。 |
| 18 | Desktop 原生文件选择器烟测证据工具链 | 提供 macOS / Windows packaged native picker pending report、runbook、update 和 validator 工具。 |
| 19 | 项目文档设计完善 | 补齐文档生命周期、阶段完成契约、完成标准、反模式和决策记录。 |

### Phase 20-23：插件生态开发者资产

| Phase | 主题 | 结果 |
|-------|------|------|
| 20 | Focus Timer 示例插件 | 覆盖 `storage` 与 `pet:say`，并通过真实 `PluginInstallService` + `PluginService` 测试。 |
| 21 | Weather Status 示例插件 | 覆盖 `network` permission、HTTPS allowlist、JSON 响应处理、storage 和 pet speech，测试使用注入 fake fetch。 |
| 22 | RSS Reader 示例插件 | 覆盖公开 RSS/Atom feed 拉取、轻量 XML 解析、storage 缓存和 pet speech，测试使用注入 fake fetch。 |
| 23 | 插件提交校验入口 | 新增 `validate:plugin` CLI，复用 `PluginInstallService` 检查目录/zip、签名 metadata、blocklist 和 review 风险。 |

## 3. 当前质量基线

截至 Phase 23，当前记录的质量基线为：

```bash
npm test                    # 269/269 Node tests pass
npm run test:control-center # 9/9 Control Center Playwright UI tests pass
npm run check:syntax        # Node syntax check + Control Center Vite build pass
```

测试覆盖面包括：

- Service 层核心行为。
- Pet pack runtime。
- 插件 manifest、安装 review、runner isolation、SDK 权限、config、storage、AI、network 和 logs。
- 示例插件 install/run。
- 插件提交前 package validation CLI。
- 主进程插件包 IPC。
- Windows release evidence tools。
- Desktop picker smoke evidence tools。
- Control Center UI 回归。

## 4. 当前架构锚点

- `PetService` 是宠物状态唯一事实源，所有 say/action/event 都通过它。
- `main.js` 负责组装服务，service 层保持依赖注入。
- API key 只进入 `SecretService`，不暴露给 renderer 或普通插件。
- 插件必须经过 manifest 权限声明、安装 review、默认 disabled 和受限 SDK。
- 本地 HTTP / MCP 默认关闭，只允许 loopback，并受 token/session gate 保护。
- macOS 支持可作为 release baseline；Windows 只声明 tooling baseline，不能提前声明 release-ready。

## 5. 下一步建议

优先级建议：

1. 发布 v1.0.1-rc.1，验证 OpenPet 改名、旧 `ibot` userData 兼容、GitHub release asset 和 About 更新检查链路。
2. 用 Phase 18 工具链填写并归档 macOS / Windows packaged app 原生 OS 文件选择器真实烟测证据。
3. 补 Windows 签名产物、SmartScreen/reputation、安装/卸载/透明窗口和原生 picker 真实烟测证据。
4. 把插件生态从提交前校验推进到真实第三方提交、审核、教程和流程演练。
5. 后续再评估远端 marketplace、真实第三方签名根信任、SES 或 Electron utilityProcess 等增强项。

## 6. 最近阶段提交

```text
本阶段提交 Phase 23 插件提交校验入口
a1fd496 test: add rss example plugin
6253744 test: add weather example plugin
d8cc3dc test: add focus timer example plugin
4f22748 docs: complete project documentation design
3770f21 test: add desktop picker smoke evidence tooling
976516c test: cover plugin package ipc install path
8d3ce0b test: cover manual plugin install review
1767180 docs: consolidate project documentation design
```
