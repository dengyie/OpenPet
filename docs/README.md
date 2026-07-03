# OpenPet Documentation Map

This is the maintainer entry point for project documentation. The goal is to keep a small set of live operating docs current and treat the rest of `docs/` as background or audit history.

## Current Docs

| Need | Read |
| --- | --- |
| User-facing overview and commands | [`../README.md`](../README.md) / [`../README.zh-CN.md`](../README.zh-CN.md) |
| Current maintainer snapshot and guardrails | [`HANDOFF.md`](./HANDOFF.md) |
| Single active work queue | [`TODO.md`](./TODO.md) |
| Local development workflow | [`development-workflow.md`](./development-workflow.md) |
| Test scope and merge-time validation | [`testing-strategy.md`](./testing-strategy.md) |
| Machine-readable project facts | [`project-context.json`](./project-context.json) |
| Compact engineering snapshot | [`development-summary.md`](./development-summary.md) |
| Compact product and release snapshot | [`project-status-review.md`](./project-status-review.md) |

## Product Areas

| Area | Canonical docs |
| --- | --- |
| Extension authoring and ecosystem rules | [`plugin-development.md`](./plugin-development.md), [`plugin-ecosystem-rules.md`](./plugin-ecosystem-rules.md), [`plugin-submission-workflow-playbook.md`](./plugin-submission-workflow-playbook.md) |
| Plugin sandbox posture | [`plugin-sandbox-evaluation.md`](./plugin-sandbox-evaluation.md) |
| Agent awareness plugin | [`agent-awareness-plugin-design.md`](./agent-awareness-plugin-design.md) |
| AI provider settings UX | [`ai-provider-settings-ux-design.md`](./ai-provider-settings-ux-design.md) |
| AI Talk and pet dialogue | [`openpet-current-todo-architecture.md`](./openpet-current-todo-architecture.md), [`superpowers/specs/2026-06-20-pet-dialogue-phase1-design.md`](./superpowers/specs/2026-06-20-pet-dialogue-phase1-design.md), [`superpowers/specs/2026-06-28-real-provider-chat-acceptance-runbook.md`](./superpowers/specs/2026-06-28-real-provider-chat-acceptance-runbook.md) |
| Control Center visual design notes | [`design-system/cursor-settings.md`](./design-system/cursor-settings.md) |
| Creator Studio and model-generation backlog | [`superpowers/specs/2026-06-19-creator-studio-conversational-generation-todo.md`](./superpowers/specs/2026-06-19-creator-studio-conversational-generation-todo.md), [`superpowers/specs/2026-06-19-openpet-model-settings-backlog.md`](./superpowers/specs/2026-06-19-openpet-model-settings-backlog.md), [`superpowers/specs/2026-06-20-openpet-creator-prompt-builder-design.md`](./superpowers/specs/2026-06-20-openpet-creator-prompt-builder-design.md) |
| Desktop release evidence | [`desktop-release-design.md`](./desktop-release-design.md), [`release-checklist.md`](./release-checklist.md) |
| Release notes | [`release-notes/`](./release-notes/) |
| MCP usage and compatibility | [`mcp-usage.md`](./mcp-usage.md), [`mcp-compatibility.md`](./mcp-compatibility.md) |

## Historical Planning Background

| Doc | Role |
| --- | --- |
| [`productization-next-steps-design.md`](./productization-next-steps-design.md) | Older next-step framing. Superseded by [`TODO.md`](./TODO.md) for active work. |
| [`productization-todo-design.md`](./productization-todo-design.md) | Historical implementation-oriented TODO breakdown. |
| [`productization-v1.1-todo-design.md`](./productization-v1.1-todo-design.md) | Historical v1.1 phase design and rationale. |
| [`project-review-todo-design.md`](./project-review-todo-design.md) | Historical review-derived backlog framing. |
| [`productization-roadmap.md`](./productization-roadmap.md) | Older broad roadmap kept for context. |

## Historical Audit Trail

- [`archive/`](./archive/) stores superseded one-off root-level reports and status snapshots.
- [`phases/`](./phases/) records what each phase delivered.
- [`reviews/`](./reviews/) records production review notes for completed phase work.
- [`release-evidence/`](./release-evidence/) stores archived evidence artifacts and reports.
- [`release-notes/`](./release-notes/) stores GitHub Release body drafts.
- [`superpowers/plans/`](./superpowers/plans/) and [`superpowers/specs/`](./superpowers/specs/) preserve implementation plans and design notes.

Historical documents are intentionally retained. When facts conflict, prefer current live docs in this order:

1. [`project-context.json`](./project-context.json) for machine-readable facts.
2. [`HANDOFF.md`](./HANDOFF.md) for maintainer continuation.
3. [`TODO.md`](./TODO.md) for current priorities and open work.
4. [`development-summary.md`](./development-summary.md) and [`project-status-review.md`](./project-status-review.md) for compact human summaries.
5. Phase, review, and archive docs for context only.

## Maintenance Rules

- Keep README files short and user-facing.
- Keep repository-root Markdown limited to public/project-standard entry files such as README, CHANGELOG, and AGENTS; put maintainer docs under `docs/`.
- Keep `HANDOFF.md` focused on current state, guardrails, and high-signal commands.
- Keep `TODO.md` as the only active backlog and priority surface.
- Keep `project-context.json` compact and valid JSON.
- Do not create a new roadmap or TODO doc unless an older one is explicitly downgraded to historical background.
- Do not update every historical phase/review doc when current facts change.
- When a new phase changes current capabilities, update only the live docs that carry that fact.
