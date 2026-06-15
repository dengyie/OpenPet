# OpenPet Project Documentation Design

> Scope: documentation architecture for the OpenPet desktop pet platform. The active product target is macOS + Windows desktop. Mobile is out of scope, and Linux is deferred until there is an explicit support decision.
> Current release truth: macOS release baseline is complete; Windows desktop build/CI/signing-policy/smoke-evidence/reporting/runbook/collector/bundle-validation/summary/archive-manifest and packaged native picker smoke evidence tooling baselines are implemented but not release-ready.

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

## 2. Documentation Goals

The documentation system has four jobs:

1. Preserve the original product intent so implementation work does not drift into unrelated targets.
2. Give a new contributor a fast path from public overview to current state, architecture, release operations, and phase history.
3. Keep support claims evidence-based, especially around Windows release readiness.
4. Make every completed phase auditable: what changed, how it was reviewed, how it was verified, and what risk remains.

The documentation should prefer factual status over aspiration. Roadmaps may describe intent, but README, HANDOFF, release docs, and status reviews must only claim what the repository can currently prove.

The design intent is a small documentation operating system, not a pile of notes. Each document should answer one of these questions:

- What is OpenPet and what can a user or contributor safely assume today?
- How is the platform structured and where should new work attach?
- What is the current release truth for macOS and Windows?
- What was changed in a phase, how was it reviewed, and what remains open?
- Which commands, evidence files, and acceptance gates prove the current claim?

If a proposed document does not answer one of those questions better than an existing document, extend the existing document instead of adding another top-level file.

## 3. Documentation Design Principles

Use these principles before creating, moving, or rewriting documentation:

- **One owner per fact**: detailed procedures should live in one narrow document, with other documents linking to it instead of copying the steps.
- **Public docs stay conservative**: README files can mention capability and direction, but release readiness, security claims, and platform support must come from evidence-backed docs.
- **Current state beats roadmap**: if a roadmap and HANDOFF disagree, update the roadmap or mark it historical; do not let future intent override current truth.
- **Phase docs are audit records**: phase and review files describe what was true when the phase landed. They should not be continuously rewritten just because test totals or later tooling changed.
- **Phase packages are indivisible**: implementation, phase notes, review notes, verification, and an independent commit close one phase before the next phase starts.
- **Bilingual entry, focused depth**: README should remain readable in English and Chinese; deep operating details can stay in the most relevant technical or release document.
- **No hidden configuration**: docs must keep repeating the product rule that new user-facing configuration belongs in Control Center, not in secret manual JSON edits.
- **Security boundaries are first-class**: plugin permissions, API-key isolation, local HTTP/MCP defaults, and release signing evidence deserve explicit documentation whenever touched.
- **Evidence names the claim**: every platform-support sentence should make clear whether it is about build configuration, CI artifacts, signed release evidence, or runtime smoke validation.

### 3.1 Documentation Operating Model

OpenPet documentation works as a project memory system, not as a separate writing task. The operating loop is:

1. Start from the project goal anchor and the active macOS + Windows desktop scope.
2. Implement one narrow phase against the service, UI, release, or ecosystem layer that owns the change.
3. Record what changed in `docs/phases/` while the details are fresh.
4. Review the phase in `docs/reviews/`, with findings and residual risks first.
5. Update live documents only for facts that changed now: support wording, current status, file maps, commands, test totals, or reader paths.
6. Verify the phase with commands appropriate to the blast radius.
7. Commit that phase independently before opening the next one.

Document lifecycles are intentionally different:

| Lifecycle | Examples | Update Pattern |
|-----------|----------|----------------|
| Live status | README, HANDOFF, status review, release checklist | Keep current; update whenever the claim changes. |
| Normative rules | This document, AGENTS | Update only when project rules, scope, or invariants change. |
| Technical reference | Architecture docs, MCP docs, catalog docs | Update when the subsystem contract changes. |
| Evidence | Release reports, smoke reports, generated manifests | Append or regenerate from tooling; do not hand-wave the result. |
| Historical audit | Phase docs and review docs | Append during the phase; avoid later rewriting except explicit corrections. |

This loop is the guardrail for the user's original request: OpenPet should keep moving as an extensible, distributable, operable desktop platform, and the documentation should make that continuity obvious to the next contributor.

## 4. Documentation Layers

The docs should be read as layered sources of truth, not as interchangeable notes:

| Layer | Documents | Owns | Detail Level |
|-------|-----------|------|--------------|
| Product entry | `README.md`, `README.zh-CN.md` | Public feature list, quick start, support claims, documentation index | Broad, user-facing, concise |
| Current state | `docs/HANDOFF.md`, `docs/project-status-review.md` | What is true now, what is verified, what remains risky | Operational handoff and status snapshot |
| Goal and governance | `docs/project-documentation-design.md`, `AGENTS.md` | Project goal anchor, doc update rules, engineering invariants | Normative project rules |
| Architecture and roadmap | `docs/jishuwendang.md`, `docs/pet-platform-development-plan.md`, `docs/productization-roadmap.md`, `docs/productization-next-steps-design.md` | System design, completed productization arc, near-term productization sequence, planned enhancements | Architecture and sequencing |
| Release operations | `docs/desktop-release-design.md`, `docs/release-checklist.md`, `docs/release-evidence/*.json` | macOS/Windows release gates, signing, smoke evidence, operator checklist | Evidence and release procedure |
| Phase records | `docs/phases/phase-*.md`, `docs/reviews/phase-*-review.md` | Implementation decisions, verification, review findings, residual risks | Append-only phase audit trail |
| Domain references | `docs/mcp-usage.md`, `docs/mcp-compatibility.md`, `docs/plugin-sandbox-evaluation.md`, `docs/ecosystem-catalog.md` | Focused reference material for one subsystem | Subsystem usage and threat/risk notes |
| Historical remediation | `docs/code-quality-remediation-plan.md`, `docs/superpowers/plans/*.md` | Historical context; update only when explicitly continuing that thread | Archived context |

