# Extension Ecosystem Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the OpenPet plugin/extension development documentation so `/Users/mango/project/codex/weather-morning-report/docs/OPENPET_EXTENSION_ECOSYSTEM_BOUNDARY.md` is treated as the source of truth.

**Architecture:** Keep historical phase documents intact, because they describe past implementation stages. Rewrite the current author-facing and ecosystem-facing docs around one developer-first local extension model while explicitly marking the legacy SDK runner as a compatibility path until the runtime catches up.

**Tech Stack:** Markdown documentation, existing OpenPet `plugin.json` package vocabulary, Electron local extension platform concepts.

---

### Task 1: Rewrite Author Guide

**Files:**
- Modify: `docs/plugin-development.md`

- [x] **Step 1: Replace old restricted SDK framing**

Write `docs/plugin-development.md` as the current author entry point for local extensions. The document must define extension packages around `plugin.json`, `entries.commands`, `entries.services`, `entries.dashboards`, `manifest`, optional `config`, and `assets`.

- [x] **Step 2: Preserve compatibility status**

Include a section that says existing examples and validation commands still cover the legacy short-lived JavaScript SDK path, while new development should align to the unified extension model.

- [x] **Step 3: Include practical examples**

Add command, service, dashboard, setup, result JSON, environment variable, bridge, data ownership, pet integration, and pet asset workflow examples.

### Task 2: Rewrite Ecosystem Rules

**Files:**
- Modify: `docs/plugin-ecosystem-rules.md`

- [x] **Step 1: Replace restrictive policy language**

Rewrite the document around lifecycle management, transparent declarations, structural package safety, honest product language, and broad third-party local automation.

- [x] **Step 2: Clarify what OpenPet does not promise**

State that OpenPet does not fully sandbox arbitrary local processes, audit every undeclared behavior, control every secret, or centrally approve local experimentation.

- [x] **Step 3: Add reviewer and author guidance**

Define source labels, manifest review, setup/uninstall behavior, compatibility expectations, and welcoming third-party author guidance.

### Task 3: Update README Entrypoints

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [x] **Step 1: Update project positioning**

Replace "permission-limited plugin system" phrasing with "developer-first local extension platform" phrasing.

- [x] **Step 2: Update plugin development section**

Rename or reframe the section as extension development, point to the rewritten docs, and keep legacy examples as compatibility examples rather than the whole ecosystem boundary.

### Task 4: Verify Documentation Consistency

**Files:**
- Inspect: `docs/plugin-development.md`
- Inspect: `docs/plugin-ecosystem-rules.md`
- Inspect: `README.md`
- Inspect: `README.zh-CN.md`

- [x] **Step 1: Search for stale restrictive claims in edited files**

Run:

```bash
rg -n "permission-limited|unrestricted Node|fully sandbox|permission-gated|network allowlist|do not require user secrets|hard compatibility" README.md README.zh-CN.md docs/plugin-development.md docs/plugin-ecosystem-rules.md
```

Expected: Any remaining matches are intentionally framed as legacy compatibility or non-guarantee language.

- [x] **Step 2: Check changed-file diff**

Run:

```bash
git diff -- README.md README.zh-CN.md docs/plugin-development.md docs/plugin-ecosystem-rules.md docs/superpowers/plans/2026-06-17-extension-ecosystem-docs.md
```

Expected: Diff only contains documentation changes aligned to the boundary design.
