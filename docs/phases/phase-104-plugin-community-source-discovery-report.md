# Phase 104 开发文档：Plugin Community Source Discovery Report

> Date: 2026-06-18
> Branch: `codex/phase104-community-source-discovery-report`

## 1. 目标

Phase 104 补齐 Phase 100 之前的社区来源发现证据层：维护者可以把公开搜索结果、相邻候选仓库和当前兼容性判断记录为稳定 JSON/Markdown artifact，再决定是否进入 Phase 100 intake。

本阶段的可验证结果是：

- `npm run create-plugin-community-source-discovery-report` 可生成 discovery summary 和 README；
- discovery report 能表达 `compatible-source-not-found`、`compatible-source-found`、`community-evidence-ready` 三种状态；
- 当前公开搜索和已知相邻候选被归档为 `compatible-source-not-found`；
- 文档明确 discovery 不是 compatibility、trust、publication、runtime safety 或 release readiness 证据。

## 2. 范围

已实现：

- 新增 `scripts/create-plugin-community-source-discovery-report.js`。
- 新增 `tests/scripts/create-plugin-community-source-discovery-report.test.js`。
- 新增 npm script：`create-plugin-community-source-discovery-report`。
- 生成 Phase 104 证据：
  - `docs/release-evidence/plugin-community-source-discovery-report/2026-06-18T23-55-00Z-compatible-source-search/`
- 同步 live docs、handoff、project context、TODO design 和 review table。

不在本阶段范围：

- 下载或执行第三方源码。
- 验证插件包兼容性；这仍属于 Phase 100。
- 把相邻生态项目自动转换为 OpenPet 插件提交。
- 声称签名信任、catalog publication、runtime safety 或 release readiness。

## 3. 实现

`create-plugin-community-source-discovery-report` 接收两组确定性输入：

- `--search-results <json-array>`：记录搜索 query、工具、结果数量和备注。
- `--candidates <json-array>`：记录候选 source URL、archive hint、submitter、状态、reason code、intake/evidence 链接和备注。

候选状态限定为：

- `not-inspected`
- `ready-for-community-evidence`
- `incompatible-package-model`
- `not-found`

派生状态规则：

- 任意 ready candidate 已有 Phase 99 evidence -> `community-evidence-ready`
- 任意 ready candidate 没有 Phase 99 evidence -> `compatible-source-found`
- 否则 -> `compatible-source-not-found`

当前 Phase 104 证据记录：

- `alvinunreal/openpets`：相邻 OpenPets 生态，存在 `openpets.plugin.json`，不是当前 OpenPet `plugin.json` package model。
- `Yarrow-Cai/hookcats`：OpenPet-adjacent 描述，但未发现 `plugin.json` / `openpets.plugin.json` 候选路径。
- `alvinunreal/opencode-pets`：更接近 OpenCode installer，不作为当前 compatible package evidence。

## 4. 决策记录

| 问题 | 决策 | 理由 | 风险 |
|------|------|------|------|
| 是否让 discovery 工具联网搜索 | 不联网，只接收已观察的搜索结果 | 测试可确定，证据可复现；真实搜索过程在阶段执行中记录 | 需要维护者手动传入最新搜索结果 |
| 是否把 `openpets.plugin.json` 当作兼容插件 | 不兼容 | 当前 OpenPet intake 要求 package root 有 `plugin.json` | 未来若提供迁移器，需要新增兼容阶段 |
| 是否在 report 里生成 Phase 100 命令 | 暂不自动生成命令 | 本阶段是 discovery aggregation；只有明确 compatible package path 后才进入 Phase 100 | 下一阶段仍需人工/脚本提供精确 archive 和 plugin path |

## 5. 验收

已完成 targeted verification：

```bash
node --test tests/scripts/create-plugin-community-source-discovery-report.test.js
```

完整验证记录见 Phase 104 review 文档。当前验收口径是：发现证据可归档，但没有找到兼容第三方 `plugin.json` package，因此下一步仍是 find-or-invite compatible package source。
