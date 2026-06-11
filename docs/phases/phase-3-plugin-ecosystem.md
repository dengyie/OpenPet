# Phase 3 开发文档：插件生态产品化

> 阶段目标：把已有插件运行时升级为可安装、可审查、可更新、可卸载的插件生态基础。  
> 范围约束：插件运行仍通过 `PluginService` 和隔离 runner；新增安装能力必须默认安全、默认停用、所有操作通过 Control Center。

## 1. 背景

当前项目已经具备：

- 插件 manifest 权限白名单与本地插件扫描。
- 本地插件短生命周期子进程 runner、Node permission model、VM context、受限 SDK。
- 插件 `storage`、`ai:chat`、`network` 能力与配额/allowlist。
- Control Center Plugins 页启停、配置、运行命令、日志与私有存储清理。

缺口是用户无法安全安装或更新第三方插件包：没有安装前 review、没有签名/hash 状态、没有权限 diff、没有卸载流。

## 2. 本阶段交付

### 2.1 安装服务

新增 `src/main/services/plugin-install-service.js`：

- `inspectPluginPackage(sourcePath)`：支持插件目录和 `.ibot-plugin.zip`，校验 `plugin.json`、`main`、`configSchema`、权限、网络 allowlist、symlink 和路径穿越。
- `installPlugin(selectionId)`：复制插件到 `userData/plugins/<plugin-id>`，默认 disabled。
- `updatePlugin(selectionId)`：对比已安装插件的权限和网络 host，更新后默认 disabled。
- `uninstallPlugin(pluginId, options)`：删除插件文件和配置，可选择删除私有 storage。
- `clearPendingSelection(selectionId)`：清理待安装选择。

### 2.2 包格式与签名

第一版包格式：

```text
my-plugin.ibot-plugin.zip
├── plugin.json
├── index.js
├── config.schema.json
├── signature.json
└── assets/
```

`signature.json` 第一版只做本地 hash metadata 校验，不宣称完整证书链信任：

```json
{
  "algorithm": "sha256",
  "signer": "ibot-labs",
  "value": "signature-value",
  "manifestSha256": "...",
  "files": {
    "plugin.json": "...",
    "index.js": "..."
  }
}
```

未签名插件允许安装，但必须显示 unsigned 风险状态。

### 2.3 IPC / Control Center

新增插件安装 IPC：

- `plugins:inspect-package`
- `plugins:clear-selection`
- `plugins:install`
- `plugins:update`
- `plugins:uninstall`

Plugins 页新增安装 review 面板：

- 插件名称、版本、安装/更新模式。
- 权限 diff：新增、移除、保留。
- 网络 allowlist diff。
- 签名状态、signer、错误。
- package hash、文件数、体积。
- 本地插件卸载按钮。

## 3. 安全与兼容规则

- 插件 id、command id 必须是 safe id。
- zip entry 不能是绝对路径、不能包含 `..`、不能包含反斜杠或 NUL。
- 插件目录和解压后目录不能包含 symlink。
- `main` 和 `configSchema` 必须位于插件目录内。
- `network.allowlist` 只允许 HTTPS public DNS host。
- 安装和更新后插件默认 disabled，用户需要在 review 后手动启用。
- 卸载插件不能影响其他插件 storage。

## 4. 验收

- 未签名插件可安装但显示风险标识。
- 带 `signature.json` 的插件 hash metadata 校验通过。
- 更新时新增权限或网络 host 会出现在 diff 中，更新后插件 disabled。
- 无效 zip、路径穿越、未知权限、非 HTTPS allowlist 被拒绝。
- 插件卸载不会影响其他插件 storage。
- `npm test` 通过。
- `npm run check:syntax` 通过。

## 5. Production Code Quality Review 关注点

- 安装和运行职责是否分离，避免 runner service 继续膨胀。
- zip/目录导入是否存在路径穿越、symlink、realpath 绕过。
- 更新权限 diff 是否基于已安装 manifest，而不是 UI 自己推断。
- 安装/更新默认 disabled 是否落到 settings。
- 卸载是否只删除目标插件，并保留或按选项删除 storage。
