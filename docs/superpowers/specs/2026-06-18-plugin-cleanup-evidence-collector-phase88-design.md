# Plugin Cleanup Evidence Collector Phase 88 Design

**Goal:** Add a local helper generator that reduces manual cleanup evidence collection drift without automatically passing any cleanup check.

**Architecture:** Keep Phase 86 reports and Phase 87 updater as the source of truth. Add a standalone Node generator that validates an existing cleanup evidence report in pending mode and emits a POSIX helper script containing a manual checklist plus updater command notes.

**Tech Stack:** Node scripts, CommonJS, POSIX shell helper generation, Node native tests, existing cleanup evidence report validator/updater.

---

## Problem

Phase 86 created cleanup evidence reports, and Phase 87 made those reports safer to update. Maintainers still need a consistent checklist for real-host evidence collection so every cleanup check is filled with the right type of proof and no helper accidentally marks evidence as passing.

## Scope

In scope:

- add `npm run create-plugin-cleanup-evidence-collector`;
- validate the input cleanup evidence report with pending checks allowed;
- generate `plugin-cleanup-evidence-collector.sh`;
- include `manual-checks.md` content for every required cleanup check;
- include `update-report-commands.md` content that points at the Phase 87 updater;
- keep generated command notes evidence-first, focused on metadata updates and validation;
- avoid any literal `--status pass` command in generated collector content;
- keep cleanup execution and readiness decisions manual/reviewed.

Out of scope:

- no runtime cleanup changes;
- no automatic packaged-app cleanup collector;
- no plugin, renderer, bridge, or filesystem permission expansion;
- no automatic pass/fail decision;
- no universal process-tree cleanup guarantee.

## Decisions

### Decision 1: generated helper, not automatic collector

Problem: maintainers need collection consistency, but automatic cleanup validation can overclaim platform guarantees.

Choice: generate a POSIX helper that writes checklist and command-note files only.

Reason: operators get repeatable prompts while readiness remains an explicit review decision.

### Decision 2: validate input report first

Problem: a malformed report would make generated update instructions misleading.

Choice: require the report to pass the Phase 86 validator with `allowPending`.

Reason: generated commands always target a structurally valid required-check matrix.

### Decision 3: no preselected pass status

Problem: helper-generated status commands could encourage evidence laundering.

Choice: generated command notes avoid status changes and warn maintainers not to mark pass without proof.

Reason: pass/fail/blocked remains a reviewed human decision.

## Acceptance

- `npm run create-plugin-cleanup-evidence-collector -- <report.json>` writes `plugin-cleanup-evidence-collector.sh` next to the report by default.
- `--output <collector.sh>` writes the helper to a chosen path.
- invalid reports are rejected before helper generation.
- generated manual checklist includes every required cleanup check id and label.
- generated update notes reference `npm run update-plugin-cleanup-evidence-report`.
- generated content does not include `--status pass`.
- docs describe the collector as evidence-gathering assistance, not cleanup readiness proof.
