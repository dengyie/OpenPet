# Phase 28 开发文档：插件提交工作流演练手册

> 阶段目标：把插件提交链条从“命令可用”推进到“第三方作者有一份可直接照着跑的演练手册”。
> 范围约束：不改变插件权限模型，不安装或启用插件，不运行插件代码，不接入远端 marketplace，不把演练手册误写成批准或签名信任。

## 1. 背景

Phase 23-27 已经把插件提交链条拆成校验、报告、PR packet、bundle 和 bundle validation 五个本地命令。但第三方作者仍然需要从散落的命令说明里自己拼出一条完整路径。

Phase 28 新增一个面向作者的 workflow playbook，把这五个命令串成单一演练路径，便于本地 rehearsal、reviewer handoff 和教程编写。

## 2. 目标

- 新增 `docs/plugin-submission-workflow-playbook.md`。
- 说明从 `validate:plugin` 到 `validate-plugin-submission-bundle` 的推荐执行顺序。
- 解释每个产物的用途、reviewer handoff 方式和常见失败模式。
- 在插件开发文档中增加到 playbook 的入口链接。
- 更新 live docs，让“真实第三方审核演练”拥有一条清晰 reader path。

## 3. 非目标

- 不新增新的 bundle 格式、签名信任机制或 reviewer 自动审批。
- 不改变 `validate:plugin`、submission report、PR packet、workflow bundle 或 bundle validation 的实现逻辑。
- 不安装、启用、更新或运行第三方插件。
- 不改变 Windows release-ready 支持声明。

## 4. 实现记录

- 新增 `docs/plugin-submission-workflow-playbook.md`，用简短的分节方式串起完整 rehearsal。
- 在 `docs/plugin-development.md` 中增加 playbook 入口。
- 在 `docs/HANDOFF.md`、`docs/development-summary.md`、`docs/productization-roadmap.md`、`docs/project-documentation-design.md` 和 `docs/project-status-review.md` 中记录 Phase 28 和当前 reader path。

## 5. 验证

```bash
git diff --check
rg -n "待验证|Phase 8-27|50 个阶段开发/review 文档|27 个阶段开发文档 \\+ 27 个 review|Phase 27 已完成|through Phase 27" README.md README.zh-CN.md docs/*.md docs/phases/phase-28-plugin-submission-workflow-playbook.md docs/reviews/phase-28-plugin-submission-workflow-playbook-review.md
```

结果：

- `git diff --check` 通过。
- 漂移检查未发现 Phase 28 相关旧口径；仅命中 `docs/productization-roadmap.md` 中既有 MCP 兼容矩阵的“待验证”状态。

## 6. 残留风险

- Playbook 只让第三方作者更容易走完本地 rehearsal，不代表真实社区提交流程、审核 SLA 或生态运营已经闭环。
- 人工 reviewer 仍然需要阅读源码、权限、网络 allowlist、bundle summary 和提交背景后记录 approval。
