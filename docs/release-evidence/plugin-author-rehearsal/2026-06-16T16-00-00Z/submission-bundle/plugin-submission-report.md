# OpenPet Plugin Submission Report

Generated at: 2026-06-16T15:58:50.418Z
Source path: /Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-author-rehearsal/2026-06-16T16-00-00Z/packages/openpet.plugin.author-ai.openpet-plugin.zip
Decision: ready-for-human-review
Ready for human review: yes
Require verified signature metadata: no

This report is a submission preflight artifact. It reuses OpenPet package validation but does not approve catalog publication, prove signer identity, install the plugin, enable the plugin, or run plugin code.

## Plugin

| Field | Value |
|-------|-------|
| id | openpet.plugin.author-ai |
| name | Author Ai |
| version | 0.1.0 |
| description | Author Ai OpenPet plugin. |
| permissions | pet:say, ai:chat |
| network allowlist | none |
| commands | ask (Ask AI) |

## Package Review

| Field | Value |
|-------|-------|
| source type | zip |
| install mode | install |
| package sha256 | 489815a1cb34a96644d5ac8eb93d361668cb6f7016037fd5993e9e783c9feb81 |
| files | 4 |
| bytes | 2308 |
| risk level | review |
| requires permission review | no |

## Signature

| Field | Value |
|-------|-------|
| status | unsigned |
| label | Unsigned plugin |
| signer | (not recorded) |
| algorithm | (not recorded) |
| errors | none |

## Validation

| Type | Messages |
|------|----------|
| errors | none |
| warnings | Plugin is unsigned; local testing may continue, but catalog/release review should require trusted signature evidence, Package requires human review before distribution |

## Reviewer Checklist

| Status | Check | Evidence |
|--------|-------|----------|
| pass | Package validation reused app install review rules | Validation returned no blocking errors. |
| warn | Signature hash metadata reviewed | Unsigned plugin |
| warn | Permissions and network hosts are explicit | Permissions: pet:say, ai:chat; network allowlist: none |
| pass | Local blocklist did not reject the package | No local blocklist hit. |
| warn | Human reviewer decision remains required before distribution | This packet is a preflight artifact; it does not approve catalog publication or establish signing trust. |

## Reviewer Actions

- Confirm the plugin purpose matches the manifest description and command titles.
- Review every requested permission and network host against the submitted source.
- For distribution, require trusted signing evidence beyond local hash metadata.
- Install only through Control Center review flow and keep the plugin disabled until a user explicitly enables it.
