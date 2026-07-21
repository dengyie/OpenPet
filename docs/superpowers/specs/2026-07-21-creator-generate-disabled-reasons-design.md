# Create Generate Disabled Reasons Design

## Problem

The Create pane disables its Generate Character and Generate Action buttons until every required input and runtime dependency is ready. The disabled buttons currently expose no explanation, so users can mistake the optional Creator Studio Service notice for a generation blocker.

## Goal

Keep all existing generation gates fail-closed while making every unmet gate visible next to the affected action. The feedback must update as the user edits the form and must be available to assistive technology.

## Scope

- New Character: explain missing Provider readiness, Creator Studio plugin availability, character name, reference image, and an active generation.
- Existing Character: explain missing Provider readiness, Creator Studio plugin availability, action name, motion prompt, usable reference image, and an active generation.
- Show a concise ready message when no blocker remains.
- Associate the feedback with the corresponding Generate button through `aria-describedby` and announce changes through an `aria-live` status region.

The Creator Studio Service runtime remains optional for generation and must not appear as a blocker when the plugin itself is available.

## Design

`useCreatorPane` remains the owner of readiness because it already owns the provider state, plugin state, form drafts, and in-flight state. It will derive ordered blocker arrays for both creation modes. The existing `canGenerateNewCharacter` and `canGenerateExistingAction` booleans will be derived from those arrays being empty rather than repeating parallel boolean expressions.

`CreatorPane` will receive both blocker arrays. The active form will render one persistent readiness note beneath its Generate button:

- With blockers: `还需完成：<blocker list>` using an error/warning presentation.
- Without blockers: a concise ready message.
- While generation is active: the message states that generation is in progress and duplicate submission is unavailable.

The Generate button remains natively disabled while blocked. Its `aria-describedby` points to the readiness note, and the note uses `role="status"` with `aria-live="polite"`.

## Data And Error Handling

The blocker arrays are renderer-only derived state. They do not cross IPC, are not persisted, and do not change backend validation. Provider and plugin failure messages already rendered elsewhere remain authoritative; the button-level feedback names the unmet category without exposing configuration details or secrets.

Blockers are ordered by remediation flow: runtime prerequisites first, then required form inputs, then active execution. This makes the message stable and actionable when several conditions are missing.

## Testing

Regression tests will verify:

1. New Character reports missing Provider, plugin, name, and reference image instead of silently disabling the button.
2. Existing Character reports missing action name, motion prompt, and usable reference image.
3. The optional Creator Studio Service stopped state is not included as a generation blocker.
4. Ready forms expose no blockers and enable their Generate button.
5. The UI binds visible feedback to each button with `aria-describedby` and an `aria-live` status region.

Focused Control Center tests and the repository syntax/type check will be run after implementation. No Provider calls or image generation are required for this renderer feedback change.

## Out Of Scope

- Changing generation eligibility rules.
- Starting Creator Studio Service during ordinary generation.
- Persisting unfinished form drafts.
- Changing Provider health checks or backend workflow behavior.
