# Creator Generate Disabled Reasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Explain every unmet Create generation prerequisite while preserving the existing fail-closed button gates.

**Architecture:** Derive ordered blocker arrays in `useCreatorPane`, where provider/plugin/form/running state already converge. Pass those arrays to `CreatorPane`; render a mode-specific status region beside each Generate button and connect it with `aria-describedby`.

**Tech Stack:** React + TypeScript/TSX, Node native test runner, source-contract tests, Vite type checking.

## Global Constraints

- The Creator Studio Service runtime remains optional for generation.
- The native Generate buttons remain disabled while blockers exist.
- No IPC, backend workflow, Provider, or secret handling changes.
- Feedback must identify missing requirements without exposing configuration values.

### Task 1: Add failing source-contract tests

**Files:**
- Modify: `tests/control-center/creator-pane-copy.test.js`

**Interfaces:**
- The tests will require `useCreatorPane.ts` to expose `newCharacterBlockers` and `existingActionBlockers`.
- The tests will require `CreatorPane.tsx` to render `creator-new-character-readiness`, `creator-existing-action-readiness`, `aria-describedby`, and `aria-live`.

- [ ] **Step 1: Write the failing assertions**

```js
test('creator pane explains every disabled generation prerequisite', () => {
  const pane = fs.readFileSync(creatorPanePath, 'utf-8')
  const hook = fs.readFileSync(hookPath, 'utf-8')
  assert.match(hook, /newCharacterBlockers/)
  assert.match(hook, /existingActionBlockers/)
  assert.match(pane, /creator-new-character-readiness/)
  assert.match(pane, /creator-existing-action-readiness/)
  assert.match(pane, /aria-describedby=/)
  assert.match(pane, /aria-live="polite"/)
  assert.match(pane, /还需完成/)
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/control-center/creator-pane-copy.test.js`

Expected: the new test fails because the blocker arrays and readiness regions do not exist yet.

### Task 2: Implement derived blocker state

**Files:**
- Modify: `src/control-center/src/hooks/useCreatorPane.ts:437-485`

**Interfaces:**
- Produce `newCharacterBlockers: string[]` and `existingActionBlockers: string[]` in `paneProps`.
- Derive `canGenerateNewCharacter` and `canGenerateExistingAction` from the corresponding array lengths.

- [ ] **Step 1: Add ordered blocker arrays**

Use these exact categories and order:

```ts
const newCharacterBlockers = [
  ...(!creatorState.provider.ready ? ['图片 Provider 未就绪'] : []),
  ...(!creatorStudioPluginReady ? ['Creator Studio 插件未就绪'] : []),
  ...(newCharacterDraft.characterName.trim().length === 0 ? ['填写角色名称'] : []),
  ...(newCharacterDraft.referenceImageToken.trim().length === 0 ? ['选择参考图'] : []),
  ...(running ? ['当前已有生成任务进行中'] : [])
]
const existingActionBlockers = [
  ...(!creatorState.provider.ready ? ['图片 Provider 未就绪'] : []),
  ...(!creatorStudioPluginReady ? ['Creator Studio 插件未就绪'] : []),
  ...(existingActionDraft.actionName.trim().length === 0 ? ['填写动作名称'] : []),
  ...(existingActionDraft.motionPrompt.trim().length === 0 ? ['填写动作描述'] : []),
  ...(!existingActionDraft.referenceImageToken.trim() && !hasStoredEditableReference ? ['选择参考图或绑定已有角色参考图'] : []),
  ...(running ? ['当前已有生成任务进行中'] : [])
]
```

Set `canGenerate...` to `newCharacterBlockers.length === 0` and `existingActionBlockers.length === 0`, then pass both arrays through `paneProps`.

- [ ] **Step 2: Run the focused test**

Run: `node --test tests/control-center/creator-pane-copy.test.js`

Expected: it still fails on the UI readiness markers, proving the hook half is present and the UI half remains.

### Task 3: Render actionable readiness feedback

**Files:**
- Modify: `src/control-center/src/panes/CreatorPane.tsx:27-50,814-958,959-1050`

**Interfaces:**
- Consume the two blocker arrays from `CreatorPaneProps`.
- Preserve `disabled={!canGenerate...}` and all existing click handlers.

- [ ] **Step 1: Add props and status helper**

Add `newCharacterBlockers` and `existingActionBlockers` as `string[]` props. Render each active form's status region using the same shape:

```tsx
const readinessText = blockers.length
  ? `还需完成：${blockers.join('、')}`
  : '已满足生成条件，可以开始生成。'
<span
  id="creator-new-character-readiness"
  className={`field-note ${blockers.length ? 'error' : 'success'}`}
  role="status"
  aria-live="polite"
>
  {readinessText}
</span>
```

Give each Generate button the matching `aria-describedby`. The Existing Character button uses its own id and blocker array. Do not include `creatorStudioReady` in either array.

- [ ] **Step 2: Run the focused test and syntax check**

Run: `node --test tests/control-center/creator-pane-copy.test.js`

Expected: all creator pane source-contract tests pass.

### Task 4: Verify regression surface

**Files:**
- No new files.

- [ ] **Step 1: Check the diff and syntax**

Run: `git diff --check` and `npm run check:syntax`.

- [ ] **Step 2: Run Control Center tests**

Run: `npm run test:control-center`.

- [ ] **Step 3: Review final behavior contract**

Confirm that Service stopped remains only in the optional details message, while missing provider/plugin/form prerequisites appear beside the disabled Generate button.

- [ ] **Step 4: Commit implementation**

```bash
git add src/control-center/src/hooks/useCreatorPane.ts src/control-center/src/panes/CreatorPane.tsx tests/control-center/creator-pane-copy.test.js
git commit -m "fix: explain creator generate prerequisites"
```
