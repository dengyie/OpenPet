# Creator Workflow Host Smoke Evidence

Generated: 2026-07-05T08:31:53.863Z

This evidence records a sanitized host-side one-click Creator Workflow smoke run against the saved OpenPet image Provider configuration.

## Scope

- Source session: `release/creator-workflow-host-smoke/2026-07-05T08-22-31-889Z`
- Reference image: `[redacted-local-reference]/正面.png`
- Scenarios: `new-character`, `existing-action`
- Raw API key: not recorded
- Local user-data path: redacted

## Request

- Scenario request: `both`
- New character: `Golden Cartoon Cat`
- New character style prompt: Create a cute cartoon-style OpenPet character based on the reference: a golden shaded British shorthair cat with round green eyes, warm gold fur, cream chest, soft chubby body, clean transparent-background sprite-ready pet art. Keep the design friendly, simplified, expressive, and suitable for a desktop pet.
- Existing action: `golden-cartoon-wave`
- Existing action prompt: Create a friendly waving action for the same cute cartoon golden shaded cat pet, preserving the round green eyes, warm gold fur, cream chest, and simplified desktop-pet style.

## Result

| Scenario | Status | Evidence |
| --- | --- | --- |
| new-character | pass | `golden-cartoon-cat` completed in `397290ms`; conditioning: image-edit via /images/edits with 1 reference image(s). |
| existing-action | pass | `golden-cartoon-wave` completed in `164609ms`; conditioning: image-edit via /images/edits with 1 reference image(s). |

## Visual QA

- Base frame: `1024x1024`, visible alpha pixels `445186`, transparent pixels `603390`, visible bounding box `x=220..918, y=56..942`.
- Waving frame: `1024x1024`, visible alpha pixels `453469`.
- New pet spritesheet: `1536x1872`.
- Existing action first frame: `192x208`, visible alpha pixels `18121`.
- Existing action sprite: `3072x208`, visible alpha pixels `244610`.
- Existing action contact sheet: `444x556`.
- Human preview: generated character is a cute cartoon golden shaded cat with warm gold fur, cream chest, round face, and desktop-pet proportions. The preview surface can look dark/vignette-like around the character, so art QA should still review final visual fit even though alpha analysis confirms the frame is not a fully opaque background.

## Manifest QA

- Imported pet id: `golden-cartoon-cat`.
- Display name: `Golden Cartoon Cat`.
- Spritesheet path: `spritesheet.webp`.
- Action manifest location: `creatorStudio.actions`.
- Action count: `9`.
- Required real actions present: `idle`, `waving`.
- `idle` has `6` frames and binds to state `idle`.
- `waving` has `4` frames and binds to `clickAction`.

## Issue Log

- No OpenPet product-chain failure occurred in this run.
- A local jq inspection command initially assumed the generated pet manifest used top-level `actions`; the actual generated pack stores actions under `creatorStudio.actions`. The follow-up manifest check used the correct path.

## Claim Boundary

This archive confirms the current supported one-click path on the current branch for the supplied single-image material shape.

It does not by itself prove production art quality, broad multi-view support, or main-branch acceptance. Human review is still required, and main-branch acceptance remains required before broadening support claims.

## Artifacts

- Report: `creator-workflow-host-smoke-result.json`

## Reproduction Command

```bash
npm run smoke:creator-workflow-host -- --source-user-data-dir "[redacted-local-user-data]" --reference-image "[redacted-local-reference]/正面.png" --scenario both
node scripts/create-creator-workflow-host-smoke-archive.js --session-dir release/creator-workflow-host-smoke/2026-07-05T08-22-31-889Z --archive-dir docs/release-evidence/creator-workflow-host-smoke/2026-07-05T08-22-31-889Z-golden-cartoon-cat-dev8
```
