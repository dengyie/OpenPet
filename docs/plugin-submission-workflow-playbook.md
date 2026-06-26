# OpenPet Extension Submission Workflow Playbook

This playbook turns the existing Phase 23-27 submission commands into a single end-to-end rehearsal path for third-party extension authors. The commands still use the historical "plugin" name for compatibility, but the target ecosystem model is extension-first.

## 1. What This Is

Use this playbook when you want to rehearse an extension submission locally before opening a PR or handing a package to a reviewer.

It covers:

- preflight validation of the extension package
- generation of the reviewer report
- generation of the PR packet
- generation of the full submission bundle
- validation of the generated bundle before review
- recording and validating a separate maintainer approval artifact after review
- one-command existing-plugin rehearsal for a more realistic local submission path
- one-command remote-source rehearsal for a reviewed HTTPS archive path
- invitation-kit drafting when discovery has not found a compatible third-party source
- one-command community-source intake reporting for public candidate archives before they claim OpenPet compatibility

It does not:

- install, enable, update, or run extension code
- establish signing trust
- approve publication
- replace manual reviewer judgment

## 2. Author-Friendly Review Posture

Submission tooling is a rehearsal and handoff path, not a gatekeeping promise that only perfect extensions may exist.

Maintainers should classify review outcomes this way:

- **Ready for review**: the package is structurally valid, declarations are understandable, and requested permissions match the described feature.
- **Changes requested**: the idea is welcome, but the author should clarify setup, cleanup, data locations, external accounts, logs, or permission rationale.
- **Blocked**: the archive is unsafe, paths escape the package, code would run during install/enable, secrets are leaked into OpenPet-managed public config, or the package misrepresents what it does.
- **Backlog gap**: the extension idea is valid but needs a host API that does not exist yet. Record the missing capability instead of forcing the author to reshape the idea into a weaker first-party pattern.

Common welcome examples:

- weather announcer: may request `pet:say` and `pet:action`, disclose weather API/network use, and keep provider credentials in extension-owned setup or files;
- pet dialogue/personality helper: may request `pet:say` / `pet:event` and expose tone, verbosity, quiet hours, or fallback lines through config;
- pet action studio: may request `actions:read`, `actions:write`, `assets:inspect`, and `assets:generate` to inspect frames, validate metadata, import frame folders, and regenerate sprites through the host;
- pack metadata helper: may request `pack-manifest:read` / `pack-manifest:write` for active installed user pack metadata only;
- dashboard companion: may expose a local HTTP dashboard and service without needing pet permissions unless it calls the bridge.

Review should ask for least-necessary permissions and clear user disclosure. It should not reject an honest third-party package simply because it uses Python, a shell script, a compiled binary, external APIs, local model files, or an extension-owned settings store.

## 3. One-Command Author Rehearsal

For the complete Phase 44 author path, run:

```bash
npm run create-plugin-author-rehearsal -- --output-dir docs/release-evidence/plugin-author-rehearsal/<session> --submission-template ai
```

This creates minimal, network, storage, and AI-assisted legacy scaffolds; validates every scaffold; packages the selected extension as `.openpet-plugin.zip`; creates a submission bundle; validates the bundle with `--require-ready`; and writes an author README, command list, checklist, and machine-readable summary.

The generated bundle is still an author-to-reviewer handoff packet. It does not install, enable, run, approve, sign, or publish the extension.

For a local existing-plugin rehearsal, run:

```bash
npm run create-plugin-real-world-submission-rehearsal -- --source examples/plugins/weather-status --output-dir docs/release-evidence/plugin-real-world-submission-rehearsal/<session>
```

This validates and packages an already-authored example plugin, creates a submission bundle, records maintainer approval, and writes local evidence files. It is closer to real contributor behavior than scaffold rehearsal, but it still does not prove external community provenance.

For a remote-source rehearsal, run:

```bash
npm run create-plugin-remote-source-submission-rehearsal -- --archive-url https://codeload.github.com/dengyie/OpenPet/zip/refs/heads/main --plugin-path examples/plugins/weather-status --output-dir docs/release-evidence/plugin-remote-source-submission-rehearsal/<session>
```

This downloads a public HTTPS archive, records archive URL, final URL, archive SHA-256, archive size, selected plugin path, and extracted file hashes, then packages the selected plugin snapshot, creates a submission bundle, records maintainer approval, and writes local evidence files. It is closer to a real reviewer handoff than a plain directory rehearsal, but the current archived example still does not prove independent public community provenance or release trust.

For a public candidate-source intake report, run:

```bash
npm run create-plugin-community-source-intake-report -- --archive-url <https-archive> --plugin-path <path-inside-archive> --community-source-url <public-source-url> --submitter "<submitter>" --output-dir docs/release-evidence/plugin-community-source-intake-report/<session>
```

This archives the public source URL, submitter label, archive URL, final URL, archive SHA-256, archive size, candidate plugin path, and extracted file hashes, then records whether the selected path is a current OpenPet `plugin.json` package. It is a compatibility-first maintainer intake step, not submission approval, signing trust, runtime safety, or release readiness.

If discovery reports `compatible-source-not-found`, prepare an invitation kit before waiting for a compatible package:

```bash
npm run create-plugin-community-source-invitation-kit -- --target-author "OpenPet-compatible extension authors" --target-url https://github.com/dengyie/OpenPet --candidate-context "Phase 104 discovery currently has no compatible public plugin.json source." --requested-capabilities "weather pet-action pet-dialogue pet-personality creator-tools" --output-dir docs/release-evidence/plugin-community-source-invitation-kit/<session>
```

