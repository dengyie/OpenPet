# OpenPet Project Documentation Design

> Scope: documentation architecture for the OpenPet desktop pet platform. The active product target is macOS + Windows desktop. Mobile is out of scope, and Linux is deferred until there is an explicit support decision.
> Current release truth: macOS release baseline is complete; Windows desktop build/CI/signing-policy/smoke-evidence/reporting baseline is implemented but not release-ready.

## 1. Project Goal Anchor

OpenPet is not just a single desktop mascot. The original project goal is an extensible, distributable, and operable Electron desktop pet platform:

- A transparent desktop pet runtime with drag, walking, action playback, and speech bubbles.
- `PetService` as the single source of truth for all pet state and every `say` / `playAction` / `setEvent` operation.
- A React + Vite Control Center where every user-facing configuration is operable through UI.
- Secure AI integration where API keys stay in the main process secret store and never reach renderer code or ordinary plugins.
- A permission-whitelisted plugin ecosystem with isolated third-party execution.
- Pet pack runtime and catalog flows for importing, enabling, deleting, and discovering pets.
- Local HTTP/MCP integration that is loopback-only, token-gated, logged, and disabled by default.
- A desktop release track that first validates macOS and then brings Windows to the same release standard.

This goal is the anchor for every project document. New documents should explain how the platform becomes safer, more operable, easier to extend, or more distributable. They should not pull the project toward mobile or unrelated runtime targets during the current track.

## 2. Documentation Layers

The docs should be read as layered sources of truth, not as interchangeable notes:

| Layer | Documents | Owns |
|-------|-----------|------|
| Product entry | `README.md`, `README.zh-CN.md` | Public feature list, quick start, support claims, documentation index |
| Current state | `docs/HANDOFF.md`, `docs/project-status-review.md` | What is true now, what is verified, what remains risky |
| Goal and governance | `docs/project-documentation-design.md`, `AGENTS.md` | Project goal anchor, doc update rules, engineering invariants |
| Architecture and roadmap | `docs/jishuwendang.md`, `docs/pet-platform-development-plan.md`, `docs/productization-roadmap.md` | System design, completed productization arc, planned enhancements |
| Release operations | `docs/desktop-release-design.md`, `docs/release-checklist.md`, `docs/release-evidence/*.json` | macOS/Windows release gates, signing, smoke evidence, operator checklist |
| Phase records | `docs/phases/phase-*.md`, `docs/reviews/phase-*-review.md` | Implementation decisions, verification, review findings, residual risks |
| Domain references | `docs/mcp-usage.md`, `docs/mcp-compatibility.md`, `docs/plugin-sandbox-evaluation.md`, `docs/ecosystem-catalog.md` | Focused reference material for one subsystem |
| Historical remediation | `docs/code-quality-remediation-plan.md`, `docs/superpowers/plans/*.md` | Historical context; update only when explicitly continuing that thread |

When documents disagree, prefer the narrowest factual source for the topic:

- Release readiness: `docs/desktop-release-design.md` and `docs/release-checklist.md`.
- Current project status: `docs/HANDOFF.md` and `docs/project-status-review.md`.
- Original goal and support wording: this document.
- Implementation history: phase docs and review docs.

## 3. Documentation Map

| Document | Role | Update When |
|----------|------|-------------|
| `AGENTS.md` | Local contributor instructions and non-negotiable project constraints | Test counts, commands, architecture invariants, or support scope change |
| `README.md` / `README.zh-CN.md` | Public entry point, feature list, quick start, roadmap | User-facing capabilities, commands, or support claims change |
| `docs/HANDOFF.md` | Current factual project state and file map | A phase lands, service map changes, release status changes, or test totals change |
| `docs/project-documentation-design.md` | Project goal anchor and documentation governance | Documentation structure, support claim rules, or phase governance changes |
| `docs/pet-platform-development-plan.md` | Historical platform architecture and staged refactor plan | Core architecture contracts or completed phase status changes |
| `docs/productization-roadmap.md` | Productization roadmap and long-running risks | Roadmap sequencing, risk status, or release-track scope changes |
| `docs/project-status-review.md` | Snapshot assessment of implementation vs original goal | Major status checkpoints, release candidates, or readiness claims |
| `docs/jishuwendang.md` | Chinese technical architecture reference | Service structure, IPC surface, commands, or technical status changes |
| `docs/desktop-release-design.md` | macOS + Windows desktop release design and acceptance gates | Packaging, CI, signing, update, or platform support status changes |
| `docs/release-checklist.md` | Operator checklist for producing and validating releases | Build/signing inputs, artifact sets, or smoke checks change |
| `docs/phases/phase-*.md` | Phase development notes and decisions | During and immediately after each implementation phase |
| `docs/reviews/phase-*-review.md` | Phase code review notes, residual risks, verification | After each phase implementation and before commit |
| `docs/release-evidence/*.json` | Structured release evidence templates or filled reports | Smoke evidence schema or a real release validation run changes |

## 4. Phase Governance

Each implementation phase should leave the repository easier to continue from than it found it:

