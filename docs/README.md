# OpenPet Documentation Map

This file is the only day-to-day developer-doc entry point for the repository.

Do not start by browsing all of `docs/`. OpenPet keeps phase notes, reviews,
roadmaps, and release evidence for auditability, but routine development should
stay on a small fixed live-doc stack.

## Live-Doc Contract

These are the canonical current docs. If a fact changes, update the owner here
instead of copying the same explanation into multiple files.

| Doc | Owns | Read when | Update when |
| --- | --- | --- | --- |
| `AGENTS.md` | worktree guardrails and repository rules | before any edit | branch/worktree rules or local constraints change |
| [`../README.md`](../README.md) / [`../README.zh-CN.md`](../README.zh-CN.md) | public overview and quick start | when you need product-level context | public capability, setup, or support wording changes |
| [`docs/README.md`](./README.md) | developer-doc entry, reading order, doc ownership | always first for docs | doc structure or ownership changes |
| [`jishuwendang.md`](./jishuwendang.md) | detailed architecture, workflow, engineering boundaries | when building or changing code | service boundaries, commands, or engineering rules change |
| [`testing-strategy.md`](./testing-strategy.md) | test taxonomy and merge expectations | before choosing regression scope | test entrypoints, gates, or deletion policy change |
| [`HANDOFF.md`](./HANDOFF.md) | current continuation context | when continuing active work | current truth, risks, or recommended next work change |
| [`openpet-current-todo-architecture.md`](./openpet-current-todo-architecture.md) | live next-milestone map by owner boundary | when choosing the next bounded milestone | priorities or ownership boundaries change |
| [`development-summary.md`](./development-summary.md) | short English engineering sync | when you need a quick human summary | capability summary or baseline changes |
| [`project-context.json`](./project-context.json) | machine-readable project facts | when automation/agents need compact context | machine-consumed facts change |
| [`project-documentation-design.md`](./project-documentation-design.md) | documentation governance and creation rules | when changing doc structure or adding new top-level docs | documentation operating model changes |

## Default Development Path

If you want the shortest path to start real work, use this order:

1. `AGENTS.md`
2. [`jishuwendang.md`](./jishuwendang.md)
3. [`testing-strategy.md`](./testing-strategy.md)
4. [`HANDOFF.md`](./HANDOFF.md)
5. [`openpet-current-todo-architecture.md`](./openpet-current-todo-architecture.md)

This path answers, in order: constraints, architecture, tests, current state,
and the next bounded milestone.

## Reading Paths

### New to the repository

1. [`../README.md`](../README.md) / [`../README.zh-CN.md`](../README.zh-CN.md)
2. [`jishuwendang.md`](./jishuwendang.md)
3. [`testing-strategy.md`](./testing-strategy.md)
4. [`development-summary.md`](./development-summary.md)
5. [`HANDOFF.md`](./HANDOFF.md)
6. [`openpet-current-todo-architecture.md`](./openpet-current-todo-architecture.md)

### Continuing the current work session

1. `AGENTS.md`
2. [`HANDOFF.md`](./HANDOFF.md)
3. [`jishuwendang.md`](./jishuwendang.md)
4. [`testing-strategy.md`](./testing-strategy.md)
5. [`openpet-current-todo-architecture.md`](./openpet-current-todo-architecture.md)

### Updating documentation itself

1. [`project-documentation-design.md`](./project-documentation-design.md)
2. this file
3. the single owner doc for the fact you are changing

### Need machine-readable facts

1. [`project-context.json`](./project-context.json)

## Write Path

Before editing docs, decide which file owns the fact:

- Product/setup/support claim: root `README*`
- Dev reading order or doc ownership: `docs/README.md`
- Architecture, commands, or workflow: `docs/jishuwendang.md`
- Regression scope and merge expectations: `docs/testing-strategy.md`
- Current continuation context: `docs/HANDOFF.md`
- Next milestone map: `docs/openpet-current-todo-architecture.md`
- Machine-consumed facts: `docs/project-context.json`
- Rules for adding/splitting docs: `docs/project-documentation-design.md`

If you cannot point to one owner, fix the ownership first instead of adding a
new overlapping document.

## Milestone Closeout Checklist

Before claiming a milestone is done, confirm these owner docs are updated when
their facts changed:

