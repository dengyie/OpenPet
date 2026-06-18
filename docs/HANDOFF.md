# OpenPet Handoff

> Last updated: 2026-06-18 | Branch: `codex/phase100-community-source-intake-report`

## Current Snapshot

OpenPet is a desktop pet platform with:

- Electron pet window runtime,
- React + Vite Control Center,
- pet pack runtime with Codex pet import and zip import,
- bundled built-in packs `doro`, `duodong`, and `chispa`,
- AI chat with secret storage in the main process,
- AI behavior decisions with Control Center replay and redacted diagnostics,
- developer-first local extension docs with explicit `entries.setup` execution, language-neutral explicit `entries.commands` process execution, explicit command result feedback, explicit command bridge access, creator-tools action reads / validation / bounded writes, active installed user pack metadata workflows, package-local frame inspection/import, user-approved picker frame inspection/import for declaration-only commands, explicit dashboard opening, explicit service start/stop controls, explicit loopback service health checks, host-managed periodic service health policy for running services, best-effort service process-group cleanup, exit-confirmed setup/command/service stop semantics, bounded host-side force stop for stubborn services, host-owned process-tree fallback cleanup across service/setup/declaration-command stop paths, current-host plugin cleanup evidence collection, cleanup evidence helper generation, cleanup evidence runner archives, packaged-app plugin cleanup evidence runner archives, cleanup evidence archive manifests, structured plugin cleanup readiness reports with validation-first updates, plugin submission bundles, scaffold author rehearsal, maintainer approval rehearsal records, existing-plugin real-world submission rehearsal evidence, remote-source submission rehearsal evidence, community-source submission evidence tooling, and community-source candidate intake reporting,
- loopback-only local HTTP / MCP,
- and a TypeScript migration baseline covering shared IPC, Control Center view contracts, the Control Center API facade, Control Center hook state boundaries, Control Center pane prop surfaces, main-process Control Center adapters for service/catalog/plugin/pet pack/About/update/actions payloads, plugin extension entry contracts, plugin submission evidence contracts, plugin cleanup archive/runner contracts, packaged plugin cleanup evidence contracts, macOS release evidence summary/archive contracts, Windows smoke report/evidence summary/archive contracts, desktop picker smoke report contracts, desktop picker evidence summary/archive contracts, packaged runtime smoke report/evidence contracts, full release evidence archive / signed closure report contracts, and representative payload fixtures.

## Read First

1. [`docs/development-summary.md`](./development-summary.md)
2. [`docs/project-context.json`](./project-context.json)
3. [`docs/project-status-review.md`](./project-status-review.md)
4. [`docs/productization-v1.1-todo-design.md`](./productization-v1.1-todo-design.md)
5. [`docs/project-documentation-design.md`](./project-documentation-design.md)

## Facts To Preserve

- `PetService` remains the single source of truth for pet state.
- New user-facing configuration belongs in Control Center.
- API keys must stay out of the renderer.
- Extension docs must be honest: OpenPet now parses declarations, can explicitly run `entries.setup` for enabled policy-allowed local plugins, can run `entries.commands` through the JavaScript compatibility runner when `main` exists, can explicitly run declaration-only local `entries.commands` as short-lived processes with JSON stdin context, can inject short-lived bridge URL/token plus host-owned data/cache/log env vars for those declaration-only command runs, can expose bounded creator-tools action reads / validation / apply, active installed user pack metadata workflows, package-local frame inspection/import, and user-approved picker frame inspection/import through the same short-lived bridge, can explicitly open declared HTTP/HTTPS dashboards for enabled plugins, can explicitly start/stop declared local service entries, can manually check declared loopback service health endpoints, can host-manage periodic health checks for running services through Control Center, attempts best-effort process-group cleanup when stopping service entries, only reports setup/command/service stop completion after child exit confirmation, will attempt one bounded host-side force stop if the service ignores the grace-period stop request, now tries a host-owned process-tree fallback before direct child kill across service/setup/declaration-command stop paths, and can record/update/collect/run/archive bounded cleanup evidence through controlled host fixtures, generated collector helpers, runner transcripts, structured readiness reports, archive manifests, and validation-first report updates. Submission bundles can now also receive a separate structured maintainer approval record. Approval remains a human review decision and not signing trust, catalog publication, runtime safety, or release readiness proof. Command, setup, and service processes are spawned without shell expansion. Services do not auto-start, setup and command entries do not run during install or enable, background checks stay opt-in and runtime-bound, picker frame import and pack metadata workflows do not imply raw filesystem grants, raw file writes, plugin-selected output paths, built-in pack edits, arbitrary pack targeting, general pet-pack writes, or universal process-tree cleanup guarantees, and OpenPet does not claim complete sandboxing for arbitrary local processes.
- `cat_anime/` structure is unchanged.
- Windows is not release-ready yet.

## Useful Commands

