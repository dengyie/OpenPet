# OpenPet Plugin Community-Source Intake Report

Generated: 2026-06-18T10:32:03.879Z

This intake report inspects a public candidate source before it enters the community-source submission evidence flow. It distinguishes compatible OpenPet packages from neighboring ecosystem repositories that only mention OpenPet/OpenPets.

## Candidate Source

- Source URL: https://github.com/alvinunreal/openpets
- Submitter: alvinunreal/openpets
- Status: incompatible-package-model
- Compatibility: Candidate archive is incompatible with the current OpenPet plugin model because it requires a package rooted by plugin.json.

## Archive Snapshot

- Archive URL: https://codeload.github.com/alvinunreal/openpets/zip/refs/heads/main
- Final URL: https://codeload.github.com/alvinunreal/openpets/zip/refs/heads/main
- Archive SHA-256: 5bcc008ab18d5ae7868cb958e021d11a43dd243b66e0b923ab07ae951ebe8b26
- Archive byte size: 32840811
- Candidate plugin path: plugins/official
- Resolved archive plugin path: openpets-main/plugins/official
- Source plugin id: (none)

## Commands

```bash
curl -L --fail --output <archive.zip> 'https://codeload.github.com/alvinunreal/openpets/zip/refs/heads/main'
unzip -qq <archive.zip> -d <extract-dir>
npm run validate:plugin -- <extract-dir>/'plugins/official'
npm run create-plugin-community-source-intake-report -- --archive-url 'https://codeload.github.com/alvinunreal/openpets/zip/refs/heads/main' --plugin-path 'plugins/official' --community-source-url 'https://github.com/alvinunreal/openpets' --submitter 'alvinunreal/openpets' --notes 'Public adjacent OpenPets ecosystem candidate inspected after Phase 100. The selected plugins/official path is expected to prove candidate-source intake behavior without claiming OpenPet plugin.json compatibility unless validation confirms it.' --output-dir '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-community-source-intake-report/2026-06-18T23-30-00Z-openpets-official'
Review the intake output. If status is ready-for-community-evidence, continue into Phase 99 with a separate submission-evidence archive:
npm run create-plugin-community-source-submission-evidence -- --archive-url 'https://codeload.github.com/alvinunreal/openpets/zip/refs/heads/main' --plugin-path 'plugins/official' --community-source-url 'https://github.com/alvinunreal/openpets' --submitter 'alvinunreal/openpets' --independence-notes 'Public adjacent OpenPets ecosystem candidate inspected after Phase 100. The selected plugins/official path is expected to prove candidate-source intake behavior without claiming OpenPet plugin.json compatibility unless validation confirms it.' --output-dir docs/release-evidence/plugin-community-source-submission-evidence/<session>
```

## Boundary

- This does not prove community plugin compatibility beyond the recorded candidate path and archive snapshot.
- This does not prove community-source submission evidence by itself.
- This does not prove signing trust, catalog publication, runtime safety, or release readiness.
- If the candidate is compatible, run the Phase 99 command next.
- If the candidate is incompatible, keep the archive as evidence of the gap instead of forcing it through the submission flow.
