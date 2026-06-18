# Pet Ground + Home Design

> Date: 2026-06-19
> Topic: Pet ground constraint and home anchor

## Goal

OpenPet needs two new host-owned pet movement settings:

- an optional `grounded` mode so the pet stays on the current display's ground line instead of drifting vertically;
- an optional `home` mode so the pet treats one anchor near its current display as home, plays near that anchor, and walks back when it strays too far.

The target outcome is intentionally narrow:

- both settings are controlled by the user in Control Center;
- `home` depends on `grounded`;
- first-run `home` uses the pet's current position as the anchor;
- dragging the pet updates home when `home` is enabled;
- recovery after display or work-area changes is automatic and conservative.

## Current State

OpenPet already has the right building blocks, but no spatial policy layer yet.

- The pet window is created as a transparent always-on-top `BrowserWindow` and initially placed near the primary display's bottom-right work area.
- The renderer only performs horizontal auto-walk through `moveBy({ x, y: 0 })`.
- Manual dragging sends absolute window positions to the main process.
- The main process already clamps window movement to the current display work area.
- Pet settings currently expose `scale`, `walkSpeed`, `walkDuration`, `bubbleDuration`, and `autoStart`, but no location or movement-boundary policy.

Key local references:

- [src/main/window.js](/Users/mango/.config/superpowers/worktrees/OpenPet/codex-openpet-dev-20260619/src/main/window.js:33)
- [src/main/ipc.js](/Users/mango/.config/superpowers/worktrees/OpenPet/codex-openpet-dev-20260619/src/main/ipc.js:131)
- [renderer.js](/Users/mango/.config/superpowers/worktrees/OpenPet/codex-openpet-dev-20260619/renderer.js:179)
- [src/control-center/src/panes/PetPane.tsx](/Users/mango/.config/superpowers/worktrees/OpenPet/codex-openpet-dev-20260619/src/control-center/src/panes/PetPane.tsx:16)
- [src/main/settings.js](/Users/mango/.config/superpowers/worktrees/OpenPet/codex-openpet-dev-20260619/src/main/settings.js:14)

## External Research

The feature direction matches established desktop-pet behavior patterns:

