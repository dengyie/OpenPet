# Phase 10 开发文档：项目文档设计加固

> 阶段目标：在不改变运行时代码和发布支持口径的前提下，把项目文档设计完善成可执行的文档操作系统，回答“哪些文档负责哪些事实、macOS/Windows 项目结构是否成立、支持声明如何升级、后续如何防漂移”。  
> 范围约束：只更新文档设计与入口索引；不声称 Windows release-ready；不引入移动端设计。

## 1. 背景

用户要求先完善整个项目文档设计，并且当前产品范围已经收敛为 macOS + Windows 桌面端。Phase 9 已经建立文档治理骨架，但它更偏向规则清单，还缺少几个后续开发最容易踩空的判断依据：

- 项目最初目标如何落到每类文档的事实归属。
- 当前 Electron 项目结构为什么满足 macOS + Windows 桌面端，而不是移动端。
- 一个支持声明从“设计意图”升级到“公开支持”需要哪些证据阶段。
- 新文档什么时候该新增，什么时候应该并入既有文档。
- 后续阶段如何快速审计测试数量、平台支持口径和 release-ready 说法是否漂移。

## 2. 交付范围

本阶段交付：

- 扩充 `docs/project-documentation-design.md` 的设计原则、事实归属矩阵、结构适配说明、支持声明生命周期、新文档创建规则和漂移审计命令。
- 同步 README 双语 Phase 索引，加入 Phase 10 文档入口。
- 更新 `docs/HANDOFF.md` 的最新 phase/review 指针。
- 新增本阶段 phase 文档和 paired review 文档。

本阶段不交付：

- 不修改 Electron 主进程、renderer、Control Center 或 service 代码。
- 不修改 release workflow、electron-builder 配置或 Windows 证据脚本。
- 不把 Windows 从 tooling baseline 改成 public support / release-ready。
- 不为移动端建立路线图、目录结构或支持声明。

## 3. 设计决策

### 3.1 文档操作系统

`project-documentation-design.md` 现在明确文档体系要回答五类问题：项目是什么、架构在哪里、当前 release truth 是什么、每个阶段改了什么、哪些命令和证据证明当前 claim。

新增原则包括 one owner per fact、public docs stay conservative、current state beats roadmap、phase docs are audit records、security boundaries are first-class。

### 3.2 事实归属矩阵

新增 ownership matrix，把事实分配给主责文档：

- 原始目标：`project-documentation-design.md`。
- 当前状态：`HANDOFF.md`。
- 服务架构：`jishuwendang.md`。
- 发布门槛：`desktop-release-design.md`。
- 发布操作步骤：`release-checklist.md`。
- Windows 证据 schema：`docs/release-evidence/*.json` 与 release scripts。
- 阶段历史：`docs/phases/`。
- review findings：`docs/reviews/`。

这样后续不会把 README、HANDOFF、roadmap、release checklist 写成互相复制的长文档。

### 3.3 macOS + Windows 结构适配

新增结构适配表，说明当前结构满足 macOS + Windows Electron 桌面端的原因：

- 运行入口保持 Electron desktop entry。
- 主进程 service 层承载共享应用逻辑。
- Control Center 是 Electron 内嵌 React + Vite UI。
- release config、icon、workflow 和 evidence scripts 承载平台差异。
- Windows readiness 由结构化证据工具和真实 smoke validation 决定。

同时明确当前结构不是 mobile architecture，没有移动 runtime、移动 UI shell、原生移动 packaging 或移动支持声明。

### 3.4 支持声明生命周期

新增从 design intent 到 public support 的阶段表：design intent、build baseline、policy baseline、evidence baseline、signed artifact evidence、runtime smoke validation、public support。

Windows 当前只到 evidence baseline。除非 signed artifact evidence 与 runtime smoke validation 都完成，否则不能跳到 public support wording。

### 3.5 漂移审计

新增 `rg` 命令用于快速检查：

- 测试数量和 badge 是否漂移。
- 禁用支持词是否误出现在 live docs。
- release-ready / supported 语义是否只出现在正确上下文。

这些命令用于提示，不盲目替换，因为历史 phase/review 记录可以保留旧测试数量。

## 4. 实施记录

### 4.1 `docs/project-documentation-design.md`

新增：

- Documentation Design Principles。
- Documentation Ownership Matrix。
- Project Structure Fitness For macOS + Windows。
- Support Claim Lifecycle。
- Documentation Structure Change playbook。
- New Document Creation playbook。
- Drift Audit。

并把 Current Documentation Status 从 Phase 9 更新为 Phase 10，保留 Windows not release-ready 口径。

### 4.2 README 双语入口

Phase 文档列表新增 Phase 10 链接，方便从公开入口找到最新文档设计记录。

### 4.3 `docs/HANDOFF.md`

文档入口顺序中的“最新阶段”从 Phase 9 更新为 Phase 10 phase/review pair。

## 5. 验收

- `project-documentation-design.md` 能回答当前项目目标、文档分层、事实归属、macOS/Windows 结构适配、支持声明生命周期、更新 playbook 和漂移审计。
- README 双语入口能导航到 Phase 10。
- HANDOFF 指向最新 phase/review pair。
- Windows 仍只描述为 build/CI/signing-policy/smoke-evidence/reporting/runbook/collector/bundle-validation/summary/archive-manifest baseline implemented but not release-ready。
- 移动端仍是 out of scope。
- `git diff --check` 通过。
- `npm run check:syntax` 通过。

## 6. 残留风险

- 本阶段不会补 Windows signed artifact evidence 或真实 Windows smoke validation。
- 文档设计只能降低漂移概率，不能替代后续阶段实际遵守 phase/review/update playbook。
- README 仍使用静态测试 badge；未来测试数量变化需要按文档设计里的 drift audit 更新。
