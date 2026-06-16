# Phase 44 开发文档：Plugin Author Experience Rehearsal

## 目标

Phase 44 的目标是把插件作者体验从“工具分散存在”推进到“第三方作者可按一条路径演练”。作者应该能 scaffold、validate、package、生成 submission bundle，并拿到可读 README、命令清单和审核 checklist。

本阶段继续保持保守安全口径：插件 config 是公开设置，不是 secret store；submission bundle 是人工审核材料，不是签名信任、catalog approval 或 runtime smoke。

## 本阶段完成内容

- 扩展 `scripts/create-openpet-plugin.js`：
  - 新增 `ai` 模板。
  - AI 模板使用 `pet:say` + `ai:chat` 权限，通过 app-owned AI provider 配置调用 `ctx.ai.chat()`。
  - 生成的 README 增加 validate、package 和 submission rehearsal 命令。
  - minimal / network / storage / ai 四类 scaffold 均通过 `validate:plugin`。

- 新增 `scripts/create-plugin-author-rehearsal.js`：
  - 一命令生成 minimal、network、storage、AI-assisted 四种模板。
  - 验证每个 scaffold。
  - 将选中的 AI 模板打包为 `.openpet-plugin.zip`。
  - 对 zip 再跑 `validate:plugin`。
  - 生成 submission bundle，并用 `validate-plugin-submission-bundle --require-ready` 校验。
  - 输出作者 README、commands.json、submission checklist 和 summary JSON。
  - 对输出目录增加安全校验，拒绝清空根目录、home、项目根、项目父目录、项目顶层目录和项目/temp 之外的路径。
  - 生成的命令清单会对路径做 shell quote，避免 workspace 路径包含空格时误导作者。

- 新增测试：
  - `tests/scripts/create-openpet-plugin.test.js` 覆盖 AI 模板。
  - `tests/scripts/create-plugin-author-rehearsal.test.js` 覆盖完整作者演练。

- 归档当前演练证据：
  - `docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/`

## 当前演练结果

当前归档包含：

- `README.md`
- `commands.json`
- `submission-checklist.md`
- `plugin-author-rehearsal-summary.json`
- `scaffolded/` 下的四个模板插件
- `packages/openpet.plugin.author-ai.openpet-plugin.zip`
- `submission-bundle/` 下的 report、PR packet 和 summary

机器摘要显示：

- minimal scaffold validation: pass
- network scaffold validation: pass
- storage scaffold validation: pass
- AI-assisted scaffold validation: pass
- AI package validation: pass
- submission bundle validation: pass
- bundle decision: `ready-for-human-review`

## 验证

```bash
node --test tests/scripts/create-openpet-plugin.test.js tests/scripts/create-plugin-author-rehearsal.test.js
node --test tests/scripts/create-openpet-plugin.test.js tests/scripts/create-plugin-author-rehearsal.test.js tests/scripts/validate-plugin-submission-bundle.test.js tests/scripts/create-plugin-submission-bundle.test.js
npm run create-plugin-author-rehearsal -- --output-dir docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z --submission-template ai
```

完整验证和 production review 记录见：

- `docs/reviews/phase-44-plugin-author-experience-rehearsal-review.md`

## 后续约束

1. 不把 submission bundle 写成发布批准或签名信任。
2. 不让插件模板引导作者存储 API keys、tokens、passwords、cookies、private keys 或 credentials。
3. 若未来增加插件 secret 能力，必须先设计 main-process-only secret contract，再更新模板与文档。
