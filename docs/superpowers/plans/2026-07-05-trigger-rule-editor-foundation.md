# Trigger Rule Editor Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users view, edit, and save existing host-owned `random` / `state` / `event` trigger rules from the Control Center Actions pane without expanding scope into a full rule builder.

**Architecture:** Reuse the existing durable trigger-rule pipeline instead of inventing a second rule store. Widen the current update path so one host-owned mutation flow can update rule status and `ruleSpec`, then add a minimal inline editor in the existing Actions pane that edits only the fields already modeled in `ActionTriggerRuleSpec`.

**Tech Stack:** Electron IPC, Node services, React 19, TypeScript shared contracts, Playwright, Node native test runner

## Global Constraints

- Work only in `/Users/mango/.codex/worktrees/ef96/OpenPet` on branch `codex/dev7`.
- Keep the milestone scoped to host-owned trigger rule editing for existing `random`, `state`, and `event` rules.
- Do not expand into Creator Studio workflow redesign, plugin-side rule mutation, demo API redesign, or other plugin contracts.
- `PetService` remains the single source of truth for pet action execution; trigger-rule edits only change persisted action config and runtime refresh.
- Plugins must not gain direct rule mutation rights beyond the existing host-owned review/apply flow.
- All new user-facing configuration must remain operable through the Control Center UI.
- `npm start` must remain functional.
- Use `apply_patch` for file edits.
- Do not claim manual validation or release evidence in this milestone.

---

## File Structure

- Modify: `src/shared/openpet-contracts.ts`
  - Add the shared request contract for editing an existing trigger rule.
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/ipc-channels.js`
  - Keep channel names aligned while broadening the payload carried by `ACTIONS_UPDATE_TRIGGER_RULE`.
- Modify: `control-center-preload.js`
  - Expose a new renderer-safe API method for rule content updates while keeping the existing status toggle helper.
- Modify: `src/main/services/action-service.js`
  - Add one host-owned `updateTriggerRule(...)` mutation that normalizes and persists edited `ruleSpec`.
- Modify: `src/main/ipc.js`
  - Route the broadened update payload to the new action-service mutation and refresh trigger runtime.
- Modify: `src/control-center/src/hooks/useActionsPane.ts`
  - Add the save handler for edited trigger rules and keep status messaging consistent.
- Modify: `src/control-center/src/panes/ActionsPane.tsx`
  - Add minimal inline edit mode for `random` / `state` / `event` rules inside the existing Trigger Rules panel.
- Modify: `src/control-center/src/api/demo-control-center-api.ts`
  - Mirror the real API behavior in demo mode so browser tests and fallback behavior stay honest.
- Test: `tests/services/action-service.test.js`
- Test: `tests/main/ipc-plugin-install.test.js`
- Test: `tests/control-center/control-center-smoke.spec.js`
- Optional targeted doc follow-up after code lands: `docs/TODO.md`, `docs/openpet-current-todo-architecture.md`, `docs/HANDOFF.md`

## Task 1: Broaden The Shared Trigger Rule Update Contract

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/ipc-channels.js`
- Modify: `control-center-preload.js`
- Modify: `src/control-center/src/api/demo-control-center-api.ts`

**Interfaces:**
- Consumes: existing `ActionTriggerRuleSpecInput`, `ActionTriggerRuleMutationResult`, `IPC.ACTIONS_UPDATE_TRIGGER_RULE`
- Produces:
  - `interface ActionTriggerRuleUpdateRequest { ruleId: string; status?: ActionTriggerRuleStatus; ruleSpec?: ActionTriggerRuleSpecInput }`
  - `ControlCenterApi.updateActionTriggerRule(payload: ActionTriggerRuleUpdateRequest): Promise<ActionTriggerRuleMutationResult>`
  - `window.controlCenterAPI.updateActionTriggerRule(...)`

- [ ] **Step 1: Write the failing shared-contract expectation**

```ts
export interface ActionTriggerRuleUpdateRequest {
  ruleId: string
  status?: ActionTriggerRuleStatus
  ruleSpec?: ActionTriggerRuleSpecInput
}

export interface ControlCenterApi {
  updateActionTriggerRule: (payload: ActionTriggerRuleUpdateRequest) => Promise<ActionTriggerRuleMutationResult>
}
```

