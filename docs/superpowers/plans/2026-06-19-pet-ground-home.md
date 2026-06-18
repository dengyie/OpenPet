# Pet Ground + Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional grounded movement and home-anchor constraints so OpenPet can keep the pet on the current display ground line, let users define a home area, and automatically keep roaming within a configurable radius.

**Architecture:** Keep persistent state in host settings, keep `PetService` as the single source of truth for saved pet settings, and add a focused main-process movement-policy helper that owns landing-point geometry, home clamping, and display recovery. The renderer should continue to request drag and horizontal movement through IPC, while Control Center exposes only user-facing toggles and radius controls rather than raw coordinates.

**Tech Stack:** Electron main process, CommonJS Node services, Node native test runner, React + TypeScript Control Center, shared TypeScript contracts, Playwright Control Center smoke tests.

---

## File Map

- Create: `src/main/pet-movement-policy.js`
  Purpose: own grounded/home normalization, landing-point math, drag/walk clamping, radius mapping, and display-change recovery helpers.
- Modify: `main.js`
  Purpose: wire the new movement-policy helper into IPC registration and display lifecycle handling.
- Modify: `src/main/ipc.js`
  Purpose: expose grounded/home settings to the renderer, route drag/move commands through movement policy, and persist home on drag end and settings changes.
- Modify: `src/main/settings.js`
  Purpose: add default persisted settings and merge logic for `petBehavior`.
- Modify: `src/main/services/pet-service.js`
  Purpose: keep pet settings access/save behavior aligned with the new settings model.
- Modify: `src/shared/openpet-contracts.ts`
  Purpose: add typed Control Center settings for grounded/home behavior.
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
  Purpose: keep shared type fixtures aligned with the new contracts.
- Modify: `src/control-center/src/lib/defaults.ts`
  Purpose: add default grounded/home values and cloning helpers for demo/UI state.
- Modify: `src/control-center/src/api/control-center-api.ts`
  Purpose: persist grounded/home/radius behavior in the demo API and enforce dependency rules there.
- Modify: `src/control-center/src/panes/PetPane.tsx`
  Purpose: render grounded toggle, home toggle, radius selector, and helper copy.
- Modify: `src/control-center/src/constants.ts`
  Purpose: provide the discrete radius options.
- Modify: `tests/control-center/control-center-smoke.spec.js`
  Purpose: cover grounded/home/radius save-reset behavior through the demo API.
- Modify: `tests/services/settings-service.test.js`
  Purpose: verify previews/saves preserve nested grounded/home settings once callers provide them.
- Create: `tests/main/pet-movement-policy.test.js`
  Purpose: TDD the geometry rules independently from IPC.
- Modify: `tests/main/window.test.js`
  Purpose: verify grounded window placement and display recovery hooks only if needed by final implementation shape.
- Modify: `tests/main/control-center-adapters.test.js`
  Purpose: keep settings view-shape expectations aligned if adapter snapshots include new settings.
- Modify: `tests/main/ipc-plugin-install.test.js`
  Purpose: no direct feature change expected, but rerun because Electron IPC baseline is already fragile in this worktree.
- Modify: `docs/HANDOFF.md`
  Purpose: note the new pet movement settings boundary if implementation lands.
- Modify: `docs/development-summary.md`
  Purpose: refresh the engineering snapshot after implementation lands.
- Modify: `docs/project-status-review.md`
  Purpose: reflect the new pet behavior capability after implementation lands.

