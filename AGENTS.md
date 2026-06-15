# Project Instructions

This is an Electron desktop pet platform.

## Architecture

The project has evolved from a single-window pet app into a multi-layer platform:

- **Main process** (`main.js`): assembles and injects all services, manages lifecycle
- **Service layer** (`src/main/services/`): EventBus → SettingsService → ActionService → PetService → AiService / PluginService / LocalHttpService
- **PetService is the single source of truth** for pet state — all say/action/event operations go through it
- **Control Center** (`src/control-center/`): React + Vite web app embedded in Electron BrowserWindow, with Pet / Actions / AI / Plugins / Catalog / Service / About tabs
- **Plugin system** (`src/main/plugins/`): permission-whitelisted SDK, official plugins validated, local third-party plugins run in an isolated Node permission-model runner
- **Pet pack runtime** (`src/main/pet-pack/`): manifest schema, loader, importer
- **Local HTTP API** (`src/main/services/local-http-service.js`): loopback only, off by default

## Development

- Use `npm start` to build the Control Center and launch Electron
- Use `npm run dev:control-center` for Control Center hot-reload at http://127.0.0.1:5173
- Use `npm test` to run all Node tests — currently 275 tests using Node native test runner
- Use `npm run test:control-center` to run the Control Center Playwright UI regression baseline
- Use `npm run generate-sprites` to regenerate sprite sheets from `cat_anime/flames/`
- Use `npm run check:syntax` for JS syntax validation
- Do not commit `node_modules/`, `dist/`, build output, or temporary OS files

## Adding new pet actions

New pet actions can be added in two ways:

1. **Manual:** create a folder under `cat_anime/flames/` with ordered image frames, then run `npm run generate-sprites`
2. **UI:** through Control Center → Actions → Import frame folder

The app discovers action folders automatically. No code changes are needed for new actions.

Each action folder should contain an ordered image sequence with alpha channels, for example `01_no_bg.png` through `24_no_bg.png`.

## Adding tests

- Use Node native test runner: `const { test } = require('node:test')`
- Use `const assert = require('node:assert')` for assertions
- Place test files under `tests/` mirroring the source structure
- Use Playwright specs under `tests/control-center/` for Control Center UI regression coverage
- Run `npm test` to verify

## Key constraints

- `npm start` must remain functional at every stage
- Do not modify the existing `cat_anime/` material structure
- Plugins must not have unrestricted Node/Electron access
- API keys must never be exposed to the renderer or ordinary plugins
- All new configuration must be operable through the Control Center UI
- Do not revert uncommitted changes made by others
