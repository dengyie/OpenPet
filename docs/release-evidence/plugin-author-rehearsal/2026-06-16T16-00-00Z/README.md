# OpenPet Plugin Author Rehearsal

Generated: 2026-06-16T15:58:50.418Z

This rehearsal follows the third-party author path without installing, enabling, or running untrusted plugin code.

## Scaffolded Templates

| Template | Plugin ID | Permissions | Validation |
|----------|-----------|-------------|------------|
| minimal | openpet.plugin.author-minimal | pet:say | pass |
| network | openpet.plugin.author-network | pet:say, network | pass |
| storage | openpet.plugin.author-storage | pet:say, storage | pass |
| ai | openpet.plugin.author-ai | pet:say, ai:chat | pass |

## Submission Rehearsal

- Selected template: ai
- Package: /Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/packages/openpet.plugin.author-ai.openpet-plugin.zip
- Bundle: /Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/submission-bundle
- Bundle decision: ready-for-human-review
- Maintainer approval remains a separate human review step recorded after the submission bundle is prepared.

## Commands

```bash
npm run create-openpet-plugin -- "Author Minimal" --template minimal --output-dir '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/scaffolded'
npm run create-openpet-plugin -- "Author Network" --template network --output-dir '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/scaffolded'
npm run create-openpet-plugin -- "Author Storage" --template storage --output-dir '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/scaffolded'
npm run create-openpet-plugin -- "Author Ai" --template ai --output-dir '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/scaffolded'
npm run validate:plugin -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/scaffolded/openpet-plugin-author-ai'
cd '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/scaffolded/openpet-plugin-author-ai' && zip -qr '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/packages/openpet.plugin.author-ai.openpet-plugin.zip' .
npm run validate:plugin -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/packages/openpet.plugin.author-ai.openpet-plugin.zip'
npm run create-plugin-submission-bundle -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/packages/openpet.plugin.author-ai.openpet-plugin.zip' --output-dir '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/submission-bundle'
npm run validate-plugin-submission-bundle -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/submission-bundle' --require-ready
npm run create-plugin-maintainer-approval -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/submission-bundle' --reviewer 'OpenPet Maintainer' --decision approved --notes 'Manifest, permissions, package hash, and submission artifacts reviewed.'
npm run validate-plugin-maintainer-approval -- '/Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/submission-bundle' --require-approved
```

## Security Notes

- Plugin config is public settings, not a secret store.
- Do not put API keys, tokens, passwords, cookies, private keys, or credentials in config schema, plugin storage, network headers, or bundled files.
- The bundle is for human review. It does not establish signing trust, catalog approval, runtime smoke success, or unrestricted sandbox safety.
