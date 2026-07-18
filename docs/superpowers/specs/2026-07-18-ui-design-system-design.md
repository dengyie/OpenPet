# OpenPet UI Design System Modernization — Design Spec

> Date: 2026-07-18
> Branch: `refactor/ui-design-system`
> Status: ✅ delivered (phases 0–5 complete)

## 1. Goal

Extend the existing design seed in `design-system/MASTER.md` (soft white surfaces, blue-gray shadows, purple accent, native-desktop restraint) across the entire OpenPet UI, and turn the ad-hoc 3055-line `styles.css` into a token-driven, module-split style architecture with a reusable shared component library.

This is a **visual/design-system modernization**, not a logic refactor, not an interaction redesign.

## 2. Execution Contract (frozen)

- **Milestone**: UI design-system modernization
- **Scope container**: all user-facing UI surfaces of OpenPet

### P0/P1 scope

| ID | Scope | Priority |
|---|---|---|
| P0-1 | Design token layer: CSS custom properties for color / spacing / radius / shadow / typography; split `styles.css` into token layer + per-domain modules | P0 |
| P0-2 | Shared component library (~10-15 components extracted from repeated pane patterns): FieldRow, Card, Button, Badge, Section, EmptyState, StatusLine, etc. Props interfaces and data flow unchanged | P0 |
| P0-3 | Visual rewrite of all 8 Control Center tabs (Create / Pet / Actions / AI / Plugins / Catalog / Service / About) on top of tokens + shared components | P0 |
| P0-4 | App shell modernization: sidebar / brand / nav; keep narrow-window compact layout | P0 |
| P1-5 | Pet-window UI: bubble chat popup, context menu, loading state (`index.html` + style-only parts of `renderer.js`) | P1 |
| P1-6 | Playwright smoke baseline updated in lock-step (selector changes minimized) | P1 |

### Explicit non-goals (P2/P3 backlog)

- Splitting `AiPane.tsx` / `useAiPane.ts` logic (structural, not visual)
- Router library / URL state
- i18n extraction (existing Chinese labels stay as-is)
- Dark mode (tokens are structured to allow it later; not implemented)
- Pet sprite animation, drag, hitbox logic
- `demo-control-center-api.ts` (4720 lines) cleanup
- Any main-process / IPC / contract change

### Manual-required

- None external. Final visual acceptance is by human screenshot review (I will produce before/after captures).

### Phase budget

5 phases (max allowed by milestone rules).

1. Token layer + style architecture
2. Shared component library + small-pane migration
3. Large-pane migration (Ai / Actions / Plugins)
4. Shell + remaining panes + pet-window UI
5. Full regression + visual acceptance

### Acceptance criteria

1. `npm run build:control-center` and `npm run check:syntax` green
2. `npm run test:control-center` (Playwright) green
3. `npm run test:core` green
4. Side-by-side screenshots of all 8 tabs + pet window, visually unified to the seed
5. `styles.css` no longer a magic-value pile; new UI consumes tokens only

## 3. Current-State Findings (from recon)

- `src/control-center/src/styles.css`: 3055 lines, single global file, hard-coded `#f4f6f8` / `#6b7280` / `7px` radius everywhere. Highest-churn + highest bug-magnet UI file.
- `src/control-center/src/components/`: only `Toggle`, `SegmentedControl`, `PluginEntryDetails`. Repeated `field-row` (76 uses), `field-label` (76), `ghost` button (73), `readonly-row` (37), etc. — clear extraction candidates.
- Panes are prop-driven from hooks (`App.jsx` passes `{...hook.paneProps}`); this contract is stable and will NOT change.
- `App.jsx` is a minimal shell with `useState` tab switching, no router.
- `control-center-api.ts` is a typed preload→demo proxy; untouched.
- Pet window: `index.html` (142 lines, inline `<style>`) + `renderer.js` (983 lines). Only the style blocks and a few style-writing JS lines are in scope.
- Design seed already lives in `design-system/MASTER.md` and the cursor-settings section of `PetPane.tsx` — the living reference.

## 4. Target Architecture

### 4.1 Style layers

```text
src/control-center/src/styles/
  tokens.css        — all custom properties (color, space, radius, shadow, type)
  base.css          — resets, element defaults, font stacks (consumes tokens)
  layout.css        — shell grid, sidebar, content, pane scaffolding
  components.css    — shared-component styles (Button, Card, FieldRow, ...)
  panes/
    pet.css actions.css ai.css plugins.css catalog.css service.css about.css create.css
  pet-window.css    — (loaded separately by index.html, see §4.4)
```

`styles.css` becomes a thin entry that `@import`s the above, so the Vite entry and existing imports keep working. Existing class names are preserved wherever a selector is behavior-relevant (tests, JS lookups); only their declarations move to tokens.

### 4.2 Token naming

```css
--op-color-bg, --op-color-surface, --op-color-border,
--op-color-text, --op-color-text-muted, --op-color-accent,
--op-space-1..8, --op-radius-sm|md|lg,
--op-shadow-sm|md|lg, --op-font-size-sm|md|lg|xl, ...
```

Prefix `--op-` to avoid collisions. Values lifted from the cursor-settings seed (soft white `#ffffff` surface, `#f4f6f8` app bg, blue-gray shadow, purple accent ~`#7c5cff` family, `7px`/`12px` radii).

### 4.3 Shared components

New files under `src/control-center/src/components/`, each a small typed TSX:

`Button` (variants: primary/ghost/danger), `Card`, `Section`, `FieldRow`, `FieldLabel`, `FieldNote`, `Badge`, `EmptyState`, `StatusLine`, `TextInput`, `TextArea`, `ReadonlyRow`, `InlineAction`, `Disclosure`.

Each component: one responsibility, props typed, no business logic, styles from `components.css`. Panes swap their inline repeated markup for these without changing hook contracts.

### 4.4 Pet window

`index.html` inline `<style>` is rewritten to consume a shared token sheet (small, self-contained; the pet window can't reuse the Control Center bundle). Bubble, context menu, and loading visuals updated to the same seed. `renderer.js` is only touched where it writes inline styles (e.g., menu positioning colors) — no animation/drag/hitbox logic changes.

### 4.5 Test strategy

- Selector changes minimized; where a class must change, update `tests/control-center/control-center-smoke.spec.js` in the same commit.
- After each phase: `npm run build:control-center`, `npm run check:syntax`; full `test:control-center` at phase boundaries.

## 5. Risks

- **Global CSS leakage**: neighbors of rebuilt selectors may visually regress. Mitigation: migrate pane-by-pane, screenshot after each.
- **Playwright fragility**: the smoke spec changed 166 times historically — treat it as a hard gate, update in lock-step.
- **Pet-window coupling**: inline styles in `renderer.js` may be load-bearing for layout (drag math). Only color/shadow/radius/font declarations are touched; geometry math untouched.

## 6. Deliverable

A single branch `refactor/ui-design-system`, ≤5 phase commits, green gates, before/after screenshots, and a delivery summary. No follow-on milestone is auto-started.
