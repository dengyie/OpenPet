# OpenPet Plugin Remote-Source Submission Rehearsal

Generated: 2026-06-17T17:33:39.420Z

This rehearsal starts from a public HTTPS archive, records remote-source provenance, packages the selected plugin snapshot, and records maintainer approval without installing, enabling, or running plugin code.

## Remote Source

- Archive URL: https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main
- Final URL: https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main
- Archive SHA-256: 607bcf3f6791f228a2ccde8eb72d381d037b6d89205026536530d573748d16c6
- Archive size: 18022439 bytes
- Requested plugin path: examples/plugins/weather-status
- Resolved archive plugin path: OpenPet-main/examples/plugins/weather-status

## Source Plugin

- Name: Weather Status
- Id: openpet.example.weather-status
- Version: 1.0.0
- Package: /Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/packages/openpet.example.weather-status.openpet-plugin.zip
- Submission bundle: /Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/submission-bundle
- Approval decision: approved

## Commands

```bash
curl -L --fail --output <archive.zip> 'https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main'
unzip -qq <archive.zip> -d <extract-dir>
npm run validate:plugin -- '<extract-dir>/OpenPet-main/examples/plugins/weather-status'
cd '<extract-dir>/OpenPet-main/examples/plugins/weather-status' && zip -qr '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/packages/openpet.example.weather-status.openpet-plugin.zip' .
npm run validate:plugin -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/packages/openpet.example.weather-status.openpet-plugin.zip'
npm run create-plugin-submission-bundle -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/packages/openpet.example.weather-status.openpet-plugin.zip' --output-dir '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/submission-bundle'
npm run validate-plugin-submission-bundle -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/submission-bundle' --require-ready
npm run create-plugin-maintainer-approval -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/submission-bundle' --reviewer 'OpenPet Maintainer' --decision approved --notes 'Remote source archive, manifest, package hash, and submission artifacts reviewed.'
npm run validate-plugin-maintainer-approval -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-remote-source-submission-rehearsal/2026-06-18T00-30-00Z/submission-bundle' --require-approved
```

## Boundary

- This is remote-source workflow evidence, not proof of independent public community ownership.
- Maintainer approval is a human review artifact.
- The archive does not prove signing trust, catalog publication, runtime safety, or release readiness.
