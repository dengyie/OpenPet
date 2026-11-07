# Creator locomotion and exhausted-evaluator admission

## Current production and formal run

- Runtime: Guangzhou main `224bf7c5c182a6b5e330b520924d0ad99d9d4f17` (PR #127); main CI `42370737230` succeeded. Rollback `/var/backups/openpet/20261107T120749Z-224bf7c5` is retained; archive SHA-256 `8c39b0814fa325e01b84baa600b04630286cdd8e31450a65f25093235bf087a7`.
- Fresh SSH health: service active, `ready/resident`; root approximately 2.3 GiB available before activation. Backend stays loopback, Nginx stays EasyTier-only. All nine deployed source hashes match the main archive. Run, ledger, checkpoints and scale-profile hashes stayed identical across deployment.
- Formal run `2026-11-05-pip`: accepted idle and waving Provider rows plus jumping audited rig (3/9). Running-right, running-left, failed, waiting, running and review remain missing. A passing partial package is not nine-action acceptance.
- Formal failed-action retry `creator.workflow:fac2f21c-80ab-4ef4-81b8-518e464772b9` stopped on `Hatch-pet evaluator call budget is exhausted`. Cumulative usage is Provider92/144, Planner1/34 and Evaluator68/68; reservations empty, windowVersion17/renewalCount16. No usage was reset.
- The additional snapshot `/var/backups/openpet/20261026T081907Z-1678945` was explicitly approved but already absent when checked. No deletion or substitute deletion was performed.

## Reproduced defects and minimal fixes

1. Periodic right locomotion included the closing pose and lost the final unique phase. The actual latest source has 25 frames at24fps, duration1.041667s. Inclusive samples `[0,3,7,10,14,17,21,24]` become `[0,3,6,9,12,15,18,21]`. Settling actions retain inclusive endpoints. Decoder rejects insufficient distinct phases before ffmpeg.
2. A global processor version could reuse old right candidates or invalidate unrelated accepted rows. Right and its left mirror use video processing version13; other video actions and the idle scale profile stay12, image pipeline stays4. Checkpoint lookup/persistence, candidates, result views and retained human selection use the same action version.
3. Exhausted evaluation capacity was checked only after paid generation. Provider admission now refuses when evaluator capacity is already exhausted, before persisting a reservation or starting the operation. Historical counts and ledger bytes stay unchanged. This is a capacity preflight, not a promise that concurrent callers cannot consume remaining capacity.
4. Action runner swallowed typed budget errors as ordinary generation/evaluation failures and could dispatch repairs. It now propagates the original error immediately, saves already generated assets and any processed QA evidence, and does not invent a scored evaluation or dispatch replacement/repair. Canonical generation and start-frame preparation also propagate typed budget errors rather than translating them into unusable identity/pose quality.
5. The running support-strip rig moved both feet together from a front-facing canonical. Formal readability8 and isolated paired-leg readability42 disproved its locomotion quality. Removed right-rig generation/obsolete gait transforms; the accepted jumping implementation and exact provenance remain supported.

## Isolated real visual evidence (not formal candidates)

| Probe root under `/var/lib/openpet/` | Provider / evaluator calls | Readability / crossFrame / overall | Result |
| --- | --- | --- | --- |
| `pip-side-paired-rig-evidence-v2` | 0 / 1 | 42 / 83 / 79 | Rejected; not integrated |
| `pip-periodic-video-evidence-v1` | 0 / 1 | 79 / 81 / 84 | Rejected; sampling alone does not fix articulated poses |
| `pip-locked-upper-video-evidence-v1` | 0 / 1 | 59 / 62 / 72 | Rejected; disconnected limbs; not integrated |

Periodic board SHA `6c5c32284a2e60bf1dd7ca7bdc22480315b7a95ef3bd8f99f4fe567d46734f7c`; locked-upper board SHA `bb1e0ee82793f789f6bc65d60eb2f4ffc91dd2a53592f65d46d0f3c70745f245`. Same boards were not rescored to fish for a pass. Source video SHA `31c5ffd30350deea6990e75b73f6d36e1f4a941d61b3ff133f56e4e6002555b3` is retained in the formal right candidate archive. Original video still blinks, drifts in body geometry and has ambiguous leg articulation. These defects remain unresolved.

## Verification and remaining work

- Fresh canonical/start-frame budget regressions reproduced the incorrect quality conversion, then passed with the fix; related host/anchor/runner suite65/65.
- Action-scoped binding regression first failed on absent resolver/stale manual selection and then passed. Fresh host/backend-runner suite66/66.
- Focused service/ledger/Backend/runner/video/rig suite213 passed, one local ffmpeg-dependent skip. Final-source VPS core2394/1skip, Control Center81 and Backend467 passed. PR and branch CI passed: full Node3571/2skips, core2393/2skips and Control Center81; macOS/Windows builds passed. Main CI42370737230 passed after merge.
- Fresh local tooling694/694 and Creator live-doc tests16/16 pass. The first full Node run on a reused Git-less VPS directory had13 harness/history errors and one stale pre-PR125 doc test; it is not a full pass. Recreated the final VPS source from current HEAD plus the reviewed delta, fixed the test-only preload to resolve its dependency from a fixed root, and scheduled core/UI plus Backend again. GitHub CI must run the complete Node suite in a full checkout.
- No Electron, browser or desktop acceptance was run on the work Mac. VPS uses existing codecs and cached browser, with no model/software download.
- Deployed budget smoke passed with the real exhausted formal ledger: `hatch_pet_evaluator_call_budget_exhausted`, zero paid operations, ledger and checkpoints byte-identical. This is admission verification, not a successful Creator run. A raw checkpoint for `failed` exists but is not reflected as accepted in the formal run; the formal public count remains3/9 until validated recovery completes.
- User authorized32 additional evaluations, cap68→100, with Provider cap144 and all history preserved. Applying it exposed HTTP400 because API/bridge omitted the field and service normalization capped it at68. Regressions reproduced both failures. The follow-up enables integer evaluator totals1–200 (default68), shared types, request validation, demo behavior and a Control Center input; saving only editable budget fields avoids sending the host's internal planner limit. Route/service/bridge/facade/normalization tests92 pass; VPS UI save/reload regression passes. This follow-up still requires CI/merge/deployment before applying the authorized top-up.
- Nine formal actions, final atlas QA and final visual gate remain open. No threshold reduction, override or probe promotion is permitted.