1. Define a narrow phase goal in `docs/phases/` before or during implementation.
2. Keep code changes scoped to that phase and preserve `npm start` functionality.
3. Add or update tests according to the risk of the change.
4. Record implementation decisions, verification commands, and residual risks in the phase doc.
5. Review the phase in `docs/reviews/` with findings first, then notes, risks, and verification.
6. Update current-state docs if the phase changes public features, architecture, release status, commands, or test totals.
7. Commit the phase before moving to the next phase.

For the Windows desktop release track, the current sequence is:

- Phase 8.1: Windows packaging config and icon generation.
- Phase 8.2: macOS + Windows release workflow split.
- Phase 8.3: platform-aware About/update assets and release checklist alignment.
- Phase 8.4: Windows signing policy.
- Phase 8.5a: Windows smoke evidence gate and pending report template.
- Phase 8.5b: Windows release job pending smoke report artifact generation.
- Phase 8.5c: Windows smoke report filling/update tooling.
- Phase 8.5: Real Windows smoke validation on a clean machine or CI-backed manual environment.

## 5. Support Claim Rules

Support language must match what the repository can actually prove:

| Platform | Allowed Wording Now | Do Not Claim Yet |
|----------|---------------------|------------------|
| macOS | Validated release baseline; official artifacts should be signed/notarized | That every tag is notarized unless the release artifact was verified |
| Windows | Packaging/CI/signing-policy/smoke-evidence/reporting baseline implemented; not release-ready until signed artifact evidence and real smoke validation pass | Public user support, SmartScreen trust, or completed installer validation |
| Linux | Deferred | Any active release target |
| Mobile | Out of scope | Any mobile app plan for the current release track |

If a document needs one sentence, use: "macOS release baseline is complete; Windows desktop build/CI/signing-policy/smoke-evidence/reporting baseline is implemented but not release-ready; mobile is out of scope."

Avoid these phrases until evidence exists:

- "Windows supported" or "Windows ready".
- "SmartScreen trusted".
- "Cross-platform desktop release complete".
- "Mobile roadmap" for the current release track.

## 6. Architecture Invariants

Documentation and code changes should preserve these invariants:

- `PetService` remains the only source of truth for pet state.
- Renderer and ordinary plugins never receive plaintext API keys.
- Plugins only use the whitelisted SDK permissions and stay isolated from unrestricted Node/Electron access.
- Local HTTP and MCP are disabled by default, loopback-only, token-gated, and logged without tokens.
- New configuration is exposed in the Control Center UI.
- `cat_anime/` remains compatible as the built-in legacy pet material source.
- Build output, temporary files, and secrets stay out of source control.
- `npm start`, `npm run check:syntax`, and `npm test` remain the minimum local health checks for ordinary implementation phases.

## 7. Update Playbooks

Use these lightweight playbooks to keep documentation from drifting.

### Feature Or Architecture Change

Update:

- The relevant phase doc and review doc.
- `docs/HANDOFF.md` if file maps, services, UI tabs, commands, or current capabilities changed.
- `docs/jishuwendang.md` if service responsibilities, IPC, or technical architecture changed.
- `README.md` and `README.zh-CN.md` only when the feature is user-facing or changes developer commands.

### Release Or Platform Change

Update:

- `docs/desktop-release-design.md` for release model and acceptance gates.
- `docs/release-checklist.md` for operator steps.
- `docs/project-documentation-design.md` if support wording changes.
- `README.md`, `README.zh-CN.md`, `docs/HANDOFF.md`, and `docs/project-status-review.md` for public/current status.
- `docs/release-evidence/` when a new template or real report is introduced.

### Test Count Or Verification Change

Update:

- `README.md` and `README.zh-CN.md` badges and test section.
- `docs/HANDOFF.md` current metrics and command notes.
- `docs/project-status-review.md` quality metrics.
- `docs/productization-roadmap.md` current baseline and final status.
- `docs/jishuwendang.md` technical status.
- `AGENTS.md` development instructions.

Do not rewrite historical phase verification counts unless the phase document is explicitly being corrected. Historical records may say, for example, "181/181" for a phase that was true at the time.

## 8. Current Documentation Status

The repository now has a coherent phase history through Phase 8.5c:

- Phase 1-7 document the platform productization arc from Control Center modularization through ecosystem operations.
- Phase 8 documents the macOS + Windows desktop release extension.
- macOS release baseline is complete.
- Windows package targets, icon generation, CI/release jobs, platform-aware About/update asset filtering, signing policy enforcement, smoke evidence validation, CI pending report generation, and report filling tooling are implemented.
- Signed Windows artifact evidence and real Windows smoke validation remain open release gates.

## 9. Next Documentation Priorities

The next documentation work should follow the implementation track rather than inventing a parallel roadmap:

- Add a filled Windows smoke report only after real Windows validation exists.
- Update release status only after signed artifact evidence and real smoke evidence pass the checklist.
- Keep mobile out of scope until a separate product decision introduces it.
- If frontend automation is introduced, document it as a verification layer in README, HANDOFF, the roadmap, and the relevant phase/review pair.