## Task 1: Add failing contract and settings defaults tests

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `src/control-center/src/lib/defaults.ts`
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`

- [ ] **Step 1: Add failing shared type fixture coverage for grounded/home settings**

Add fixture fields that will fail typecheck until `ControlCenterSettings` is extended:

```ts
const settingsFixture: ControlCenterSettings = {
  scale: 1,
  walkSpeed: 2,
  walkDuration: 15000,
  bubbleDuration: 1300,
  autoStart: false,
  grounded: true,
  home: {
    enabled: true,
    radius: 'medium',
    hasAnchor: true
  }
}
```

- [ ] **Step 2: Add failing defaults coverage for clone behavior**

Extend `src/control-center/src/lib/defaults.ts` test or fixture usage so the following shape is required:

```ts
export const defaultSettings = {
  scale: 1,
  walkSpeed: 2,
  walkDuration: 15000,
  bubbleDuration: 1300,
  autoStart: false,
  grounded: false,
  home: {
    enabled: false,
    radius: 'medium',
    hasAnchor: false
  }
} satisfies ControlCenterSettings
```

- [ ] **Step 3: Run the relevant type-backed test command and verify RED**

Run:

```bash
npm test -- --test-name-pattern "shared IPC contract exports stable frozen channel names"
```

Then run:

```bash
npm run check:syntax
```

Expected before implementation:

- TypeScript-backed files or syntax checks fail because `ControlCenterSettings` does not yet include `grounded` or `home`.

## Task 2: Implement shared contracts and default cloning

**Files:**
- Modify: `src/shared/openpet-contracts.ts`
- Modify: `tests/shared/openpet-contracts-type-fixture.ts`
- Modify: `src/control-center/src/lib/defaults.ts`

- [ ] **Step 1: Extend `ControlCenterSettings` with grounded/home view state**

Add the new types:

```ts
export type PetHomeRadius = 'small' | 'medium' | 'large'

export interface ControlCenterPetHomeSettings {
  enabled: boolean
  radius: PetHomeRadius
  hasAnchor: boolean
}

export interface ControlCenterSettings {
  scale: number
  walkSpeed: number
  walkDuration: number
  bubbleDuration: number
  autoStart: boolean
  grounded: boolean
  home: ControlCenterPetHomeSettings
}
```

- [ ] **Step 2: Update defaults and cloning helpers**

In `src/control-center/src/lib/defaults.ts`, implement nested defaults:

```ts
export const defaultSettings = {
  scale: 1,
  walkSpeed: 2,
  walkDuration: 15000,
  bubbleDuration: 1300,
  autoStart: false,
  grounded: false,
  home: {
    enabled: false,
    radius: 'medium',
    hasAnchor: false
  }
} satisfies ControlCenterSettings

