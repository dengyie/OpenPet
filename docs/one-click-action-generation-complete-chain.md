# One-Click Action Generation Complete Chain

> Date: 2026-07-04
> Owner: dev8
> Status: implemented in `codex/dev8`
> Scope: complete the ordinary-user one-click generation chain while preserving advanced Creator Studio and Actions workflows

## Goal

Make OpenPet creation feel like one primary path:

```text
reference image -> generate -> import -> immediately verify in OpenPet
```

The ordinary path must support:

- one-click generation of a custom action for the current editable pet
- one-click creation of a new pet with a usable base action set
- automatic import and activation/binding after technical QA succeeds
- advanced inspection, repair, manual import, and trigger editing through Creator Studio and Actions

## Confirmed Decisions

- Default generation is automatic: draft, confirm, generate, approve, import, then verify.
- Failed QA or import falls back to Creator Studio details instead of blocking the happy path up front.
- Existing-action generation automatically replaces `clickAction`.
- The previous `clickAction` must be visible and recoverable from the Create result surface.
- New-pet generation should prefer real basic actions where available, while allowing honest fallback rows.
- Minimum useful new-pet gate: `idle` and `waving` are the required real basic actions; other rows may fall back in the first implementation.
- The first implementation stays inside the existing Creator Studio, ActionService, and PetPackService architecture.
- No new pet/action package format is introduced.
- The Create tab stays simple; advanced customization remains in Creator Studio and Actions.

## Architecture

### Existing-Action Chain

```text
Create tab
  -> CreatorWorkflowService.generateExistingAction()
  -> Creator Studio command flow
  -> action-frame-builder QA
  -> import-approved-action bridge
  -> ActionImportService.importActionFrames()
  -> ActionService trigger proposal acceptance
  -> clickAction update
  -> Create result shows previous/current clickAction
```

### New-Pet Chain

```text
Create tab
  -> CreatorWorkflowService.generateNewCharacter()
  -> Creator Studio command flow
  -> provider image generation
  -> real-atlas-builder
  -> pet.json + spritesheet.webp
  -> PetPackService import and activation
  -> Create result shows active pet and basic action coverage
```

### Advanced Layer

Advanced workflows remain available:

- Creator Studio dashboard for run details, QA artifacts, retry, frame repair, and manual handoff.
- Actions pane for manual frame folder import, trigger proposal inbox review, trigger rules, and pet pack management.
- Plugin command bridge for explicit creator tools with permission-gated access.

## Data Contract Changes

### `CreatorWorkflowResult.clickActionChange`

Returned for existing-action generation when `clickAction` changes:

```json
{
  "previousActionId": "eat_no_bg",
  "currentActionId": "shy-spin",
  "importedActionId": "shy-spin",
  "canRestore": true
}
```

This is renderer-safe and does not expose filesystem paths or provider secrets.

### `CreatorWorkflowResult.basicActions`

Returned for new-pet generation when atlas QA reports action row coverage:

```json
{
  "requiredRealActionIds": ["idle", "waving"],
  "realActionIds": ["idle"],
  "fallbackActionIds": ["waving", "waiting"],
  "missingRequiredActionIds": ["waving"],
  "rows": [
    {
      "actionId": "idle",
      "sourceActionId": "idle",
      "sourceRelativePath": "runs/run-1/frames/base/0001.png",
      "fallback": false
    }
  ]
}
```

## Implementation Record

- `src/shared/openpet-contracts.ts`
  - Added renderer-safe `clickActionChange` and `basicActions` workflow result contracts.
- `src/main/services/creator-workflow-service.js`
  - Existing-action generation captures the previous `clickAction`, accepts the generated trigger proposal, and returns a reversible change summary.
  - New-pet generation reads `runs/<runId>/qa/atlas-validation.json` and returns basic action coverage to the Create result surface.
- `examples/plugins/creator-studio/lib/host-model-bridge.js`
  - Full-pet provider runs now attempt only the required extra action-specific source image: `waving`.
  - `idle` remains the validated base source, while optional rows continue to fall back from the base pose unless a usable action-specific image is already present in the generation outputs.
  - Basic action source generation runs with a bounded per-action timeout, so the required extra pose can fail honestly without expanding the whole full-pet generation budget.
  - Action pose prompts reuse the existing sanitized prompt rules before reaching the host image model bridge.
  - Missing per-action outputs are recorded as failed attempts and left for atlas fallback instead of failing the whole pet generation.
- `examples/plugins/creator-studio/lib/real-atlas-builder.js`
  - Atlas rows can use action-specific generated outputs by `actionId`, `rowId`, or `action`.
  - Action-specific outputs must decode with visible pixels before they can count as real rows; invalid transparent rows fall back to the base source and are reported in QA.
  - `idle` and `waving` are marked as required real basic actions.
  - `atlas-validation.json` records real, fallback, and missing required coverage without absolute paths.
- `examples/plugins/creator-studio/lib/full-pet-qa.js`
  - When `atlas-validation.json` includes required basic action coverage, approval/import rejects missing required real actions instead of silently importing misleading QA.
- `src/control-center/src/hooks/useCreatorPane.ts`
  - Create can restore the previous `clickAction` after an existing-action generation.
- `src/control-center/src/panes/CreatorPane.tsx`
  - Create result cards show previous/current click action and basic action coverage.
- `src/control-center/src/api/demo-control-center-api.ts`
  - Demo workflow results now include the new optional result fields.
- `tests/services/creator-workflow-service.test.js`
  - Covers click action replacement and basic action coverage return.
- `tests/examples/creator-studio-real-atlas-builder.test.js`
  - Covers fallback metadata and action-specific atlas row source selection.
- `tests/examples/creator-studio-host-model-bridge.test.js`
  - Covers sanitization of full-pet action pose prompts.

## Validation

Run the focused spine:

```sh
node --test tests/services/creator-workflow-service.test.js \
  tests/examples/creator-studio-real-atlas-builder.test.js \
  tests/examples/creator-studio-plugin.test.js \
  tests/services/image-generation-model-service.test.js
```

If local dependencies such as `sharp` are missing, run the subset that can execute and record the dependency blocker.

Current local validation notes:

- `node --test tests/services/creator-workflow-service.test.js tests/examples/creator-studio-host-model-bridge.test.js tests/examples/creator-studio-real-atlas-builder.test.js` passed.
- `node --test tests/examples/creator-studio-plugin.test.js` passed.
- `node --test tests/control-center/demo-control-center-api.test.js` passed.
- `npm run typecheck` passed.
- `npm run check:syntax` passed, including Control Center production build.

## Risks

- Provider outputs may not include action-specific metadata yet. The builder treats optional rows as fallback, while required coverage is surfaced through QA for review/import gating.
- Provider-backed full-pet generation is still sensitive to gateway/model stability. The current implementation intentionally minimizes action-specific follow-up generation so base generation remains the critical path.
- Auto-replacing `clickAction` is intentionally opinionated. The Create result must make the replacement explicit and reversible.

## Current Stable Path

- The current stable shortest path is one clean front-facing reference image.
- On the active dev8 branch, the verified real-user chain is:
  - one-click new pet generation from `正面.png`
  - one-click existing-pet action generation from `正面.png`
- Multi-view collage inputs such as `全面.png` are not the preferred path for the current provider/gateway setup.

## Non-Goals

- New atlas dimensions or row semantics.
- Rich prompt matrix editing inside the Create tab.
- Versioned action history or complete asset gallery.
- Custom actions for arbitrary installed Codex pet packs beyond the current editable action host.
