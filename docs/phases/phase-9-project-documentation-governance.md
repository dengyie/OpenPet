# Phase 9 开发文档：项目文档治理完善

> 阶段目标：把项目目标、文档分层、阶段治理、支持声明和更新 playbook 固化为可执行的文档体系，确保后续开发能按阶段推进、review、验证和提交。  
> 范围约束：本阶段只调整项目文档，不改变运行时代码、不扩大平台支持声明、不声称 Windows release-ready。

## 1. 背景

OpenPet 已经从单窗口桌宠演进为 Electron desktop pet platform：主进程 service 层、React Control Center、AI、插件、Pet pack、本地 HTTP/MCP、macOS release baseline 和 Windows release-track tooling 都已存在。

随着 Phase 1-8.5f 的记录逐步累积，文档体系已经完整但偏分散：README、HANDOFF、技术文档、路线图、release design、release checklist、phase docs 和 review docs 都在描述项目状态。为了继续按“分阶段开发、每阶段记录、review、验证、提交”的方式推进，需要一个更明确的文档治理层来回答：

- 最开始约定的项目目标是什么。
- 新人或后续 agent 应该先读哪些文档。
- 哪些文档是 release readiness 的事实源。
- macOS、Windows、Linux、移动端分别能怎么说。
- 每个阶段完成后必须更新哪些文档。
- 测试数量、支持声明和当前状态如何避免漂移。

## 2. 交付范围

本阶段交付：

- 扩充 `docs/project-documentation-design.md`，让它成为项目目标与文档治理的主入口。
- 在 README 双语入口中突出文档设计、release checklist 和当前测试数量。
- 在 `docs/HANDOFF.md` 中增加接手阅读顺序和当前支持声明口径。
- 修正 live status 文档里的测试数量漂移，统一为当前 `219/219`。
- 新增本阶段开发文档和 review 文档，验证文档治理流程本身也遵守阶段规则。

本阶段不交付：

- 不新增 runtime 功能。
- 不修改 Electron build/release workflow。
- 不补真实 Windows signed artifact evidence。
- 不执行或伪造 Windows smoke validation。
- 不引入移动端或 Linux 支持计划。

## 3. 设计决策

### 3.1 文档分层

`docs/project-documentation-design.md` 将文档分成这些层：

- Product entry：README 双语入口。
- Current state：HANDOFF 与 project status review。
- Goal and governance：project documentation design 与 AGENTS。
- Architecture and roadmap：技术文档、平台开发计划、产品化路线图。
- Release operations：desktop release design、release checklist、release evidence。
- Phase records：phase docs 与 review docs。
- Domain references：MCP、插件沙箱、生态 catalog 等子系统文档。
- Historical remediation：历史整改计划和专项计划。

当文档出现冲突时，以更窄、更靠近事实源的文档为准。例如 release readiness 以 `desktop-release-design.md` 和 `release-checklist.md` 为准，当前项目状态以 `HANDOFF.md` 和 `project-status-review.md` 为准。

### 3.2 读者路径

新增 reader paths，给不同任务明确入口：了解项目、继续开发、读架构、做发布、验证 Windows claim、开发插件、接 MCP/agent。

README 保持导航和公开状态；深层步骤放到技术、路线图、release 或 phase 文档中，避免入口文档变成又厚又容易过期的操作手册。

### 3.3 支持声明边界

当前统一口径：

```text
macOS release baseline is complete; Windows desktop build/CI/signing-policy/smoke-evidence/reporting/runbook/collector/bundle-validation baseline is implemented but not release-ready; mobile is out of scope.
```

Windows 只允许描述 build/CI/signing-policy/smoke-evidence/reporting/runbook/collector/bundle-validation baseline。只有 signed artifact evidence 和真实 Windows smoke validation 都完成后，才能改成 release-ready 语义。

### 3.4 阶段治理

每个阶段必须形成闭环：

1. 阶段目标和范围写入 `docs/phases/`。
2. 实现或文档改动保持 scoped。
3. 按风险补测试或验证。
4. 阶段文档记录实现、验证和残留风险。
5. paired review 文档先列 findings，再写 notes、risks、verification。
6. 更新 live status 文档。
7. 提交 commit 后再进入下一阶段。

### 3.5 测试数量漂移处理

当前 live status 文档和 README badge 应使用当前实际测试数量。历史 phase 验证记录不回写，避免把当时真实的验收结果改成后来数字。

本阶段将 README、HANDOFF、project-status-review 中仍保留的 `210 tests` live references 更新为 `219 tests`。

## 4. 实施记录

### 4.1 `docs/project-documentation-design.md`

新增或扩充：

- Documentation Goals。
- Documentation Layers 的 detail level。
- Documentation Map 的 update triggers。
- Reader Paths。
- Cross-Platform Scope。
- Phase Completion playbook。
- Windows Evidence Change playbook。
- Documentation Quality Bar。

并保留原始项目目标锚点和 Windows release-ready 禁止越界语义。

### 4.2 README 双语入口

更新：

- 测试 badge 从 `210 passed` 改为 `219 passed`。
- `npm test` 命令注释从 210 改为 219。
- Testing section 从 210 改为 219。
- 主文档列表把 `project-documentation-design.md` 放到更靠前的位置。
- 增加 `release-checklist.md` 入口，方便发布和 Windows evidence 工作直接找到操作清单。

### 4.3 `docs/HANDOFF.md`

新增“文档入口顺序”：

1. project documentation design。
2. HANDOFF。
3. desktop release design / release checklist。
4. 最新 phase / review pair。

同时补当前支持口径，避免后续接手时误把 Windows tooling baseline 理解成 Windows release-ready。

### 4.4 `docs/project-status-review.md`

把 live status 中的测试数量从 210 改成 219，保持与当前 `npm test` 输出一致。

## 5. 验收

- `docs/project-documentation-design.md` 明确项目目标、文档分层、reader paths、支持声明、阶段治理、更新 playbook 和质量门槛。
- README 双语入口包含 project documentation design 和 release checklist。
- live status 文档不再保留过期 `210 tests` 口径。
- Windows 不被声明为 supported / ready / SmartScreen trusted。
- 移动端保持 out of scope。
- `git diff --check` 通过。
- `npm test` 通过，当前为 `219/219`。
- `npm run check:syntax` 通过。

## 6. 残留风险

- 本阶段提升的是文档治理，不替代后续真实 Windows signed artifact evidence 或 smoke validation。
- 文档体系仍需要后续阶段遵守；如果阶段完成后不更新 HANDOFF、phase/review 和 release docs，仍可能再次漂移。
- README badge 是静态 badge，不是 CI 动态 badge；后续如果测试数量变化，需要继续按 update playbook 更新。