export const cloneSettings = (settings: Partial<ControlCenterSettings> | null | undefined): ControlCenterSettings => ({
  ...defaultSettings,
  ...(settings || {}),
  home: {
    ...defaultSettings.home,
    ...(settings?.home || {})
  }
})
```

- [ ] **Step 3: Update the shared type fixture**

Keep the new fixture aligned with the final contract:

```ts
home: {
  enabled: true,
  radius: 'medium',
  hasAnchor: true
}
```

- [ ] **Step 4: Run verification and confirm GREEN**

Run:

```bash
npm run check:syntax
```

Expected:

- PASS with no syntax errors in shared and Control Center files.

- [ ] **Step 5: Commit**

```bash
git add src/shared/openpet-contracts.ts tests/shared/openpet-contracts-type-fixture.ts src/control-center/src/lib/defaults.ts
git commit -m "feat: add pet grounded and home settings contracts"
```

## Task 3: Write failing persistence and demo API tests

**Files:**
- Modify: `tests/control-center/control-center-smoke.spec.js`
- Modify: `tests/services/settings-service.test.js`

- [ ] **Step 1: Add a Control Center smoke test for grounded/home persistence**

Add a focused Playwright test:

```js
test('persists grounded and home settings in the demo API session', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('checkbox', { name: 'Enable grounded mode' }).click()
  await page.getByRole('checkbox', { name: 'Enable home anchor' }).click()
  await page.getByRole('button', { name: '大' }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()

  await expect(page.locator('.status-line')).toContainText('原始大小 100%')

  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Enable grounded mode' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Enable home anchor' })).toBeChecked()
  await expect(page.getByRole('group', { name: '活动范围' }).getByRole('button', { name: '大' })).toHaveClass(/active/)
})
```

- [ ] **Step 2: Add a Control Center smoke test for dependency enforcement**

```js
test('turning grounded off disables home in the demo API session', async ({ page }) => {
  await page.goto('/')

  const grounded = page.getByRole('checkbox', { name: 'Enable grounded mode' })
  const home = page.getByRole('checkbox', { name: 'Enable home anchor' })

  await grounded.click()
  await home.click()
  await grounded.click()

  await expect(home).toBeDisabled()
  await expect(home).not.toBeChecked()
})
```

- [ ] **Step 3: Extend settings service unit coverage for nested preview/save payloads**

Add:

```js
test('settings service previews nested pet behavior settings without flattening them', () => {
  const bus = createEventBus()
  const previews = []
  const service = createSettingsService({
    eventBus: bus,
    loadSettings: () => ({
      scale: 1,
      walkSpeed: 2,
      petBehavior: {
        grounded: false,
        home: { enabled: false, radius: 'medium', anchor: null }
      }
    }),
    saveSettings: () => {}
  })

  bus.on('settings:preview', (settings) => previews.push(settings))

  const next = service.preview({
    petBehavior: {
      grounded: true,
      home: { enabled: false, radius: 'large', anchor: null }
    }
  })

  assert.equal(next.petBehavior.grounded, true)
  assert.equal(next.petBehavior.home.radius, 'large')
  assert.equal(previews[0].petBehavior.home.radius, 'large')
})
```

- [ ] **Step 4: Run the targeted tests and verify RED**

Run:

```bash
node --test tests/services/settings-service.test.js
```

Run:

```bash
npm run test:control-center -- --grep "grounded and home|turning grounded off disables home"
```

Expected before implementation:

- settings service test may pass or expose shallow-merge assumptions;
- Playwright tests fail because the Pet pane does not yet render grounded/home controls.

## Task 4: Implement persisted host settings and Control Center demo state

**Files:**
- Modify: `src/main/settings.js`
- Modify: `src/control-center/src/api/control-center-api.ts`
- Modify: `src/control-center/src/constants.ts`
- Modify: `src/control-center/src/panes/PetPane.tsx`

- [ ] **Step 1: Add persisted `petBehavior` defaults and merge logic**

In `src/main/settings.js`, extend defaults:

```js
petBehavior: {
  grounded: false,
  home: {
    enabled: false,
    radius: 'medium',
    anchor: null
  }
},
```

Merge nested values safely:

```js
petBehavior: {
  ...defaultSettings.petBehavior,
  ...(isPlainObject(settings.petBehavior) ? settings.petBehavior : {}),
  home: {
    ...defaultSettings.petBehavior.home,
    ...(isPlainObject(settings.petBehavior?.home) ? settings.petBehavior.home : {}),
    anchor: isPlainObject(settings.petBehavior?.home?.anchor)
      ? settings.petBehavior.home.anchor
      : defaultSettings.petBehavior.home.anchor
  }
},
```

- [ ] **Step 2: Add radius options**

In `src/control-center/src/constants.ts`, add:

```ts
export const homeRadiusOptions: NumericOption[] = [
  { label: '小', value: 0 },
  { label: '中', value: 1 },
  { label: '大', value: 2 }
]
```

Use numeric UI values only if you intentionally map them in the pane; otherwise create a string-based constant list in the same file:

```ts
export const homeRadiusOptions = [
  { label: '小', value: 'small' },
  { label: '中', value: 'medium' },
  { label: '大', value: 'large' }
] as const
```

- [ ] **Step 3: Persist grounded/home behavior in the demo API**

Update `createDefaultDemoState()` and `saveSettings()` behavior in `src/control-center/src/api/control-center-api.ts` so:

```ts
if (!nextSettings.grounded) {
  nextSettings.home = {
    ...nextSettings.home,
    enabled: false
  }
}
```

When home becomes enabled and there is no stored anchor in demo state, keep `hasAnchor: true` in the renderer-facing view state.

- [ ] **Step 4: Render the new Pet pane controls**

Add to `src/control-center/src/panes/PetPane.tsx`:

```tsx
<div className="field-row">
  <div>
    <div className="field-label">落地模式</div>
    <div className="field-note">宠物沿着当前屏幕底边活动</div>
  </div>
  <Toggle
    ariaLabel="Enable grounded mode"
    checked={settings.grounded}
    onChange={(grounded) => onChange({
      grounded,
      home: grounded ? settings.home : { ...settings.home, enabled: false }
    })}
  />
