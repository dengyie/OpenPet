# OpenPet Plugin Community-Source Intake Report

Generated: 2026-07-06T14:09:02.260Z

This intake report inspects a public candidate source before it enters the community-source submission evidence flow. It distinguishes compatible OpenPet packages from neighboring ecosystem repositories that only mention OpenPet/OpenPets.

## Candidate Source

- Source URL: https://github.com/alvinunreal/opencode-pets
- Submitter: alvinunreal/opencode-pets
- Status: incompatible-package-model
- Compatibility: Candidate archive is incompatible with the current OpenPet plugin model because it requires a package rooted by plugin.json.

## Archive Snapshot

- Archive URL: https://codeload.github.com/alvinunreal/opencode-pets/zip/refs/heads/master
- Final URL: https://codeload.github.com/alvinunreal/opencode-pets/zip/refs/heads/master
- Archive SHA-256: 3532a32749a39e261c7ac7923146e5c0b2d864fc871c5f1573ecb93717f4c3f4
- Archive byte size: 1464222
- Candidate plugin path: .
- Resolved archive plugin path: .
- Source plugin id: (none)

## Commands

```bash
curl -L --fail --output <archive.zip> 'https://codeload.github.com/alvinunreal/opencode-pets/zip/refs/heads/master'
unzip -qq <archive.zip> -d <extract-dir>
npm run validate:plugin -- <extract-dir>/'.'
npm run create-plugin-community-source-intake-report -- --archive-url 'https://codeload.github.com/alvinunreal/opencode-pets/zip/refs/heads/master' --plugin-path '.' --community-source-url 'https://github.com/alvinunreal/opencode-pets' --submitter 'alvinunreal/opencode-pets' --notes '2026-07-06 intake: public OpenCode-adjacent repo exposes installer/template sources but no current OpenPet plugin.json package root.' --output-dir 'docs/release-evidence/plugin-community-source-intake-report/2026-07-06T10-30-00Z-opencode-pets'
Review the intake output. If status is ready-for-community-evidence, continue into Phase 99 with a separate submission-evidence archive:
npm run create-plugin-community-source-submission-evidence -- --archive-url 'https://codeload.github.com/alvinunreal/opencode-pets/zip/refs/heads/master' --plugin-path '.' --community-source-url 'https://github.com/alvinunreal/opencode-pets' --submitter 'alvinunreal/opencode-pets' --independence-notes '2026-07-06 intake: public OpenCode-adjacent repo exposes installer/template sources but no current OpenPet plugin.json package root.' --output-dir docs/release-evidence/plugin-community-source-submission-evidence/<session>
```

## Boundary

- This does not prove community plugin compatibility beyond the recorded candidate path and archive snapshot.
- This does not prove community-source submission evidence by itself.
- This does not prove signing trust, catalog publication, runtime safety, or release readiness.
- If the candidate is compatible, run the Phase 99 command next.
- If the candidate is incompatible, keep the archive as evidence of the gap instead of forcing it through the submission flow.