- Public capability, installation, or support wording: root `README*`
- Developer reading order or doc ownership: `docs/README.md`
- Service boundaries, commands, or architectural truth: `docs/jishuwendang.md`
- Test entrypoints, merge gates, or deletion policy: `docs/testing-strategy.md`
- Current session truth and next bounded work: `docs/HANDOFF.md`
- Next milestone map and priority shifts: `docs/openpet-current-todo-architecture.md`
- Short status summary for fast orientation: `docs/development-summary.md`
- Machine-consumed facts: `docs/project-context.json`

## Domain Docs

| Area | Canonical docs |
| --- | --- |
| Extension authoring and ecosystem rules | [`plugin-development.md`](./plugin-development.md), [`plugin-ecosystem-rules.md`](./plugin-ecosystem-rules.md), [`plugin-submission-workflow-playbook.md`](./plugin-submission-workflow-playbook.md) |
| Plugin sandbox posture | [`plugin-sandbox-evaluation.md`](./plugin-sandbox-evaluation.md) |
| AI provider UX and AI Talk direction | [`ai-provider-settings-ux-design.md`](./ai-provider-settings-ux-design.md), [`openpet-current-todo-architecture.md`](./openpet-current-todo-architecture.md) |
| Creator Studio backlog and prompt flow | [`superpowers/specs/2026-06-19-creator-studio-conversational-generation-todo.md`](./superpowers/specs/2026-06-19-creator-studio-conversational-generation-todo.md), [`superpowers/specs/2026-06-19-openpet-model-settings-backlog.md`](./superpowers/specs/2026-06-19-openpet-model-settings-backlog.md), [`superpowers/specs/2026-06-20-openpet-creator-prompt-builder-design.md`](./superpowers/specs/2026-06-20-openpet-creator-prompt-builder-design.md) |
| Desktop release evidence | [`desktop-release-design.md`](./desktop-release-design.md), [`release-checklist.md`](./release-checklist.md) |
| MCP usage and compatibility | [`mcp-usage.md`](./mcp-usage.md), [`mcp-compatibility.md`](./mcp-compatibility.md) |

## Planning And Historical Records

| Path | Purpose |
| --- | --- |
| [`project-status-review.md`](./project-status-review.md) | periodic status audit snapshot; may lag the canonical live docs above |
| [`project-review-todo-design.md`](./project-review-todo-design.md) | consolidated review-derived design backlog |
| [`productization-next-steps-design.md`](./productization-next-steps-design.md), [`productization-v1.1-todo-design.md`](./productization-v1.1-todo-design.md), [`productization-todo-design.md`](./productization-todo-design.md), [`productization-roadmap.md`](./productization-roadmap.md) | broader productization planning and older roadmap context |
| [`pet-platform-development-plan.md`](./pet-platform-development-plan.md) | original platform-evolution design record |
| [`phases/`](./phases/) | historical implementation records by phase |
| [`reviews/`](./reviews/) | production review records |
| [`release-evidence/`](./release-evidence/) | archived evidence artifacts and reports |
| [`release-notes/`](./release-notes/) | release body drafts |
| [`superpowers/plans/`](./superpowers/plans/) and [`superpowers/specs/`](./superpowers/specs/) | implementation plans and design notes |

## Maintenance Rules

- Keep root README files short and user-facing.
- Keep `docs/README.md` as the only development-doc index.
- Keep `HANDOFF.md` short and operational. Do not let it become a second
  architecture guide or roadmap.
- Keep `jishuwendang.md` as the single detailed developer guide.
- Keep `testing-strategy.md` as the owner of test taxonomy, merge gates, and
  test-deletion guidance.
- Keep `openpet-current-todo-architecture.md` as the live next-milestone map.
- Keep `development-summary.md` short; it is an orientation note, not a second
  architecture manual.
- Treat `project-status-review.md` and long-form roadmap docs as periodic audit
  material unless they are explicitly refreshed.
- Treat `phases/`, `reviews/`, release evidence, and old roadmap docs as audit
  history. Do not rewrite them just because current facts changed.
- Before adding a new top-level document under `docs/`, first decide why the
  fact cannot live under one of the existing owners above.

When facts conflict, prefer live docs in this order:

1. [`project-context.json`](./project-context.json) for machine-consumed facts.
2. [`HANDOFF.md`](./HANDOFF.md) for current continuation.
3. [`jishuwendang.md`](./jishuwendang.md) for architecture and workflow.
4. [`testing-strategy.md`](./testing-strategy.md) for test expectations.
5. [`development-summary.md`](./development-summary.md) and
   [`project-status-review.md`](./project-status-review.md) for short human
   summaries.
