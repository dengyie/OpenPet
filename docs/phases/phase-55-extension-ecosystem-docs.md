# Phase 55 开发文档：Extension Ecosystem Docs

## 目标

Phase 55 把当前作者入口和生态规则从“受限 plugin SDK”表述改为“developer-first local extension platform”表述，并以 `/Users/mango/project/codex/weather-morning-report/docs/OPENPET_EXTENSION_ECOSYSTEM_BOUNDARY.md` 作为本阶段文档源头。

本阶段只更新当前作者面向和生态面向文档，不改变运行时代码，不升级 sandbox 声明，不修改历史 phase/review 记录，也不把 legacy JavaScript SDK 兼容路径删除。

## 本阶段完成内容

- 重写 `docs/plugin-development.md` 为 extension author guide：
  - 以统一 `plugin.json` package model 描述 extension。
  - 覆盖 `entries.commands`、`entries.services`、`entries.dashboards`、`manifest`、`config` 和 `assets`。
  - 增加 command、service、dashboard、setup、result JSON、环境变量、bridge、data ownership、pet integration 和 pet asset workflow 示例。
  - 明确现有 scaffold、validation、example plugins 与 short-lived JavaScript SDK runner 仍是兼容路径。
- 重写 `docs/plugin-ecosystem-rules.md`：
  - 从 restrictive plugin policy 改为生命周期、透明声明、结构安全和诚实产品语言。
  - 明确 OpenPet 不承诺完整 sandbox 任意本地进程、不审计所有未声明行为、不控制所有 secret、不中央审批本地实验。
  - 增加 source labels、manifest review、setup/uninstall、compatibility 和第三方作者指导。
- 更新 `README.md` 与 `README.zh-CN.md`：
  - 将入口定位从旧 plugin-only 口径调整为 developer-first local extension ecosystem。
  - 将 Plugin Development 入口改为 Extension Development。
  - 保留 legacy SDK examples 作为当前兼容示例。
  - 将测试徽章同步到当前 409 Node tests + 10 UI baseline。
- 更新 `docs/plugin-submission-workflow-playbook.md`：
  - 将提交流程手册改为 extension-first 口径。
  - 明确现有命令仍沿用 `plugin` 命名只是兼容事实。
  - 将 legacy config secret rejection 描述为当前工具限制，而不是未来生态上限。
- 新增并完成 `docs/superpowers/plans/2026-06-17-extension-ecosystem-docs.md` checklist，记录本阶段文档执行计划。

## Review 结论

Production review 没有发现需要修复的 P0/P1/P2 问题。

Review 过程中发现一处 P3 级文档风险：README 和活文档最初把 services、dashboards、setup、health 等目标 extension runtime 能力写得过像当前已实现能力。已修复为“目标模型已文档化，当前宿主仍保留 legacy SDK command-style 兼容路径”的表述。

## 验收

- 当前作者入口以 extension model 为主，不再把 legacy SDK runner 描述为生态上限。
- README 英中入口都指向 extension development，并保留当前工具命令仍使用 `plugin` 命名的兼容说明。
- Ecosystem rules 明确 OpenPet 的真实承诺：结构安全、生命周期、日志、health、uninstall 和透明声明，而不是完整 sandbox。
- 历史 phase/review 文档保持不改写。
- `rg` stale-claim 搜索中剩余命中只能是 legacy compatibility 或 non-guarantee 语境。
- `npm run check:syntax`、`npm run test:control-center`、`npm test` 和 `git diff --check` 通过。

## 验证

```bash
rg -n "permission-limited|unrestricted Node|fully sandbox|permission-gated|do not require user secrets|hard compatibility|受限插件|无限制 Node|插件 SDK 支持权限|不支持普通插件级 secret" README.md README.zh-CN.md docs/plugin-development.md docs/plugin-ecosystem-rules.md docs/plugin-submission-workflow-playbook.md docs/HANDOFF.md docs/development-summary.md docs/project-status-review.md docs/project-context.json docs/productization-v1.1-todo-design.md docs/project-review-todo-design.md
node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json', 'utf8')); console.log('project-context ok')"
npm run check:syntax
npm run test:control-center
npm test
git diff --check
```

当前结果：

- stale-claim `rg` search: pass，剩余命中均为 legacy compatibility 或 non-guarantee 语境。
- `node -e "JSON.parse(...)"`: project-context ok
- `npm run check:syntax`: pass
- `npm run test:control-center`: 10/10 pass
- `npm test`: 409/409 pass
- `git diff --check`: pass

## 后续约束

1. 后续 runtime 实现若推进 extension model，应保持 legacy SDK examples 可用，直到迁移路径明确。
2. 不要把 source labels 写成能力隔离或安全保证；它们只是 provenance 和 display messaging。
3. OpenPet 可以管理 lifecycle、logs、health 和 uninstall，但不能宣称完整控制第三方 local process 的所有行为。