</div>

<div className="field-row">
  <div>
    <div className="field-label">Home 点</div>
    <div className="field-note">开启后会把当前位置当作家，拖动宠物会更新家的位置</div>
  </div>
  <Toggle
    ariaLabel="Enable home anchor"
    checked={settings.home.enabled}
    disabled={!settings.grounded}
    onChange={(enabled) => onChange({
      home: { ...settings.home, enabled }
    })}
  />
</div>
```

Render a segmented control for radius:

```tsx
<SegmentedControl
  label="活动范围"
  value={settings.home.radius}
  options={homeRadiusOptions}
  onChange={(radius) => onChange({ home: { ...settings.home, radius } })}
  disabled={!settings.home.enabled}
/>
```

If `SegmentedControl` does not support `disabled`, add the minimal prop support in that component as part of this task.

- [ ] **Step 5: Run verification and confirm GREEN**

Run:

```bash
node --test tests/services/settings-service.test.js
```

Run:

```bash
npm run test:control-center -- --grep "grounded and home|turning grounded off disables home|persists Pet settings in the demo API session"
```

Expected:

- PASS for the updated settings service coverage;
- PASS for Pet pane demo persistence and dependency UI behavior.

- [ ] **Step 6: Commit**

```bash
git add src/main/settings.js src/control-center/src/api/control-center-api.ts src/control-center/src/constants.ts src/control-center/src/panes/PetPane.tsx tests/control-center/control-center-smoke.spec.js tests/services/settings-service.test.js
git commit -m "feat: add pet grounded and home controls"
```

## Task 5: Write failing movement-policy tests

**Files:**
- Create: `tests/main/pet-movement-policy.test.js`

- [ ] **Step 1: Add a grounded clamp test**

```js
test('grounded policy clamps the pet landing point to the display ground line', () => {
  const policy = createPetMovementPolicy({
    screen: createFakeScreen({
      workArea: { x: 0, y: 0, width: 1440, height: 900, id: 1 }
    })
  })

  const result = policy.clampDragPosition({
    windowBounds: { x: 100, y: 100, width: 300, height: 300 },
    requestedTopLeft: { x: 240, y: 120 },
    settings: createPetBehaviorSettings({ grounded: true })
  })

  assert.equal(result.y, 900 - 300 - policy.getGroundInset())
})
```

- [ ] **Step 2: Add a home-radius clamp test**

```js
test('home policy clamps horizontal landing positions to the configured radius', () => {
  const policy = createPetMovementPolicy({
    screen: createFakeScreen({
      workArea: { x: 0, y: 0, width: 1440, height: 900, id: 1 }
    })
  })

  const result = policy.clampMoveBy({
    windowBounds: { x: 900, y: 560, width: 300, height: 300 },
    delta: { x: 40, y: 0 },
    settings: createPetBehaviorSettings({
      grounded: true,
      home: {
        enabled: true,
        radius: 'small',
        anchor: { displayId: '1', x: 1000, y: 860 }
      }
    })
  })

  assert.equal(result.hitX, true)
  assert.equal(result.landingX <= policy.getAllowedRange('small', 1000).max, true)
})
```

- [ ] **Step 3: Add a drag-end rehome test**

```js
test('drag end returns a persisted home anchor when home is enabled', () => {
  const policy = createPetMovementPolicy({
    screen: createFakeScreen({
      workArea: { x: 0, y: 0, width: 1440, height: 900, id: 1 }
    })
  })

  const result = policy.createHomeAnchorFromWindow({
    windowBounds: { x: 880, y: 560, width: 300, height: 300 }
  })

  assert.deepEqual(result, { displayId: '1', x: 1030, y: 860 })
})
```

- [ ] **Step 4: Add a display-recovery clamp test**

```js
test('display recovery clamps stale home anchors back into the current work area', () => {
  const policy = createPetMovementPolicy({
    screen: createFakeScreen({
      workArea: { x: 0, y: 0, width: 1280, height: 800, id: 1 }
    })
  })

  const next = policy.normalizeAnchorForDisplay({
    anchor: { displayId: '1', x: 2000, y: 1200 },
    display: { id: 1, workArea: { x: 0, y: 0, width: 1280, height: 800 } }
  })

  assert.equal(next.x <= 1280, true)
  assert.equal(next.y <= 800, true)
})
```

- [ ] **Step 5: Run targeted tests and verify RED**

Run:

```bash
node --test tests/main/pet-movement-policy.test.js
```

Expected before implementation:

- FAIL because `src/main/pet-movement-policy.js` does not exist yet.

## Task 6: Implement main-process pet movement policy

**Files:**
- Create: `src/main/pet-movement-policy.js`

- [ ] **Step 1: Create normalization helpers and radius mapping**

Implement:

```js
const HOME_RADIUS_PX = {
  small: 120,
  medium: 220,
  large: 360
}
```

Add helpers:

- `normalizePetBehaviorSettings(settings)`
- `normalizePetHomeRadius(value)`
- `getLandingPoint(windowBounds)`
- `getTopLeftForLandingPoint(landingPoint, windowBounds)`

- [ ] **Step 2: Implement grounded drag clamping**

Add:

```js
const clampDragPosition = ({ windowBounds, requestedTopLeft, settings, display }) => {
  // clamp x to work area, and if grounded, force y to ground line
}
```

Return a shape compatible with existing IPC behavior:

```js
{ x, y, hitX, hitY, landingX, landingY, displayId }
```

- [ ] **Step 3: Implement walk clamping and home range enforcement**

Add:

```js
const clampMoveBy = ({ windowBounds, delta, settings, display }) => {
  // derive next landing point, clamp to work area, clamp to home radius if enabled
}
```

When `home.enabled` is true:

- derive `[minLandingX, maxLandingX]` from anchor + radius;
- clamp next landing point into that range;
- set `hitX = true` if requested move exceeded the range.

- [ ] **Step 4: Implement anchor creation and display recovery**

Add:

```js
const createHomeAnchorFromWindow = ({ windowBounds, display }) => ({ ... })
const normalizeAnchorForDisplay = ({ anchor, display }) => ({ ... })
const normalizeWindowForDisplay = ({ windowBounds, settings, display }) => ({ ... })
```

- [ ] **Step 5: Export a factory**

```js
const createPetMovementPolicy = ({ screen }) => ({
  getGroundInset,
  getAllowedRange,
  clampDragPosition,
  clampMoveBy,
  createHomeAnchorFromWindow,
  normalizeAnchorForDisplay,
  normalizeWindowForDisplay,
  resolveDisplayForWindow,
  normalizePetBehaviorSettings
})

