# Control Center Cursor Settings Page Spec

## Route Purpose

Let users choose, upload, manage, rename, replace, and delete pet hover cursors inside the Control Center `Pet` pane.

## Binding Visual Reference

- `/Users/mango/Downloads/corsurdesing.png`

## Route Status Target

- `Framework Ready`

## Desktop Layout Regions

1. Large title and descriptive copy.
2. Horizontal cursor card strip with consistent card width and soft preview tiles.
3. Separate rounded management panel with left-aligned title and right-aligned action buttons.
4. List rows with preview tile, name + badge + metadata, then trailing actions.
5. Bottom usage note outside the panel.

## Mobile / Narrow Width Behavior

- Cursor option strip scrolls horizontally.
- Panel header buttons may wrap below title.
- List action buttons may wrap but keep row grouping readable.

## Components

- Cursor option cards
- Add custom cursor card
- Cursor management panel
- Cursor library row
- Usage badge
- Footer guidance note

## Acceptance Checklist

- Title and description match the reference hierarchy.
- Top card strip visually matches the reference rhythm and active state.
- Management panel matches the rounded card structure and row density.
- Current upload/manage/edit/delete flows still work.
- Footer note sits outside the main management panel.