```bash
npm start
npm run dev:control-center
npm test                     # 676/676 Node tests
npm run test:control-center
npm run typecheck
npm run check:syntax
npm run create-openpet-plugin -- "My Plugin" --template minimal --output-dir scratch/plugins
npm run create-plugin-author-rehearsal
npm run create-plugin-real-world-submission-rehearsal -- --source examples/plugins/weather-status --output-dir docs/release-evidence/plugin-real-world-submission-rehearsal/<session>
npm run create-plugin-remote-source-submission-rehearsal -- --archive-url https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main --plugin-path examples/plugins/weather-status --output-dir docs/release-evidence/plugin-remote-source-submission-rehearsal/<session>
npm run create-plugin-community-source-intake-report -- --archive-url <https-archive> --plugin-path <path-inside-archive> --community-source-url <public-source-url> --submitter "<submitter>" --output-dir docs/release-evidence/plugin-community-source-intake-report/<session>
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
- `docs/plugin-development.md`, `docs/plugin-ecosystem-rules.md`, and `docs/plugin-submission-workflow-playbook.md` for extension onboarding, maintainer approval rehearsal, remote-source rehearsal, community-source intake/evidence, and legacy SDK compatibility.
- `scripts/create-openpet-plugin.js`, `scripts/create-plugin-author-rehearsal.js`, `scripts/create-plugin-real-world-submission-rehearsal.js`, `scripts/create-plugin-remote-source-submission-rehearsal.js`, `scripts/create-plugin-community-source-intake-report.js`, `scripts/create-plugin-community-source-submission-evidence.js`, `scripts/create-plugin-maintainer-approval.js`, and `scripts/validate-plugin-maintainer-approval.js` for current compatibility starter templates, existing-plugin rehearsal, remote-source rehearsal, community-source intake/evidence, and reviewer-path rehearsal.

## Next Steps

1. Use the archived Phase 43 signed release closure report as the current release-claim gate: official desktop, macOS, and Windows release readiness remain `not-ready` until signed evidence and platform smoke reports are complete.
2. Use Phase 64 plugin command bridge as the current plugin-command boundary: command entries still run only from an explicit Control Center action on enabled policy-allowed local plugins, and declaration-only command runs now get a short-lived bridge URL/token for `pet.say`, `pet.action`, `pet.event`, and read-only context.
3. Use Phase 65 release evidence link closure as the current runtime/picker evidence boundary: packaged runtime reports must link the paired desktop picker report before they can claim readiness, and archive release readiness now fails when that link is missing or mismatched.
4. Use Phase 66 desktop picker evidence archive tooling when a packaged native picker run is collected: generate the summary, create the archive manifest, and only claim readiness when the filled report and archive both pass.
5. Use Phase 67 release picker archive link closure as the desktop picker archive boundary: release-level archive manifests and signed closure wording explicitly require the reviewed desktop picker archive manifest to match the archived picker report.
6. Use Phase 73 cleanup hardening plus Phase 72 service process-tree fallback, Phase 71 periodic health policy, Phase 70 setup/command cleanup parity, and Phase 69 plugin service force stop as the current extension cleanup/health boundary: setup, declaration-only command, and service stop requests now keep stop intent visible until child exit confirmation, setup and declaration-only commands now try host-owned process-tree cleanup before direct child kill fallback, only service entries add the bounded host-side force-stop path, and only running services can receive opt-in periodic health checks.
7. Use Phase 74 maintainer approval rehearsal as the current extension review-handoff boundary: author rehearsal stops at a ready-for-human-review submission bundle, maintainer approval is recorded as a separate Markdown/JSON artifact, and approval remains explicit human judgment rather than automated trust or publication.
8. Use Phase 101 plugin submission evidence contracts plus Phase 98 packaged plugin cleanup evidence contracts, Phase 97 Windows smoke report contracts, Phase 96 desktop picker smoke report contracts, Phase 95 packaged runtime evidence contracts, Phase 94 desktop picker evidence contracts, Phase 93 Windows smoke evidence contracts, Phase 92 macOS release evidence contracts, Phase 91 plugin cleanup evidence contracts, Phase 54 Release Evidence Contracts, and Phase 64 plugin entry/setup/command/dashboard/service contracts as the current TypeScript migration baseline.
9. Use Phase 75 real-world submission rehearsal as the current existing-plugin submission baseline: `examples/plugins/weather-status` now has an archived local package -> submission bundle -> maintainer approval evidence chain, but that archive still does not prove external community provenance, signing trust, catalog publication, runtime safety, or release readiness.
10. Use Phase 76 remote-source rehearsal as the current source-review baseline: `https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main` now has an archived HTTPS archive -> extracted plugin -> submission bundle -> maintainer approval evidence chain that records archive URL, final URL, archive SHA-256, archive size, selected plugin path, and extracted file hashes, but it still does not prove independent public community ownership, signing trust, catalog publication, runtime safety, or release readiness.
11. Use Phase 77 macOS release evidence capture as the current signed-evidence collection path: the helper can archive `macos-codesign.txt`, `macos-notarization.txt`, `macos-gatekeeper.txt`, and Markdown/JSON summaries, but official readiness remains false until real signed, notarized, Gatekeeper-accepted evidence is present.
12. Use Phase 78 macOS release evidence artifact upload as the current release-workflow evidence boundary: macOS release jobs upload `openpet-macos-release-evidence-<tag>` as a maintainer artifact, while public GitHub Release assets stay limited to install/update files.
13. Use Phase 79 macOS release evidence archive tooling as the current long-term artifact retention boundary: downloaded workflow evidence can be copied into a permanent archive with provenance and hashes, but it still does not prove official release readiness by itself.
14. Use Phase 80 creator-tools bridge as the current action-config authoring boundary: declaration-only creator-tools commands can declare `runtime` / `creator-tools` / `hybrid` profiles, receive host-owned data/cache/log directories, and read / validate / apply bounded action configuration updates through the short-lived bridge.
15. Use Phase 81 Windows smoke archive gate as the current release-evidence integrity boundary: release-level archive manifests and signed closure reports now require `windows-smoke-archive-manifest.json` to exist, validate, and match the archived Windows smoke report path and SHA-256 hash.
16. Use Phase 82 creator-tools asset inspection as the current read-only asset-authoring boundary: declaration-only creator-tools commands with `assets:inspect` can ask the host to inspect package-local action frame folders through the short-lived bridge.
17. Use Phase 83 creator-tools sprite import as the current generation boundary: declaration-only creator-tools commands with `assets:generate` can ask the host to import package-local action frame folders and regenerate sprites/action config with frame/pixel limits, while raw file writes, arbitrary folder access, plugin-selected output paths, pet-pack writes, and broader pack-authoring APIs remain future work.
18. Use Phase 84 creator-tools pack manifest workflow as the current pack-authoring metadata boundary: declaration-only creator-tools commands with `pack-manifest:read` / `pack-manifest:write` can read, validate, and apply active installed user pack manifest metadata through the host, while built-in pack edits, arbitrary pack targeting, action-field edits through this route, and general pet-pack writes remain future work.
19. Use Phase 85 creator-tools picker import as the current user-approved external asset boundary: declaration-only creator-tools commands with `assets:inspect` / `assets:generate` can ask the host to open a native folder picker and inspect/import the approved frame folder without receiving the selected path or raw filesystem grants.
20. Use Phase 86 plugin cleanup evidence as the current cleanup-evidence boundary: maintainers can run a controlled current-host cleanup fixture, archive JSON/Markdown evidence, create structured readiness reports, and validate those reports, while universal process-tree cleanup guarantees remain out of scope.
21. Use Phase 90 plugin cleanup evidence runner as the current cleanup-evidence execution boundary: maintainers can execute the conservative collector, archive stdout/stderr/run metadata, and create hash manifests while keeping cleanup readiness report-driven.
22. Use Phase 91 plugin cleanup evidence contracts as the current cleanup TypeScript boundary: cleanup archive manifests, collector transcripts, and runner results now have shared contracts and representative fixtures without changing runtime guarantees.
23. Use Phase 92 macOS release evidence contracts as the current signed-evidence TypeScript boundary: macOS evidence summaries and artifact archive manifests now have shared contracts and representative fixtures without changing readiness rules.
24. Use Phase 93 Windows smoke evidence contracts as the current Windows evidence TypeScript boundary: Windows smoke evidence summaries and archive manifests now have shared contracts and representative fixtures without changing readiness rules.
25. Use Phase 94 desktop picker evidence contracts as the current picker evidence TypeScript boundary: desktop picker evidence summaries and archive manifests now have shared contracts and representative fixtures without changing readiness rules.
26. Use Phase 95 packaged runtime evidence contracts as the current packaged runtime TypeScript boundary: packaged runtime smoke reports and runner evidence payloads now have shared contracts and representative fixtures without changing smoke readiness or picker-link rules.
27. Use Phase 96 desktop picker smoke report contracts as the current source picker-report TypeScript boundary: desktop picker smoke reports now have shared contracts and representative fixtures without changing smoke readiness rules.
28. Use Phase 97 Windows smoke report contracts as the current source Windows-report TypeScript boundary: Windows smoke reports now have shared contracts and representative fixtures without changing smoke readiness or signing rules.
29. Use Phase 98 packaged app plugin cleanup evidence as the current packaged cleanup evidence boundary: maintainers can launch a packaged OpenPet app session, drive setup / declaration-command / service cleanup flows through the real plugin services, map observed behavior into the existing cleanup report, and archive the result without claiming universal process-tree cleanup guarantees.
30. Use Phase 99 community-source submission evidence as the current community provenance boundary: maintainers can wrap a remote-source rehearsal with public source URL, submitter label, source relationship, and independence notes, while still keeping signing, publication, runtime safety, and release readiness claims out of scope.
31. Use Phase 100 community-source intake reporting as the current candidate-source triage boundary: maintainers can now archive a public candidate source and record whether it is a compatible OpenPet `plugin.json` package before attempting the Phase 99 evidence flow.
32. Use Phase 101 plugin submission evidence contracts as the current submission-evidence TypeScript boundary: submission bundles, maintainer approvals, existing-plugin rehearsals, remote-source rehearsals, and community-source evidence summaries now have shared contracts and representative fixtures without changing readiness or trust rules.
33. After Phase 101, continue from collecting real signed workflow artifacts, a real independent candidate-source intake session, then a compatible live community source run through the new evidence commands, or another high-drift service/report boundary.