module.exports = { createPetMovementPolicy }
```

- [ ] **Step 6: Run targeted tests and confirm GREEN**

Run:

```bash
node --test tests/main/pet-movement-policy.test.js
```

Expected:

- PASS for grounded clamp, home clamp, drag-end rehome, and display-recovery coverage.

- [ ] **Step 7: Commit**

```bash
git add src/main/pet-movement-policy.js tests/main/pet-movement-policy.test.js
git commit -m "feat: add pet movement policy"
```

## Task 7: Wire movement policy into main process and IPC

**Files:**
- Modify: `main.js`
- Modify: `src/main/ipc.js`

- [ ] **Step 1: Instantiate the policy in `main.js`**

Add:

```js
const { createPetMovementPolicy } = require('./src/main/pet-movement-policy')
```

Inside `app.whenReady()`:

```js
const petMovementPolicy = createPetMovementPolicy({ screen })
```

Pass it into IPC registration:

```js
registerIpcHandlers({
  ...,
  petMovementPolicy,
  screen
})
```

- [ ] **Step 2: Expand renderer settings payload**

In `src/main/ipc.js`, extend:

```js
const createPetRendererSettings = (settings = {}) => ({
  scale: settings.scale,
  walkSpeed: settings.walkSpeed,
  walkDuration: settings.walkDuration,
  bubbleDuration: settings.bubbleDuration,
  grounded: Boolean(settings.petBehavior?.grounded),
  home: {
    enabled: Boolean(settings.petBehavior?.home?.enabled),
    radius: settings.petBehavior?.home?.radius || 'medium',
    hasAnchor: Boolean(settings.petBehavior?.home?.anchor)
  }
})
```

- [ ] **Step 3: Route drag and walk through policy**

Replace direct `clampToWorkArea()` use for pet motion:

```js
ipcMainService.on(IPC.PET_SET_POSITION, (event, point) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !point) return
  const next = petMovementPolicy.clampDragPosition({
    windowBounds: win.getBounds(),
    requestedTopLeft: { x: point.x, y: point.y },
    settings: petService.getSettings().petBehavior
  })
  win.setPosition(next.x, next.y)
})
```

And:

```js
ipcMainService.handle(IPC.PET_MOVE_BY, (event, delta) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !delta) return null
  const next = petMovementPolicy.clampMoveBy({
    windowBounds: win.getBounds(),
    delta,
    settings: petService.getSettings().petBehavior
  })
  win.setPosition(next.x, next.y)
  return next
})
```

- [ ] **Step 4: Persist home on drag end and first enable**

Because current IPC only has move commands, add a minimal drag-end IPC channel if needed:

```js
PET_DRAG_ENDED: 'pet:drag-ended'
```

On drag end:

- derive the final window bounds;
- if `home.enabled`, persist `settings.petBehavior.home.anchor = createHomeAnchorFromWindow(...)`.

When settings are saved and `home.enabled` transitions from `false` to `true` without an anchor:

- populate anchor from the current pet window before saving.

- [ ] **Step 5: Add display-change recovery**

In `main.js`, subscribe after window creation:

```js
screen.on('display-metrics-changed', normalizePetWindowForDisplayChange)
screen.on('display-removed', normalizePetWindowForDisplayChange)
screen.on('display-added', normalizePetWindowForDisplayChange)
```

The handler should:

- no-op if the pet window is missing;
- normalize current window bounds;
- if `home.enabled`, normalize and persist the anchor when it changes.

- [ ] **Step 6: Run targeted tests and confirm GREEN**

Run:

```bash
node --test tests/main/pet-movement-policy.test.js tests/services/settings-service.test.js
```

Run:

```bash
npm run check:syntax
```

Expected:

- PASS for unit tests and syntax validation.

- [ ] **Step 7: Commit**

```bash
git add main.js src/main/ipc.js src/main/settings.js src/main/pet-movement-policy.js
git commit -m "feat: enforce grounded and home pet movement"
```

## Task 8: Connect renderer gesture semantics for rehoming

**Files:**
- Modify: `preload.js`
- Modify: `renderer.js`
- Modify: `src/shared/ipc-channels.js`
- Modify: `src/shared/ipc-channels.ts`

- [ ] **Step 1: Add a drag-end IPC channel**

In shared channels:

```js
PET_DRAG_ENDED: 'pet:drag-ended',
```

Mirror it in both JS and TS channel definitions.

- [ ] **Step 2: Expose drag-end API from preload**

Add:

```js
dragEnded: () => ipcRenderer.send(IPC.PET_DRAG_ENDED),
```

- [ ] **Step 3: Notify main process on pointer-up**

In `renderer.js`, after drag release:

```js
if (state.drag?.moved) {
  window.petAPI.dragEnded()
}
```

Keep this after pointer capture cleanup so it only fires for actual drags.

- [ ] **Step 4: Run syntax verification and confirm GREEN**

Run:

```bash
npm run check:syntax
```

Expected:

- PASS with the new IPC channel and renderer call path.

- [ ] **Step 5: Commit**

```bash
git add preload.js renderer.js src/shared/ipc-channels.js src/shared/ipc-channels.ts
git commit -m "feat: persist home anchor after pet drags"
```

## Task 9: Add focused Control Center regression coverage

**Files:**
- Modify: `tests/control-center/control-center-smoke.spec.js`

- [ ] **Step 1: Add reset behavior coverage**

Extend the Pet pane tests:

```js
await page.getByRole('checkbox', { name: 'Enable grounded mode' }).click()
await page.getByRole('checkbox', { name: 'Enable home anchor' }).click()
await page.getByRole('button', { name: '大' }).click()
await page.getByRole('button', { name: '保存', exact: true }).click()
await page.getByRole('button', { name: '还原' }).click()

