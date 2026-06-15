# Phase 15 开发文档：项目文档设计收口

> 阶段目标：在不改变运行时代码和发布支持口径的前提下，把项目文档设计收口为后续 macOS + Windows 桌面开发可执行的治理入口。  
> 范围约束：只更新文档；不改变 Electron 主进程、Control Center、插件、AI、本地 HTTP/MCP 或 release scripts；不声称 Windows release-ready；不引入移动端设计。

## 1. 背景

前序 Phase 9-10 已经建立项目文档治理和文档设计主入口，Phase 11-14 则持续扩展 Control Center UI 自动化。当前用户要求先完善整个项目文档设计，并且项目范围已经收敛为 macOS + Windows 桌面端，不再考虑移动端。

本阶段重点不是新增功能，而是把后续最容易漂移的几个判断写进文档系统：

- 最初约定的项目目标必须继续作为所有文档和阶段工作的锚点。
- 当前 Electron 项目结构满足 macOS + Windows 桌面端，但不代表 Windows 已 release-ready。
- 移动端不在当前发布范围，也不能被 Electron 桌面结构隐含支持。
- 每个阶段仍要有开发文档、review 文档、验证记录和提交边界。
- live docs 的测试数量、最新阶段指针和 README 徽章必须和当前事实一致。

## 2. 目标

- 修正 README 双语入口中的 UI 测试徽章漂移。
- 在 README 双语 phase 索引中加入 Phase 15。
- 扩充 `docs/project-documentation-design.md`，补齐 macOS/Windows 桌面结构决策记录、结构改进 backlog、scope 变更规则、support claim 升级清单、phase/review 模板和文档-only 阶段 playbook。
- 更新 `docs/HANDOFF.md`、`docs/productization-roadmap.md` 和 `docs/project-status-review.md` 的最新阶段与文档完整性口径。
- 新增本阶段 paired review，保持阶段历史可审计。

## 3. 非目标

- 不改动任何运行时代码。
- 不新增 Playwright 或 Node 测试。
- 不更新真实 Windows release-ready 状态。
- 不创建移动端路线图、移动端目录结构或移动端支持声明。
- 不重写历史 phase/review 文档中的历史验证数据。

## 4. 实现记录

### 4.1 README 入口校准

- `README.md` 和 `README.zh-CN.md` 的测试徽章从 `236 node + 2 ui` 修正为 `236 node + 8 ui`。
- 双语 phase 列表新增 Phase 15 文档链接。

这只修正 live entry point 的当前事实，不修改历史 phase 文档里的历史测试数量。

### 4.2 文档设计主入口加固

`docs/project-documentation-design.md` 新增：

- Desktop structure decision record：明确共享 Electron 架构适合 macOS + Windows 桌面端，但 Windows 公共支持仍缺签名产物证据和真实冒烟验证。
- Desktop structure improvement backlog：把 Windows smoke evidence、release scripts、UI automation 和 Windows plugin runner 验证列为结构不变前提下的增信项。
- Phase document minimum template：固定新阶段文档最少应包含背景、目标、非目标、实现记录、文档更新、验证和残留风险。
- Review document minimum template：固定 review 以 findings 开头，即使无问题也要记录 residual risk。
- Scope change rules：规定 Windows、Linux、移动端 scope 变化前必须具备的证据或架构计划。
- Support claim upgrade checklist：把 macOS/Windows 支持声明升级拆成 build config、release workflow、资产、签名、runtime smoke、release checklist 等可审计条件。
- Documentation-only phase playbook：规定纯文档阶段应更新哪些 live docs，以及最低验证方式。

### 4.3 当前态文档同步

- `docs/HANDOFF.md`：更新时间、当前状态和最新 phase/review 指针。
- `docs/productization-roadmap.md`：记录 Phase 15 对文档设计的收口，并在 phase 表中新增 Phase 15。
- `docs/project-status-review.md`：更新时间、状态摘要、Phase 15 行和阶段文档/review 数量。

## 5. 文档更新

本阶段更新：

- `README.md`
- `README.zh-CN.md`
- `docs/project-documentation-design.md`
- `docs/HANDOFF.md`
- `docs/productization-roadmap.md`
- `docs/project-status-review.md`
- `docs/phases/phase-15-project-documentation-design-consolidation.md`
- `docs/reviews/phase-15-project-documentation-design-consolidation-review.md`

## 6. 验证

已执行验证：

```bash
rg -n "236%20node%20%2B%202%20ui|Phase 8-14|14 个阶段|28 个阶段" README.md README.zh-CN.md docs/HANDOFF.md docs/productization-roadmap.md docs/project-status-review.md docs/project-documentation-design.md
rg -n "Windows supported|Windows ready|SmartScreen trusted|Cross-platform desktop release complete|Mobile roadmap" README.md README.zh-CN.md AGENTS.md docs
git diff --check
```

Because this phase changes Markdown only, no runtime command is required. If later edits touch package scripts, code snippets intended to execute, or generated release assets, run the relevant package command in addition to the Markdown drift checks.

验证结果：

- 未发现 live docs 中残留旧测试徽章、旧 Phase 范围或旧阶段文档计数。
- Windows / mobile 支持声明搜索只命中文档治理规则、历史阶段记录或本阶段边界说明；未发现新的公开支持越界声明。
- `git diff --check` 通过。

## 7. 残留风险

- 文档设计只能降低漂移概率，不能替代后续阶段实际遵守 phase/review/update playbook。
- Windows 仍不是 release-ready；真实 Windows 签名产物证据和 smoke report 仍必须后续补齐。
- Control Center 手动插件包安装 review 仍是 UI 自动化缺口，适合作为后续实现阶段处理。