When documents disagree, prefer the narrowest factual source for the topic:

- Release readiness: `docs/desktop-release-design.md` and `docs/release-checklist.md`.
- Current project status: `docs/HANDOFF.md` and `docs/project-status-review.md`.
- Original goal, documentation governance, and support wording: this document.
- Implementation history: phase docs and review docs.
- Contributor constraints: `AGENTS.md`.

### 4.1 Repository Documentation Topology

The persistent documentation layout should stay close to this shape:

```text
README.md / README.zh-CN.md        # public entry and conservative support wording
AGENTS.md                          # local contributor constraints
docs/HANDOFF.md                    # current project state and next work
docs/project-documentation-design.md # goal anchor and documentation operating model
docs/jishuwendang.md               # Chinese technical architecture reference
docs/productization-roadmap.md     # productization sequence and long-running risks
docs/productization-next-steps-design.md # near-term productization design and prioritized TODOs
docs/project-status-review.md      # milestone-level project assessment
docs/desktop-release-design.md     # macOS + Windows release architecture
docs/release-checklist.md          # release operator checklist
docs/release-evidence/             # structured release and smoke evidence
docs/phases/                       # phase implementation records
docs/reviews/                      # paired phase reviews
docs/*-usage.md / *-compatibility.md / *-evaluation.md # subsystem references
```

New folders should earn their place by having a distinct lifecycle. For example, release evidence deserves its own folder because it is structured and generated; phase records deserve their own folder because they are append-only audit history. A single conceptual note usually belongs inside the existing owner document instead.

## 5. Documentation Map

| Document | Role | Update When |
|----------|------|-------------|
| `AGENTS.md` | Local contributor instructions and non-negotiable project constraints | Test counts, commands, architecture invariants, or support scope change |
| `README.md` / `README.zh-CN.md` | Public entry point, feature list, quick start, roadmap | User-facing capabilities, commands, test totals, or support claims change |
| `docs/HANDOFF.md` | Current factual project state, next work, file map, command map | A phase lands, service map changes, release status changes, or test totals change |
| `docs/project-documentation-design.md` | Project goal anchor and documentation governance | Documentation structure, support claim rules, or phase governance changes |
| `docs/pet-platform-development-plan.md` | Historical platform architecture and staged refactor plan | Core architecture contracts or completed phase status changes |
| `docs/productization-roadmap.md` | Productization roadmap and long-running risks | Roadmap sequencing, risk status, or release-track scope changes |
| `docs/productization-next-steps-design.md` | Near-term productization design and prioritized TODOs | Next-phase sequencing, acceptance gates, or implementation planning |
| `docs/project-status-review.md` | Snapshot assessment of implementation vs original goal | Major status checkpoints, release candidates, or readiness claims |
| `docs/jishuwendang.md` | Chinese technical architecture reference | Service structure, IPC surface, commands, or technical status changes |
| `docs/desktop-release-design.md` | macOS + Windows desktop release design and acceptance gates | Packaging, CI, signing, update, or platform support status changes |
| `docs/release-checklist.md` | Operator checklist for producing and validating releases | Build/signing inputs, artifact sets, or smoke checks change |
| `docs/phases/phase-*.md` | Phase development notes and decisions | During and immediately after each implementation phase |
| `docs/reviews/phase-*-review.md` | Phase code review notes, residual risks, verification | After each phase implementation and before commit |
| `docs/release-evidence/*.json` | Structured release evidence templates or filled reports | Smoke evidence schema or a real release validation run changes |

## 6. Documentation Ownership Matrix

Use this matrix to decide where a fact belongs before editing multiple documents:

| Fact Type | Primary Owner | Secondary Mentions |
|-----------|---------------|--------------------|
| Original product goal | `docs/project-documentation-design.md` | README overview, `docs/HANDOFF.md` |
| Current project status | `docs/HANDOFF.md` | `docs/project-status-review.md`, README badges/status |
| Service architecture | `docs/jishuwendang.md` | `docs/HANDOFF.md`, `AGENTS.md` |
| Productization sequence | `docs/productization-roadmap.md` | phase docs, status review |
| Near-term TODO design | `docs/productization-next-steps-design.md` | `docs/productization-roadmap.md`, latest phase and review docs |
| Release gates | `docs/desktop-release-design.md` | `docs/release-checklist.md`, README support wording |
| Release operator steps | `docs/release-checklist.md` | `docs/desktop-release-design.md` |
| Windows smoke evidence schema | `docs/release-evidence/*.json` and release scripts | release checklist, Phase 8 records |
| MCP usage and compatibility | `docs/mcp-usage.md`, `docs/mcp-compatibility.md` | `docs/jishuwendang.md` Service section |
| Plugin security model | `docs/plugin-sandbox-evaluation.md` | `AGENTS.md`, plugin phase/review docs |
| Ecosystem catalog operations | `docs/ecosystem-catalog.md` | productization roadmap, HANDOFF file map |
| Phase implementation history | `docs/phases/phase-*.md` | paired review, status review summaries |
| Review findings | `docs/reviews/phase-*-review.md` | HANDOFF only if they affect next work |