await expect(page.getByRole('checkbox', { name: 'Enable grounded mode' })).toBeChecked()
await expect(page.getByRole('checkbox', { name: 'Enable home anchor' })).toBeChecked()
await expect(page.getByRole('group', { name: '活动范围' }).getByRole('button', { name: '大' })).toHaveClass(/active/)
```

- [ ] **Step 2: Verify disabled radius state**

```js
await expect(page.getByRole('group', { name: '活动范围' })).toHaveAttribute('aria-disabled', 'true')
```

Or, if the component renders button disabling:

```js
await expect(page.getByRole('group', { name: '活动范围' }).getByRole('button', { name: '中' })).toBeDisabled()
```

- [ ] **Step 3: Run the focused Playwright suite**

Run:

```bash
npm run test:control-center -- --grep "Pet|grounded|home"
```

Expected:

- PASS for the updated Pet pane regression coverage.

- [ ] **Step 4: Commit**

```bash
git add tests/control-center/control-center-smoke.spec.js
git commit -m "test: cover grounded and home pet controls"
```

## Task 10: Run end-to-end verification and refresh docs

**Files:**
- Modify: `docs/HANDOFF.md`
- Modify: `docs/development-summary.md`
- Modify: `docs/project-status-review.md`

- [ ] **Step 1: Run the full verification set**

Run:

```bash
npm test
```

Run:

```bash
npm run test:control-center
```

Run:

```bash
npm run check:syntax
```

Expected:

- PASS for unit tests, Playwright UI regression, and syntax checks.

If the pre-existing Electron installation issue in `tests/main/ipc-plugin-install.test.js` reappears, capture it explicitly in the commit note and stop before claiming full green.

- [ ] **Step 2: Refresh live docs with shipped behavior**

Update docs to mention:

- grounded mode is host-owned;
- home depends on grounded;
- dragging while home is enabled rehomes the pet;
- display changes auto-normalize the anchor.

Use concise updates only in:

```md
docs/HANDOFF.md
docs/development-summary.md
docs/project-status-review.md
```

- [ ] **Step 3: Re-run the minimal doc-safe verification**

Run:

```bash
npm run check:syntax
```

Expected:

- PASS with no code regressions from doc updates.

- [ ] **Step 4: Commit**

```bash
git add docs/HANDOFF.md docs/development-summary.md docs/project-status-review.md
git commit -m "docs: record grounded and home pet behavior"
```

## Self-Review

Spec coverage checklist:

- Grounded-only mode: covered by Tasks 4, 5, 6, and 9.
- Home depends on grounded: covered by Tasks 3 and 4.
- First enable sets current position as home: covered by Task 7.
- Dragging rehomes the pet: covered by Tasks 7 and 8.
- Landing-point persistence semantics: covered by Tasks 5 and 6.
- Discrete radius tiers: covered by Tasks 4, 5, and 6.
- Display-change recovery: covered by Task 7.
- Control Center operability and persistence: covered by Tasks 3, 4, and 9.
- Validation strategy: covered by Tasks 5, 6, 9, and 10.

Placeholder scan:

- No `TODO`, `TBD`, or deferred implementation placeholders remain.
- Every code-changing task includes concrete code or exact shapes to implement.
- Every verification task includes explicit commands and expected outcomes.

Type consistency checklist:

- Renderer-facing settings use `grounded` and `home` consistently.
- Persisted host settings use `petBehavior.grounded` and `petBehavior.home`.
- Radius tiers use `small | medium | large` consistently across contracts, defaults, UI, and movement policy.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-19-pet-ground-home.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
