# OpenPet Development Workflow

This guide is the current maintainer entry point for running, validating, and packaging OpenPet locally. Keep detailed test ownership in [`testing-strategy.md`](./testing-strategy.md) and release gates in [`release-checklist.md`](./release-checklist.md).

## Daily Run

```bash
npm start
```

`npm start` builds the Control Center and launches Electron. It is the default path for local product checks because it exercises the main process, pet window, Control Center bundle, and service wiring together.

## Common Workflows

| Need | Command | Notes |
| --- | --- | --- |
| Launch the desktop app | `npm start` | Best default for local smoke checks and demos. |
| Work on Control Center UI | `npm run dev:control-center` | Starts Vite at `http://127.0.0.1:5173`; run Electron separately when needed. |
| Validate core runtime changes | `npm run test:core` | Main-process, service, renderer, pet-pack, plugin, shared contract, and light Control Center tests. |
| Validate release/tooling changes | `npm run test:tools` | Release evidence, plugin submission, scaffold, and maintenance tooling tests. |
| Run all Node tests | `npm test` | Use before release prep or broad refactors. |
| Validate syntax, types, and UI build | `npm run check:syntax` | Runs Node syntax checks, TypeScript no-emit checks, and Control Center production build. |
| Run UI regression baseline | `npm run test:control-center` | Uses Playwright. Set `OPENPET_CONTROL_CENTER_PORT=<free-port>` when 5173 is occupied. |
| Build an unpacked desktop app | `npm run pack` | Useful before manual packaged-app checks. |

## Control Center Development

Use the Vite dev server when working only on the embedded React UI:

```bash
npm run dev:control-center
```

If port `5173` is already in use, either stop the existing process or set a port-specific environment variable for tests:

```bash
OPENPET_CONTROL_CENTER_PORT=5175 npm run test:control-center
```

For production-shape UI verification, prefer:

```bash
npm run build:control-center
```

## Service And Main-Process Work

Changes under `main.js`, `src/main/`, `src/shared/`, plugin runtime, pet-pack runtime, or release evidence tooling usually need at least:

```bash
npm run check:syntax
npm run test:core
```

Use the narrower command first while iterating, then broaden to `npm test` before handing off.

## Release Prep

Before preparing a tag or GitHub Release, run:

```bash
npm run check:syntax
npm test
npm run test:control-center
```

For local UI tests, use a clean port when another project is already listening on the default Vite port:

```bash
OPENPET_CONTROL_CENTER_PORT=5175 npm run test:control-center
```

Packaging checks:

```bash
npm run pack
```

Release-specific smoke evidence and signing gates are documented in [`desktop-release-design.md`](./desktop-release-design.md), [`release-checklist.md`](./release-checklist.md), and [`release-notes/`](./release-notes/).

## Troubleshooting

If startup or UI build state looks stale:

```bash
rm -rf dist/control-center node_modules/.vite
npm start
```

If a local port is occupied:

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

Stop only processes you own. If the process belongs to another project, use an alternate port for OpenPet tests instead of killing it.

