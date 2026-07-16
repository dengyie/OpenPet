# OpenPet Development Workflow

This is the canonical contributor workflow for OpenPet. Use
[the project README](../README.md) for the product overview,
[the documentation map](./README.md) for routing, and
[the active queue](./TODO.md) for the only active work queue.

## Prerequisites And Setup

Required local tools:

- Node.js 22.12.0 or newer;
- npm 9 or newer;
- macOS for the currently validated packaged desktop and native system-cursor
  paths.

Install dependencies once per worktree:

~~~bash
npm install
~~~

Common entrypoints:

~~~bash
npm start
npm run dev:control-center
npm run build:control-center
~~~

npm start builds the native cursor helper and Control Center before launching
Electron. The Control Center development server listens on
http://127.0.0.1:5173.

## Protected Main And Worktree Isolation

Treat the primary main worktree as protected. Development belongs in an
isolated worktree on a named feature branch.

Before editing, run:

~~~bash
pwd
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
git worktree list --porcelain
~~~

Stop before editing when the worktree is detached, is on main, has uncommitted
changes of unknown ownership, or is not the intended isolated worktree. Do not
clean, reset, remove, or repoint another contributor's branch or worktree.

Rebase a feature branch from inside its own worktree:

~~~bash
git rebase main
~~~

That command updates the current feature branch to use main as its base. Do not
switch the protected primary worktree away from main.

## Architecture Entry Points

- main.js assembles Electron lifecycle and injected services.
- src/main/bootstrap/ owns service and runtime construction.
- src/main/services/ contains the operating service layer.
- PetService is the single source of truth for pet state, actions, speech, and
  events.
- src/main/ipc.js and src/main/ipc/ expose bounded renderer-facing adapters.
- src/control-center/ contains the React + Vite configuration UI.
- src/main/plugins/ and plugin services own extension validation, permissions,
  process isolation, storage, and networking.
- src/main/pet-pack/ owns pet-pack schema, loading, and import.
- scripts/ owns release evidence, maintenance, and package tooling.

Preserve dependency direction: renderers call typed/preload APIs, IPC adapters
call services, and services own state and infrastructure behavior. Do not make
renderers a second source of truth or bypass PetService for pet mutations.

## Standard Change Workflow

1. Read the relevant implementation, call sites, types, configuration, tests,
   and active documentation.
2. Reproduce the defect or define the behavior with a focused failing test.
3. Run the test and confirm it fails for the intended reason.
4. Implement the smallest change at the owning layer.
5. Run the focused test until it passes.
6. Run the validation grade required by the change.
7. Inspect git diff, run git diff --check, and commit one coherent workstream.
8. Rebase onto the latest main before integration and rerun the required
   merge-time matrix.

Avoid unrelated refactors. Split responsibilities only when the current change
would otherwise deepen coupling, duplicate ownership, or leave a resource
lifecycle unclear.

## Validation Grades

Use the highest grade touched by a change.

### Grade A: Security, Persistence, Lifecycle, And Public Runtime

Examples include secrets, settings durability, IPC, plugin package/network
security, process lifecycle, request cancellation, and AI conversation state.

~~~bash
node --test <focused-test-files>
npm run test:core:all
npm test
npm run check:syntax
git diff --check
~~~

Also run the relevant manual acceptance when the behavior depends on the
desktop, OS integration, credentials, signing, or a real provider.

### Grade B: User-Facing Control Center And Runtime Integration

Examples include Control Center panes/hooks, adapters, provider flows, pet
interaction, and plugin management.

~~~bash
node --test <focused-test-files>
npm run test:core
npm run test:control-center
npm run check:syntax
git diff --check
~~~

### Grade C: Tooling, Contracts, And Documentation

Examples include release scripts, evidence parsers, shared contracts, active
documentation, and documentation governance.

~~~bash
node --test <focused-test-files>
npm run test:tools
npm run check:docs-drift
git diff --check
~~~

Run broader suites when a tooling or contract change is consumed by runtime
code.

## Area-Specific Workflows

### Core Runtime And Services

Mirror source paths under tests/main/, tests/services/, tests/plugins/,
tests/pet-pack/, or tests/shared/. Use npm run test:core during iteration and
npm run test:core:all before merging a user-facing runtime change.

### Control Center

Use npm run dev:control-center for local UI iteration. Keep user-facing
configuration in Control Center and use existing hooks, typed API facades, and
shared contracts. Run npm run test:control-center for UI regressions and
npm run check:syntax for the production build.

### Plugins

Read [plugin development](./plugin-development.md) and
[plugin ecosystem rules](./plugin-ecosystem-rules.md). Plugins must not receive
unrestricted Node/Electron access or renderer-visible provider credentials.
Use the existing manifest, permission, runner, bridge, storage, network,
lifecycle, and transaction boundaries.

### Pet Packs And Actions

Do not restructure cat_anime/. Add manual action frames under
cat_anime/flames/<action>/ and run npm run generate-sprites, or use the Control
Center import flow. Pet-pack changes belong under src/main/pet-pack/, the
pet-pack service, and mirrored tests.

### Release And Evidence Tooling

Use [the release checklist](./release-checklist.md) and
[the release evidence index](./release-evidence/README.md). Synthetic
rehearsals prove tooling and data flow only. They do not replace external
evidence or manual-required signing, notarization, real-device, provider, or
human acceptance.

## Security And Data Handling

- Keep API keys and provider credentials in main-process secret storage.
- Never expose credentials, raw prompts, private paths, tokens, or plugin
  payloads in renderer state, logs, fixtures, or evidence archives.
- Validate and bound plugin file, archive, process, bridge, and network inputs.
- Preserve timeout, cancellation, transaction, rollback, and cleanup semantics
  across every asynchronous stage.
- Keep extension safety wording conservative: permission-limited and isolated
  does not mean universally safe.

## Troubleshooting

- Dependency or Electron initialization errors: rerun npm install in the
  isolated worktree and retry the original command.
- Control Center browser failures: run npm run build:control-center, then the
  focused Playwright spec or npm run test:control-center.
- Type or build failures: run npm run typecheck before the full
  npm run check:syntax command.
- Native cursor helper failures: run npm run build:system-cursor and the
  focused system cursor service tests; macOS runtime acceptance remains
  separate.
- Documentation failures: run npm run check:docs-drift and the matching
  tests/docs/ or tests/scripts/check-docs-drift.test.js test. Fix the canonical
  live document rather than a historical phase record.

## Merge Readiness And Handoff

Before requesting integration:

- rebase the feature branch onto the latest main;
- confirm the worktree is clean and on the intended branch;
- run the required validation grade and any plan-specific full matrix;
- record commands, pass/fail counts, skipped tests, and manual checks honestly;
- update only the live documents whose current facts changed;
- leave external blockers open unless real evidence closes them;
- verify the protected primary worktree remains on main and unchanged.

## Canonical References

- Documentation map: [docs/README.md](./README.md)
- Active queue: [docs/TODO.md](./TODO.md)
- Maintainer handoff: [docs/HANDOFF.md](./HANDOFF.md)
- Test ownership: [docs/testing-strategy.md](./testing-strategy.md)
- Plugin authoring: [docs/plugin-development.md](./plugin-development.md)
- Release gates: [docs/release-checklist.md](./release-checklist.md)
- Machine-readable facts: [docs/project-context.json](./project-context.json)
