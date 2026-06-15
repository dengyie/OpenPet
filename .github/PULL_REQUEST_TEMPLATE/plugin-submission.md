## Plugin Submission

Plugin name:
Plugin id:
Plugin version:

## Submission Packet

- [ ] `npm run validate:plugin -- <plugin-dir-or-zip>` completed
- [ ] `npm run create-plugin-submission-report -- <plugin-dir-or-zip> --output plugin-submission-report.md` attached or pasted
- [ ] `npm run create-plugin-submission-pr -- <plugin-dir-or-zip> --output plugin-submission-pr.md` used for this PR body
- [ ] Source code or immutable package download link provided
- [ ] Catalog entry proposed in `catalog/openpet-catalog.json`

## Permissions

Requested permissions:
Network allowlist:
Commands:

Explain why each permission and network host is necessary:

## Reviewer Checklist

- [ ] Package validation passed without blocking errors
- [ ] Manifest id, name, version, main file, config schema, permissions, and command titles match the submitted source
- [ ] Network allowlist is limited to required public HTTPS hosts
- [ ] Signature hash metadata is reviewed; trusted signing evidence is required separately before distribution
- [ ] Package hash, file count, and byte size are recorded
- [ ] Plugin remains disabled by default after install or update
- [ ] Manual reviewer approval is recorded before merge

## Boundaries

This PR template does not approve catalog publication, prove signer identity, install the plugin, enable the plugin, or run plugin code. Do not merge until human review is complete.
