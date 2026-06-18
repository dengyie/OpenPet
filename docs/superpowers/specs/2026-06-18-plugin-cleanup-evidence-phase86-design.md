# Plugin Cleanup Evidence Phase 86 Design

**Goal:** Add repeatable cleanup evidence tooling that records controlled host process-tree cleanup and validates broader real-host plugin cleanup evidence reports.

**Architecture:** Keep runtime cleanup semantics unchanged. Add one standalone evidence script that starts a controlled root process plus descendant, invokes `service-process-tree` cleanup, waits for root and descendant exit, and writes JSON/Markdown evidence with conservative claim language. Add a separate checklist report generator/validator for maintainer-filled evidence across service/setup/command cleanup paths.

**Tech Stack:** Node scripts, existing `src/main/services/service-process-tree.js`, Node native tests, shared TypeScript contracts, release evidence docs.

---

## Problem

Phases 68-73 hardened service/setup/command cleanup behavior with exit-confirmed state, bounded service force-stop, and process-tree fallback. Those phases have strong unit coverage, but the live docs still call out a need for stronger cleanup evidence on real hosts.

Phase 86 closes that evidence gap without expanding plugin powers or promising universal cleanup. It records a controlled host run: OpenPet starts a small local process tree it owns, applies the existing cleanup helper, and stores the result as auditable evidence. It also provides a structured checklist report for broader real-host cleanup evidence that may be filled from packaged app runs, terminal transcripts, logs, or CI artifacts.

## Scope

In scope:

- add `npm run create-plugin-cleanup-evidence`;
- add `npm run create-plugin-cleanup-evidence-report`;
- add `npm run validate-plugin-cleanup-evidence-report`;
- write `plugin-cleanup-evidence.json` and `plugin-cleanup-evidence.md`;
- validate structured checklist reports with pending and readiness modes;
- refuse to overwrite existing evidence files;
- include generated time, platform, signal, root PID, descendant PIDs before cleanup, live descendants after cleanup, root/descendant exit status, warnings, and claim boundary;
- add shared TypeScript contract coverage for the report shape;
- archive one current macOS host evidence run.

Out of scope:

- no changes to `PluginService` stop behavior;
- no new force-stop policy;
- no new plugin permissions;
- no renderer or plugin bridge access;
- no claim that every plugin process tree can always be terminated on every OS.

## Decisions

### Decision 1: evidence command, not runtime behavior

Problem: real-host evidence is missing, but runtime cleanup semantics already have a documented boundary.

Choice: add a standalone evidence script that exercises the existing cleanup helper.

Reason: this gives maintainers a repeatable proof artifact without changing production stop behavior.

### Decision 2: controlled fixture only

Problem: killing arbitrary external process trees would be unsafe.

Choice: the script starts its own root process and descendant, then only targets that owned root PID and known descendant PIDs.

Reason: evidence collection must be safe enough for local maintainers and CI-like hosts.

### Decision 3: conservative report wording

Problem: a passing local cleanup run can be misread as a universal guarantee.

Choice: every report includes a claim boundary and warnings that scope the evidence to one controlled host/session.

Reason: OpenPet should gain evidence without overstating sandbox or cleanup guarantees.

## Acceptance

- `npm run create-plugin-cleanup-evidence -- --output-dir <dir>` writes JSON and Markdown evidence.
- `npm run create-plugin-cleanup-evidence-report -- --output <report.json>` writes a pending checklist report.
- `npm run validate-plugin-cleanup-evidence-report -- <report.json> --allow-pending` validates in-progress reports.
- `npm run validate-plugin-cleanup-evidence-report -- <report.json>` requires every cleanup check to pass with evidence.
- The command refuses to overwrite existing evidence.
- The report marks `ok: true` only when cleanup was attempted, the root exits, and no pre-cleanup descendants remain live.
- Tests cover CLI parsing, actual controlled host evidence generation, overwrite refusal, conservative Markdown wording, pending/readiness report validation, and malformed cleanup checks.
- Shared TypeScript contracts cover `PluginCleanupEvidenceReport`.
- Live docs describe Phase 86 as evidence collection, not stronger runtime cleanup semantics.
