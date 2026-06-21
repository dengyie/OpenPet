# Cursor Settings Asset And Data Spec

## Content Sources

- Cursor names, timestamps, dimensions: existing settings/runtime data.
- Status badges and button labels: existing localized UI strings.

## Placeholder Policy

- Use current application data only.
- No fake custom cursor entries will be introduced in shipping code.

## Visual Asset Sources

- Binding screenshot: `/Users/mango/Downloads/corsurdesing.png`
- Cursor thumbnails: existing built-in and user-uploaded cursor assets.
- Icons: existing inline SVG React components in `PetPane.tsx`.

## Data Ownership

- Selection state: existing settings persistence.
- Custom cursor library rows: existing `settings.customCursors`.
- Upload/edit/delete behaviors: existing hook and IPC flow.

## Replacement Trigger

- If the missing original screenshot is restored and materially differs from `corsurdesing.png`, this page should be re-audited and adjusted.
