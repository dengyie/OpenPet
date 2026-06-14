# OpenPet Project Documentation Design

> Scope: documentation architecture for the OpenPet desktop pet platform. The active product target is macOS + Windows desktop. Mobile is out of scope, and Linux is deferred until there is an explicit support decision.

## 1. Original Product Goal

OpenPet is not just a single desktop mascot. The project goal is an extensible, distributable, and operable Electron desktop pet platform:

- A transparent desktop pet runtime with drag, walking, action playback, and speech bubbles.
- `PetService` as the single source of truth for all pet state and all `say` / `playAction` / `setEvent` operations.
- A React + Vite Control Center where every user-facing configuration is operable through UI.
- Secure AI integration where API keys stay in the main process secret store and never reach renderer code or ordinary plugins.
- A permission-whitelisted plugin ecosystem with isolated third-party execution.
- Pet pack runtime and catalog flows for importing, enabling, deleting, and discovering pets.
- Local HTTP/MCP integration that is loopback-only, token-gated, logged, and disabled by default.
- A desktop release track that first validates macOS and then brings Windows to the same release standard.

This goal is the anchor for all project documents. New documents should clarify how the platform gets safer, more operable, or more distributable; they should not pull the project toward mobile or unrelated runtime targets during the current track.

## 2. Documentation Map

| Document | Role | Update When |
|----------|------|-------------|
| `README.md` / `README.zh-CN.md` | Public entry point, feature list, quick start, roadmap | User-facing capabilities, commands, or support claims change |
| `docs/HANDOFF.md` | Current factual project state and file map | A phase lands, service map changes, or release status changes |
| `docs/project-documentation-design.md` | Documentation system and project goal anchor | Documentation structure or phase governance changes |
| `docs/pet-platform-development-plan.md` | Historical platform architecture and staged refactor plan | Core architecture contracts or completed phase status changes |
| `docs/productization-roadmap.md` | Productization roadmap and long-running risks | Roadmap sequencing, risk status, or release-track scope changes |
| `docs/project-status-review.md` | Snapshot assessment of implementation vs original goal | Major status checkpoints, release candidates, or readiness claims |
| `docs/desktop-release-design.md` | macOS + Windows desktop release design and acceptance gates | Packaging, CI, signing, update, or platform support status changes |
| `docs/release-checklist.md` | Operator checklist for producing and validating releases | Build/signing inputs, artifact sets, or smoke checks change |
| `docs/phases/phase-*.md` | Phase development notes and decisions | During and immediately after each implementation phase |
| `docs/reviews/phase-*-review.md` | Phase code review notes, residual risks, verification | After each phase implementation and before commit |

## 3. Phase Governance

Each implementation phase should leave the repo easier to continue from than it found it:

1. Define a narrow phase goal in `docs/phases/` before or during implementation.
2. Keep code changes scoped to that phase and preserve `npm start` functionality.
3. Add or update tests according to the risk of the change.
4. Record implementation decisions, verification commands, and residual risks in the phase doc.
5. Review the phase in `docs/reviews/` with findings first, then notes, risks, and verification.
6. Commit the phase before moving to the next phase.

For the Windows desktop release track, the current sequence is:

- Phase 8.1: Windows packaging config and icon generation.
- Phase 8.2: macOS + Windows release workflow split.
- Phase 8.3: platform-aware About/update assets and release checklist alignment.
- Phase 8.4: Windows signing policy.
- Phase 8.5a: Windows smoke evidence gate and pending report template.
- Phase 8.5: Real Windows smoke validation on a clean machine or CI-backed manual environment.

## 4. Support Claim Rules

Support language must match what the repository can actually prove:

| Platform | Allowed Wording Now | Do Not Claim Yet |
|----------|---------------------|------------------|
| macOS | Validated release baseline; official artifacts should be signed/notarized | That every tag is notarized unless the release artifact was verified |
| Windows | Packaging/CI/signing-policy/smoke-evidence-gate baseline implemented; not release-ready until signed artifact evidence and real smoke validation pass | Public user support, SmartScreen trust, or completed installer validation |
| Linux | Deferred | Any active release target |
| Mobile | Out of scope | Any mobile app plan for the current release track |

If a document needs one sentence, use: "macOS release baseline is complete; Windows desktop build/CI/signing-policy/smoke-evidence-gate baseline is implemented but not release-ready; mobile is out of scope."

## 5. Architecture Invariants

Documentation and code changes should preserve these invariants:

- `PetService` remains the only source of truth for pet state.
- Renderer and ordinary plugins never receive plaintext API keys.
- Plugins only use the whitelisted SDK permissions and stay isolated from unrestricted Node/Electron access.
- Local HTTP and MCP are disabled by default, loopback-only, token-gated, and logged without tokens.
- New configuration is exposed in the Control Center UI.
- `cat_anime/` remains compatible as the built-in legacy pet material source.
- Build output, temporary files, and secrets stay out of source control.

## 6. Current Documentation Status

The repository now has a coherent phase history through Phase 8.5a:

- Phase 1-7 document the platform productization arc from Control Center modularization through ecosystem operations.
- Phase 8 documents the macOS + Windows desktop release extension.
- macOS release baseline is complete.
- Windows package targets, icon generation, CI/release jobs, platform-aware About/update asset filtering, signing policy enforcement, and smoke evidence validation are implemented.
- Signed Windows artifact evidence and real Windows smoke validation remain open release gates.