When a fact needs to appear in multiple places, keep the primary owner detailed and make secondary mentions short and link-oriented.

## 7. Reader Paths

Use these paths when onboarding or when deciding which document to update:

| Reader Need | Start Here | Then Read |
|-------------|------------|-----------|
| Understand what OpenPet is | `README.zh-CN.md` or `README.md` | `docs/project-documentation-design.md`, `docs/HANDOFF.md` |
| Continue development today | `AGENTS.md` | `docs/HANDOFF.md`, relevant phase/review docs |
| Understand architecture | `docs/jishuwendang.md` | `docs/pet-platform-development-plan.md`, service tests |
| Continue productization | `docs/productization-next-steps-design.md` | `docs/productization-roadmap.md`, latest `docs/phases/` and `docs/reviews/` pair |
| Work on release readiness | `docs/desktop-release-design.md` | `docs/release-checklist.md`, `docs/release-evidence/` |
| Validate Windows claims | `docs/release-checklist.md` | `docs/phases/phase-8-windows-desktop-release.md`, `docs/reviews/phase-8-windows-desktop-release-review.md` |
| Add or review plugins | `docs/plugin-sandbox-evaluation.md` | `docs/ecosystem-catalog.md`, plugin service tests |
| Integrate external agents | `docs/mcp-usage.md` | `docs/mcp-compatibility.md`, Service tab notes in `docs/jishuwendang.md` |

README should stay navigational. Deep implementation details belong in the technical, roadmap, release, or phase documents linked from it.

## 8. Project Structure Fitness For macOS + Windows

The current repository structure is fit for the active macOS + Windows Electron desktop track because shared application behavior and platform-specific release concerns are separated:

| Area | Current Structure | Why It Fits macOS + Windows |
|------|-------------------|-----------------------------|
| Runtime entry | `main.js`, `preload.js`, `renderer.js`, `index.html` | Electron desktop entry points stay platform-neutral while window behavior is centralized. |
| Main services | `src/main/services/` | State, plugins, AI, pet packs, local HTTP/MCP, and release-facing metadata are injected services rather than OS-specific forks. |
| UI shell | `src/control-center/` | React + Vite Control Center can run inside Electron on both desktop OSes and as a browser/dev build. |
| Shared IPC | `src/shared/ipc-channels.js` | Channel names are centralized and reduce renderer/main drift across platforms. |
| Pet assets | `cat_anime/`, `src/main/pet-pack/` | Legacy material stays compatible while pet pack runtime abstracts user-installed packs under `userData`. |
| Plugins | `src/main/plugins/`, `plugin-service`, `plugin-install-service` | Permission model and SDK are service-level contracts; Windows-specific behavior remains a validation concern, not a separate plugin tree. |
| Release config | `package.json` `build`, `build/`, `.github/workflows/` | electron-builder handles macOS and Windows artifacts through platform-specific targets and credentials outside source control. |
| Release evidence | `docs/release-evidence/`, `scripts/create-windows-*`, `scripts/validate-windows-*` | Windows readiness is tracked through structured reports and tools instead of broad prose claims. |
| Tests | `tests/` mirroring source areas | Core services and release tooling can be validated locally, while true Windows runtime claims remain gated by Windows evidence. |

This structure is not a mobile architecture. There is no mobile runtime shell, no mobile UI navigation model, no native iOS/Android packaging, no mobile asset pipeline, and no documented mobile support claim. If mobile ever becomes a real product decision, it should start as a separate architecture track rather than being implied by the current Electron desktop layout.

### 8.1 Desktop Structure Decision Record

The current answer to "does the project structure satisfy macOS and Windows desktop?" is yes, with release evidence still pending for Windows. Keep this distinction crisp:

| Question | Current Answer | Documentation Consequence |
|----------|----------------|---------------------------|
| Can one shared Electron app structure serve macOS and Windows? | Yes. Runtime, service, IPC, Control Center, plugin, pet-pack, and catalog layers are platform-neutral by design. | Architecture docs can describe a shared desktop app structure. |
| Are platform-specific concerns isolated? | Mostly yes. Packaging, signing, update assets, and smoke evidence live in `package.json`, `.github/workflows/`, `build/`, release scripts, and release docs. | Release docs own the OS-specific truth; feature docs should link instead of restating gates. |
| Is Windows public release support proven? | No. Tooling exists, including packaged native picker smoke evidence tooling, but signed artifacts and real Windows smoke validation are still missing. | README and HANDOFF must keep "baseline implemented but not release-ready" wording. |
| Is mobile supported by this structure? | No. Electron desktop structure does not imply mobile runtime support. | Mobile must remain out of scope unless a new product decision creates a separate architecture track. |

