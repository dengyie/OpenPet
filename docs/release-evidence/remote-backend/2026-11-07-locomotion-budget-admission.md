# Creator locomotion and exhausted-evaluator admission

## Current production and formal run

- Runtime: Guangzhou main `cf9a0b35ed0f6e1be41056fc14ce83e5cede85e9` (PR #129); main CI `42375000156` succeeded. Rollback `/var/backups/openpet/20261107T130824Z-cf9a0b35` is retained; archive SHA-256 `7beb9c902285c1f585602b34eb956cba7363f64ac18918b5a04a0481d517c549`.
- Fresh SSH health: ready/resident; root approximately 1.7 GiB available. Backend stays loopback, Nginx stays EasyTier-only. Nine deployed source hashes match main. Run, ledger, checkpoints and scale-profile hashes stayed identical across deployment before the authorized configuration change.
- Formal run `2026-11-05-pip`: idle/waving/jumping/failed accepted (5/9). Recovery Job `creator.workflow:42ee00fa-5b0a-496f-9131-a38fa5558875` succeeded: the validated failed-action checkpoint was reused without another Provider call. Right/left, running and review remain missing. A partial package is not nine-action acceptance.
- Authorized evaluator cap100 is applied. After failed recovery, cumulative usage is Provider92/144, Planner1/34 and Evaluator69/100; no history was reset. Subsequent recovery outcomes and cumulative totals are recorded below.
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
- Deployed budget smoke passed with the real exhausted formal ledger: `hatch_pet_evaluator_call_budget_exhausted`, zero paid operations, ledger and checkpoints byte-identical. This is admission verification, not a successful Creator run. This earlier exhausted-ledger smoke preceded the successful validated failed-action recovery described above.
- User authorized32 additional evaluations, cap68→100, with Provider cap144 and all history preserved. Applying it exposed HTTP400 because API/bridge omitted the field and service normalization capped it at68. Regressions reproduced both failures. The follow-up enables integer evaluator totals1–200 (default68), shared types, request validation, demo behavior and a Control Center input; saving only editable budget fields avoids sending the host's internal planner limit. Route/service/bridge/facade/normalization tests92 pass; VPS UI save/reload regression passes. PR #128 merged as a4effcd9, main CI42372997548 succeeded, and the follow-up is deployed in cf9a0b35.
- Nine formal actions, final atlas QA and final visual gate remain open. No threshold reduction, override or probe promotion is permitted.

## Durable action state before package evaluation

- Production retained a successful `failed` checkpoint while the public run still marked that action omitted. Package evaluation had exhausted its budget after the action checkpoint was saved, before the new action results were written to the run.
- Red regressions for a normal action and a right/left pair reproduced the mismatch. Action repair now publishes the accepted action results, current omitted list and scale hash before mirroring/package finalization, and removes stale package metadata/links. The previous left result is invalidated before deriving it from a replacement right source. A later exception keeps durable accepted results and the original typed error. It does not claim the package passed.
- Retry also preserves an unreported passing checkpoint for the host to revalidate all bindings/frame hashes/provenance before reuse; stale checkpoints still generate normally. Red→green regression confirms the checkpoint is not discarded before validation. Host/backend/action-runner suite88/88 passed. PR #129 merged as cf9a0b35, main CI42375000156 succeeded (Node3578/2skip, core2399/2skip, UI82; macOS/Windows builds passed). It is deployed and validated checkpoint recovery succeeded online.

## Partial budget PATCH reset (reproduced and repaired)

- Applying only `maxEvaluatorCalls:100` exposed a second configuration defect: the real Backend Provider shallow-merged Hatch configuration, replacing the complete nested budgets object. Normalization restored omitted limits to defaults, including Provider144→72; historical ledger usage was preserved.
- A real-domain regression through `createAiDomain`, Provider and the settings mutation authority reproduced all omitted limits being reset. The minimal fix merges stored/submitted budget fields before normalization, including explicit cost-null handling. The fake route fixture had already deep-merged budgets and therefore did not expose this production defect.
- Before restoring configuration, SQLite was consistently backed up with integrity_check=ok at `/var/backups/openpet/pip-budget-before-restore144-20261107.db`. A complete editable-budget PATCH restored Provider144 and retained Evaluator100. Ledger bytes were identical across the restore; usage stayed92/1/69. Host-only maxPlannerCalls is excluded from the API payload.
- Fresh Provider/domain/route/contracts regressions101/101 passed. The code fix still requires CI, merge and deployment; configuration restoration alone is not proof that partial PATCH is repaired in production.

## Concrete work and review gestures

- Waiting recovery `creator.workflow:f55201a9-42d7-4004-94ca-4029d5b12841` succeeded. Its second real video candidate scored90 and passed the original action gate. Formal accepted coverage is5/9: idle/waving/jumping/failed/waiting. Its partial-package evaluation scored identity98/distinctness81/crossAction95/smallScale89/style97/overall90 and correctly failed actionDistinctness; this is not final acceptance.
- Work-state retry `creator.workflow:eef57c4e-19d9-4b95-821a-b452612f5ac4` and review retry `creator.workflow:d0c5bc99-487b-481f-a01a-49dd04a69152` completed with quality omissions. Work candidates scored79/79/84; review86/88/87/84. Original boards show flapping/stepping for work and turning/opening the beak for review. Historical totals101 Provider,1 planner,81 evaluator; caps144/100 unchanged,19 evaluations remain.
- Root cause: the video prompt emitted internal state id `performing running`, although this id means task-processing rather than locomotion. Both work/review had generic phase names without concrete action guidance. A red prompt regression reproduces the misleading label and absent gesture constraints.
- Use focused-work wording and two compact chest-adjacent working beats; inspection uses an existing appendage toward the chin, a small head tilt and acknowledgement nod. Feet stay fixed; the original viewpoint/face constraints prohibit stepping, flapping or speaking. No new anatomy or props are requested. The original quality gates remain mandatory.
- Only video work/review processor bindings advance to14. Right/left remain13, all other video rows and the idle scale profile remain12. Red→green checkpoint regression verifies stale work/review refusal and accepted idle/wave/jump/failed/waiting reuse. Focused host/backend/video tests126/126 and syntax/typecheck/build pass; real verification still requires deployment.
- PR130 is merged as main `dfc967661cf5f4b04bf9e5c4cdd86525aaa74502`, main CI42377269980 success; its budget fix will deploy with this follow-up to avoid an unnecessary second switch. Runtime remainscf9a0b35 until activation.