- [Webmeji README](https://raw.githubusercontent.com/lars-rooij/webmeji/master/README.md) describes creatures that "walk around on the bottom", jump to screen edges, get dragged, and clamp drag movement to screen bounds. This is strong evidence that "bottom edge" is a natural primary behavior surface for pet-like companions.
- [CLAWD.exe](https://zlaxrr.github.io/clawd-pet/) explicitly frames the character as living on the taskbar and moving along visible desktop surfaces. That supports a grounded-first user experience instead of a free-floating one.
- [Electron screen docs](https://www.electronjs.org/docs/latest/api/screen) provide the primitives OpenPet needs: `getDisplayMatching(rect)`, `getDisplayNearestPoint(point)`, `workArea`, and display change events such as `display-removed` and `display-metrics-changed`.
- [GitHub Desktop issue #3342](https://github.com/desktop/desktop/issues/3342) is a concrete reminder that persisted window positions can become invalid after environment changes and must be normalized back into reachable screen space.

These sources suggest a good first version should:

- keep movement tied to visible work areas;
- avoid storing brittle absolute top-left window positions as the main semantic anchor;
- treat display changes as a recovery path, not as a fatal error;
- keep user mental models simple: the pet stands on the ground and has a home nearby.

## Confirmed Decisions

The following product decisions were confirmed during review:

- First version scope is one home anchor on the current display only.
- The anchor is constrained to the current display `workArea`.
- When `grounded` and `home` are both enabled, dragging the pet updates home to the new position.
- Enabling `home` for the first time stores the pet's current position as home.
- Home is stored as the pet's landing point, not the window's top-left corner.
- `home` depends on `grounded`; `grounded` can be enabled independently.
- Home radius is user-configurable through three discrete sizes, not free pixel input.
- If display metrics change and home becomes invalid, OpenPet automatically clamps it back into the current display work area instead of disabling the feature.

## Decision Record

### Decision 1: keep both features host-owned in pet settings

- Problem: these behaviors could be modeled in pet packs, AI behavior rules, or host settings.
- Choice: store them in OpenPet host settings alongside existing pet behavior settings.
- Reason: the feature is about window movement policy, display geometry, and user preference. It does not belong to pet art packs or AI orchestration.
- Risk: future per-pack behavior tuning may want pet-specific overrides. That is intentionally deferred.

### Decision 2: make `home` depend on `grounded`

- Problem: independent toggles would require defining free-floating home behavior and vertical return semantics.
- Choice: `grounded` may be toggled alone; `home` is only available when `grounded` is enabled.
- Reason: this keeps the first version's geometry one-dimensional in practice: the pet moves along a ground line and returns along that same line.
- Risk: future users may ask for floating companions with a 2D roam radius. That can be added later without weakening this first release.

### Decision 3: store home as a landing point

- Problem: a persisted home could be represented as window top-left, window center, or pet landing point.
- Choice: store home as the bottom-center landing point of the pet window in display DIP coordinates.
- Reason: this survives scale changes and keeps the visual meaning stable. The user's mental model is "this spot on the desktop is home", not "this window rectangle corner is home".
- Risk: if future pet packs have very different visual feet offsets, OpenPet may eventually need a pack-specific landing offset. That is outside this phase.

### Decision 4: dragging is a home-editing gesture when home is enabled

- Problem: dragging could be temporary displacement or an explicit relocation of home.
- Choice: when `home` is enabled, drag end updates home to the new landing point.
- Reason: this is the lowest-friction interaction and aligns with "enable home uses current position" as the same mental model.
- Risk: users lose the ability to temporarily move the pet away from home without changing home. That trade-off is acceptable for v1 simplicity.

### Decision 5: recover by clamping, not by failing closed

- Problem: persisted home anchors can become unreachable after display changes.
- Choice: if the saved home is outside the active display's usable area, clamp it to the nearest valid landing point inside the current `workArea`.
- Reason: OpenPet already prefers visible, reachable window recovery over strict preservation of stale geometry.
- Risk: the pet may end up slightly shifted after a display change, but the feature remains usable.

## Scope

In scope:

- new pet settings for `grounded`, `home enabled`, and discrete `home radius`;
- persisted home anchor in host settings;
- main-process movement normalization for drag and auto-walk;
- home updates on enable and drag end;
- automatic return-to-home behavior when the pet is outside its allowed radius;
- Control Center UI and demo API updates;
- targeted tests for settings, IPC movement policy, and Control Center persistence.

Out of scope:

- multiple homes;
- cross-display homes;
- pack-defined home behavior;
- freeform coordinate editing;
- floating 2D home movement while `grounded` is off;
- complex pathfinding, acceleration, physics, or obstacle avoidance;
- visual home marker overlays on the desktop;
- plugin or MCP APIs for mutating home behavior in this phase.

## Design

### 1. Settings model

Add a host-owned pet movement policy section under top-level settings:

```json
{
  "petBehavior": {
    "grounded": false,
    "home": {
      "enabled": false,
      "radius": "medium",
      "anchor": {
        "displayId": "current-display-id",
        "x": 1420,
        "y": 1040
      }
    }
  }
}
```

Suggested normalized shape in runtime code:

```ts
type PetHomeRadius = 'small' | 'medium' | 'large'

interface PetHomeAnchor {
  displayId: string
  x: number
  y: number
}

interface PetHomeSettings {
  enabled: boolean
  radius: PetHomeRadius
  anchor: PetHomeAnchor | null
}

interface PetBehaviorSettings {
  grounded: boolean
  home: PetHomeSettings
}
```

Rules:

- `home.enabled` must be forced to `false` when `grounded` is `false`;
- `home.anchor` may be `null` in persisted data, but enabling `home` immediately fills it from current position;
- malformed anchors are sanitized to `null`;
- unknown radius values fall back to `medium`.

### 2. Shared contracts and Control Center view state

Extend `ControlCenterSettings` so the renderer can read and save the new behavior state directly.

Suggested view-state additions:

```ts
interface ControlCenterPetHomeSettings {
  enabled: boolean
  radius: 'small' | 'medium' | 'large'
  hasAnchor: boolean
}

interface ControlCenterSettings {
  scale: number
  walkSpeed: number
  walkDuration: number
  bubbleDuration: number
  autoStart: boolean
  grounded: boolean
  home: ControlCenterPetHomeSettings
}
```

The renderer does not need raw anchor coordinates in v1. It only needs:

- whether grounded is on;
- whether home is on;
- current radius;
- whether a home anchor exists.

Anchor coordinates remain main-process-owned geometry state.

### 3. Movement geometry

The main process becomes the single owner of landing-point math.

Definitions:

- `landingX = windowBounds.x + windowBounds.width / 2`
- `landingY = windowBounds.y + windowBounds.height`

Ground line for a display:

- `groundY = display.workArea.y + display.workArea.height - groundInset`

`groundInset` should preserve the current visual bottom spacing already implied by the window layout, not flush the pet to the work-area edge.

Radius mapping should be simple and discrete:

- `small`: conservative radius;
- `medium`: default radius;
- `large`: wider roaming radius.

The exact pixel values should be chosen relative to current window size and typical desktop width, but remain simple constants in v1.

### 4. Main-process movement policy

Add a small movement-policy layer in the main process, separate from renderer animation.

Responsibilities:

- normalize persisted pet behavior settings;
- compute active display and valid landing ranges;
- convert between landing points and window top-left positions;
- clamp drag and walk movement against ground and home constraints;
- update home on drag end or first enable;
- re-clamp home on display changes.

Suggested module boundary:

- keep `PetService` as source of settings truth;
- keep renderer responsible for animation and gesture initiation;
- add a focused helper or service for movement policy instead of pushing more geometry into `renderer.js`.

### 5. Drag behavior

Drag start remains unchanged.

During drag:

- if `grounded` is off, existing work-area clamping behavior stays unchanged;
- if `grounded` is on, the main process forces the resulting window Y to the active display's ground line;
- X still clamps to the display work area.

On drag end:

- if `home` is enabled, compute the final landing point and persist it as the new home anchor;
- if `home` is disabled, do not persist any anchor changes.

This keeps drag semantics simple:

- drag moves the pet;
- grounded keeps it on the floor;
- home-enabled drag also rehomes the pet.

### 6. Auto-walk behavior

The renderer should not own home logic. It should continue asking the main process to move.

When the renderer calls `moveBy({ x, y: 0 })`:

- the main process computes the candidate landing point;
- if `grounded` is enabled, the window is forced onto the display ground line;
- if `home` is disabled, normal work-area clamping applies;
- if `home` is enabled, the candidate landing point is clamped to the allowed home radius interval;
- when a requested move would exceed the allowed interval, the result returns a boundary hit so the renderer turns around;
- if the pet is already outside the allowed interval due to environment changes or stale position, the main process prioritizes walking back toward the nearest legal landing point.

This preserves the current renderer contract:

- renderer requests a horizontal move;
- main process returns normalized bounds and hit state;
- renderer handles direction changes.

### 7. Enable and disable flows

When the user turns `grounded` on:

- persist `grounded: true`;
- immediately normalize the current pet window onto the active display ground line.

When the user turns `grounded` off:

- persist `grounded: false`;
- force `home.enabled = false`;
- keep the current window position as-is after that save.

When the user turns `home` on:

- require `grounded = true`;
- if no anchor exists, store the current landing point as anchor;
- persist `home.enabled = true`.

When the user turns `home` off:

- persist `home.enabled = false`;
- keep the anchor in storage only if future UX wants quick re-enable, or clear it immediately if we want stronger predictability.

Recommendation for v1:

- keep the anchor while disabled;
- only hide the behavior, not the remembered place.

That makes temporary disable/re-enable less frustrating.

### 8. Display-change recovery

Listen to Electron display events relevant to geometry changes:

- `display-added`
- `display-removed`
- `display-metrics-changed`

On any relevant change:

- determine the best active display using current window bounds or nearest point;
- recalculate the valid ground line and legal landing interval;
- clamp the current window into a visible valid landing position;
- if home is enabled, clamp the anchor into the same display's legal home range and persist the normalized anchor if it changed.

This keeps the pet reachable after:

- taskbar or Dock movement;
- resolution changes;
- scale factor changes;
- unplugging a monitor.

### 9. Control Center UX

Add a new section in the Pet pane under the current movement settings.

Proposed controls:

- `Toggle`: `落地模式`
- `Toggle`: `Home 点`
- `SegmentedControl`: `活动范围`

UI rules:

- `Home 点` toggle is disabled when `落地模式` is off;
- `活动范围` is disabled when `Home 点` is off;
- a short note explains that enabling home uses the current position as home;
- a short note explains that dragging the pet while home is enabled will move home.

Suggested copy direction:

- `落地模式`: 宠物沿着当前屏幕底边活动
- `Home 点`: 宠物会把当前位置当作家，围着家附近活动
- helper note: 开启 Home 后，拖动宠物会更新家的位置

### 10. Demo API behavior

The Control Center demo API should simulate:

- persistence of `grounded`, `home.enabled`, and `home.radius`;
- disabling `home` when `grounded` turns off;
- remembered home anchor presence within the demo session.

No real desktop geometry simulation is required in the demo API. It only needs stable settings behavior for UI regression coverage.

## Error Handling

- Invalid or missing anchor data should sanitize to `null`, not crash startup.
- If `home.enabled` is true but no valid anchor can be recovered, OpenPet should use the current landing point and persist it.
- If display lookup fails unexpectedly, fall back to the primary display work area.
- If a save fails, the existing Pet pane status line should surface the error in the same pattern as other pet settings.

## Acceptance

- Users can enable `grounded` independently.
- Users can only enable `home` when `grounded` is on.
- Enabling `home` without an anchor stores the current landing point as home.
- Dragging while `home` is enabled updates home.
- Auto-walk never moves beyond the configured home radius when `home` is on.
- The pet returns toward the allowed home area when currently outside it.
- Display changes automatically normalize both current position and home anchor into valid reachable space.
- Control Center demo mode persists the new settings in-session.

## Validation Plan

Targeted automated coverage should include:

- settings normalization tests for malformed `petBehavior` data;
- IPC or movement-policy tests for grounded clamping;
- movement-policy tests for home interval clamping by radius tier;
- drag-end tests that update home when enabled;
- settings-save tests that auto-disable home when grounded turns off;
- display-change recovery tests that clamp stale anchors;
- Control Center smoke or focused UI tests for:
  - grounded toggle behavior,
  - home dependency disabling,
  - radius persistence,
  - save and reset flows.

Likely file areas:

- `tests/services/settings-service.test.js`
- `tests/main/...` movement or IPC coverage
- `tests/control-center/control-center-smoke.spec.js`

## Risks

- The current movement contract only reports simple boundary hits. Home-return behavior must avoid making direction changes feel jittery.
- If ground-line math ignores visual sprite feet offset, the pet may look slightly sunk or floating.
- If anchors are persisted too eagerly during drag move instead of drag end, settings churn could become noisy.
- Multi-display users may later expect one home per display. This design intentionally does not provide that yet.

## Open Questions

The grilling phase resolved the important product questions. Remaining implementation questions are low-risk and should be settled in planning:

- exact pixel values for `small`, `medium`, and `large` radius;
- whether disabled `home` should keep or clear the saved anchor in final implementation;
- whether to expose a future explicit `设为家` action in the Pet pane or context menu.

## Suggested Next Steps

1. Review and approve this spec.
2. Write an implementation plan that splits work into:
   - settings and contracts,
   - main-process movement policy,
   - Control Center UI,
   - tests and docs.
3. Implement in small slices with targeted verification after each slice.
