# Phase 38 开发文档：Plugin Secrets Decision and Scaffolding

> 阶段目标：明确 OpenPet 目前不支持插件级 secrets，并把插件作者路径收敛成可生成、可验证、可提交的脚手架。
> 范围约束：本阶段不引入插件 secret store，不让 API key 进入普通插件配置，不改变插件 runner 的权限边界。

## 1. 背景

Phase 37 已把 release evidence archive manifest 工具链收口，但插件生态继续往前走时，必须先把“插件配置里能不能放 secret”这件事说清楚。当前主进程已经有 AI secret store，但那是应用内部的主进程能力，不是给插件作者的 secret 存储。若继续让插件示例和文档给出含糊口径，后续作者很容易把 API key、token 或 password 当作普通配置保存。

Phase 38 的目标不是增加更强权限，而是做一个明确的产品决策：插件配置只能承载公开、可审查、可复制的值；secret-like 字段必须被 validator 拒绝，并在文档和脚手架里明确说明。

## 2. 实现记录

- 新增 `src/main/plugins/config-schema.js`：
  - 抽出共享 plugin config schema 规范化逻辑。
  - 对 `string` / `number` / `boolean` config fields 进行统一校验。
  - 拒绝看起来像 secret 的字段名、标题、描述、`password` 风格 metadata 或 `writeOnly` 标记。
- 更新 `src/main/services/plugin-service.js`：
  - 运行时读取 local plugin config schema 时复用共享校验。
  - 插件 config 继续保留为 Control Center 可编辑的普通设置。
- 更新 `src/main/services/plugin-install-service.js`：
  - 安装/审查时复用同一套 config schema 校验，避免 validator 和 runtime 分叉。
- 新增 `scripts/create-openpet-plugin.js`：
  - 生成 `minimal` / `network` / `storage` 三类插件脚手架。
  - 默认输出公开配置示例，明确禁止插件级 secrets。
  - 生成 `plugin.json`、`config.schema.json`、`index.js`、`README.md`。
- 新增 `npm` script：
  - `create-openpet-plugin`
- 更新插件开发文档：
  - `docs/plugin-development.md`
  - `docs/plugin-ecosystem-rules.md`
  - `docs/plugin-submission-workflow-playbook.md`

## 3. Secret Policy

OpenPet 当前的插件 policy 是：

- 插件配置不是 secret store。
- `apiKey`、`accessToken`、`authToken`、`password`、`credential`、`privateKey` 一类字段不允许出现在插件 config schema 中。
- `writeOnly` / `password` 风格 metadata 不允许用来伪装 secret 存储。
- 如果作者需要私密凭证，必须留在应用主进程或以后单独设计的受限能力里，不得通过普通插件配置传递。

## 4. Scaffold Contract

`create-openpet-plugin` 生成的模板默认满足以下规则：

- `minimal`：只做 pet say + public message config。
- `network`：只使用 allowlisted HTTPS host 和公开请求路径，不包含 token 输入。
- `storage`：只演示普通计数器状态，不包含任何 secret 字段。
- 每个模板都生成 README，提醒作者不要在插件 config、storage 或 headers 里放秘密。

## 5. 验证

```bash
node --test tests/plugins/manifest.test.js
node --test tests/scripts/validate-plugin-package.test.js
node --test tests/scripts/create-openpet-plugin.test.js
npm test
npm run check:syntax
```

## 6. Review 结论

- 插件 secrets 口径被显式收紧为“不支持普通插件级 secret 存储”。
- validator、install review、runtime config schema 使用同一份共享校验逻辑，避免文档与执行分叉。
- 脚手架提供了三个能直接上手的模板，但不为 secret 用法开后门。

## 7. 后续工作

1. 评估是否需要 Phase 39 的 sandbox 再审视。
2. 继续补齐插件 submission workflow 的文档和示例。
3. 如果未来引入受限 secret capability，必须先完成单独的产品决策和主进程权限设计。
