# IM Gateway Stage 3 Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Phase 1 IM Gateway MVP by adding the first-class Control Center Plugins pane card, documenting the remaining IM roadmap, and verifying the milestone.

**Architecture:** Keep IM connection behavior inside the bundled official `openpet.im-gateway` plugin. The host owns secret state and exposes only renderer-safe token presence through the existing Control Center API. The Plugins pane renders a small IM-specific card beside the existing service, native execution, and config controls.

**Tech Stack:** React, TypeScript, Vite Control Center, Playwright smoke tests, Node native test runner, existing plugin IPC contracts.

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/1dc8/OpenPet` on branch `dev9`.
- Do not edit the protected primary worktree at `/Users/mango/project/codex/OpenPet`.
- Keep Phase 1 scoped to Telegram long polling, QQ and WeChat disabled skeletons, explicit triggers, allowlists, redacted health/logs, and no raw IM text persistence.
- Do not expose the Telegram bot token back to the renderer after save.
- Do not add Phase 2 AI chat bridge behavior in this stage.
- Commit Stage 3 atomically after tests pass.

---

### Task 1: Add the Control Center RED test

**Files:**
- Modify: `tests/control-center/control-center-smoke.spec.js`

**Interfaces:**
- Consumes: `demoControlCenterAPI.getImGatewaySecretState()`, `saveImGatewayTelegramBotToken(token)`, and `clearImGatewayTelegramBotToken()` through the browser fallback API.
- Produces: Playwright coverage for the IM Gateway card, token saved state, token clearing, and token non-rendering.

- [ ] **Step 1: Write the failing Playwright test**

Add a test that seeds `openpet.im-gateway`, opens Plugins, saves `123456:stage3-secret-token`, verifies the saved state flips to `Telegram token: saved`, verifies the raw token is not visible after save, clears the token, and verifies the state returns to `Telegram token: not saved`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:control-center -- --grep "manages IM Gateway"
```

Expected: FAIL because the IM Gateway settings card and token controls do not exist yet.

### Task 2: Wire IM secret state through the Plugins pane hook

**Files:**
- Modify: `src/control-center/src/hooks/usePluginsPane.ts`
- Modify: `src/control-center/src/panes/PluginsPane.tsx`

**Interfaces:**
- Consumes: `api.getImGatewaySecretState()`, `api.saveImGatewayTelegramBotToken(token)`, `api.clearImGatewayTelegramBotToken()`.
- Produces: `imGatewaySecretState`, `imGatewayTelegramTokenDraft`, `savingImGatewayTelegramToken`, `clearingImGatewayTelegramToken`, `onChangeImGatewayTelegramTokenDraft`, `onSaveImGatewayTelegramBotToken`, and `onClearImGatewayTelegramBotToken` pane props.

- [ ] **Step 1: Add failing type-level usage**

Extend `PluginsPaneProps` with the new IM props before implementation so TypeScript identifies missing values in `usePluginsPane`.

- [ ] **Step 2: Implement minimal hook state and handlers**

Load the IM secret state alongside plugins/logs, save token drafts through the API, clear drafts after save, refresh the boolean state after save/clear, and set concise status messages.

- [ ] **Step 3: Run targeted typecheck**

Run:

```bash
npm run typecheck -- --pretty false
```

Expected: PASS.

### Task 3: Render the IM Gateway settings card

**Files:**
- Modify: `src/control-center/src/panes/PluginsPane.tsx`
- Modify: `docs/superpowers/specs/2026-07-08-im-gateway-core-plugin-design.md`

**Interfaces:**
- Consumes: pane props from Task 2.
- Produces: A first-class `aria-label="IM Gateway 设置"` card only for `plugin.id === 'openpet.im-gateway'`.

- [ ] **Step 1: Add the card UI**

Render a compact card with `IM Gateway`, `Telegram token: saved/not saved`, QQ and WeChat disabled status, a password input labeled `Telegram Bot Token`, `Save Telegram Token`, and `Clear Telegram Token`.

- [ ] **Step 2: Keep token text out of rendered state after save**

Clear `imGatewayTelegramTokenDraft` after a successful save so the saved token is not visible in the page.

- [ ] **Step 3: Update future-work documentation**

Add a Stage 3 status note and keep later Phase 2-7 development items in the spec as explicit future work.

### Task 4: Verify and commit Stage 3

**Files:**
- Test: `tests/control-center/control-center-smoke.spec.js`
- Test: `tests/control-center/demo-control-center-api.test.js`
- Test: existing IM Gateway host/plugin tests from Stages 1 and 2

**Interfaces:**
- Produces: An atomic Stage 3 commit on `dev9`.

- [ ] **Step 1: Run targeted Stage 3 verification**

Run:

```bash
npm run test:control-center -- --grep "manages IM Gateway"
node --test tests/control-center/demo-control-center-api.test.js
npm run typecheck -- --pretty false
```

Expected: PASS.

- [ ] **Step 2: Run milestone regression verification**

Run:

```bash
node --test tests/examples/im-gateway-plugin.test.js tests/services/plugin-service.test.js tests/main/ipc-plugin-install.test.js tests/main/main-scale-injection.test.js tests/main/test-script-coverage.test.js tests/control-center/demo-control-center-api.test.js
git diff --check
```

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-07-08-im-gateway-stage3-control-center.md docs/superpowers/specs/2026-07-08-im-gateway-core-plugin-design.md tests/control-center/control-center-smoke.spec.js src/control-center/src/hooks/usePluginsPane.ts src/control-center/src/panes/PluginsPane.tsx
git commit -m "feat: add IM gateway control center card"
```
