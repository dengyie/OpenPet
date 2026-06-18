# Phase 102: Plugin Community-Source Intake Evidence

> Date: 2026-06-18
> Scope: archive a real public third-party candidate-source intake session using the Phase 100 intake tooling.

## Goal

Phase 100 added the compatibility-first intake command. Phase 102 uses that command against a real public adjacent ecosystem source so the project has evidence that maintainers can record a candidate without overstating compatibility.

## Evidence Source

- Community source URL: `https://github.com/alvinunreal/openpets`
- Archive URL: `https://codeload.github.com/alvinunreal/openpets/zip/refs/heads/main`
- Candidate path: `plugins/official`
- Submitter label: `alvinunreal/openpets`
- Output directory: `docs/release-evidence/plugin-community-source-intake-report/2026-06-18T23-30-00Z-openpets-official/`

## Decision Record

### Decision 1: archive an incompatible adjacent ecosystem instead of waiting for a green-path source

- Problem: the next documented gap after Phase 101 was a real independent candidate-source intake session.
- Choice: run Phase 100 intake against a public OpenPets repository and preserve the result even though it is not a current OpenPet `plugin.json` package.
- Reason: this proves the intake workflow can record real public provenance and reject neighboring package models without forcing them into Phase 99.
- Risk: this still does not provide a compatible live third-party OpenPet plugin submission; docs must keep that as the next evidence gap.

### Decision 2: stop at intake and do not run Phase 99 for this candidate

- Problem: Phase 99 assumes a compatible package snapshot ready for submission evidence.
- Choice: do not route this candidate into Phase 99 because the intake verdict is `incompatible-package-model`.
- Reason: forcing it through the submission chain would overstate ecosystem compatibility.
- Risk: maintainers still need to find or receive a compatible public `plugin.json` package for a green-path community-source evidence run.

### Decision 3: keep intake reproduction commands separate from Phase 99 follow-up commands

- Problem: the first generated intake command log preserved the conditional Phase 99 command, but did not preserve the exact Phase 100 intake command that created this archive.
- Choice: update the intake report generator so `community-intake-commands.json` records the intake command first, then lists Phase 99 as a separate conditional follow-up with its own submission-evidence output path.
- Reason: the archive should be reproducible as an intake artifact without implying that incompatible candidates should be routed into Phase 99 or that Phase 99 output belongs in the intake directory.
- Risk: older Phase 100 archives may still have the older command wording; this Phase 102 archive is regenerated with the corrected format.

## Result

The intake report produced:

- `status`: `incompatible-package-model`
- `reasonCode`: `plugin-json-missing`
- archive SHA-256: `5bcc008ab18d5ae7868cb958e021d11a43dd243b66e0b923ab07ae951ebe8b26`
- archive byte size: `32840811`
- resolved archive plugin path: `openpets-main/plugins/official`
- extracted file hash count: `100`

The checklist intentionally leaves "Candidate is ready for Phase 99 evidence flow" unchecked.

## Validation

Commands run:

```bash
npm run create-plugin-community-source-intake-report -- --archive-url https://codeload.github.com/alvinunreal/openpets/zip/refs/heads/main --plugin-path plugins/official --community-source-url https://github.com/alvinunreal/openpets --submitter "alvinunreal/openpets" --notes "Public adjacent OpenPets ecosystem candidate inspected after Phase 100. The selected plugins/official path is expected to prove candidate-source intake behavior without claiming OpenPet plugin.json compatibility unless validation confirms it." --output-dir docs/release-evidence/plugin-community-source-intake-report/2026-06-18T23-30-00Z-openpets-official
node -e 'const fs=require("fs"); const p="docs/release-evidence/plugin-community-source-intake-report/2026-06-18T23-30-00Z-openpets-official/plugin-community-source-intake-report-summary.json"; const v=JSON.parse(fs.readFileSync(p,"utf8")); console.log(JSON.stringify({status:v.status, reasonCode:v.compatibility.reasonCode, summary:v.compatibility.summary, archiveSha256:v.archive.archiveSha256, archiveByteSize:v.archive.archiveByteSize, archivePluginPath:v.archive.archivePluginPath, fileCount:Object.keys(v.archive.extractedFileHashes||{}).length, plugin:v.plugin}, null, 2));'
node --test tests/scripts/create-plugin-community-source-intake-report.test.js
```

Final verification before commit:

```bash
npm run check:syntax
# pass: node syntax checks, typecheck, Control Center production build

npm test
# pass: 676/676

npm run test:control-center
# pass: 10/10

npm run typecheck
# pass

git diff --check
# pass

node -e "JSON.parse(require('node:fs').readFileSync('docs/project-context.json','utf8')); JSON.parse(require('node:fs').readFileSync('docs/release-evidence/plugin-community-source-intake-report/2026-06-18T23-30-00Z-openpets-official/plugin-community-source-intake-report-summary.json','utf8')); JSON.parse(require('node:fs').readFileSync('docs/release-evidence/plugin-community-source-intake-report/2026-06-18T23-30-00Z-openpets-official/community-source-intake.json','utf8')); JSON.parse(require('node:fs').readFileSync('docs/release-evidence/plugin-community-source-intake-report/2026-06-18T23-30-00Z-openpets-official/community-intake-commands.json','utf8')); console.log('json ok')"
# json ok
```

## Outcome

OpenPet now has a real public candidate-source intake archive. It demonstrates the maintainer workflow is evidence-preserving and conservative: adjacent public ecosystems can be recorded as real candidates without being misrepresented as compatible OpenPet plugin submissions.