Add a shared type-fixture assertion or compile-only usage in `tests/shared/openpet-contracts-type-fixture.ts` so the new request shape is exercised by TypeScript.

- [ ] **Step 2: Run type-oriented verification before implementation**

Run: `npm run typecheck`
Expected: FAIL with missing `ActionTriggerRuleUpdateRequest` / `updateActionTriggerRule` symbols in the fixture or consumer code.

- [ ] **Step 3: Implement the minimal shared contract and preload wiring**

```ts
export interface ActionTriggerRuleUpdateRequest {
  ruleId: string
  status?: ActionTriggerRuleStatus
  ruleSpec?: ActionTriggerRuleSpecInput
}

export interface ControlCenterApi {
  setActionTriggerRuleStatus: (ruleId: string, status: ActionTriggerRuleStatus) => Promise<ActionTriggerRuleMutationResult>
  updateActionTriggerRule: (payload: ActionTriggerRuleUpdateRequest) => Promise<ActionTriggerRuleMutationResult>
}
```

```js
setActionTriggerRuleStatus: (ruleId, status) =>
  ipcRenderer.invoke(IPC.ACTIONS_UPDATE_TRIGGER_RULE, { ruleId, status }),
updateActionTriggerRule: (payload) =>
  ipcRenderer.invoke(IPC.ACTIONS_UPDATE_TRIGGER_RULE, payload),
```

```ts
updateActionTriggerRule: async (payload) => {
  const rule = demoState.actionsConfig.triggerRules.find((item) => item.id === payload.ruleId)
  if (!rule) throw new Error('Trigger rule not found')
  // ruleSpec patch handling is implemented in Task 2; here only add the API surface now
}
```

- [ ] **Step 4: Re-run type verification**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/openpet-contracts.ts src/shared/ipc-channels.ts src/shared/ipc-channels.js control-center-preload.js src/control-center/src/api/demo-control-center-api.ts tests/shared/openpet-contracts-type-fixture.ts
git commit -m "feat(actions): add trigger rule edit contract"
```

## Task 2: Implement Host-Owned Trigger Rule Content Updates In Main Process

**Files:**
- Modify: `src/main/services/action-service.js`
- Modify: `src/main/ipc.js`
- Modify: `tests/services/action-service.test.js`
- Modify: `tests/main/ipc-plugin-install.test.js`
- Optional if runtime assertions need widening: `tests/services/trigger-rule-runtime-service.test.js`

**Interfaces:**
- Consumes:
  - `ActionTriggerRuleUpdateRequest`
  - `normalizeTriggerRuleItem(...)`
  - existing persisted `triggerRules`
- Produces:
  - `actionService.updateTriggerRule(ruleId, updates) -> { rule, animations }`
  - `IPC.ACTIONS_UPDATE_TRIGGER_RULE` accepts `{ ruleId, status?, ruleSpec? }`

- [ ] **Step 1: Write failing service tests for edited rule persistence**

Add a focused test beside the existing `setTriggerRuleStatus` coverage:

```js
test('action service updates state trigger rule ruleSpec and timestamp', () => {
  const result = service.updateTriggerRule('rule:state:wave:test', {
    ruleSpec: {
      summary: 'Play Wave when focus mode is idle.',
      state: { predicate: 'focus.mode === idle', source: 'host' }
    }
  })

  assert.equal(result.rule.ruleSpec.summary, 'Play Wave when focus mode is idle.')
  assert.equal(result.rule.ruleSpec.state.predicate, 'focus.mode === idle')
  assert.equal(savedConfig.triggerRules[0].updatedAt, '2026-06-22T10:05:00.000Z')
})
```

Add an IPC-level test proving `ACTIONS_UPDATE_TRIGGER_RULE` now accepts `ruleSpec` payload:

```js
const updatedRuleResult = await ipcMain.handlers.get(IPC.ACTIONS_UPDATE_TRIGGER_RULE)(null, {
  ruleId: 'rule:state:wave:test',
  ruleSpec: {
    summary: 'Use Wave when focus mode is idle.',
    state: { predicate: 'focus.mode === idle', source: 'host' }
  }
})

