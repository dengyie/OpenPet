<div align="center">

# OpenPet

An Electron desktop pet platform with a visual Control Center, AI chat, plugins, pet packs, and local agent APIs.

[![Tests](https://img.shields.io/badge/tests-394%20node%20%2B%2010%20ui-success)](./tests)
[![Build](https://img.shields.io/badge/build-passing-success)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.1--rc.2-blue.svg)](./package.json)

[English](./README.md) | [简体中文](./README.zh-CN.md)

</div>

OpenPet puts a small animated pet on your desktop and gives it a real platform behind the scenes. The pet can walk, speak, play actions, switch character packs, react to AI replies, and be extended through a permission-limited plugin system.

The current release track is macOS-first. Windows build and validation tooling exists, but Windows is not advertised as release-ready until signed installer evidence and real smoke reports are archived.

## What You Get

- Transparent desktop pet window with drag, walking, actions, and speech bubbles.
- React + Vite Control Center for Pet, Actions, AI, Plugins, Catalog, Service, and About settings.
- Pet pack runtime with legacy cat support, folder import, `.codex-pet.zip` import, and native `pet.json` + `spritesheet.webp` Codex pet atlases.
- Three bundled built-in pets: `doro`, `duodong`, and `chispa`.
- OpenAI-compatible chat with API keys kept in the main process secret store.
- Plugin SDK with permission review, isolated execution, private storage, network allowlists, catalog install, and blocklist checks.
- Optional loopback-only HTTP and MCP endpoints for local tools and agents.
- Gradual TypeScript migration baseline with `npm run typecheck` included in syntax checks.

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
- API keys never go to the renderer or ordinary plugins.
- Third-party plugins do not get unrestricted Node or Electron access.
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

## Plugin Development

Start with the tested examples:

- [Focus Timer](./examples/plugins/focus-timer/) for storage and pet speech.
- [Weather Status](./examples/plugins/weather-status/) for network allowlists.
- [RSS Reader](./examples/plugins/rss-reader/) for public feed fetching and cached announcements.

Minimal plugin shape:

```text
my-plugin/
  plugin.json
  config.schema.json   # optional
  index.js
```

Before submitting a plugin:

```bash
npm run validate:plugin -- <plugin-dir-or-zip>
npm run create-plugin-submission-bundle -- <plugin-dir-or-zip> --output-dir plugin-submission-bundle
npm run validate-plugin-submission-bundle -- plugin-submission-bundle --require-ready
```

Read [plugin-development.md](./docs/plugin-development.md) and [plugin-submission-workflow-playbook.md](./docs/plugin-submission-workflow-playbook.md) for the full path.
Plugin authors should also read [plugin-ecosystem-rules.md](./docs/plugin-ecosystem-rules.md) for the hard compatibility and review rules.

## Documentation

- [CHANGELOG.md](./CHANGELOG.md) - release notes.
- [docs/development-summary.md](./docs/development-summary.md) - current engineering summary.
- [docs/HANDOFF.md](./docs/HANDOFF.md) - maintainer handoff.
- [docs/plugin-ecosystem-rules.md](./docs/plugin-ecosystem-rules.md) - plugin author contract, compatibility rules, and review guardrails.
- [docs/project-context.json](./docs/project-context.json) - compact machine-readable project context.
- [docs/project-documentation-design.md](./docs/project-documentation-design.md) - documentation rules and support-claim policy.
- [docs/desktop-release-design.md](./docs/desktop-release-design.md) and [docs/release-checklist.md](./docs/release-checklist.md) - desktop release evidence gates.
- [docs/phases/](./docs/phases/) and [docs/reviews/](./docs/reviews/) - historical phase records.

## Validation Baseline

Current local baseline:

```bash
npm test                     # 394/394 Node tests
npm run test:control-center  # 10/10 Playwright tests
npm run typecheck            # TypeScript no-emit checks
npm run check:syntax         # syntax + typecheck + Control Center build
```

## License

MIT. See [LICENSE](./LICENSE).
