# OpenPet Handoff

> Last updated: 2026-06-28 | Branch: `codex/plugin-command-runtime-split`

## Current Snapshot

OpenPet is a desktop pet platform with:

- Electron pet window runtime with optional grounded movement and home-anchor roaming controls,
- React + Vite Control Center,
- pet pack runtime with Codex pet import and zip import,
- bundled built-in packs `doro`, `duodong`, and `chispa`,
- AI chat with secret storage in the main process, active/draft provider settings, separate save/test connection checks, structured provider diagnostics, grouped model-settings UI with preset-driven drafts and discovered-model apply actions, pet-pack AI Talk persona/history/memory, desktop chat, and host-owned image-generation model settings for Creator Studio,
- AI behavior decisions with Control Center replay and redacted diagnostics,
- developer-first local extension docs with explicit `entries.setup` execution, language-neutral explicit `entries.commands` process execution, explicit command result feedback, explicit command bridge access, creator-tools action reads / validation / bounded writes, active installed user pack metadata workflows, package-local frame inspection/import, user-approved picker frame inspection/import for declaration-only commands, reviewed action trigger proposal acceptance, explicit dashboard opening, explicit service start/stop controls, explicit loopback service health checks, host-managed periodic service health policy for running services, best-effort service process-group cleanup, exit-confirmed setup/command/service stop semantics, bounded host-side force stop for stubborn services, host-owned process-tree fallback cleanup across service/setup/declaration-command stop paths, current-host plugin cleanup evidence collection, cleanup evidence helper generation, cleanup evidence runner archives, packaged-app plugin cleanup evidence runner archives, cleanup evidence archive manifests, structured plugin cleanup readiness reports with validation-first updates, plugin submission bundles, scaffold author rehearsal, maintainer approval rehearsal records, existing-plugin real-world submission rehearsal evidence, remote-source submission rehearsal evidence, community-source submission evidence tooling, community-source candidate discovery reporting, community-source invitation kits, community-source candidate intake reporting, and compatible-intake-to-submission bridge tooling,
- loopback-only local HTTP / MCP,
- and a TypeScript migration baseline covering shared IPC, Control Center view contracts, the Control Center API facade, Control Center hook state boundaries, Control Center pane prop surfaces, main-process Control Center adapters for service/catalog/plugin/pet pack/About/update/actions payloads, plugin extension entry contracts, plugin submission evidence contracts, community-source invitation evidence contracts, plugin cleanup archive/runner contracts, packaged plugin cleanup evidence contracts, macOS release evidence summary/archive contracts, Windows smoke report/evidence summary/archive contracts, desktop picker smoke report contracts, desktop picker evidence summary/archive contracts, packaged runtime smoke report/evidence contracts, full release evidence archive / signed closure report contracts, and representative payload fixtures.

## Read First

1. [`docs/development-summary.md`](./development-summary.md)
2. [`docs/project-context.json`](./project-context.json)
3. [`docs/project-status-review.md`](./project-status-review.md)
4. [`docs/openpet-current-todo-architecture.md`](./openpet-current-todo-architecture.md)
5. [`docs/productization-v1.1-todo-design.md`](./productization-v1.1-todo-design.md)
6. [`docs/project-documentation-design.md`](./project-documentation-design.md)

## Facts To Preserve