assert.equal(updatedRuleResult.rule.ruleSpec.state.predicate, 'focus.mode === idle')
```

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `node --test tests/services/action-service.test.js tests/main/ipc-plugin-install.test.js`
Expected: FAIL because `updateTriggerRule` does not exist and IPC still only routes status updates.

- [ ] **Step 3: Implement minimal action-service and IPC support**

Use one mutation path instead of duplicating status-only and content-edit logic:

```js
const updateTriggerRule = (ruleId, updates = {}) => {
  const { current, index, rule } = findTriggerRuleItem(ruleId)
  const nextRule = normalizeTriggerRuleItem({
    ...rule,
    ...(updates.status ? { status: normalizeTriggerRuleStatus(updates.status) } : {}),
    ...(updates.ruleSpec ? {
      ruleSpec: normalizeTriggerRuleSpec({
        type: rule.type,
        actionId: rule.actionId,
        value: {
          ...rule.ruleSpec,
          ...updates.ruleSpec
        },
        proposal: {
          ...rule,
          ruleSpec: {
            ...rule.ruleSpec,
            ...updates.ruleSpec
          }
        }
      })
    } : {}),
    updatedAt: now()
  })
  const triggerRules = current.triggerRules.map((item, itemIndex) => itemIndex === index ? nextRule : item)
  const animations = persistMutableConfig({ ...current, triggerRules })
  return { rule: nextRule, animations }
}
```

Keep `setTriggerRuleStatus(...)` as a small wrapper if that lowers churn:

```js
const setTriggerRuleStatus = (ruleId, status) => updateTriggerRule(ruleId, { status })
```

Route IPC payload through the new method and keep runtime refresh:

```js
const result = actionService.updateTriggerRule(payload?.ruleId, {
  ...(payload?.status ? { status: payload.status } : {}),
  ...(payload?.ruleSpec ? { ruleSpec: payload.ruleSpec } : {})
})
refreshTriggerRuleRuntime()
```

Log enough context to debug edits without leaking unrelated data:

```js
details: {
  ruleId: result.rule.id,
  actionId: result.rule.actionId,
  type: result.rule.type,
  status: result.rule.status,
  updatedFields: [
    ...(payload?.status ? ['status'] : []),
    ...(payload?.ruleSpec ? ['ruleSpec'] : [])
  ]
}
```

- [ ] **Step 4: Run focused backend verification**

Run: `node --test tests/services/action-service.test.js tests/main/ipc-plugin-install.test.js tests/services/trigger-rule-runtime-service.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/action-service.js src/main/ipc.js tests/services/action-service.test.js tests/main/ipc-plugin-install.test.js tests/services/trigger-rule-runtime-service.test.js
git commit -m "feat(actions): persist trigger rule edits"
```

## Task 3: Add Minimal Trigger Rule Editing UI In Actions Pane

**Files:**
- Modify: `src/control-center/src/hooks/useActionsPane.ts`
- Modify: `src/control-center/src/panes/ActionsPane.tsx`
- Modify: `src/control-center/src/api/demo-control-center-api.ts`
- Modify: `tests/control-center/control-center-smoke.spec.js`

**Interfaces:**
- Consumes:
  - `api.updateActionTriggerRule(payload)`
  - `ActionTriggerRule`
  - `ActionTriggerRuleSpecInput`
- Produces:
  - `onUpdateTriggerRule(ruleId, ruleSpec)`
  - inline edit controls for `random`, `state`, and `event` rules

- [ ] **Step 1: Write a failing UI smoke test for editing an existing rule**

Add one focused Playwright test near the existing trigger-rule management coverage:

```js
test('edits host-owned state trigger rules from the Actions UI', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Actions' }).click()

  const sleepRule = page.locator('[aria-label="触发规则"]').locator('.trigger-inbox-item', { hasText: 'Sleep' })
  await sleepRule.getByRole('button', { name: '编辑规则' }).click()
  await sleepRule.getByLabel('规则摘要').fill('Use Sleep while the pet is in focus idle mode.')
  await sleepRule.getByLabel('状态条件').fill('pet.idle && focus.mode === \"idle\"')
  await sleepRule.getByLabel('状态来源').fill('host')
  await sleepRule.getByRole('button', { name: '保存规则' }).click()

  await expect(page.locator('.status-line')).toContainText('已保存触发规则：rule:state:sleep:test')
  await expect(sleepRule).toContainText('Use Sleep while the pet is in focus idle mode.')
  await expect(sleepRule).toContainText('pet.idle && focus.mode === \"idle\"')
})
```

- [ ] **Step 2: Run the focused Playwright test to verify failure**

Run: `npm run test:control-center -- tests/control-center/control-center-smoke.spec.js -g "edits host-owned state trigger rules from the Actions UI"`
Expected: FAIL because there is no edit mode or save handler.

- [ ] **Step 3: Implement the smallest useful editor**

In `useActionsPane.ts`, add the save handler:

```ts
const onUpdateTriggerRule = async (payload: ActionTriggerRuleUpdateRequest) => {
  if (!payload.ruleId) return
  setWorking(true)
  setStatus('')
  try {
    const response = await api.updateActionTriggerRule(payload)
    setActionsConfig(cloneActionsConfig(response.animations))
    setStatus(`已保存触发规则：${payload.ruleId}`)
  } catch (error) {
    setStatus(messageFromError(error, '保存触发规则失败'))
  } finally {
    setWorking(false)
  }
}
```

In `ActionsPane.tsx`, keep the editor inline per rule instead of adding a new builder surface:

```tsx
const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
const [drafts, setDrafts] = useState<Record<string, ActionTriggerRuleSpecInput>>({})
```

Render only the fields already modeled by the rule type:

```tsx
{rule.type === 'random' ? (
  <>
    <label>
      <span>规则摘要</span>
      <input aria-label="规则摘要" value={draft.summary || ''} onChange={...} />
    </label>
    <label>
      <span>调度模式</span>
      <select aria-label="调度模式" value={draft.schedule?.mode || 'interval'} onChange={...}>
        <option value="interval">interval</option>
        <option value="opportunistic">opportunistic</option>
      </select>
    </label>
    {draft.schedule?.mode === 'interval' ? (
      <label>
        <span>间隔毫秒</span>
        <input aria-label="间隔毫秒" type="number" min="1000" step="1000" value={draft.schedule?.intervalMs || 60000} onChange={...} />
      </label>
    ) : null}
  </>
) : null}
```

```tsx
{rule.type === 'state' ? (
  <>
    <label>
      <span>规则摘要</span>
      <input aria-label="规则摘要" value={draft.summary || ''} onChange={...} />
    </label>
    <label>
      <span>状态条件</span>
      <input aria-label="状态条件" value={draft.state?.predicate || ''} onChange={...} />
    </label>
    <label>
      <span>状态来源</span>
      <input aria-label="状态来源" value={draft.state?.source || ''} onChange={...} />
    </label>
  </>
) : null}
```

```tsx
{rule.type === 'event' ? (
  <>
    <label>
      <span>规则摘要</span>
      <input aria-label="规则摘要" value={draft.summary || ''} onChange={...} />
    </label>
    <label>
      <span>事件名</span>
      <input aria-label="事件名" value={draft.event?.name || ''} onChange={...} />
    </label>
    <label>
      <span>事件来源</span>
      <input aria-label="事件来源" value={draft.event?.source || ''} onChange={...} />
    </label>
  </>
) : null}
```

Provide only three new actions:

```tsx
<button type="button" className="ghost" disabled={working} onClick={() => startEditing(rule)}>
  编辑规则
