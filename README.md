<div align="center">

# OpenPet

An Electron desktop pet platform with a visual Control Center, AI chat, plugins, pet packs, and local agent APIs.

[![Tests](https://img.shields.io/badge/tests-core%20%2B%20ui-success)](./tests)
[![Build](https://img.shields.io/badge/build-passing-success)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.1--rc.3-blue.svg)](./package.json)

[English](./README.md) | [简体中文](./README.zh-CN.md)

</div>

OpenPet puts a small animated pet on your desktop and gives it a real platform behind the scenes. The pet can walk, speak, play actions, switch character packs, react to AI replies, and grow through a developer-first local extension ecosystem.

The current delivery target is a demo. The repository contains an Electron Shell, a forked Backend sidecar, a React Control Center, bundled pet packs, OpenAI-compatible AI settings, local extension runtime controls, loopback-only automation APIs, and release evidence tooling. Native/window services remain under `src/main/`, while migrated management and long-running work lives under `services/backend/`.

The current demo release track is macOS-first. macOS and Windows packages use unsigned or locally self-signed builds; the project will not purchase Apple Developer ID, notarization, Windows publisher certificates, or third-party signing services. Self-signing does not establish Gatekeeper approval, SmartScreen reputation, or publisher trust. Target-platform runtime smoke remains useful for checking demo flows.

Remote Backend deployment is documented in [docs/deployment/openpet-mesh-backend.md](docs/deployment/openpet-mesh-backend.md). The Guangzhou service is loopback-only over the existing EasyTier `ssh gz-cvm` alias; macOS and Windows development builds use self-signed artifacts.

## What You Get

- Transparent desktop pet window with drag, walking, actions, and speech bubbles.
- React + Vite Control Center for Pet, Actions, AI, Plugins, Catalog, Service, and About settings, including compact narrow-window layouts.
- Pet pack runtime with legacy cat support, folder import, `.codex-pet.zip` import, and native `pet.json` + `spritesheet.webp` Codex pet atlases.
- Three bundled built-in pets: `doro`, `duodong`, and `chispa`.
- OpenAI-compatible chat and image-provider configuration with API keys kept in the main process secret store.
- Creator Studio workflows for prompt planning, image-backed atlas generation, frame repair, approval, dashboard review, and pet/action import.
- Developer-first local extension model with current legacy SDK compatibility, explicit command/dashboard/service controls, creator-tools action, pack-manifest, package-local asset, user-approved picker asset bridges, cleanup evidence tooling, validation, logs, catalog install, and uninstall flow.
- Optional loopback-only HTTP and MCP endpoints for local tools and agents.
- Gradual TypeScript migration baseline covering shared contracts and the Control Center API facade.

## Quick Start

Requirements:

- Node.js 22.12.0 or newer
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
npm run test:core            # Core Node runtime regression suite
npm run test:core:all        # Core Node suite + Control Center Playwright suite
npm run test:tools           # Release/tooling Node tests
npm test                     # Full Node test suite
npm run test:control-center  # Playwright UI regression suite
npm run typecheck            # TypeScript no-emit check
npm run check:syntax         # Node syntax + typecheck + Control Center build
npm run build:contracts      # Build @openpet/contracts before API contract checks
npm run check:api-contract   # 140 IPC accounting and current REST route reconciliation (120/119)
npm run check:channel-retirement
npm run check:docs-drift
npm run pack                 # electron-builder directory package
npm run dist                 # macOS DMG/ZIP on macOS
```

## Project Shape

OpenPet is split into a small pet renderer, an Electron Shell, a forked Backend sidecar, and an embedded Control Center.

```text
main.js + src/main/bootstrap/
  Electron Shell composition root and lifecycle

apps/desktop/src/sidecar/
  Backend spawn, readiness, restart, settings hydration, and reverse bridge

services/backend/
  HTTP router/middleware, domains, Jobs, SQLite repositories, SSE, and Shell bridge

packages/contracts/
  TypeScript/Zod bridge, settings, Job, event, and response contracts

src/main/services/
  Active Shell/native services and migration-era services still called by main.js

src/control-center/
  React + Vite UI embedded in Electron (current Control Center location)

src/main/pet-pack/
  Shell-side pet.json schema, loader, importer, and native asset operations
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

OpenPet uses one third-party package model: an extension. The package manifest is still named `plugin.json` for compatibility. The host now normalizes and inspects extension declarations for `entries.setup`, `entries.commands`, `entries.services`, `entries.dashboards`, `manifest`, `config`, and `assets`; JavaScript compatibility packages can expose `entries.commands` through the existing runner, and declaration-only local extensions can run short-lived `entries.commands` as explicit user actions with JSON stdin context and a short-lived bridge for `pet.say`, `pet.action`, `pet.event`, bounded context reads, creator-tools action reads/writes, active installed pack manifest metadata workflows, package-local frame inspection/import, and user-approved picker frame inspection/import. Enabled plugins can explicitly run declared setup entries, open declared HTTP/HTTPS dashboards, start or stop declared service entries, manually check declared loopback service health endpoints, and enable host-managed periodic checks for already-running services from Control Center. Command, setup, and service processes are spawned without shell expansion, services do not auto-start, and setup and commands do not run during install or enable. Arbitrary shell consoles, arbitrary file writes, raw filesystem grants, general pet-pack writes, and hard process-tree guarantees remain future runtime work.

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
- [docs/README.md](./docs/README.md) - documentation map and reading order.
- [docs/TODO.md](./docs/TODO.md) - single active maintainer work queue.
- [docs/HANDOFF.md](./docs/HANDOFF.md) - current maintainer snapshot, guardrails, and priorities.
- [docs/plugin-ecosystem-rules.md](./docs/plugin-ecosystem-rules.md) - extension ecosystem boundary, lifecycle rules, and third-party author guidance.
- [docs/project-context.json](./docs/project-context.json) - compact machine-readable project context.

Use `docs/README.md` instead of browsing every file under `docs/`; historical phase, roadmap, and review records are retained as audit history, while active planning now lives in `docs/TODO.md`.

## Validation Baseline

Current release-candidate baseline:

```bash
npm run check:syntax         # Node syntax + typecheck + Control Center build
npm run test:core            # core Node runtime regression suite
npm run test:tools           # release, evidence, scaffold, and maintenance tooling tests
npm test                     # full Node native test suite
npm run test:control-center  # Playwright UI regression baseline
npm run typecheck            # TypeScript no-emit checks
```

## License

MIT. See [LICENSE](./LICENSE).
