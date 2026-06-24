# Cursor Settings Design System

This document consolidates the cursor settings design notes that previously lived under the repository-level `design-system/` folder. It is scoped to the Control Center `Pet` pane cursor settings section.

## Objective

Rebuild and maintain the Control Center `Pet` pane cursor settings section so it matches the recovered local design reference while preserving existing OpenPet cursor selection and management flows.

## Intake Basis

- User request: pixel-level recreation of the cursor settings page.
- Strongest available visual source: `/Users/mango/Downloads/corsurdesing.png`.
- Original requested screenshot path `/Users/mango/Downloads/ShareMouse/1782066303975_d.png` was missing at implementation time.
- Current source path: `temporary-binding` local screenshot authority for this single page section.
- Replacement trigger: if the original screenshot is restored, or a newer approved mock replaces it, re-audit this section before changing visual details.

## Route Coverage

- In scope: Control Center `Pet` pane cursor settings section.
- Deferred: other `Pet` pane controls, other Control Center tabs, and pet runtime hover behavior.
- Audience: OpenPet desktop users configuring pet hover cursors.
- Route purpose: let users choose, upload, manage, rename, replace, and delete pet hover cursors inside the Control Center `Pet` pane.

## Visual Principles

- Use a soft white control surface with subtle blue-gray shadowing.
- Keep rounded large containers with generous internal padding.
- Prefer calm, native-desktop spacing over dense dashboard layout.
- Use purple only for active emphasis, borders, badges, and primary outline actions.
- Make cursor cards tactile, evenly spaced, and not compressed.

## Typography And Color Tokens

- Heading hierarchy should be strong enough for Chinese UI copy.
- Section title should be large and bold.
- Descriptive copy should use medium gray and generous line height.
- Card labels and list item names should use dark foreground with medium-heavy weight.

| Token | Value |
| --- | --- |
| Surface | `#ffffff` |
| Soft background tint | `#fbfbfe` |
| Border | `#e7ebf3` |
| Muted text | `#7a8599` |
| Primary accent | `#8b76ff` |
| Primary accent strong | `#6f5cff` |
| Selection wash | `#f6f2ff` |

## Layout Primitives

- Outer cursor section is a vertical stack.
- Large title and descriptive copy sit above the interactive area.
- Top row is a horizontally scrollable card strip.
- Management area is a large rounded panel with header, list rows, and footer note.
- Rows use a long horizontal layout with preview, metadata, and trailing actions.
- Footer usage guidance sits outside the main management panel.

## Component Inventory

- Cursor option cards
- Add custom cursor card
- Cursor management panel
- Cursor library row
- Usage badge
- Footer guidance note

## Interaction Style

- Selected cursor cards get a strong accent border and floating check badge.
- Buttons remain real controls, not static artwork.
- Manage and upload controls stay visible in the panel header.

## Responsive Rules

- Cursor card strip can horizontally scroll on narrow widths.
- List rows may wrap actions, but preview and metadata alignment should remain stable.
- Management panel must keep large corner radius and internal spacing on all widths.

## Asset And Data Policy

- Use current application data only.
- Do not introduce fake custom cursor entries in shipping code.
- Cursor names, timestamps, and dimensions come from existing settings/runtime data.
- Status badges and button labels come from existing localized UI strings.
- Cursor thumbnails come from existing built-in and user-uploaded cursor assets.
- Icons come from existing inline SVG React components in `PetPane.tsx`.
- Recreate panel backgrounds and preview textures with CSS.
- Do not add remote assets.

## Data Ownership

- Selection state: existing settings persistence.
- Custom cursor library rows: existing `settings.customCursors`.
- Upload, edit, and delete behavior: existing hook and IPC flow.

## Implementation Plan

1. Define source authority and page decomposition.
2. Refactor `PetPane` cursor section markup for the reference layout.
3. Rework CSS for card geometry, panel composition, typography, and action alignment.
4. Run build plus visual QA and fix blocking mismatches.

## Likely Files

- `src/control-center/src/panes/PetPane.tsx`
- `src/control-center/src/styles.css`
- `src/control-center/src/hooks/usePetSettingsPane.ts` only if UI state shape must adjust
- `docs/design-system/cursor-settings.md`

## Verification

```bash
npm run build:control-center
```

Use browser-level visual inspection against `/Users/mango/Downloads/corsurdesing.png` when working on this visual section.

## Risks

- Existing global `styles.css` may have neighboring selectors that visually leak into the rebuilt panel.
- The recovered reference remains temporary authority until the original screenshot is restored or replaced.

## Non-Negotiables

- Preserve existing selection, upload, edit, delete, and persistence logic.
- Do not replace the page with a screenshot.
- Keep DOM-based, accessible controls.
- Match the recovered reference composition before adding extra polish.

## Acceptance Checklist

- Title and description match the reference hierarchy.
- Top card strip visually matches the reference rhythm and active state.
- Management panel matches the rounded card structure and row density.
- Current upload, manage, edit, and delete flows still work.
- Footer note sits outside the main management panel.

## Visual Source Map

| Source | Status | Controls | Route/Section | Authority Reason | Milestone | Replacement Trigger | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/Users/mango/Downloads/corsurdesing.png` | `temporary-binding` | Whole section composition | Control Center `Pet` pane cursor settings block | Strongest available user-owned local screenshot after original path was missing | Current cursor-settings rebuild | Original `1782066303975_d.png` restored or a newer approved mock replaces it | Desktop-only reference; spacing and hierarchy are authoritative for this pass |

## Round Output

- Round 0 complete: milestone and section scope bounded.
- Round 2 complete: cursor block decomposed into title, intro copy, horizontal card strip, management panel, list rows, action group, and footer hint.
- Round 3 complete: implementation mapped to `PetPane.tsx` plus `styles.css`.