</button>
<button type="button" className="ghost" disabled={working} onClick={() => saveRule(rule.id, draft)}>
  保存规则
</button>
<button type="button" className="ghost" disabled={working} onClick={() => cancelEditing(rule.id)}>
  取消
</button>
```

In `demo-control-center-api.ts`, mirror the host mutation:

```ts
updateActionTriggerRule: async (payload) => {
  const rule = demoState.actionsConfig.triggerRules.find((item) => item.id === payload.ruleId)
  if (!rule) throw new Error('Trigger rule not found')
  const nextRule = {
    ...rule,
    ...(payload.status ? { status: payload.status } : {}),
    ...(payload.ruleSpec ? { ruleSpec: createDemoTriggerRuleSpec(rule.type, rule.actionId, { ruleSpec: payload.ruleSpec }) } : {}),
    updatedAt: '2026-06-22T00:00:00.000Z'
  }
  demoState.actionsConfig = cloneActionsConfig({
    ...demoState.actionsConfig,
    triggerRules: demoState.actionsConfig.triggerRules.map((item) => item.id === payload.ruleId ? nextRule : item)
  })
  writeDemoState()
  return { animations: cloneActionsConfig(demoState.actionsConfig), rule: nextRule }
}
```

- [ ] **Step 4: Run UI verification**

Run: `npm run test:control-center -- tests/control-center/control-center-smoke.spec.js -g "host-owned trigger rules"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/control-center/src/hooks/useActionsPane.ts src/control-center/src/panes/ActionsPane.tsx src/control-center/src/api/demo-control-center-api.ts tests/control-center/control-center-smoke.spec.js
git commit -m "feat(control-center): edit host trigger rules inline"
```

## Task 4: Final Verification, Review, And Live-Docs Alignment

**Files:**
- Verify changed files from Tasks 1-3
- Optional docs if the milestone fully lands:
  - `docs/TODO.md`
  - `docs/openpet-current-todo-architecture.md`
  - `docs/HANDOFF.md`

**Interfaces:**
- Consumes: completed code from Tasks 1-3
- Produces: verified milestone-ready branch and optional docs alignment

- [ ] **Step 1: Run the narrow verification suite**

Run: `npm run typecheck`
Expected: PASS

Run: `node --test tests/services/action-service.test.js tests/main/ipc-plugin-install.test.js tests/services/trigger-rule-runtime-service.test.js`
Expected: PASS

Run: `npm run test:control-center -- tests/control-center/control-center-smoke.spec.js -g "host-owned trigger rules"`
Expected: PASS

- [ ] **Step 2: Run broader regression if narrow tests pass**

Run: `npm run test:core`
Expected: PASS

Only if UI edits touched shared rendering behavior enough to justify it:

Run: `npm run test:control-center`
Expected: PASS

- [ ] **Step 3: Update live docs only after tests pass**

Update `docs/TODO.md` P1 wording from “add a host-owned trigger-rule editor/schema” to the next still-open trigger-rule gap.

Update `docs/openpet-current-todo-architecture.md` Actions section from “saved host rules are shown” to “saved host rules are shown and minimally editable in Actions pane”.

Update `docs/HANDOFF.md` only if it currently understates this newly landed editing capability.

- [ ] **Step 4: Do the milestone review pass**

Check these review questions before merge:

```text
1. Does any path let a plugin mutate trigger rules directly? It must remain no.
2. Can malformed ruleSpec input bypass normalizeTriggerRuleSpec? It must remain no.
3. Does editing a rule refresh trigger runtime immediately? It must remain yes.
4. Does the UI only expose fields already supported by ActionTriggerRuleSpec? It must remain yes.
5. Did we avoid expanding to a full visual rule builder, import/export, or Creator Studio contract work? It must remain yes.
```

- [ ] **Step 5: Commit docs/review follow-up**

```bash
git add docs/TODO.md docs/openpet-current-todo-architecture.md docs/HANDOFF.md
git commit -m "docs(actions): align trigger rule editor milestone"
```

## Spec Coverage Check

- The milestone requires host-owned durable `random` / `state` / `event` trigger rules to be viewable and savable from Control Center: covered by Tasks 2-3.
- The milestone must not expand into full workflow builders, other plugin contracts, or Creator Studio redesign: enforced by Global Constraints and Task 3 scope.
- The milestone needs backend contract clarity, UI wiring, and regression tests: covered by Tasks 1-4.
- The milestone should stop after one bounded deliverable: this plan ends at verified inline edit/save flow plus docs alignment.

## Placeholder Scan

- No `TODO`, `TBD`, or “implement later” placeholders are left in task steps.
- Each code-changing task includes concrete file targets, function names, and verification commands.
- The only optional work is docs alignment after code passes; it does not block the code path.

## Type Consistency Check

- Shared request type uses `ActionTriggerRuleUpdateRequest` consistently across shared contracts, preload, hook, and demo API.
- Main-process mutation name is `updateTriggerRule(...)`.
- Renderer save handler is `onUpdateTriggerRule(...)`.
- Existing `setActionTriggerRuleStatus(...)` remains as a compatibility helper, not the primary editor save contract.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-05-trigger-rule-editor-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
