# Production Code Quality Review：Phase 3 插件生态产品化

> Review date：2026-06-12  
> Scope：`PluginInstallService`、插件 manifest 安全字段、插件安装 IPC/preload、Control Center Plugins 安装审查 UI、沙箱评估文档、service tests。

## 1. Findings

No blocking findings after fixes.

## 2. Issues Found And Fixed During Review

- `PluginInstallService.installSelection()` originally allowed the source directory to be the already installed target directory. Because `copyDirectory()` removes the target before copying, selecting the installed plugin directory for update could delete the plugin before copy. Fixed by comparing source and target realpaths before removal and rejecting same-directory updates.
- Signature hash metadata was initially treated as verified when it covered only `plugin.json`. That could label a package as verified while leaving executable files such as `index.js` outside the signed hash set. Fixed by requiring `signature.json.files` to cover every non-`signature.json` package file and by rejecting install/update when signature hash errors are present.
- UI uninstall flow exposed service support for preserving storage but did not let users choose removal. Fixed with a second confirmation for deleting private storage.

## 3. Review Notes

- Plugin installation and plugin execution are now separated: `PluginInstallService` owns inspect/install/update/uninstall, while `PluginService` continues to own discovery, enablement, runtime SDK, command execution, logs, config, storage, AI and network calls.
- Package inspection validates plugin id and command id safe names through `normalizePluginManifest()`, rejects unknown permissions, validates HTTPS public DNS network allowlists, requires `main`, checks optional `configSchema`, rejects symlinks, and blocks unsafe zip entries before extraction.
- Install/update copies into `userData/plugins/<plugin-id>` and writes settings metadata with `enabled[pluginId] = false`, so newly installed or updated third-party plugins require explicit user enablement.
- Update review compares permissions and network allowlist against the currently installed manifest, not renderer state.
- Control Center review shows install/update mode, permission diff, network diff, signature status, signer, package hash, file count, size, and commands before install/update.
- Installed plugin list now surfaces stored signature status from `settings.plugins.installed`, so the review result remains visible after restart.
- Uninstall removes only the target plugin directory and config/enablement metadata; private storage is preserved unless the user chooses removal.

## 4. Residual Risk

- Signature support is hash metadata verification, not a full certificate trust chain or public-key verification. The UI and docs explicitly describe this as metadata verification.
- Zip extraction currently relies on the platform `unzip` command. This is acceptable for the current macOS Electron target but should be revisited if Windows/Linux distribution becomes a goal.
- The install flow does not yet download catalog entries or enforce a blocklist; those are Phase 7 concerns.
- Frontend behavior is covered by Vite build rather than browser automation because this project does not yet have a frontend test harness.

## 5. Verification

- `npm test` passed：133/133.
- `npm run check:syntax` passed.
- New tests cover unsigned install, signature hash verification, partial signature rejection, permission/network diff on update, same-directory update protection, uninstall with and without storage deletion, and unsafe zip traversal rejection.

## 6. Recommendation

Safe to merge with the residual follow-ups above.
