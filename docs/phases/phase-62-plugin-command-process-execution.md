# Phase 62: Plugin Command Process Execution

> Date: 2026-06-17
> Branch: `codex/plugin-command-process-execution`
> Status: completed locally

## Goal

Let enabled, policy-allowed local extensions run declared `entries.commands` from an explicit user action without requiring a legacy JavaScript `main` file.

## What Changed

- `PluginService.runCommand()` now keeps official and JavaScript compatibility commands on their existing SDK runner path.
- Declaration-only local `entries.commands` now run as short-lived child processes from explicit command actions.
- Command processes:
  - require the plugin to be enabled and policy-allowed;
  - resolve cwd inside the plugin directory and reject escaping paths or symlinks;
  - spawn with `shell: false`;
  - receive stdin JSON with `pluginId`, `commandId`, `payload`, `config`, and `paths.extensionDir`;
  - log stdout/stderr snippets;
  - parse the final stdout JSON line into a typed command result when possible;
  - reject non-zero exits, duplicate concurrent runs, unknown command ids, non-JSON payloads before spawn, and stalled commands.
- Control Center command buttons now respect plugin block status in addition to enabled/running state.
- Shared contracts now include `PluginCommandRunResultViewState`.

## Boundaries Preserved

- Commands do not run during install, update, enable, setup, service start, or health checks.
- This is not an arbitrary shell console.
- No bridge token injection was added.
- API keys remain out of renderer and plugin command contexts.
- Command process cleanup is timeout/direct-child best effort, not a hard process-tree guarantee.
- OpenPet still does not claim complete sandboxing for arbitrary local processes.

## Tests

```bash
node --test tests/services/plugin-service.test.js
# 78/78 pass

node --test tests/main/ipc-plugin-install.test.js
# 16/16 pass

npm run typecheck
# pass

npm run test:control-center
# 10/10 pass
```

Full verification before commit:

```bash
npm run check:syntax
# pass

npm test
# 465/465 pass

npm run test:control-center
# 10/10 pass

git diff --check
# pass

node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); console.log('project-context ok')"
# project-context ok
```

## Next

The next extension phase should likely focus on one of:

- bridge integration for pet actions/dialog/personality changes;
- richer command result UX in Control Center;
- community extension rehearsal with command-entry examples;
- hard process-tree cleanup guarantees where the host can honestly support them.
