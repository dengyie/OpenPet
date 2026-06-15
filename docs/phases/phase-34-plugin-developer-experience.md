# Phase 34 开发文档：Plugin Developer Experience

> 阶段目标：把插件作者入口从分散说明收拢成清晰、可执行、和现有安全模型一致的开发文档体系。
> 范围约束：不改变插件运行时、安全边界、权限模型或安装流程；只整理作者文档、规则文档和 README 入口。

## 1. 背景

OpenPet 已经具备可运行的插件系统、示例插件、提交前校验、审核包和 workflow bundle 工具。但插件作者需要在 README、开发指南、示例插件、phase 记录和测试之间跳转，才能拼出完整契约。

本阶段把插件生态文档拆成两层：

- `docs/plugin-development.md`：面向作者的构建指南。
- `docs/plugin-ecosystem-rules.md`：面向作者和 reviewer 的硬规则与兼容契约。

## 2. 实现记录

- README 的插件开发入口增加 `plugin-ecosystem-rules.md` 链接。
- `docs/plugin-development.md` 增加 Ecosystem Guardrails 小节。
- 新增 `docs/plugin-ecosystem-rules.md`：
  - 插件目标与非目标。
  - package shape 和 `.openpet-plugin.zip` 优先格式。
  - 路径、symlink、权限、网络、secret、enablement 的硬边界。
  - runtime contract：短生命周期、command-style、JSON-serializable result。
  - SDK adaptation rules：`ctx.pet`、`ctx.storage`、`ctx.network`、`ctx.ai`、`ctx.commands`。
  - config、compatibility、submission、testing、review 和 maintainer evolution 规则。
- 新增设计记录 `docs/superpowers/specs/2026-06-16-plugin-developer-experience-design.md`。

## 3. Review 修复

Production review 指出 `network.allowlist` 文档写成 “hostnames only”，但当前 `normalizePluginManifest()` 实际支持公共 DNS host 加显式端口，例如 `cdn.example.com:8443`。

修复后文档统一为：

- 允许公共 DNS host。
- 允许必要时带显式端口。
- 不允许 scheme、path、query、credentials、localhost、私有 IP 或裸 IP。

现有 `tests/plugins/manifest.test.js` 已覆盖 `cdn.example.com:8443` 的正常化路径。

## 4. 验证

```bash
node --test tests/plugins/manifest.test.js
git diff --check
```

结果：

- `tests/plugins/manifest.test.js` 通过，8/8。
- `git diff --check` 通过。

## 5. 剩余风险

- 本阶段只整理文档，不新增插件模板脚手架。
- `plugin-ecosystem-rules.md` 需要在未来新增权限、secret store、后台任务或 marketplace 能力时同步更新。
