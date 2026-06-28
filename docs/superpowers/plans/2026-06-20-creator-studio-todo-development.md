# Creator Studio Dual-Layer Default Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the current Creator Studio production milestone by delivering a host-owned, provider-first `生成并导入` default path while keeping the Creator Studio dashboard as the advanced details and manual-execution surface.

**Architecture:** Keep Creator Studio responsible for task drafting, run workspaces, generation, QA, approval evidence, and review artifacts. Move the ordinary-user orchestration contract to the OpenPet host boundary, with the main process owning long-running default-flow state and the renderer only collecting input, showing progress, and opening details. Preserve provider credentials, trigger persistence, and pet state ownership inside host services.

**Tech Stack:** Electron main process services, Control Center React + Vite renderer, Creator Studio plugin commands and local HTTP service, Node native test runner, Playwright smoke tests.

---

## Milestone Contract

Milestone: Creator Studio dual-layer default-flow closure

Target user capability: a user can submit a natural-language request from the host UI, run a provider-backed `生成并导入` flow without mid-run interruption, and only drop into Creator Studio details when manual review, repair, or debugging is needed.

P0/P1 scope:

- P0: add one host-owned `生成并导入` entry that runs `draft -> auto-answer safe follow-ups -> confirm -> generate -> auto-approve -> import`.
- P0: the default path uses `provider` and blocks early when provider configuration is missing.
- P0: missing trigger input is auto-filled with `manual`.
- P0: provider, QA, approval, and import failures preserve the same run and route to advanced details.
- P0: long-running default-flow ownership lives in the host runtime, not only in transient renderer state.
- P1: add clear ordinary-user copy for the main path and advanced/details copy for Creator Studio.
- P1: add regression coverage for preflight failure, one-click success, auto trigger defaulting, fallback routing, and doc truthfulness.

Out of scope:

- new provider families or secret-storage redesign;
- rich trigger scheduler editor, cooldowns, priorities, or rule simulation;
- reference image upload;
- model-assisted intent parsing;
- full-pet UX redesign;
- provider-backed packaged UI smoke as a baseline gate.

Manual-required:

- real provider generation needs configured provider credentials or local endpoint access;
- final generated asset quality still requires human review;
- packaged provider smoke remains manual follow-up because it needs a configured packaged app session.

Phase limit: 3 phases.

Acceptance criteria:

- `npm start` remains functional.
- `node --test tests/docs/live-docs-creator-studio.test.js tests/control-center/plugin-command-result.test.js tests/services/plugin-service.test.js tests/main/window.test.js tests/main/main-scale-injection.test.js` passes.
- `npx playwright test tests/control-center/control-center-smoke.spec.js --grep "Creator Studio"` passes.
- `npm run typecheck` passes.
- `npm run check:syntax` passes.
- the host-owned default path stays provider-first and does not silently degrade to fixture.
- no API key, provider secret, bridge token, or absolute local artifact path leaks into user-facing logs, prompts, or renderer API payloads.

## Landed Baseline

These pieces already exist and should be extended rather than rewritten:

- conversational task drafting and confirmation through `draft-task`, `answer-question`, and `confirm-task`;
- single-action generation with ordered transparent frames and action QA metadata;
- full-pet provider path with real generated atlas packaging and validation artifacts;
- playback preview and timing diagnostics in the dashboard review surface;
- sanitized prompt provenance and phase-aware imported review surfaces;
- host trigger proposal inbox and host-owned trigger-rule acceptance;
- browser coverage for dashboard run or review flows, `dashboard-browser` regression paths, and Control Center Plugins-pane smoke coverage for Creator Studio handoff;
- `npm run smoke:ai-provider` and `npm run smoke:creator-studio-provider` as technical generation-chain smoke commands;
- packaged Creator Studio evidence runner and packaged Creator Studio fixture UI E2E runner.

The dedicated smoke commands and packaged fixture runner prove technical chain readiness, host-owned model bridge behavior, and packaged fixture interaction. They do not claim final visual quality readiness. Provider-backed packaged smoke remains follow-up work.

## File Structure And Ownership

### Host runtime and orchestration

- Create `src/main/services/creator-studio-default-flow-service.js` to own preflight, step sequencing, progress, failure classification, and details routing payloads.
- Modify `src/main/services/plugin-service.js` to expose a host-callable default-flow entry and safe command helpers without leaking plugin internals to the renderer.
- Modify `main.js` to register and inject the new default-flow service.
- Modify `src/main/window.js` only as needed to wire new IPC handlers or deep-link payloads into Control Center.

