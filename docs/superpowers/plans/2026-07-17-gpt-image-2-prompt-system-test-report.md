# GPT Image 2 Prompt System Independent Test Report

## Result

- Date: 2026-07-17
- Test worktree: `/Users/mango/.codex/worktrees/dev8-gpt-image-2-prompt-test/OpenPet`
- Test branch: `codex/dev8-gpt-image-2-prompt-test`
- Final production checkpoint tested: `631e89bd` (`fix: remove token identifiers from image prompts`)
- Implementation ancestor: `33504539` (`feat: align image prompts with gpt image 2`)
- Hardening ancestors: `51ebbf22`, `7da1d0cc`, and `efa8bf86`
- Final verdict: **implemented but unverified**

All required automated verification passes. Real Provider generation, image inspection, background-removal artifact inspection, visual-agent review, and human approval were not run in this task, so this report does not grant Provider approval or `production-art-ready` status.

## Isolation And Integration

The test branch was created in a new independent worktree from handoff commit `1787dd8b`. Production updates were integrated only by cherry-picking direct production descendants. No production branch, protected main worktree, or other worktree was modified, switched, reset, rebased, pushed, or merged.

| Production commit | Test integration commit | Stable patch ID |
| --- | --- | --- |
| `33504539` | already present as ancestor | `f2ef1bcea0c48b3ec01d82308c4c5490aba72128` |
| `51ebbf22` | `504ea77e` | `25eb54537e9d23c55ba7e09833ea448c8630be2f` |
| `7da1d0cc` | `11db2a88` | `b9031df07bc301a67a0a1de1a37b9a7bff2b91d9` |
| `efa8bf86` | `b903feaf` | `bd017d874884fc794f14c23866dfcfdff3eb379b` |
| `631e89bd` | `6f0d71c8` | `978d9ca544e33002a0f342ac31e3e149c593b7a6` |
| `f5d1bae2` handoff | `60c42100` | `fb99fca629d221640d83b2c60fd35d8fe253fd98` |

## Test Changes

The independent test branch changed only tests, test-only fixtures, and this report:

- `tests/examples/creator-studio-provider-image-prompt-system.test.js`
- `tests/examples/creator-studio-pet-generation-human-examples.test.js`
- `tests/examples/creator-studio-anchor-prompt-builder.test.js`
- `tests/examples/creator-studio-plugin.test.js`
- `tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js`
- `tests/examples/creator-studio-dashboard-browser.test.js`
- `tests/services/image-generation-model-service.test.js`
- `docs/superpowers/plans/2026-07-17-gpt-image-2-prompt-system-test-report.md`

Coverage added or refreshed:

- VisualPlan product-language filtering and preservation of explicit visible changes;
- model capability profiles for `gpt-image-2`, `gpt-image-1`, `gpt-image-1.5`, generic eligible models, and empty-model failure;
- ProviderImageTask v3 complete action semantics, contiguous frame numbers, exact cell geometry, sparse and duplicate rejection, and unknown-field rejection;
- standard GPT Image 2 section order for character, keyframe, frame-sheet, and repair prompts;
- opaque cutout background instructions for `gpt-image-2` and direct transparency for eligible generic models;
- non-idle pose authority, idle canonical-pose preservation, anatomy-neutral wording, and internal/secret/path/URL filtering;
- exact frame-beat coverage for every generated official action and configured frame count;
- direction, root, secondary motion, forbidden motion, loop closure, and no frame-range placeholders;
- quality-guidance scope for direction, baseline, static motion, identity, edge, background, scale, and action-specific reasons;
- smallest-delta repair with exactly one correction and separate preservation instructions;
- Host request evidence and transport contract: one reference, multipart `image`, one requested output, v3/v3 provenance, renderer, capability profile, background strategy, frame-beat count, and clause IDs;
- `/images/edits`, `n=1`, omitted GPT Image 2 API background field, and an opaque-cutout prompt.

## Production Findings Closed During Testing

Independent testing found three production defects. Each was fixed on the production branch, integrated by equivalent cherry-pick, and verified by a fresh regression:

1. Identity-comparison reference wording rendered as `Its the ...`. `7da1d0cc` replaced it with explicit region subjects. Regression proves the prompt begins with `The main ... controls ...` and contains no `Its the` wording.
2. A character-image prompt using an identity-comparison board incorrectly referred to a nonexistent `ACTION PLAN or FRAME PLAN` and told the model not to preserve the neutral pose. `efa8bf86` gives character images coherent calm identity-pose authority while keeping action pose authority for non-idle actions.
3. A standalone token-like identifier such as `bridge-token` survived creative-brief sanitization and reached the final Provider prompt. `631e89bd` added directive sanitization and final compiler defense. The secret-bearing prompt regression now passes.

No production finding remains open from the automated scope.

## Test-Only Baseline Drift

Two initial `test:core` failures were test-only fixture drift, not runtime defects. The dashboard mock parser recognized only the old sprite-sheet wording, so it generated default 4x3/12-frame images for new prompts that explicitly requested other layouts. The parser now recognizes:

```text
Create one ... animation frame sheet with exactly N ... arranged in C columns and R rows
```

The two retry tests then passed independently and in the fresh full core suite.

The first syntax attempt also failed before TypeScript execution because the new worktree had no local `node_modules` type-resolution directory. A git-ignored dependency link directory was created from the existing workspace dependencies. The unchanged syntax command then passed. This was an isolated test-environment setup issue.

## Automated Verification

| Command | Exit | Result |
| --- | ---: | --- |
| `npm run check:syntax` | 0 | Node syntax, TypeScript, system cursor build, and Control Center build passed |
| `node --test tests/examples/creator-studio-provider-image-prompt-system.test.js` | 0 | 12 passed, 0 failed |
| `node --test tests/examples/creator-studio-anchor-prompt-builder.test.js tests/examples/creator-studio-plugin.test.js` | 0 | 98 passed, 0 failed |
| `node --test tests/examples/creator-studio-host-model-bridge.test.js tests/examples/creator-studio-host-model-bridge-anchor-generation.test.js` | 0 | 35 passed, 0 failed |
| `node --test tests/examples/creator-studio-pet-generation-human-examples.test.js` | 0 | 5 passed, 0 failed |
| `node --test tests/services/image-generation-model-service.test.js` | 0 | 45 passed, 0 failed |
| Focused total | 0 | 195 passed, 0 failed |
| `npm run test:core` | 0 | 1541 tests: 1540 passed, 0 failed, 1 skipped |
| `npm run test:control-center` | 0 | 71 passed, 0 failed |
| `npm run test:core:all` | 0 | Core 1540 passed, 0 failed, 1 skipped; Control Center 71 passed |

## Real Provider And Visual Verification

Not run.

This task did not invoke a real `openai-compatible` Provider, generate or load images, run local background removal on Provider output, inspect contact sheets/GIFs/atlas evidence, or ask a visual agent to evaluate image quality. No Provider credentials were used or reported.

The following remain independently unverified:

- canonical character visual identity;
- running-right start and peak keyframes;
- complete running-right and stationary frame sheets;
- action repair after observable QA rejection;
- opaque-background removal and transparent artifact QA;
- identity preservation, action readability, direction, frame progression, copied-board leakage, invented anatomy, edge halos, and repair locality;
- explicit human approval.

## Final Verdict

The GPT Image 2 prompt system passes its automated contract and repository regression gates on the independent test branch. Because the required real Provider and visual evidence were not produced, the legally accurate final status is:

**implemented but unverified**

Do not claim Provider approval or `production-art-ready` from this report.