- `PetService` remains the single source of truth for pet state.
- Pet grounded/home behavior remains host-owned movement policy, configured from Control Center rather than pet packs or AI rules.
- New user-facing configuration belongs in Control Center.
- API keys must stay out of the renderer.
- AI chat provider settings use a draft/active split. Saving and testing must go through main-process `AiService`, return sanitized structured diagnostics, and must not expose API keys, Authorization headers, prompts, or credentialed Base URLs to renderer/plugin contexts.
- Image generation for Creator Studio is host-owned at the provider boundary. Control Center now uses one OpenAI-compatible image model-settings flow with presets, discovered-model suggestions, timeout/concurrency controls, and main-process API key storage; `ImageGenerationModelService` still owns provider calls and output writes, and Creator Studio consumes host-mediated outputs instead of receiving provider credentials. Ordinary extensions must not expect OpenPet-managed chat/image provider API keys or secret-bearing provider config to be injected into plugin config, renderer state, environment variables, or bridge payloads.
- Action trigger proposals remain review inputs, not plugin-owned mutations. The host can now apply `click` proposals to `clickAction`, acknowledge `manual`/`unbound`, and persist reviewed `random` / `state` / `event` rules through the Actions pane's host-owned condition editor.
- AI Talk diagnostics are now partially user-visible in Control Center: memory cards expose `reason`, `useCount`, and `lastUsedAt`, recent memory jobs render as a list, and users can export redacted AI Talk traces without exposing prompts, secrets, or raw filtered memory text.
- `PluginService` has reached an architecture checkpoint: high-risk logic is split into dedicated controllers, and the remaining service code should now be treated as orchestration unless a new independent risk cluster appears. See `docs/plugin-service-architecture-checkpoint.md`.
- Extension docs must be honest: OpenPet now parses declarations, can explicitly run `entries.setup` for enabled policy-allowed local plugins, can run `entries.commands` through the JavaScript compatibility runner when `main` exists, can explicitly run declaration-only local `entries.commands` as short-lived processes with JSON stdin context, can inject short-lived bridge URL/token plus host-owned data/cache/log env vars for those declaration-only command runs, can expose bounded creator-tools action reads / validation / apply, active installed user pack metadata workflows, package-local frame inspection/import, and user-approved picker frame inspection/import through the same short-lived bridge, can explicitly open declared HTTP/HTTPS dashboards for enabled plugins, can explicitly start/stop declared local service entries, can manually check declared loopback service health endpoints, can host-manage periodic health checks for running services through Control Center, attempts best-effort process-group cleanup when stopping service entries, only reports setup/command/service stop completion after child exit confirmation, will attempt one bounded host-side force stop if the service ignores the grace-period stop request, now tries a host-owned process-tree fallback before direct child kill across service/setup/declaration-command stop paths, and can record/update/collect/run/archive bounded cleanup evidence through controlled host fixtures, generated collector helpers, runner transcripts, structured readiness reports, archive manifests, and validation-first report updates. Submission bundles can now also receive a separate structured maintainer approval record. Approval remains a human review decision and not signing trust, catalog publication, runtime safety, or release readiness proof. Command, setup, and service processes are spawned without shell expansion. Services do not auto-start, setup and command entries do not run during install or enable, background checks stay opt-in and runtime-bound, picker frame import and pack metadata workflows do not imply raw filesystem grants, raw file writes, plugin-selected output paths, built-in pack edits, arbitrary pack targeting, general pet-pack writes, or universal process-tree cleanup guarantees, and OpenPet does not claim complete sandboxing for arbitrary local processes.
- `cat_anime/` structure is unchanged.
- Windows is not release-ready yet.

## Useful Commands