The kit writes a summary, README, message draft, and checklist. It is draft outreach material only: it does not prove the invitation was sent, a reply was received, a compatible package exists, or any trust/publication decision was made.

For a community-source evidence archive, run:

```bash
npm run create-plugin-community-source-submission-evidence -- --archive-url <https-archive> --plugin-path <path-inside-archive> --community-source-url <public-source-url> --submitter "<submitter>" --source-relation independent-third-party --independence-notes "..." --output-dir docs/release-evidence/plugin-community-source-submission-evidence/<session>
```

This keeps the same archive/package/submission/approval chain as the remote-source rehearsal, then adds community provenance metadata that is missing from an official-repository archive alone: source URL, submitter label, source relation, and independence notes. For public sources, run the intake report first so incompatible neighboring repositories are archived as evidence gaps instead of being forced through the submission chain. This is still review evidence. It does not prove signing trust, catalog publication, runtime safety, or release readiness.

## 4. Manual Rehearsal Order

Start from a generated local extension or a tested legacy example such as `examples/plugins/focus-timer`.

```bash
npm run create-openpet-plugin -- "My Plugin" --template minimal --output-dir scratch/plugins
npm run validate:plugin -- scratch/plugins/openpet.plugin.my-plugin
npm run validate:plugin -- examples/plugins/focus-timer
npm run create-plugin-submission-report -- examples/plugins/focus-timer --output plugin-submission-report.md
npm run create-plugin-submission-pr -- examples/plugins/focus-timer --output plugin-submission-pr.md
npm run create-plugin-submission-bundle -- examples/plugins/focus-timer --output-dir plugin-submission-bundle
npm run validate-plugin-submission-bundle -- plugin-submission-bundle --require-ready
npm run create-plugin-maintainer-approval -- plugin-submission-bundle --reviewer "OpenPet Maintainer" --decision approved --notes "Manifest, permissions, package hash, and submission artifacts reviewed."
npm run validate-plugin-maintainer-approval -- plugin-submission-bundle --require-approved
```

If the bundle is blocked before human review, fix the package or signature issue first, then rerun the bundle and validator commands.
If the maintainer decision is `changes-requested`, keep the approval files as review evidence but do not treat the bundle as maintainer-approved.

Current validation may still reject legacy SDK config fields that look like secrets, such as `apiKey`, `accessToken`, `password`, `credential`, `format: "password"`, or `writeOnly: true`. Under the extension boundary, treat that as a current tooling limitation for OpenPet-managed config: disclose extension-owned secrets in `manifest`, keep them in extension-managed files or setup flows, avoid implying that OpenPet controls every credential, and do not present saved OpenPet chat/image provider credentials as something an ordinary extension can read or reuse.

## 5. What Each Artifact Means

- `plugin-submission-report.md`: reviewer-facing validation report
- `plugin-submission-pr.md`: PR body template with checklist and review notes
- `plugin-submission-summary.json`: machine-readable bundle summary
- `plugin-maintainer-approval.md`: human-readable maintainer approval record
- `plugin-maintainer-approval.json`: machine-readable maintainer approval record

The summary should confirm:

- the source path
- the output bundle directory
- the ready-for-human-review decision
- the extension identity
- the package hash
- the signature state

## 6. Reviewer Handoff

When the author rehearsal succeeds:

1. Attach or paste `plugin-submission-report.md` into the extension PR.
2. Use `plugin-submission-pr.md` as the PR body or starting point.
3. Include the bundle directory if the reviewer wants the machine-readable summary.
4. Record the maintainer approval separately:

```bash
npm run create-plugin-maintainer-approval -- plugin-submission-bundle --reviewer "OpenPet Maintainer" --decision approved --notes "Manifest, permissions, package hash, and submission artifacts reviewed."
npm run validate-plugin-maintainer-approval -- plugin-submission-bundle --require-approved
```

The approval record is a human review artifact. It does not establish signing trust, catalog publication, runtime safety, or release readiness.

## 7. Common Failure Patterns

- `validate:plugin` fails: fix manifest, signature metadata, blocklist, current compatibility checks, or package safety issues first.
- `create-plugin-submission-bundle` exits non-zero: the package is not ready for human review yet.
- `validate-plugin-submission-bundle --require-ready` fails: check the bundle summary decision and repair the underlying package or signature issue.
- `create-plugin-maintainer-approval` exits non-zero: the submission bundle is malformed, the maintainer metadata is incomplete, or the generated record is not approval-ready.
- `validate-plugin-maintainer-approval --require-approved` fails: the approval artifact is missing, mismatched, malformed, or the submission bundle was not ready for human review.

Do not treat every validation failure as a rejection of the extension idea. Separate package-safety failures from ecosystem-growth gaps:

- path traversal, unsafe zip entries, malformed JSON, hidden install execution, or credential leakage are blockers;
- unknown permissions may mean the author used a future capability name, so ask them to map it to current permissions or record a backlog gap;
- secret-like OpenPet-managed config fields are current tooling limitations, so authors may move credentials to extension-owned setup/files and disclose that ownership;
- missing real community provenance is an evidence gap, not proof the package is low quality.

## 8. Why This Exists

The project already had command-level documentation for validation, report generation, PR packets, bundle generation, and bundle validation. This playbook gives third-party authors a single rehearsal path they can follow without stitching the steps together themselves, while the runtime and tooling migrate from the legacy plugin SDK toward the unified extension model.