Do not split app logic into `mac/` and `windows/` folders unless a concrete OS behavior cannot be expressed behind an injected service or release script. The preferred structure is shared application code with narrow platform adapters and explicit release evidence.

### 8.2 Desktop Structure Improvement Backlog

These items can improve macOS/Windows confidence without changing the architecture shape:

- Add real Windows smoke reports once signed Windows artifacts exist.
- Keep release scripts idempotent and evidence-producing instead of relying on manual prose.
- Expand UI automation in demo API mode for Control Center flows, keep main-process IPC glue covered with fixture-based Node tests, then separately validate launched Electron behavior where native dialogs, file pickers, or OS integration matter.
- Add platform-specific notes only in release docs or service docs that own the behavior.
- Keep plugin runner and local file path behavior covered by service tests plus real Windows smoke evidence before making Windows support claims.

## 9. Phase Governance

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
- Phase 8.5d: Windows smoke validation runbook generation and CI artifact upload.
- Phase 8.5e: Windows smoke evidence collector generation and CI artifact upload.
- Phase 8.5f: Windows smoke evidence bundle validation.
- Phase 8.5g: Windows smoke evidence summary/archive generation.
- Phase 8.5h: Windows smoke archive manifest generation.
- Phase 8.5: Real Windows smoke validation on a clean machine or CI-backed manual environment.

Phase 9 is a documentation-governance phase. It does not change release readiness, but it records the rules in this document as an auditable phase with a paired review.

Phase 10 is a documentation-design hardening phase. It keeps the same release truth, expands this document into the owner matrix, structure-fitness check, support-claim lifecycle, and drift-audit rules, and records that work with a paired review.

Phase 11 is a Control Center frontend automation phase. It adds a project-owned Playwright smoke baseline for the React + Vite Control Center in demo API mode, updates developer commands and live documentation, and records the remaining UI automation gaps with a paired review.

Phase 12 is a Control Center saved-configuration automation phase. It expands the Playwright baseline to cover Pet, AI, and Service configuration saves in demo API mode, keeps API-key plaintext out of demo state, updates current-state documentation, and records the remaining UI automation gaps with a paired review.

Phase 13 is a Control Center Catalog automation phase. It expands the Playwright baseline to cover Catalog plugin install, plugin update, and pet-pack install flows in demo API mode, keeps real package download and validation out of scope, updates current-state documentation, and records the remaining UI automation gaps with a paired review.

Phase 14 is a Control Center MCP session automation phase. It expands the Playwright baseline to cover Service tab MCP session display, revoke-all behavior, and token-rotation session invalidation in demo API mode, keeps real HTTP/MCP transport validation out of scope, updates current-state documentation, and records the remaining UI automation gap with a paired review.

Phase 15 is a project documentation design consolidation phase. It keeps the same runtime and release truth, corrects live documentation drift, strengthens this document with desktop structure decision records and phase/update templates, and records the documentation-only work with a paired review.

Phase 16 is a Control Center manual plugin install automation phase. It expands the Playwright demo API baseline to cover the Plugins tab manual package review, cancel, install, disabled-by-default result, log persistence, and reload persistence, while keeping real Electron file picker and zip validation smoke out of scope.

Phase 17 is an Electron plugin package IPC smoke phase. It keeps production IPC behavior unchanged, adds injectable `ipcMain` / `dialog` seams for tests, covers `plugins:inspect-package` and `plugins:install` with a real `.openpet-plugin.zip` fixture, and records that launched native OS file picker validation and Windows packaged-app smoke remain out of scope.

Phase 18 is a desktop native picker smoke evidence phase. It adds macOS / Windows packaged-app picker smoke report generation, update tooling, runbook generation, and readiness validation. It records the remaining boundary explicitly: generated pending reports and runbooks do not prove picker success until a real packaged app run fills evidence and validates without `--allow-pending`.

Phase 19 is a project documentation design completion phase. It keeps runtime and release truth unchanged, expands this document with the documentation operating model, lifecycle categories, repository topology, phase completion contract, documentation done criteria, anti-patterns, and decision records, and records the documentation-only work with a paired review.

Phase 20 is an example plugin developer asset phase. It keeps runtime security boundaries and release readiness unchanged, adds a tested Focus Timer local plugin example, adds the plugin development guide, updates live docs to point developers at the example, and records the ecosystem cold-start improvement with a paired review.

Phase 21 is a Weather example plugin developer asset phase. It keeps runtime security boundaries and release readiness unchanged, adds a tested local plugin example for `network` permission and HTTPS allowlist usage, updates plugin development docs with a concrete network example, and records that the example uses injected test fetch instead of live network or API keys.

Phase 22 is an RSS example plugin developer asset phase. It keeps runtime security boundaries and release readiness unchanged, adds a tested local plugin example for public RSS/Atom feed fetching, lightweight XML normalization, storage caching, and pet speech, and records that the example uses injected test fetch instead of live network or API keys.

Phase 23 is a plugin submission validation phase. It keeps runtime security boundaries and release readiness unchanged, adds a local `validate:plugin` CLI that reuses `PluginInstallService` package review without installing or running plugin code, updates plugin development docs with a pre-submission check, and records that real community review flow and signing trust remain future work.