### Renderer and Control Center

- Modify `src/control-center/src/api/control-center-api.ts` to add typed calls for starting the default flow, checking provider health, and opening advanced details for a run.
- Modify `src/control-center/src/hooks/usePluginsPane.ts` to keep UI state thin: prompt input, launch request, progress display, and details navigation only.
- Modify `src/control-center/src/panes/PluginsPane.tsx` to present the Creator Studio dual-layer UI with `生成并导入` as the primary action and `查看任务详情` as the advanced path.

### Tests and doc truth

- Modify `tests/control-center/control-center-smoke.spec.js` for the default host flow, provider-blocked path, successful import summary, and advanced fallback routing.
- Modify `tests/control-center/plugin-command-result.test.js` if command-result normalization changes.
- Modify `tests/services/plugin-service.test.js`, `tests/main/window.test.js`, and `tests/main/main-scale-injection.test.js` for main-process orchestration wiring.
- Modify `tests/docs/live-docs-creator-studio.test.js` to keep the spec and plan aligned on provider-first default flow, no-interruption policy, advanced fallback, and packaged-provider follow-up status.

## User Flow Acceptance Map

The implementation is only done when these concrete user stories are true:

1. **Happy path:** a configured user enters one prompt, clicks `生成并导入`, waits, and gets an imported action or pet summary without extra questions.
2. **Provider blocked path:** a user with no healthy provider config is stopped before generation and told to fix AI/provider settings.
3. **Needs-details path:** a run that still needs manual input or repair reopens the same `runId` in Creator Studio details.
4. **Advanced path:** a user can still open Creator Studio directly and run the workflow step by step.

Each phase should protect at least one of these stories, and final verification should cover all four.

## Runtime Sequence To Preserve

The plan assumes one fixed default-flow sequence:

1. renderer submits prompt;
2. preload forwards typed IPC;
3. main-process service performs preflight;
4. host runtime executes `draft-task`;
5. host runtime auto-answers only safe trigger gaps with `manual`;
6. host runtime executes `confirm-task`;
7. host runtime executes `run-step` on `provider`;
8. hard QA success triggers `approve-run`;
9. approved run triggers host import;
10. failures reopen the same run in advanced details.

Any implementation that changes this sequence needs an explicit spec update, not an ad hoc code change.

## Phase 1: Main-Process Default-Flow Contract

**Phase goal:** Move one-click orchestration ownership to the host runtime so the default flow survives renderer reloads and keeps plugin boundaries narrow.

**P0/P1 mapping:** P0 long-running orchestration ownership, P0 provider-first sequencing, P0 failure classification.

**Files:**
- Create: `src/main/services/creator-studio-default-flow-service.js`
- Modify: `src/main/services/plugin-service.js`
- Modify: `main.js`
- Modify: `src/main/window.js`
- Test: `tests/services/plugin-service.test.js`
- Test: `tests/main/window.test.js`
- Test: `tests/main/main-scale-injection.test.js`

**Implementation checklist:**

- [ ] define one host-side start method that accepts prompt text plus minimal current-pet context and always selects `provider`;
- [ ] add provider preflight that returns a user-facing blocked reason when no healthy provider configuration exists;
- [ ] sequence `draft-task`, safe auto-answer, `confirm-task`, `run-step`, `approve-run`, and `import-approved-action` or `import-approved-pet` inside host runtime code;
- [ ] treat only the missing trigger question as auto-answerable in this milestone and fill it with `manual`;
- [ ] preserve `runId`, step, and failure reason so the renderer can reopen advanced details for the same run;
- [ ] avoid writing secrets or absolute local paths into flow progress or error payloads.

**Verification:**

Run:

```bash
node --test tests/services/plugin-service.test.js tests/main/window.test.js tests/main/main-scale-injection.test.js
```

Expected:

- host runtime can start the default flow without renderer-owned sequencing;
- provider preflight failures are returned as blocked host results;
- failure payloads include the run ID and advanced-details route target without leaking secrets.

**Phase output for reviewers:**

- one host-owned entrypoint exists for the default Creator Studio flow;
- the authoritative run sequence no longer lives in renderer hooks;
- run IDs survive failure paths so details can reopen the exact run.

**Phase review gate:**

- run production review on the phase diff;
- blocking issue example: renderer still owns the authoritative sequence or progress state.

## Phase 2: Dual-Layer Host UI

