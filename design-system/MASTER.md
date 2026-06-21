# Cursor Settings Design System

## Objective

Rebuild the Control Center `Pet` pane cursor settings section so it closely matches the recovered local design reference while preserving the existing OpenPet cursor selection and management flows.

## Intake Basis

- User request: pixel-level recreation of the cursor settings page.
- Strongest available visual source: `/Users/mango/Downloads/corsurdesing.png`
- Original requested screenshot path `/Users/mango/Downloads/ShareMouse/1782066303975_d.png` was missing at implementation time.

## Audience

- OpenPet desktop users configuring pet hover cursors.

## Route Inventory

- In scope: Control Center `Pet` pane cursor settings section.
- Deferred: other `Pet` pane controls, other Control Center tabs, pet runtime hover behavior.

## Source Path Choice

- Current source path: `temporary-binding` local screenshot authority for a single page section.
- Milestone target: `Framework Ready` with high-fidelity visual reproduction for the cursor section.

## Visual Principles

- Soft white control surface with subtle blue-gray shadowing.
- Rounded large containers with generous internal padding.
- Calm, almost native desktop spacing instead of dense web dashboard density.
- Purple used only for active emphasis, borders, badges, and primary outline action.
- Cursor cards should feel tactile and evenly spaced, not compressed.

## Typography

- Strong Chinese heading hierarchy.
- Large bold section title.
- Medium gray descriptive copy with generous line height.
- Card labels and list item names use dark foreground with medium-heavy weight.

## Color Tokens

- Surface: `#ffffff`
- Soft background tint: `#fbfbfe`
- Border: `#e7ebf3`
- Muted text: `#7a8599`
- Primary accent: `#8b76ff`
- Primary accent strong: `#6f5cff`
- Selection wash: `#f6f2ff`

## Layout Primitives

- Outer cursor section is a vertical stack.
- Top row is a horizontally scrollable card strip.
- Management area is a large rounded panel with header, list rows, and footer note.
- Rows use long horizontal layout with preview, metadata, and trailing actions.

## Interaction Style

- Selected cursor cards get a strong accent border and floating check badge.
- Buttons remain real controls, not static artwork.
- Manage and upload controls stay visible in the panel header.

## Responsive Rules

- Cursor card strip can horizontally scroll on narrow widths.
- List rows may wrap actions, but preview and metadata alignment should remain stable.
- Management panel must keep large corner radius and internal spacing on all widths.

## Non-Negotiables

- Preserve existing selection, upload, edit, delete, and persistence logic.
- Do not replace the page with a screenshot.
- Keep DOM-based, accessible controls.
- Match the recovered reference composition before adding extra polish.
