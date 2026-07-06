# Release Evidence Index

This directory is the maintainer entrypoint for archived evidence artifacts.

## Current Priority Evidence

- Agent awareness smoke: [`agent-awareness-local-smoke/`](./agent-awareness-local-smoke/)
- AI provider smoke: [`ai-provider-smoke/`](./ai-provider-smoke/)
- AI Talk smoke: [`ai-talk-local-smoke/`](./ai-talk-local-smoke/)
- Creator Studio provider smoke: [`creator-studio-provider-smoke/`](./creator-studio-provider-smoke/)
- Public release metadata: [`release-public-assets/`](./release-public-assets/)
- macOS public-asset verification: [`macos-release-evidence/`](./macos-release-evidence/)
- macOS workflow-artifact imports and parser reruns: [`macos-release-evidence-archive/`](./macos-release-evidence-archive/)
- Windows smoke provenance: [`windows-smoke/`](./windows-smoke/)
- Desktop picker evidence: [`desktop-picker/`](./desktop-picker/)
- Packaged runtime evidence: [`packaged-runtime/`](./packaged-runtime/)
- Signed release closure audits: [`signed-release-closure/`](./signed-release-closure/)
- Community-source discovery and intake: [`plugin-community-source-discovery-report/`](./plugin-community-source-discovery-report/), [`plugin-community-source-intake-report/`](./plugin-community-source-intake-report/), [`plugin-community-source-invitation-kit/`](./plugin-community-source-invitation-kit/)

## Supporting Rehearsals And Tooling Evidence

- Plugin author rehearsal: [`plugin-author-rehearsal/`](./plugin-author-rehearsal/)
- Plugin remote-source rehearsal: [`plugin-remote-source-submission-rehearsal/`](./plugin-remote-source-submission-rehearsal/)
- Plugin real-world rehearsal: [`plugin-real-world-submission-rehearsal/`](./plugin-real-world-submission-rehearsal/)
- Plugin cleanup evidence: [`plugin-cleanup-evidence/`](./plugin-cleanup-evidence/)

## Synthetic Coverage Boundaries

- `tests/scripts/mock-agent-awareness-flow.test.js` rehearses the shipped agent-awareness smoke, archive, and manual-acceptance update CLI chain with sanitized synthetic Codex data. It does not replace a real archived Codex session or human desktop acceptance.
- `tests/scripts/mock-plugin-community-source-flow.test.js` rehearses the shipped community-source intake, evidence, and discovery CLI chain against a synthetic compatible archive. It does not replace a real compatible third-party `plugin.json` package or external trust review.
- `tests/release/mock-picker-runtime-flow.test.js` rehearses the shipped macOS evidence/archive, Windows smoke/picker/runtime, and signed release-closure CLI chain against synthetic signed fixtures. It does not replace real signed artifacts, real packaged-app observation, or manual release review.
- `tests/release/mock-packaged-provider-flow.test.js` rehearses the shipped packaged Create and packaged Creator Studio provider-path CLIs against a provider-ready app shim. It does not replace a real configured packaged provider session.

## Reading Rules

- Start with the category README, then open the newest or current session it points to.
- Treat session timestamps and names as part of the evidence meaning; newer is not always “better” if the README marks an archive as historical, intermediate, or structure-only.
- Keep live docs such as [`../HANDOFF.md`](../HANDOFF.md), [`../TODO.md`](../TODO.md), and [`../project-status-review.md`](../project-status-review.md) as the current truth layer above the archives.

These archives are useful because they preserve specific evidence packets, provenance, and negative release truth over time. They do not by themselves prove current release readiness, future runtime behavior, or external ecosystem compatibility.
