# OpenPet Plugin Submission Workflow Playbook

This playbook turns the Phase 23-27 plugin submission commands into a single end-to-end rehearsal path for third-party plugin authors.

## 1. What This Is

Use this playbook when you want to rehearse a plugin submission locally before opening a PR or handing a package to a reviewer.

It covers:

- preflight validation of the plugin package
- generation of the reviewer report
- generation of the PR packet
- generation of the full submission bundle
- validation of the generated bundle before review

It does not:

- install, enable, update, or run plugin code
- establish signing trust
- approve publication
- replace manual reviewer judgment

## 2. Recommended Rehearsal Order

Start from a tested local example plugin such as `examples/plugins/focus-timer`.

```bash
npm run validate:plugin -- examples/plugins/focus-timer
npm run create-plugin-submission-report -- examples/plugins/focus-timer --output plugin-submission-report.md
npm run create-plugin-submission-pr -- examples/plugins/focus-timer --output plugin-submission-pr.md
npm run create-plugin-submission-bundle -- examples/plugins/focus-timer --output-dir plugin-submission-bundle
npm run validate-plugin-submission-bundle -- plugin-submission-bundle --require-ready
```

If the bundle is blocked before human review, fix the package or signature issue first, then rerun the bundle and validator commands.

## 3. What Each Artifact Means

- `plugin-submission-report.md`: reviewer-facing validation report
- `plugin-submission-pr.md`: PR body template with checklist and review notes
- `plugin-submission-summary.json`: machine-readable bundle summary

The summary should confirm:

- the source path
- the output bundle directory
- the ready-for-human-review decision
- the plugin identity
- the package hash
- the signature state

## 4. Reviewer Handoff

When the rehearsal succeeds:

1. Attach or paste `plugin-submission-report.md` into the plugin PR.
2. Use `plugin-submission-pr.md` as the PR body or starting point.
3. Include the bundle directory if the reviewer wants the machine-readable summary.
4. Record the reviewer approval separately.

## 5. Common Failure Patterns

- `validate:plugin` fails: fix manifest, signature metadata, blocklist, or package safety issues first.
- `create-plugin-submission-bundle` exits non-zero: the package is not ready for human review yet.
- `validate-plugin-submission-bundle --require-ready` fails: check the bundle summary decision and repair the underlying package or signature issue.

## 6. Why This Exists

The project already had command-level documentation for validation, report generation, PR packets, bundle generation, and bundle validation. This playbook gives third-party authors a single rehearsal path they can follow without stitching the steps together themselves.