```bash
npm start
npm run dev:control-center
npm test
npm run test:control-center
npm run typecheck
npm run check:syntax
node --test tests/services/ai-service.test.js tests/services/action-service.test.js tests/main/control-center-adapters.test.js tests/main/ipc-plugin-install.test.js
npm run test:control-center -- --grep "AI config|applies an action trigger proposal|loads the app shell"
npm run create-openpet-plugin -- "My Plugin" --template minimal --output-dir scratch/plugins
npm run create-plugin-author-rehearsal
npm run create-plugin-real-world-submission-rehearsal -- --source examples/plugins/weather-status --output-dir docs/release-evidence/plugin-real-world-submission-rehearsal/<session>
npm run create-plugin-remote-source-submission-rehearsal -- --archive-url https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main --plugin-path examples/plugins/weather-status --output-dir docs/release-evidence/plugin-remote-source-submission-rehearsal/<session>
npm run create-plugin-community-source-discovery-report -- --search-results '<json-array>' --candidates '<json-array>' --output-dir docs/release-evidence/plugin-community-source-discovery-report/<session>
npm run create-plugin-community-source-invitation-kit -- --target-author "OpenPet-compatible extension authors" --target-url https://github.com/dengyie/OpenPet --candidate-context "Phase 104 discovery currently has no compatible public plugin.json source." --requested-capabilities "weather pet-action pet-dialogue pet-personality creator-tools" --output-dir docs/release-evidence/plugin-community-source-invitation-kit/<session>
npm run create-plugin-community-source-intake-report -- --archive-url <https-archive> --plugin-path <path-inside-archive> --community-source-url <public-source-url> --submitter "<submitter>" --output-dir docs/release-evidence/plugin-community-source-intake-report/<session>
npm run create-plugin-community-source-evidence-from-intake -- --intake-summary docs/release-evidence/plugin-community-source-intake-report/<session>/plugin-community-source-intake-report-summary.json --source-relation independent-third-party --independence-notes "..." --output-dir docs/release-evidence/plugin-community-source-submission-evidence/<session>
npm run create-plugin-community-source-submission-evidence -- --archive-url <https-archive> --plugin-path <path-inside-archive> --community-source-url <public-source-url> --submitter "<submitter>" --source-relation independent-third-party --independence-notes "..." --output-dir docs/release-evidence/plugin-community-source-submission-evidence/<session>
npm run create-plugin-maintainer-approval -- <submission-bundle-dir> --reviewer "OpenPet Maintainer" --decision approved --notes "..."
npm run validate-plugin-maintainer-approval -- <submission-bundle-dir> --require-approved
npm run create-plugin-cleanup-evidence -- --output-dir docs/release-evidence/plugin-cleanup-evidence/<session>
npm run create-plugin-cleanup-evidence-report -- --output docs/release-evidence/plugin-cleanup-evidence/<session>/plugin-cleanup-evidence-report.json
npm run create-plugin-cleanup-evidence-collector -- docs/release-evidence/plugin-cleanup-evidence/<session>/plugin-cleanup-evidence-report.json
npm run run-plugin-cleanup-evidence-collector -- --archive-dir docs/release-evidence/plugin-cleanup-evidence/<session>
npm run run-packaged-plugin-cleanup-evidence -- --app release/mac-arm64/OpenPet.app --plugin-source tests/fixtures/plugins/cleanup-evidence-fixture --archive-dir docs/release-evidence/plugin-cleanup-evidence/<session>
npm run create-plugin-cleanup-evidence-archive-manifest -- --archive-dir docs/release-evidence/plugin-cleanup-evidence/<session>
npm run update-plugin-cleanup-evidence-report -- docs/release-evidence/plugin-cleanup-evidence/<session>/plugin-cleanup-evidence-report.json --check service-exit-confirmed-stop --status pass --evidence-file evidence/service-stop.txt
npm run update-packaged-plugin-cleanup-evidence-report -- docs/release-evidence/plugin-cleanup-evidence/<session>/plugin-cleanup-evidence-report.json --runtime-artifact docs/release-evidence/plugin-cleanup-evidence/<session>/packaged-plugin-cleanup-runtime.json
npm run validate-plugin-cleanup-evidence-report -- docs/release-evidence/plugin-cleanup-evidence/<session>/plugin-cleanup-evidence-report.json --allow-pending
npm run create-packaged-runtime-smoke-report
npm run create-packaged-runtime-smoke-runbook
npm run run-packaged-runtime-smoke
npm run validate-packaged-runtime-smoke-report
npm run create-windows-smoke-archive-manifest
npm run create-desktop-picker-evidence-summary
npm run create-desktop-picker-archive-manifest
npm run create-release-evidence-archive-manifest
npm run create-signed-release-closure-report
npm run create-macos-release-evidence -- --app release/mac/OpenPet.app --notarization-text "<notarytool accepted output>" --output-dir docs/release-evidence/macos-release-evidence/<session>
npm run create-macos-release-evidence-archive -- --artifact-dir <downloaded-openpet-macos-release-evidence-tag> --archive-dir docs/release-evidence/macos-release-evidence-archive/<session>
```