Phase 24 is a plugin submission review packet phase. It keeps runtime security boundaries and release readiness unchanged, adds a local `create-plugin-submission-report` CLI that reuses Phase 23 validation results to produce reviewer Markdown/JSON, checklist, and human-review boundaries, and records that real community submission workflow, PR templates, and signing trust remain future work.

Phase 25 is a plugin submission PR template phase. It keeps runtime security boundaries and release readiness unchanged, adds a local `create-plugin-submission-pr` CLI and GitHub plugin PR template that turn Phase 24 report data into a PR body, checklist, and explicit human-approval boundaries, and records that real community review operations and signing trust remain future work.

Phase 26 is a plugin submission workflow bundle phase. It keeps runtime security boundaries and release readiness unchanged, adds a local `create-plugin-submission-bundle` CLI that writes the Phase 24 report, Phase 25 PR body, and a summary JSON into one local bundle directory, and records that the bundle is submission material rather than approval, signing trust, or runtime evidence.

Phase 27 is a plugin submission workflow bundle validation phase. It keeps runtime security boundaries and release readiness unchanged, adds a local `validate-plugin-submission-bundle` CLI that checks the Phase 26 bundle files, summary consistency, and ready-for-review status, and records that validation is still only local preflight, not approval or signing trust.

Phase 28 is a plugin submission workflow playbook phase. It keeps runtime security boundaries and release readiness unchanged, adds a documentation-only rehearsal path that connects the Phase 23-27 validation, report, PR packet, workflow bundle, and bundle validation commands for third-party plugin authors, and records that the playbook is guidance rather than approval or signing trust.

Phase 29 is an RC upgrade smoke evidence phase. It keeps runtime behavior unchanged, adds local report generation and validation for legacy `ibot` userData compatibility, and records that the smoke evidence is still local proof rather than signed release or GitHub Release validation.

Do not skip the review document. If a phase changes release claims, security boundaries, plugin permissions, or API-key handling, the review must explicitly state whether those boundaries still hold.

### 9.1 Phase Completion Contract

A phase is complete only when all of these are true:

| Requirement | Evidence |
|-------------|----------|
| Scope is narrow and named | Phase document states the goal and non-goals. |
| Implementation is present or the phase is explicitly documentation-only | Changed files are listed in the phase document. |
| Tests or checks match the risk | Verification commands and outcomes are recorded. |
| Review happened after implementation | Paired review document leads with findings or explicitly says none were found. |
| Live docs reflect changed facts | README, HANDOFF, roadmap, release docs, or status review are updated only when their facts changed. |
| Repository is left handoff-ready | Residual risks and next work are documented. |
| Commit boundary is clean | The phase is committed before unrelated next-phase work begins. |

This contract matters more than phase size. A small documentation phase still needs a review and verification record; a large implementation phase still needs to stay narrow enough that the next contributor can understand exactly what changed.

### 9.2 Phase Document Minimum Template

Each new phase document should include these sections unless the phase is explicitly exploratory:

```markdown
# Phase N 开发文档：<主题>

> 阶段目标：<one sentence>
> 范围约束：<what this phase will not change>

## 1. 背景
## 2. 目标
## 3. 非目标
## 4. 实现记录
## 5. 文档更新
## 6. 验证
## 7. 残留风险
```

The phase document should name the exact files changed, the commands run, and the remaining risk in plain language. It should not claim a broader platform, security, or release status than the implementation proves.

### 9.3 Review Document Minimum Template

Each paired review should lead with findings:

```markdown
# Phase N <主题> Review

## Findings

- No blocking issues found.

## Notes
## Verification
## Residual Risk
```

If there are findings, order them by severity and include file references. If there are no findings, explicitly say so and still record test gaps or release/security residual risk.

### 9.4 Phase Numbering And Naming

Use the next integer `Phase N` for ordinary productization work. Use decimal labels only when a phase is a clear continuation of one release track, as the Windows Phase 8 substeps did. File names should be descriptive and stable:

```text
docs/phases/phase-N-short-topic.md
docs/reviews/phase-N-short-topic-review.md
```

Prefer topic names that describe the deliverable, not the implementation detail. For example, `example-plugin-developer-asset` is better than `add-files-to-examples` because it explains why the phase exists.

## 10. Cross-Platform Scope

Current product scope is desktop only:

- macOS remains the validated release baseline.
- Windows is in the desktop release track, with build/CI/signing-policy/smoke-evidence/reporting/runbook/collector/bundle-validation/summary/archive-manifest tooling implemented.
- Windows release readiness still requires signed artifact evidence and real Windows smoke validation.
- Linux is deferred.
- Mobile is out of scope for this track.

Project structure is acceptable for macOS + Windows Electron desktop work because platform-specific release concerns live in electron-builder config, release workflow, and release docs, while app logic remains in the shared main/service/control-center layers. It is not designed as a mobile codebase: there is no mobile runtime, no mobile UI shell, no native mobile packaging, and no mobile support claim should appear in current docs.

### 10.1 Scope Change Rules

Changing platform scope requires more than a roadmap bullet:

| Scope Change | Required Before Public Docs Change |
|--------------|------------------------------------|
| Windows moves to release-ready | Signed artifact evidence, real Windows smoke report, release checklist pass, and status docs updated together. |
| Linux becomes active | Product decision, packaging design, release gates, support wording, and at least a build baseline phase. |
| Mobile becomes active | Separate architecture plan for native/runtime shell, UI model, packaging, asset pipeline, and security model. |
| A platform is deferred | Roadmap can mention deferral, but README should not present it as supported or planned for the current release. |

Until those prerequisites exist, keep the current scope sentence unchanged.

## 11. Support Claim Rules

Support language must match what the repository can actually prove:

| Platform | Allowed Wording Now | Do Not Claim Yet |
|----------|---------------------|------------------|
| macOS | Validated release baseline; official artifacts should be signed/notarized | That every tag is notarized unless the release artifact was verified |
| Windows | Packaging/CI/signing-policy/smoke-evidence/reporting/runbook/collector/bundle-validation/summary/archive-manifest and packaged native picker smoke evidence tooling baselines implemented; not release-ready until signed artifact evidence and real smoke validation pass | Public user support, SmartScreen trust, or completed installer validation |
| Linux | Deferred | Any active release target |
| Mobile | Out of scope | Any mobile app plan for the current release track |

If a document needs one sentence, use: "macOS release baseline is complete; Windows desktop build/CI/signing-policy/smoke-evidence/reporting/runbook/collector/bundle-validation/summary/archive-manifest and packaged native picker smoke evidence tooling baselines are implemented but not release-ready; mobile is out of scope."

Avoid these phrases until evidence exists:

- "Windows supported" or "Windows ready".
- "SmartScreen trusted".
- "Cross-platform desktop release complete".
- "Mobile roadmap" for the current release track.

Support claims move through this lifecycle:

| Stage | Meaning | Allowed Documentation Tone |
|-------|---------|----------------------------|
| Design intent | A platform is being considered | Roadmap-only, explicitly not supported |
| Build baseline | Config and CI can produce artifacts | "build/CI baseline implemented" |
| Policy baseline | Signing, naming, and evidence requirements are documented/enforced | "signing-policy baseline implemented" |
| Evidence baseline | Reports, runbooks, collectors, validators, summaries, and manifests exist | "smoke-evidence tooling baseline implemented" |
| Signed artifact evidence | Actual release artifacts pass signature validation | Mention only the specific release/tag validated |
| Runtime smoke validation | Clean-machine matrix passes with filled evidence report | Release docs may call that release candidate ready for platform validation |
| Public support | Signed artifacts plus smoke validation pass and release owners accept the risk | README/support matrix may use public support wording |

Windows is currently at the evidence-baseline stage. It must not jump to public support wording without signed artifact evidence and runtime smoke validation.

### 11.1 Support Claim Upgrade Checklist

Before changing any live document from "baseline implemented" to a stronger support claim, check all of these:

| Check | macOS | Windows |
|-------|-------|---------|
| Build config exists | Complete | Complete |
| Release workflow exists | Complete | Complete |
| Platform icon/assets exist | Complete | Complete |
| Signing policy documented | Complete | Baseline complete |
| Signed artifact evidence exists | Required per release/tag | Still open |
| Runtime smoke evidence exists | Required per release/tag | Still open |
| Release checklist passes | Required per release/tag | Still open |
| README support wording can change | Only for verified artifact/tag | Not yet |

If any required row is open, preserve conservative wording and link to the release document that owns the gap.

## 12. Architecture Invariants

Documentation and code changes should preserve these invariants:

- `PetService` remains the only source of truth for pet state.
- Renderer and ordinary plugins never receive plaintext API keys.
- Plugins only use the whitelisted SDK permissions and stay isolated from unrestricted Node/Electron access.
- Local HTTP and MCP are disabled by default, loopback-only, token-gated, and logged without tokens.
- New configuration is exposed in the Control Center UI.
- `cat_anime/` remains compatible as the built-in legacy pet material source.
- Build output, temporary files, and secrets stay out of source control.
- `npm start`, `npm run check:syntax`, and `npm test` remain the minimum local health checks for ordinary implementation phases; run `npm run test:control-center` for Control Center UI changes.

Docs should also preserve these documentation invariants:

- README never becomes the only place where a release or security requirement is explained.
- HANDOFF remains a current-state map, not a roadmap dump.
- Release checklists contain commands that exist in `package.json` or standard platform tooling.
- Phase reviews lead with findings and call out residual release/security risks.
- Historical verification counts stay historical unless a phase doc is explicitly corrected.

## 13. Update Playbooks

Use these lightweight playbooks to keep documentation from drifting.

### Feature Or Architecture Change

Update:

- The relevant phase doc and review doc.
- `docs/HANDOFF.md` if file maps, services, UI tabs, commands, or current capabilities changed.
- `docs/jishuwendang.md` if service responsibilities, IPC, or technical architecture changed.
- `README.md` and `README.zh-CN.md` only when the feature is user-facing or changes developer commands.

### Phase Completion

Update:

- The relevant `docs/phases/phase-*.md` implementation record.
- The paired `docs/reviews/phase-*-review.md` review section.
- `docs/HANDOFF.md` if current state, next work, metrics, service map, commands, or file maps changed.
- `docs/project-status-review.md` for major checkpoints or readiness changes.
- `docs/productization-roadmap.md` if roadmap sequencing, risk status, or release baseline changed.
- README files only for public status, command, roadmap, or support-claim changes.

