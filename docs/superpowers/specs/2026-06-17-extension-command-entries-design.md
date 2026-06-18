# Extension Command Entries Runtime Design

> Date: 2026-06-17
> Phase target: Phase 56

## Goal

Phase 56 turns the Phase 55 extension vocabulary into the first runtime-backed host capability: OpenPet accepts `plugin.json` packages that declare `entries.commands`, exposes those command entries through the existing plugin list and review surfaces, and lets enabled JavaScript compatibility packages run those command ids through the existing isolated SDK runner.

This phase does not start long-running services, execute arbitrary shell commands, host dashboards, or relax the current plugin runner boundary.

## Current State

OpenPet currently normalizes legacy plugin manifests with top-level `main`, `permissions`, `network`, and `commands`. Local JavaScript packages run through `src/main/plugins/local-plugin-runner.js`, which loads `main` and invokes command handlers registered by `activate(ctx)`.

Phase 55 updated the author-facing docs to describe a broader extension model with `entries.commands`, `entries.services`, and `entries.dashboards`. Runtime code does not yet understand that `entries` object.

## Scope

In scope:

- Normalize `entries.commands`, `entries.services`, and `entries.dashboards` in `src/main/plugins/manifest.js`.
- Treat `entries.commands` as the command list when legacy top-level `commands` is absent.
- Keep top-level `commands` as the compatibility source when present.
- Expose normalized `entries` in shared TypeScript contracts and plugin view state.
- Let existing local JavaScript packages with `main` and `entries.commands` run command ids through the current SDK runner.
- Add tests for normalization, service listing, runtime execution, and type fixtures.
- Update live docs and phase/review records.

Out of scope:

- Running `entries.commands[].command` as a shell command.
- Starting or stopping `entries.services`.
- Opening `entries.dashboards`.
- Adding new Control Center tabs or UI controls.
- Changing catalog trust, signature, or sandbox claims.

## Manifest Model

`entries` is optional. When present, each child list is normalized into stable view data:

```json
{
  "entries": {
    "commands": [
      {
        "id": "start",
        "title": "Start focus",
        "command": "node ./commands/start.js",
        "cwd": "."
      }
    ],
    "services": [
      {
        "id": "companion",
        "title": "Companion Service",
        "command": "npm run service:start",
        "cwd": ".",
        "health": {
          "type": "http",
          "url": "http://127.0.0.1:8787/health"
        }
      }
    ],
    "dashboards": [
      {
        "id": "main",
        "title": "Dashboard",
        "url": "http://127.0.0.1:8787"
      }
    ]
  }
}
```

For Phase 56, `command`, `cwd`, `health`, and `url` are declarations. They are visible to host surfaces and reviewers, but only command ids backed by the existing JavaScript `main` compatibility runner are executable.

## Compatibility Rules

If top-level `commands` exists, OpenPet keeps using it for `manifest.commands`. This preserves old packages and avoids changing review diffs.

If top-level `commands` is absent and `entries.commands` exists, OpenPet derives `manifest.commands` from `entries.commands`. This lets new extension-shaped packages appear and run through the existing SDK runner when their `main` implements the same command ids.

If both exist, both are normalized. Phase 56 does not merge them; top-level `commands` remains the compatibility command list.

## Safety Boundaries

This phase is deliberately conservative:

- No shell command execution is added.
- No long-running service process is started.
- No dashboard URL is opened automatically.
- Existing blocked-plugin, disabled-by-default, config-schema, private-storage, AI, network, and SDK permission behavior remains unchanged.
- Docs must not claim service/dashboard runtime support after this phase.

## Testing

Required checks:

- Manifest tests prove `entries.commands`, `entries.services`, and `entries.dashboards` normalize safely.
- Manifest tests reject unsafe entry ids and unsafe entry paths.
- Plugin service tests prove an extension-shaped local package with `main` + `entries.commands` is listed as runnable and can execute the command id through the current runner.
- Shared contract type fixtures include the `entries` view shape.
- Full verification remains `npm run check:syntax`, `npm run test:control-center`, `npm test`, and `git diff --check`.

## Acceptance

- `normalizePluginManifest()` returns a stable `entries` object.
- Existing legacy plugin manifests still return the same top-level `commands` shape.
- New extension-shaped JavaScript compatibility packages using `entries.commands` are visible in `listPlugins()` and can run through `runCommand()`.
- Service and dashboard declarations are visible as non-running declarations.
- Production review is recorded and addressed.
- Phase docs and live docs describe the exact runtime boundary without overclaiming.
