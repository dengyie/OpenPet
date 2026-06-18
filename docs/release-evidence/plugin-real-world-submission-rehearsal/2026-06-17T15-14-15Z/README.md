# OpenPet Plugin Real-World Submission Rehearsal

Generated: 2026-06-17T15:14:15.000Z

This rehearsal uses an existing plugin directory as a local stand-in for a real third-party submission.
It validates, packages, creates a submission bundle, and records maintainer approval without installing, enabling, or running plugin code.

## Source Plugin

- Name: Weather Status
- Id: openpet.example.weather-status
- Version: 1.0.0
- Source: /Users/mango/project/codex/OpenPet/examples/plugins/weather-status
- Package: /Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/packages/openpet.example.weather-status.openpet-plugin.zip
- Submission bundle: /Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/submission-bundle
- Approval decision: approved

## Commands

```bash
npm run validate:plugin -- '/Users/mango/project/codex/OpenPet/examples/plugins/weather-status'
cd '/Users/mango/project/codex/OpenPet/examples/plugins/weather-status' && zip -qr '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/packages/openpet.example.weather-status.openpet-plugin.zip' .
npm run validate:plugin -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/packages/openpet.example.weather-status.openpet-plugin.zip'
npm run create-plugin-submission-bundle -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/packages/openpet.example.weather-status.openpet-plugin.zip' --output-dir '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/submission-bundle'
npm run validate-plugin-submission-bundle -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/submission-bundle' --require-ready
npm run create-plugin-maintainer-approval -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/submission-bundle' --reviewer 'OpenPet Maintainer' --decision approved --notes 'Manifest, permissions, package hash, network hosts, and submission artifacts reviewed.'
npm run validate-plugin-maintainer-approval -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/submission-bundle' --require-approved
```

## Boundary

- This is local workflow evidence, not proof of external community provenance.
- Maintainer approval is a human review artifact.
- The archive does not prove signing trust, catalog publication, runtime safety, or release readiness.
