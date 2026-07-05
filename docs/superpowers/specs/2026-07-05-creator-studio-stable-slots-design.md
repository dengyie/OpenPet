# Creator Studio Stable Slots Design

**Date:** 2026-07-05
**Owner:** dev8
**Status:** approved for option A implementation

## Goal

Add a deterministic offline correction pass for already-extracted official full-pet row frames so extraction-induced jitter, baseline jumps, and size popping can be reduced before atlas composition.

## Context

OpenPet's official-quality pet path follows the Codex/hatch-pet atlas contract: `1536x1872`, 8 columns, 9 rows, `192x208` cells, transparent unused cells, and row-specific actions. The current row package path can extract row strips, validate row frames, and compose a complete atlas, but it does not yet provide a stable-slots correction pass for row frames that contain real pose variation but were cropped or placed inconsistently.

The official hatch-pet reference treats `stable-slots` as an extraction repair tool: it preserves row-level playback stability after visual inspection. It is not a way to create action motion from one image.

## Scope

This slice implements only the local deterministic correction pass.

In scope:

- Accept row frame files for one known official action.
- Validate source and output paths stay inside Creator Studio `dataDir` when provided.
- Measure visible alpha bounds for every frame.
- Build a shared transparent slot from the maximum observed sprite width and height plus small padding.
- Recenter each sprite horizontally in that shared slot.
- Align each sprite to a shared bottom baseline.
- Fit the shared slot into the fixed `192x208` Codex cell without enlarging beyond cell-safe bounds.
- Write corrected PNG frames and a metadata JSON file.
- Preserve frame order and frame count.
- Keep QA responsible for rejecting static, transform-like, empty, or semantically wrong rows.

Out of scope:

- Calling image providers.
- Generating row strips.
- Inferring missing action frames from a base image.
- Contact sheet or GIF rendering.
- UI controls.
- Promoting a row to official quality without row QA and human visual review.

## API

Create `examples/plugins/creator-studio/lib/full-pet-row-stable-slots.js` with:

```js
async function stabilizeRowFrames({
  frames,
  actionId,
  outputDir,
  dataDir = '',
  padding = 4
})
```

Return:

```js
{
  actionId: 'waving',
  frames: [
    { index: 0, actionId: 'waving', path: '/abs/.../01.png', sourcePath: '/abs/.../01.png' }
  ],
  stabilization: {
    method: 'stable-slots',
    frameWidth: 192,
    frameHeight: 208,
    frameCount: 4,
    slotWidth: 68,
    slotHeight: 92,
    baseline: 154,
    padding: 4,
    inputs: [
      { index: 0, bbox: { left: 60, top: 70, right: 118, bottom: 154, width: 59, height: 85 } }
    ]
  }
}
```

## Algorithm

1. Resolve `actionId` through `getOfficialFullPetRow`; unknown action ids throw.
2. Normalize `frames` to the expected official row frame count and reject mismatches before writing outputs.
3. Resolve every source frame path inside `dataDir` when `dataDir` is provided, including symlink-realpath checks.
4. Resolve `outputDir` inside `dataDir` when `dataDir` is provided.
5. Decode each source frame with `sharp().ensureAlpha()` and compute visible alpha bbox.
6. Reject empty frames; stable-slots cannot repair missing art.
7. Compute:
   - `slotWidth = min(192, max(frame bbox width) + padding * 2)`
   - `slotHeight = min(208, max(frame bbox height) + padding * 2)`
   - `baseline = min(208 - padding - 1, max(frame bbox bottom))`
8. For every frame:
   - crop the visible bbox;
   - resize down only if the crop cannot fit inside the shared slot;
   - composite into a transparent shared slot centered on x and bottom-aligned to `slotHeight - padding - 1`;
   - composite the shared slot into a transparent `192x208` cell centered on x and placed so its bottom aligns with the shared target baseline;
   - write `01.png`, `02.png`, etc.
9. Write `stable-slots-metadata.json` next to the corrected frames.

The helper deliberately does not inspect row semantics. It only normalizes extraction geometry. Existing QA remains the acceptance gate.

## Error Handling

- Unknown official row: `Unknown official full-pet row`.
- Source path escape: `Official row frame path escaped the Creator Studio data directory`.
- Output path escape: `Official row stable-slots output path escaped the Creator Studio data directory`.
- Frame count mismatch: `Official row stable-slots frame count mismatch`.
- Empty frame: `Official row stable-slots cannot stabilize empty frames`.
- Decode failures bubble from `sharp` as implementation errors; tests cover empty/escape/count behavior.

## Testing

Add `tests/examples/creator-studio-full-pet-row-stable-slots.test.js`.

Required coverage:

- A jittered but genuinely varied row fails or exceeds QA drift before correction, then passes QA after stable-slots.
- A repeated static row remains rejected after correction.
- A transform-like translated row remains rejected after correction.
- Source paths outside `dataDir` are rejected.
- Output paths outside `dataDir` are rejected.
- Frame count mismatches are rejected.

## Acceptance

The slice is complete when:

- The new stable-slots tests pass.
- Existing row extractor, row QA, and real atlas builder tests still pass.
- `npm run check:syntax` passes.
- The implementation is committed on `codex/dev8`.