**Phase goal:** Expose the ordinary-user main path in Control Center while keeping Creator Studio clearly framed as the advanced details surface.

**P0/P1 mapping:** P0 host entry, P1 user-facing copy, P1 details navigation.

**Files:**
- Modify: `src/control-center/src/api/control-center-api.ts`
- Modify: `src/control-center/src/hooks/usePluginsPane.ts`
- Modify: `src/control-center/src/panes/PluginsPane.tsx`
- Test: `tests/control-center/control-center-smoke.spec.js`
- Test: `tests/control-center/plugin-command-result.test.js`

**Implementation checklist:**

- [ ] show a Creator Studio host panel in `Plugins` with prompt input, primary `生成并导入`, and secondary `查看任务详情`;
- [ ] call the host default-flow API instead of sequencing the plugin workflow directly in the renderer;
- [ ] show concise ordinary-user progress copy and imported-result summary without run-internal jargon by default;
- [ ] route provider preflight blockers to AI or model settings with a precise setup message;
- [ ] when the host returns a failed run, keep the failure summary short and offer advanced details for the same run.

**Verification:**

Run:

```bash
npx playwright test tests/control-center/control-center-smoke.spec.js --grep "Creator Studio"
npm run typecheck
```

Expected:

- the host-owned Creator Studio entry is visible;
- provider-not-configured blocks before generation;
- successful default flow reaches imported action summary;
- failed default flow offers advanced details for the same run.

**Phase output for reviewers:**

- ordinary-user copy stays simple and avoids plugin implementation jargon;
- `查看任务详情` remains available without becoming the required path;
- provider-first behavior is visible from the UI and test coverage, not only from internal code.

**Phase review gate:**

- run production review on the phase diff;
- blocking issue example: the renderer still contains the authoritative orchestration logic instead of acting as a thin client.

## Phase 3: Hardening, Truthfulness, and Follow-Up Boundaries

**Phase goal:** Lock the milestone behavior with regression coverage and make the docs, smoke commands, and packaged-work statements consistent.

**P0/P1 mapping:** P1 regression coverage, P1 doc truthfulness, P1 milestone closure clarity.

**Files:**
- Modify: `tests/docs/live-docs-creator-studio.test.js`
- Modify: `docs/superpowers/specs/2026-06-19-creator-studio-conversational-generation-todo.md`
- Modify: `docs/superpowers/plans/2026-06-20-creator-studio-todo-development.md`
- Modify: `tests/control-center/control-center-smoke.spec.js` as needed for final assertions

**Implementation checklist:**

- [ ] assert that active docs describe the provider-first default path, no-interruption rule, advanced-details fallback, and packaged-provider smoke as follow-up;
- [ ] keep landed facts truthful: playback preview and timing diagnostics, browser regressions, `npm run smoke:ai-provider`, `npm run smoke:creator-studio-provider`, packaged evidence, and packaged fixture UI E2E;
- [ ] make sure the plan, spec, and UI terminology all use the same dual-layer language;
- [ ] leave richer trigger editing, packaged-provider smoke, and broader full-pet UX in backlog rather than silently expanding scope.

**Verification:**

Run:

```bash
node --test tests/docs/live-docs-creator-studio.test.js tests/control-center/plugin-command-result.test.js
npm run check:syntax
```

Expected:

- live-docs tests pass against the updated spec and plan;
- syntax check passes;
- the remaining packaged-app work is clearly documented as follow-up rather than implied as already complete.

**Phase output for reviewers:**

- docs, tests, and UI all use the same dual-layer language;
- packaged fixture evidence is described as landed;
- packaged provider smoke remains explicitly outside this milestone.

**Phase review gate:**

- run production review on the final phase diff;
- blocking issue example: docs claim provider-backed packaged UI smoke or main-process ownership that the implementation does not actually provide.

## Review Output Contract

At the end of each phase, produce a review report in this format:

```text
严重问题：
中等问题：
非阻塞建议：
安全风险：
稳定性风险：
可维护性风险：
测试覆盖：
质量评分：
通过状态：通过 / 有条件通过 / 不通过
```

Fix P0/P1 blocking issues before phase completion. Non-blocking suggestions go to backlog.

## Stop Condition

Stop after Phase 3 when:

- the host runtime owns the default-flow sequence;
- ordinary users can use a provider-first `生成并导入` path without mid-run questioning;
- failures preserve the run and route to advanced details;
- docs, tests, and UI language all agree on the dual-layer model;
- packaged-provider smoke is explicitly left as the next milestone rather than silently pulled into scope.
