# OpenPet Plugin Submission Report

Generated at: 2026-06-17T15:14:15.000Z
Source path: /Users/mango/project/codex/OpenPet/docs/release-evidence/plugin-real-world-submission-rehearsal/2026-06-17T15-14-15Z/packages/openpet.example.weather-status.openpet-plugin.zip
Decision: ready-for-human-review
Ready for human review: yes
Require verified signature metadata: no

This report is a submission preflight artifact. It reuses OpenPet package validation but does not approve catalog publication, prove signer identity, install the plugin, enable the plugin, or run plugin code.

## Plugin

| Field | Value |
|-------|-------|
| id | openpet.example.weather-status |
| name | Weather Status |
| version | 1.0.0 |
| description | Example local plugin that fetches allowlisted weather JSON and asks the pet to summarize it. |
| permissions | network, pet:say, storage |
| network allowlist | api.weather.example.com |
| commands | refresh (Refresh weather), last (Show last weather) |

## Package Review

| Field | Value |
|-------|-------|
| source type | zip |
| install mode | install |
| package sha256 | 9d90fc03bf24fa70b79fe8f4fbc6fffd62212df9c91d1abf384df0a571790567 |
| files | 4 |
| bytes | 5457 |
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
| warn | Permissions and network hosts are explicit | Permissions: network, pet:say, storage; network allowlist: api.weather.example.com |
| pass | Local blocklist did not reject the package | No local blocklist hit. |
| warn | Human reviewer decision remains required before distribution | This packet is a preflight artifact; it does not approve catalog publication or establish signing trust. |

## Reviewer Actions

- Confirm the plugin purpose matches the manifest description and command titles.
- Review every requested permission and network host against the submitted source.
- For distribution, require trusted signing evidence beyond local hash metadata.
- Install only through Control Center review flow and keep the plugin disabled until a user explicitly enables it.
