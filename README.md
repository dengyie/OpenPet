<div align="center">

# OpenPet

An Electron desktop pet platform with a visual Control Center, AI chat, plugins, pet packs, and local agent APIs.

[![Tests](https://img.shields.io/badge/tests-434%20node%20%2B%2010%20ui-success)](./tests)
[![Build](https://img.shields.io/badge/build-passing-success)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.1--rc.2-blue.svg)](./package.json)

[English](./README.md) | [简体中文](./README.zh-CN.md)

</div>

OpenPet puts a small animated pet on your desktop and gives it a real platform behind the scenes. The pet can walk, speak, play actions, switch character packs, react to AI replies, and grow through a developer-first local extension ecosystem.

The current release track is macOS-first. Windows build and validation tooling exists, but Windows is not advertised as release-ready until signed installer evidence and real smoke reports are archived.

## What You Get

- Transparent desktop pet window with drag, walking, actions, and speech bubbles.
- React + Vite Control Center for Pet, Actions, AI, Plugins, Catalog, Service, and About settings.
- Pet pack runtime with legacy cat support, folder import, `.codex-pet.zip` import, and native `pet.json` + `spritesheet.webp` Codex pet atlases.
- Three bundled built-in pets: `doro`, `duodong`, and `chispa`.
- OpenAI-compatible chat with API keys kept in the main process secret store.
- Developer-first local extension model with current legacy SDK compatibility, explicit command/dashboard/service controls, validation, logs, catalog install, and uninstall flow.
- Optional loopback-only HTTP and MCP endpoints for local tools and agents.
- Gradual TypeScript migration baseline covering shared contracts and the Control Center API facade.

## Quick Start

Requirements:

- Node.js 18 or newer
- npm 9 or newer
- macOS for the currently validated packaged app path

```bash
git clone https://github.com/dengyie/OpenPet.git
cd OpenPet
npm install
npm start
```

Useful commands:

```bash
npm start                    # Build Control Center and launch Electron
npm run dev:control-center   # Control Center hot reload at http://127.0.0.1:5173
npm test                     # Node test suite
npm run test:control-center  # Playwright UI regression suite
npm run typecheck            # TypeScript no-emit check
npm run check:syntax         # Node syntax + typecheck + Control Center build
npm run pack                 # electron-builder directory package
npm run dist                 # macOS DMG/ZIP on macOS
```

## Project Shape

OpenPet is split into a small pet renderer, an Electron main process, and an embedded Control Center.

```text
main.js
  assembles services and Electron lifecycle

src/main/services/
  EventBus -> SettingsService -> ActionService -> PetService
                                      |-> AiService
                                      |-> PluginService
                                      |-> LocalHttpService / MCP

src/control-center/
  React + Vite UI embedded in Electron

src/main/pet-pack/
  pet.json schema, loader, importer, Codex atlas adapter
```

Important project rules:

- `PetService` is the single source of truth for pet state.
- User-facing configuration belongs in Control Center, not manual JSON edits.
- API keys never go to the renderer.
- Third-party extensions are local software: OpenPet should show what they declare and manage lifecycle/logs/uninstall, without claiming a complete sandbox for arbitrary local processes.
- The existing `cat_anime/` material structure is kept intact.

## Pet Packs

OpenPet supports:

- Built-in legacy cat assets from `cat_anime/`.
- User-imported action frame folders.
- OpenPet pet packs with `pet.json`.
- Codex-compatible pet directories containing `pet.json` and `spritesheet.webp`.
- Codex pet zip packages.
- Built-in read-only packs under `assets/pet-packs/`.

To add a new action manually, put ordered transparent frames under `cat_anime/flames/<action>/` and run:

```bash
npm run generate-sprites
```

For normal use, import pet packs from Control Center -> Actions -> Pet Packs.

## Extension Development

OpenPet uses one third-party package model: an extension. The package manifest is still named `plugin.json` for compatibility. The host now normalizes and inspects extension declarations for `entries.commands`, `entries.services`, `entries.dashboards`, `manifest`, `config`, and `assets`; JavaScript compatibility packages can expose `entries.commands` through the existing runner. Enabled plugins can explicitly open declared HTTP/HTTPS dashboards and start or stop declared service entries from Control Center. Services do not auto-start, commands are spawned without shell expansion, and setup, health checks, bridge flows, and general shell command execution remain future runtime work.

Current legacy SDK examples are still useful while the host runtime catches up:

- [Focus Timer](./examples/plugins/focus-timer/) for storage and pet speech.
- [Weather Status](./examples/plugins/weather-status/) for legacy network allowlists.
- [RSS Reader](./examples/plugins/rss-reader/) for public feed fetching and cached announcements.

Target extension shape:

```text
my-extension/
  plugin.json
  config.schema.json   # optional
  commands/
  service/
  web/
  assets/
```

Current validation and submission tooling still uses the historical "plugin" command name:

```bash
npm run validate:plugin -- <plugin-dir-or-zip>
npm run create-plugin-submission-bundle -- <plugin-dir-or-zip> --output-dir plugin-submission-bundle
npm run validate-plugin-submission-bundle -- plugin-submission-bundle --require-ready
```

Read [plugin-development.md](./docs/plugin-development.md) and [plugin-submission-workflow-playbook.md](./docs/plugin-submission-workflow-playbook.md) for the full path.
Extension authors should also read [plugin-ecosystem-rules.md](./docs/plugin-ecosystem-rules.md) for lifecycle, transparency, compatibility, and honest safety boundaries.

## Documentation

- [CHANGELOG.md](./CHANGELOG.md) - release notes.
- [docs/development-summary.md](./docs/development-summary.md) - current engineering summary.
- [docs/HANDOFF.md](./docs/HANDOFF.md) - maintainer handoff.
- [docs/plugin-ecosystem-rules.md](./docs/plugin-ecosystem-rules.md) - extension ecosystem boundary, lifecycle rules, and third-party author guidance.
- [docs/project-context.json](./docs/project-context.json) - compact machine-readable project context.
- [docs/project-documentation-design.md](./docs/project-documentation-design.md) - documentation rules and support-claim policy.
- [docs/desktop-release-design.md](./docs/desktop-release-design.md) and [docs/release-checklist.md](./docs/release-checklist.md) - desktop release evidence gates.
- [docs/phases/](./docs/phases/) and [docs/reviews/](./docs/reviews/) - historical phase records.

## Validation Baseline

Current local baseline:

```bash
npm test                     # 434/434 Node tests
npm run test:control-center  # 10/10 Playwright tests
npm run typecheck            # TypeScript no-emit checks
npm run check:syntax         # syntax + typecheck + Control Center build
```

## License

MIT. See [LICENSE](./LICENSE).
