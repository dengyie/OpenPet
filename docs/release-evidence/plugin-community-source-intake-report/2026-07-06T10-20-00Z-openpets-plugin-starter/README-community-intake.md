# OpenPet Plugin Community-Source Intake Report

Generated: 2026-07-06T14:09:02.173Z

This intake report inspects a public candidate source before it enters the community-source submission evidence flow. It distinguishes compatible OpenPet packages from neighboring ecosystem repositories that only mention OpenPet/OpenPets.

## Candidate Source

- Source URL: https://github.com/alvinunreal/openpets-plugin-starter
- Submitter: alvinunreal/openpets-plugin-starter
- Status: incompatible-package-model
- Compatibility: Candidate archive is incompatible with the current OpenPet plugin model because it requires a package rooted by plugin.json.

## Archive Snapshot

- Archive URL: https://codeload.github.com/alvinunreal/openpets-plugin-starter/zip/refs/heads/main
- Final URL: https://codeload.github.com/alvinunreal/openpets-plugin-starter/zip/refs/heads/main
- Archive SHA-256: 4b1817db54b5ca2ce8965bc47ac616aa372f213a0ee192f11b1635db1c80a9f5
- Archive byte size: 6567
- Candidate plugin path: .
- Resolved archive plugin path: .
- Source plugin id: (none)

## Commands

```bash
curl -L --fail --output <archive.zip> 'https://codeload.github.com/alvinunreal/openpets-plugin-starter/zip/refs/heads/main'
unzip -qq <archive.zip> -d <extract-dir>
npm run validate:plugin -- <extract-dir>/'.'
npm run create-plugin-community-source-intake-report -- --archive-url 'https://codeload.github.com/alvinunreal/openpets-plugin-starter/zip/refs/heads/main' --plugin-path '.' --community-source-url 'https://github.com/alvinunreal/openpets-plugin-starter' --submitter 'alvinunreal/openpets-plugin-starter' --notes '2026-07-06 intake: public starter repo uses openpets.plugin.json at the archive root rather than the current OpenPet plugin.json package model.' --output-dir 'docs/release-evidence/plugin-community-source-intake-report/2026-07-06T10-20-00Z-openpets-plugin-starter'
Review the intake output. If status is ready-for-community-evidence, continue into Phase 99 with a separate submission-evidence archive:
npm run create-plugin-community-source-submission-evidence -- --archive-url 'https://codeload.github.com/alvinunreal/openpets-plugin-starter/zip/refs/heads/main' --plugin-path '.' --community-source-url 'https://github.com/alvinunreal/openpets-plugin-starter' --submitter 'alvinunreal/openpets-plugin-starter' --independence-notes '2026-07-06 intake: public starter repo uses openpets.plugin.json at the archive root rather than the current OpenPet plugin.json package model.' --output-dir docs/release-evidence/plugin-community-source-submission-evidence/<session>
```

## Boundary

- This does not prove community plugin compatibility beyond the recorded candidate path and archive snapshot.
- This does not prove community-source submission evidence by itself.
- This does not prove signing trust, catalog publication, runtime safety, or release readiness.
- If the candidate is compatible, run the Phase 99 command next.
- If the candidate is incompatible, keep the archive as evidence of the gap instead of forcing it through the submission flow.
