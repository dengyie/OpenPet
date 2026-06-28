# OpenPet Documentation Map

This file is the documentation entry point for maintainers. It keeps current operating documents separate from historical phase records so contributors do not need to read every file before making a change.

## Start Here

| Need | Read |
| --- | --- |
| User-facing overview and commands | [`../README.md`](../README.md) / [`../README.zh-CN.md`](../README.zh-CN.md) |
| Current maintainer handoff | [`HANDOFF.md`](./HANDOFF.md) |
| Short engineering summary | [`development-summary.md`](./development-summary.md) |
| Machine-readable project facts | [`project-context.json`](./project-context.json) |
| Current platform status and remaining gaps | [`project-status-review.md`](./project-status-review.md) |
| Current code-aligned TODO architecture | [`openpet-current-todo-architecture.md`](./openpet-current-todo-architecture.md) |

## Product Areas

| Area | Canonical docs |
| --- | --- |
| Extension authoring and ecosystem rules | [`plugin-development.md`](./plugin-development.md), [`plugin-ecosystem-rules.md`](./plugin-ecosystem-rules.md), [`plugin-submission-workflow-playbook.md`](./plugin-submission-workflow-playbook.md) |
| Plugin sandbox posture | [`plugin-sandbox-evaluation.md`](./plugin-sandbox-evaluation.md) |
| AI provider settings UX | [`ai-provider-settings-ux-design.md`](./ai-provider-settings-ux-design.md) |
| AI Talk and pet dialogue | [`openpet-current-todo-architecture.md`](./openpet-current-todo-architecture.md), [`superpowers/specs/2026-06-20-pet-dialogue-phase1-design.md`](./superpowers/specs/2026-06-20-pet-dialogue-phase1-design.md), [`superpowers/specs/2026-06-28-real-provider-chat-acceptance-runbook.md`](./superpowers/specs/2026-06-28-real-provider-chat-acceptance-runbook.md) |
| Creator Studio and model-generation backlog | [`superpowers/specs/2026-06-19-creator-studio-conversational-generation-todo.md`](./superpowers/specs/2026-06-19-creator-studio-conversational-generation-todo.md), [`superpowers/specs/2026-06-19-openpet-model-settings-backlog.md`](./superpowers/specs/2026-06-19-openpet-model-settings-backlog.md), [`superpowers/specs/2026-06-20-openpet-creator-prompt-builder-design.md`](./superpowers/specs/2026-06-20-openpet-creator-prompt-builder-design.md) |
| Desktop release evidence | [`desktop-release-design.md`](./desktop-release-design.md), [`release-checklist.md`](./release-checklist.md) |
| Release notes | [`release-notes/`](./release-notes/) |
| MCP usage and compatibility | [`mcp-usage.md`](./mcp-usage.md), [`mcp-compatibility.md`](./mcp-compatibility.md) |

## Planning Docs

| Doc | Role |
| --- | --- |
| [`productization-next-steps-design.md`](./productization-next-steps-design.md) | High-level next-step design. Use for productization direction, not exact current state. |
| [`productization-v1.1-todo-design.md`](./productization-v1.1-todo-design.md) | Detailed phase execution design and completed phase index. |
| [`project-review-todo-design.md`](./project-review-todo-design.md) | Consolidated review-derived TODO design. |
| [`openpet-current-todo-architecture.md`](./openpet-current-todo-architecture.md) | Live TODO entry point grouped by current runtime/service boundaries. |
| [`productization-roadmap.md`](./productization-roadmap.md) | Older broad roadmap. Treat as background unless a live doc links a current item to it. |

## Historical Audit Trail

- [`phases/`](./phases/) records what each phase delivered.
- [`reviews/`](./reviews/) records production review notes for completed phase work.
- [`release-evidence/`](./release-evidence/) stores archived evidence artifacts and reports, including maintained real-provider smoke archives such as `ai-provider-smoke/`, `ai-talk-local-smoke/`, and `creator-studio-provider-smoke/`, packaged runtime smoke archives under `packaged-runtime/`, and release-claim closure archives under `signed-release-closure/`.
- [`release-notes/`](./release-notes/) stores GitHub Release body drafts.
- [`superpowers/plans/`](./superpowers/plans/) and [`superpowers/specs/`](./superpowers/specs/) preserve implementation plans and design notes.

Historical documents are intentionally retained. When facts conflict, prefer current live docs in this order:

1. [`project-context.json`](./project-context.json) for machine-readable facts.
2. [`HANDOFF.md`](./HANDOFF.md) for maintainer continuation.
3. [`development-summary.md`](./development-summary.md) and [`project-status-review.md`](./project-status-review.md) for human summaries.
4. Phase/review docs for audit history only.

## Maintenance Rules

- Keep README files short and user-facing.
- Keep HANDOFF focused on current state, commands, facts to preserve, and next steps.
- Keep project-context compact and valid JSON.
- Do not update every historical phase/review doc when current facts change.
- When a new phase changes current capabilities, update only the live docs that carry that fact.