## Where To Look For Detail

- `docs/README.md` for the documentation map and reading order.
- `docs/plugin-service-architecture-checkpoint.md` for the current plugin host service boundary and split-stop rationale.
- `docs/openpet-current-todo-architecture.md` for the current TODO map grouped by runtime/service boundary.
- `docs/phases/` for phase records.
- `docs/reviews/` for phase review notes.
- `docs/project-status-review.md` for longer evaluation.
- `docs/productization-v1.1-todo-design.md` for the Phase 38+ execution design.
- `docs/project-review-todo-design.md` for the consolidated whole-project review TODO design.
- `docs/productization-todo-design.md` for the prioritized TODO implementation design.
- `docs/desktop-release-design.md` for desktop release evidence.
- `docs/plugin-sandbox-evaluation.md` for current plugin runner guarantees, limits, and v1.1 recommendation.
- `scripts/run-packaged-runtime-smoke.js`, `scripts/create-packaged-runtime-smoke-report.js`, and `scripts/validate-packaged-runtime-smoke-report.js` for packaged app runtime evidence.
- `scripts/create-desktop-picker-evidence-summary.js` and `scripts/create-desktop-picker-archive-manifest.js` for reviewed native picker evidence archive summaries and manifests.
- `scripts/create-release-evidence-archive-manifest.js` and `scripts/create-signed-release-closure-report.js` for release-level evidence archive validation and release-claim closure.
- `scripts/create-macos-release-evidence.js`, `scripts/create-macos-release-evidence-archive.js`, and `.github/workflows/release.yml` for canonical macOS codesign/notarization/Gatekeeper evidence capture, Actions artifact upload, and permanent evidence artifact archiving before release-level archive aggregation.
- `docs/plugin-development.md`, `docs/plugin-ecosystem-rules.md`, and `docs/plugin-submission-workflow-playbook.md` for extension onboarding, maintainer approval rehearsal, remote-source rehearsal, community-source discovery/invitation/intake/evidence, and legacy SDK compatibility.
- `docs/ai-provider-settings-ux-design.md` for the implemented AI provider draft/active save/test workflow, structured diagnostics, and security boundaries.
- `docs/superpowers/specs/2026-06-19-openpet-model-settings-backlog.md` for the older model-settings backlog and remaining post-polish model UI/bridge work.
- `docs/superpowers/specs/2026-06-19-creator-studio-conversational-generation-todo.md` for Creator Studio conversational generation, custom action tasks, and trigger proposal boundaries.
- `scripts/create-openpet-plugin.js`, `scripts/create-plugin-author-rehearsal.js`, `scripts/create-plugin-real-world-submission-rehearsal.js`, `scripts/create-plugin-remote-source-submission-rehearsal.js`, `scripts/create-plugin-community-source-discovery-report.js`, `scripts/create-plugin-community-source-invitation-kit.js`, `scripts/create-plugin-community-source-intake-report.js`, `scripts/create-plugin-community-source-evidence-from-intake.js`, `scripts/create-plugin-community-source-submission-evidence.js`, `scripts/create-plugin-maintainer-approval.js`, and `scripts/validate-plugin-maintainer-approval.js` for current compatibility starter templates, existing-plugin rehearsal, remote-source rehearsal, community-source discovery/invitation/intake/evidence, and reviewer-path rehearsal.

## Next Steps

1. Keep release wording conservative until real signed macOS evidence, real Windows smoke evidence, and reviewed desktop picker archives are all linked into the release archive and signed closure flow.
2. Treat `docs/openpet-current-todo-architecture.md` as the live engineering queue; update this handoff only with current facts and short next-step guidance.
3. Preserve the current plugin host architecture checkpoint: new `PluginService` extraction work needs a fresh independent risk cluster, not just a long file.
4. Preserve the current Creator Studio/host boundary: plugin owns prompts, task/workflow state, QA, and dashboard guidance; the host owns secrets, provider calls, writes, imports, and final trigger persistence.