Commit after the phase is documented and verified. The next phase should start from a clean, explainable state.

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

Use actual current totals in live status documents. Do not keep stale badge numbers or command comments because they become the first source of confusion for new contributors.

### Documentation-Only Phase

Update:

- `docs/project-documentation-design.md` for the rule, matrix, reader path, or support wording being changed.
- README files only if navigation, badges, support scope, or public status changes.
- `docs/HANDOFF.md`, `docs/project-status-review.md`, and `docs/productization-roadmap.md` when the latest phase pointer or current documentation status changes.
- A phase doc and paired review when the change establishes durable project governance.

Verification for documentation-only phases should include `git diff --check` and a targeted `rg` drift audit. Run heavier commands only when scripts, package commands, code snippets that must execute, or generated artifacts changed.

### Windows Evidence Change

Update:

- `docs/desktop-release-design.md` for acceptance-gate state.
- `docs/release-checklist.md` for operator commands and checked items.
- `docs/release-evidence/` for templates or filled reports.
- `docs/phases/phase-8-windows-desktop-release.md` and its review for implementation/review history.
- Public/current state docs only after the evidence changes what can honestly be claimed.

Real Windows smoke evidence should be stored or referenced as evidence, not rewritten into a broad support claim until the checklist passes.

Do not rewrite historical phase verification counts unless the phase document is explicitly being corrected. Historical records may say, for example, "181/181" for a phase that was true at the time.

### Documentation Structure Change

Update:

- `docs/project-documentation-design.md` for the rule or map change.
- README docs index only when reader navigation changes.
- `docs/HANDOFF.md` if the recommended onboarding path or latest phase pointer changes.
- A phase doc and paired review for auditable changes to governance.

Do not update release readiness, support claims, or test counts just because the documentation structure improved.

### New Document Creation

Before adding a new document:

- Check the ownership matrix for an existing primary owner.
- Prefer a section in the existing owner if the topic is a narrow addition.
- Add a new document only when the topic has a distinct audience, lifecycle, or evidence set.
- Link the new document from README, HANDOFF, or a domain owner only when it is part of a reader path.
- Add it to the documentation map if it becomes a persistent source of truth.

## 14. Drift Audit

Run a lightweight drift audit whenever a phase changes user-facing capability, release status, support scope, or test totals.

Recommended checks:

```bash
rg -n "tests-[0-9]+|[0-9]+ tests|[0-9]+ 个测试|[0-9]+/[0-9]+" README.md README.zh-CN.md AGENTS.md docs
rg -n "Windows supported|Windows ready|SmartScreen trusted|Cross-platform desktop release complete|Mobile roadmap" README.md README.zh-CN.md AGENTS.md docs
rg -n "release-ready|release ready|supported|support" README.md README.zh-CN.md docs/desktop-release-design.md docs/release-checklist.md docs/HANDOFF.md docs/project-status-review.md
git diff --check
```

Use the results as prompts, not as blind replacements. Historical phase and review records may intentionally contain old test counts or quoted forbidden phrases inside rule sections.

## 15. Documentation Quality Bar

Every live document should satisfy these checks:

- It has one clear owner role in the documentation map.
- It does not duplicate detailed procedures that belong in a narrower release, architecture, or phase document.
- It uses the current support wording for macOS, Windows, Linux, and mobile.
- It distinguishes completed work from planned work.
- It lists commands that exist in `package.json` when users are expected to run them.
- It keeps evidence-based status separate from roadmap language.
- It links to the owner document instead of duplicating long checklists.
- It names residual risk when a platform, security, or release claim is incomplete.
- It avoids inventing future platform scope inside implementation notes.

Before committing documentation-only work, run at least a link/path sanity check with `rg` plus `npm run check:syntax` when package scripts, code snippets, or release scripts are touched. If only Markdown prose changed, `git diff --check` is the minimum whitespace check.

### 15.1 Documentation Done Criteria

Use this checklist before closing any documentation-affecting phase:

| Check | Pass Condition |
|-------|----------------|
| Goal preserved | The original goal still reads as an extensible, distributable, operable Electron desktop pet platform. |
| Scope preserved | macOS + Windows desktop remains the active scope; mobile remains out of scope. |
| Windows wording conservative | Windows is not called release-ready unless signed artifact evidence and real smoke validation exist. |
| Ownership respected | Detailed procedures live in the owner document and secondary docs link or summarize. |
| Phase package complete | Phase doc, review doc, verification, and commit boundary are present. |
| Commands truthful | Any command shown to users exists in `package.json` or is standard platform tooling. |
| Counts current | Live test totals and badge counts match the last verified run. |
| Historical docs stable | Old phase records are not rewritten just to refresh counts or modern wording. |

If a phase changes only documentation rules, do not update product capability claims. If a phase changes only product capability, do not invent new documentation governance unless the existing rules are insufficient.

### 15.2 Documentation Anti-Patterns

Avoid these patterns because they are how drift usually starts:

- Copying the full release checklist into README instead of linking to `docs/release-checklist.md`.
- Updating the roadmap as if planned work has landed.
- Calling generated pending evidence a passed smoke test.
- Adding a new top-level document for a paragraph that belongs in the ownership matrix.
- Letting phase docs omit verification because the change was "only docs".
- Updating test counts in current docs without running or reading the relevant verification output.
- Treating Windows build tooling as Windows public support.
- Mentioning mobile as a current product path without a separate architecture decision.

## 16. Documentation Decision Records

Durable documentation decisions should be recorded here when they affect future work. Keep them short and append-only.

| Decision | Status | Rationale |
|----------|--------|-----------|
| The project goal anchor lives in this document. | Active | It prevents the original platform intent from being scattered across README, roadmap, and handoff notes. |
| Phase work requires a paired review document. | Active | The review record makes residual risk visible before the next phase starts. |
| Live support wording separates macOS baseline from Windows evidence baseline. | Active | Windows tooling exists, but signed artifacts and real Windows smoke validation are still missing. |
| Mobile remains out of scope for the current track. | Active | The Electron desktop structure does not provide mobile runtime, UI, packaging, or asset-pipeline support. |
| Documentation-only governance changes can be their own phase. | Active | Governance affects every later contributor and deserves the same audit trail as code. |

## 17. Current Documentation Status

The repository now has a coherent phase history through Phase 29:

- Phase 1-7 document the platform productization arc from Control Center modularization through ecosystem operations.
- Phase 8 documents the macOS + Windows desktop release extension.
- Phase 9 documents the project documentation-governance layer itself, including reader paths, support-claim rules, phase completion playbooks, and live-status drift checks.
- Phase 10 hardens this document into a fuller documentation design, including fact ownership, macOS/Windows structure fitness, support-claim lifecycle, new-document rules, and drift audits.
- Phase 11 introduces a Playwright Control Center smoke baseline and documents it as a verification layer.
- Phase 12 expands the Control Center Playwright baseline to saved configuration flows for Pet, AI, and Service.
- Phase 13 expands the Control Center Playwright baseline to Catalog plugin install/update and pet-pack install flows.
- Phase 14 expands the Control Center Playwright baseline to Service MCP session management flows.
- Phase 15 consolidates the project documentation design, fixes live documentation drift, and adds durable structure/scope/update templates for future phases.
- Phase 16 expands the Control Center Playwright baseline to manual plugin package install review flows in demo API mode.
- Phase 17 expands Node regression coverage to the main-process plugin package IPC inspect/install path with a real zip fixture.
- Phase 18 adds packaged macOS / Windows native picker smoke evidence tooling: pending report generation, report updates, runbook generation, signed-readiness validation, and release-document alignment.
- Phase 19 expands the documentation design into a fuller operating model: documentation lifecycles, repository topology, phase completion contract, done criteria, anti-patterns, and decision records.
- Phase 20 adds the first tested local example plugin developer asset: Focus Timer, `docs/plugin-development.md`, and real install/run service coverage.
- Phase 21 adds the second tested local example plugin developer asset: Weather Status, network allowlist guidance, and real install/run service coverage with injected fetch.
- Phase 22 adds the third tested local example plugin developer asset: RSS Reader, public feed guidance, lightweight XML normalization, cached announcements, and real install/run service coverage with injected fetch.
- Phase 23 adds the plugin submission validation CLI, reusing `PluginInstallService` package review for local directory/zip preflight, signature metadata status, blocklist checks, and human-review warnings.
- Phase 24 adds the plugin submission review packet CLI, turning validation results into reviewer Markdown/JSON, checklist evidence, and explicit non-approval/signing-trust boundaries.
- Phase 25 adds the plugin submission PR template and PR packet CLI, turning the review packet into a GitHub-ready PR body, contributor checklist, reviewer checklist, and explicit human approval boundary.
- Phase 26 adds the plugin submission workflow bundle CLI, packaging the reviewer report, PR body, and summary JSON into one local directory while keeping install/enable/run and signing-trust boundaries out of scope.
- Phase 27 adds the plugin submission workflow bundle validation CLI, checking bundle file presence, summary consistency, and ready-for-human-review status while keeping install/enable/run and signing-trust boundaries out of scope.
- Phase 28 adds the plugin submission workflow playbook, giving third-party plugin authors a single local rehearsal path from validation through bundle validation while keeping install/enable/run and signing-trust boundaries out of scope.
- Phase 29 adds RC upgrade smoke evidence tooling, giving release verifiers a local report/validation path for legacy `ibot` userData compatibility while keeping signed release and real packaged RC validation out of scope.
- macOS release baseline is complete.
- Windows package targets, icon generation, CI/release jobs, platform-aware About/update asset filtering, signing policy enforcement, smoke evidence validation, CI pending report, runbook, collector generation, evidence bundle validation, evidence summary/archive generation, archive manifest generation, and report filling tooling are implemented.
- Signed Windows artifact evidence, filled packaged native picker evidence, and real Windows smoke validation remain open release gates.

## 18. Next Documentation Priorities

The next documentation work should follow the implementation track rather than inventing a parallel roadmap:

- Add a filled Windows smoke report only after real Windows validation exists.
- Update release status only after signed artifact evidence and real smoke evidence pass the checklist.
- Keep mobile out of scope until a separate product decision introduces it.
- Fill and archive real launched Electron / packaged-app smoke evidence for native OS file picker behavior using the Phase 18 toolchain.
