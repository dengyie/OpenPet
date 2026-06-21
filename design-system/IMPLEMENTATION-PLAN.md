# Cursor Settings Implementation Plan

## Milestone

Cursor settings page high-fidelity rebuild inside Control Center `Pet` pane.

## Phase Order

1. Define source authority and page decomposition.
2. Refactor `PetPane` cursor section markup for the reference layout.
3. Rework CSS for card geometry, panel composition, typography, and action alignment.
4. Run build plus visual QA and fix blocking mismatches.

## Route Coverage

- In scope: `src/control-center/src/panes/PetPane.tsx` cursor settings section only.
- Out of scope: other pane sections and other tabs.

## Likely Files

- `src/control-center/src/panes/PetPane.tsx`
- `src/control-center/src/styles.css`
- `src/control-center/src/hooks/usePetSettingsPane.ts` only if UI state shape must adjust
- `design-system/*` docs

## Asset Strategy

- Reuse existing inline SVG icons and existing cursor assets.
- Recreate panel backgrounds and preview textures with CSS.
- No new remote assets.

## Verification

- `npm run build:control-center`
- browser-level visual inspection against `corsurdesing.png`

## Risks

- Existing global `styles.css` may have neighboring selectors that visually leak into the rebuilt panel.
- Missing original screenshot means the recovered reference remains temporary authority.

## Milestone Target

`Framework Ready` with near-reference visual fidelity for the cursor settings block.
