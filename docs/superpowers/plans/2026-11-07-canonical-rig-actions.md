# Canonical Rig Actions Implementation Plan

### 2026-11-10 held-task recovery and accounting (latest verified state)

- Production remains PR143/main `61cba11a66a4e8390592618b39a0aa845a67152f`; archive SHA256 `3826fd963d72a3876bb160a22eea16f8e465bef14a751feea5b80a212d25b55f`, rollback `/var/backups/openpet/20261109T000609Z-2537955`. Current development is uncommitted on `codex/running-rig-readability` in the final-acceptance worktree. No probe has been promoted into formal checkpoints.
- Formal run `2026-11-05-pip` currently has **7/9 accepted checkpoints**: idle/waving/failed/waiting row-real, jumping/right gait approved-rig, left gait approved-mirror. Work v16 and review v17 are rejected. Current partial atlas SHA256 `796ebd46c2c12ce47d9a41fe5df76854e8283a8daaf9fb8aaa25db894e0cec32`; bundle `fc12fc7e89bac12b88ce0ca01b332f3a537a59565afc342e9de867519622c3c0`. Final board `721094418a453743dcf4d072c6e19a9a85808130d42e63a4ba4edc7d452e0e78` fails actionDistinctness83 (<85); it does not establish nine-action acceptance.
- The user's continuing authorization includes necessary budgets and cleanup. Persisted caps are Provider200/Planner34/Evaluator200. Verified ledger snapshot: Provider148, Planner1, Evaluator147, providerFailures33, no reservations. A stale elapsed window was renewed through the existing service to window34; cumulative usage was preserved and the prior ledger snapshot retained. `estimatedCost=0` is the service's recorded value, not verified billing. A missing-constraints image admission failed before Provider dispatch but is counted by the existing Provider wrapper; its failed attempt is retained. No repeated approval is needed for this scope.
- Resting-pose work rig failed readability48. The engaged bare-wing chest rig (`work-chest-v18`, board `3720f177b4bbf70e46eabd682e7b10d6434434757a6730aee3c5b1d737747513`) passed technical checks but failed Vision identity96/readability50/smallScale70/overall62. Do not rescore these boards or claim pixel motion proves action meaning.
- New held-task pose `held-task-pose-v19b` uses a connected cream tablet, identical head/face/feet and existing wings. Prepared pose SHA256 `8feaa041d89f477c081a33b2958f27bc13d743cb281ca23ee70c85e98c120e5e`; existing keyframe technical gate score93.93 passes. `held-review-v19`, board `71bda334d54c01d031b30c881f63fc73413e060f30a82450f4fffc7ffe8c12c1`, passes its single real Vision evaluation: identity95/readability87/crossFrame94/crossAction92/smallScale89/style94/overall92, no defects. This is isolated evidence, not formal acceptance.
- Work-only display animation `held-running-display-v20`, board `4ddfb6e76252d7cd21f818ecd6f442076f53593bcc53e0bceca1e6d8813d75f6`, fails readability60/overall83. Bending the whole chest field visibly distorts the rigid tablet; those diagnostic variants were not submitted. `held-work-video-v21` was generated once (task `task_pnf37TXz8S1XThRN5jek4aYITpgRsRrO`, video SHA256 `8c86e3d4ae3da18d553ea329fa2ce5f2711d29cd3bbe85130bdea0d8805a84e0`), technical QA passes. Its board is `728a6d079e9b2c7ac9b11bf083fc1ebcba97890646b899649212d9840cfe28d5`; real evaluation is pending at this accounting checkpoint. A previous evaluation command never dispatched because the isolated `/tmp/openpet-readable-validation` directory disappeared; the evaluation now uses the unchanged production evaluator module. Preserve that distinction from a paid retry.
- Fresh regressions reproduced false static rejections for internal visible work with an unchanged alpha silhouette. Row QA now considers spatial visible-color boundaries, retaining rejection of uniform recolor and isolated pixel noise. Temporal QA retains alpha/root/dropout/contamination checks and also counts visible internal boundaries. Work rigs consume and retain a separate hash-verified pose, including export/restore/tamper checks. Current unit/host/codec baseline before the newest temporal additions: **134/134 on VPS, zero skips**. New focused temporal/recolor/internal-noise checks:10/10 locally. Final full regression must be rerun after the remaining design changes.
- Next: finish the pending work-video evaluation; implement the proven held-task pose in the real prompt/host path (both work and review), keep tablet rigid and animate a clear task gesture, then run formal retries and the final nine-action visual gate. Current production remains unchanged. Preserve all formal/unique probe evidence and required rollback. No workstation UI or binary download.
- Durable local evidence: `/Users/mango/.codex/visualizations/2026/11/08/01a1bbc5-f32d-75b2-87bb-5624f5fdbd91/held-task-recovery/`; remote probes stay under the formal run's `probes/`. Diagnostic helpers currently in `/tmp/openpet-held-*.cjs` and `/tmp/openpet-task-display-rig.cjs` must be copied into durable evidence before relying on them across sessions.

Earlier dated checkpoints below are historical; the budget and acceptance statements above supersede them.


### 2026-11-08 final acceptance recovery (latest verified state)

- Read-only SSH recovery confirms Guangzhou runs main `a1aeb7afe3a0b8ec8e0351c1eb688955948c1c51` (PR140), health `ready/resident`; rollback `/var/backups/openpet/20261108T081247Z-a1aeb7af` is retained. The previous 7/9 checkpoint below is historical.
- Formal run `2026-11-05-pip` has all nine accepted action checkpoints and no omitted actions. Right running is `approved-rig`, left running is `approved-mirror`; idle/waving/failed/waiting/running/review are `row-real`, jumping is `approved-rig`. The final visual gate still rejects the package, so actual final acceptance remains open.
- Formal atlas SHA256 `50ed3ddaef34c252dd5028478322d58ebd1d38ff884328afdd955817ab1c24d2`; bundle SHA256 `c99f21208af30ba5097fcd12f9408469852f3fb5ba0725a4c9d41cefc5fc90bb`. Formal final scores: identity96/distinctness81/crossAction85/smallScale93/style96/overall88; major cross-action inconsistency. Original artifacts and gate remain intact.
- Recovered uncommitted final-board fixes into independent branch `codex/final-acceptance-recovery`, preserving the source worktree. One shared atlas crop/scale preserves cross-action size and airborne offsets; final evaluator requests map each visible sequence to its registered intent, including mirrored left gait and work/inspection semantics. This code is not yet merged or deployed.
- Existing single real probe over that exact unchanged atlas used the corrected board SHA256 `7cc901cc9252244598a474a237701704a54fad2678433d99ccd1852b57315d9d`: identity95/distinctness78/crossAction90/smallScale91/style95/overall87, still `repair`. Major defects now identify `sequence-running` and `sequence-review`; minor defects remain in waiting/failed/right/left. This is diagnostic evidence, not a replacement formal verdict.
- Current ledger: Provider137/144, Planner1/34, Evaluator131/132, providerFailures32, no reservations. No budget was increased or reset, no new paid call was made during takeover, and no source/probe was promoted. Repairing both flagged actions and passing the final package requires at least three fresh evaluations, while only one remains; further paid verification needs an explicit evaluator-cap decision.
- Fresh regression proof: the recovered tests fail against unchanged main (54 pass/4 fail; equal source widths rendered158/59 and summary jump centers58/58), then all58 pass with the fix. Contracts/API/channel/docs checks and full syntax/typecheck/Control Center build pass. Local core has2395 pass/26 browser-launch failures/4 skips; all82 Control Center cases fail at browser launch because the pinned Chromium is absent. These are environment gaps; no browser was downloaded or workstation UI launched. CI/remote full-matrix verification remains required.
- Next: finish code/codec and CI verification, then repair actual work/inspection source gestures without weakening thresholds; retain the final formal workflow and web API checks as acceptance gates. Free root space at recovery was647MiB; deployment still requires the existing1GiB guard and verified recoverable cleanup.

Earlier dated checkpoint sections below are retained as history.


### 2026-11-08 current verification

- Guangzhou now runs main `168495acc01d84ea2f2375de6ccedd570bd12741` (PR138), ready/resident. Main CI42417936153 succeeded. Archive SHA256 `814348cd87415f46800f9760a45bca959901bd2d49739ab745ab891aefdb7d4e`; all17 recorded source hashes match that exact main. Shadow/build/API checks passed before atomic activation; SQLite backup integrity is `ok`. Current rollback is `/var/backups/openpet/20261107T221242Z-168495ac`; the preceding rollback is also retained.
- The deletion rule now permits necessary, verified low-risk cleanup without repeated confirmation; risky or uncertain deletions still require confirmation. The two obsolete code/runtime snapshots `20261030T181145Z-3300861` and `20261031T100520Z-3552725` were removed separately, after their complete historical data directories were moved to `/var/backups/openpet-data-preserved/<same stamp>`. This recovered roughly980MiB; free space rose from688 to1668MiB before staging. No generation evidence was deleted and the1GiB deployment guard was preserved.
- Exact-production real-codec support-rig regressions passed19/19, including right rig, mirror/package, source snapshot, checkpoint resume and export. HTTPS static/Creator/preview requests passed; unauthenticated/revoked sessions401 and settings authorization403 passed. Four formal JSON hashes were unchanged across deployment. After the real retry, all seven previously accepted checkpoint entries and41 frame hashes still match the baseline; normal run/budget/invalidation metadata changed.
- Formal retry Job `creator.workflow:02bcb5ee-7e98-4c6b-b288-b1adef319892` finished successfully as a Job but rejected every new right-running candidate. Three fresh videos scored84/85/81; the production articulated rig scored identity92/readability82/crossFrame83/crossAction90/smallScale87/style89/overall85, with major unreadable phases3/7. Its new poseSHA is `429852b1f934d5ae85047bc7a707688cccfe518c7a9230984c5e25e4019b4b28`; boardSHA `e26a1b8bfbfeb92176ebd2099be701ffb44d44af24af5beb86d45d1110fdeed2`. The earlier isolated pose/probe passing92 did not establish reliable acceptance for a fresh generated pose. No probe was promoted and no score or gate was overridden.
- Formal Pip remains7/9: idle/waving/jumping/failed/waiting/running/review accepted; right/left and final nine-action visual acceptance remain open. Existing seven-action package still fails its original final gate; spriteSHA `42e2e94f0dee2b535eaf7e4228c65c85dfc8696be47aa5fb7cf2444b5514500f`, bundleSHA `99483d7fdeb4e08f795b644f534ccfb7d661ef1fb8f266309d0318799dfe94e5`. HTTPS exposes that same partial package and both previews. The unchanged package was not rescored.
- Authorized caps remain Provider144/Planner34/Evaluator132. Usage is now133/1/123, no reservations, providerFailures32; history was preserved. Next work is to diagnose the rejected rig phases against its actual pose before any changed candidate is evaluated. Repeating an unchanged board, copying the passing probe into formal state, or claiming9/9 from technical QA is prohibited. All checks use code/SSH/API/VPS; no workstation UI.

This earlier checkpoint is historical; prefer the final acceptance recovery section above.


> Execute inline in the existing isolated branch/worktree. User's persistent completion goal authorizes implementing the documented deterministic-rig route; do not promote research probe artifacts. No workstation UI. Necessary verified low-risk cleanup may proceed directly under the updated deletion rule; risky or uncertain deletion requires confirmation.

**Goal:** Deliver all nine official actions and a quality-passing final pet through the production Creator workflow, retaining video as the primary route and adding source-faithful deterministic rigs where generation drifts.

**Architecture:** A hash-bound canonical support-rig renderer produces transparent action frames from source pixels and code-owned motion phases. The existing normalization/artifact/technical/visual gates remain mandatory. The host offers one rig repair candidate after supported video quality failures, persists its manifest and source hashes, and carries explicit `approved-rig` provenance through checkpoints, coverage and final metadata. Unsupported anatomy/actions remain rejected until their renderer and evidence are implemented.

**Tech Stack:** Existing Node, sharp, native test runner, Creator bridge and QA; no new dependencies or model downloads.

## Current checkpoint (2026-11-08)

Current production and the latest rejected formal retry are recorded above. PR137/138 are deployed as main168495ac. The production pose snapshot remains self-contained, but a fresh generated pose still yielded an85-point rig with unreadable passing phases3/7. Formal acceptance remains7/9, with11 Provider and9 evaluator calls left under the existing caps. Diagnose actual frame/pose geometry before changing rendering or spending further model calls. See [current evidence](../../release-evidence/remote-backend/2026-11-07-locomotion-budget-admission.md).

## Global constraints

### Evaluator configuration recovery

- [x] Reproduce rejected evaluator top-up through authenticated API (HTTP400) and service normalization (100→68).
- [x] Add bounded integer evaluator-total configuration to existing API/bridge/service/types/Control Center and demo; keep default68, historical counters and Provider limits.
- [x] Verify real route/service behavior, strict request validation and VPS UI save/reload.
- [x] Merge after green CI, deploy and configure the authorized cap100 through the existing API, preserving Provider144 and history. The first32 additional calls were consumed. The user subsequently authorized a further32 calls (cap132), applied with all historical usage preserved; see the current verification above.

- Keep existing quality thresholds and current accepted action evidence.
- Nine-action completion requires every action, mirrored running-left, final atlas QA and final visual gate; two-action packages do not satisfy it.
- No paid Provider request for deterministic rendering. Evaluations use existing budget ownership.
- Validate canonical SHA, dimensions, safe real paths, registered motion hash and manifest/frame hashes. Preserve cancellation and fail closed before side effects.
- New artifacts use run-owned candidate directories; never import probe output.
- Distinguish `approved-rig` from Provider `row-real` and `approved-mirror` in retained metadata.

## 1. Transparent frame normalization and support rig

Files: `lib/video-matte-pipeline.js`, new `lib/canonical-support-rig.js`, new `tests/examples/creator-studio-canonical-support-rig.test.js`.

- [x] Write failing tests: mismatched canonical hash/path/symlink; cancellation before output; unsupported anatomy/action; bounded dimensions; deterministic rerender to new directory; source gradients/green pixels preserved; five meaningful jump phases; no edge clipping; frame/manifest hashes.
- [x] Add `backgroundMode: 'source-alpha'` to the existing frame normalization so transparent source pixels bypass color-key removal. Default remains color-key. Test visible green against the same input.
- [x] Infer the support split from measured canonical alpha bounds (84% of subject height), not Pip coordinates. Keep the upper image untouched; scale the continuous lower strip per registered jumping phases. Render a bounded 512 canvas with explicit vertical lift; normalize with the existing character profile.
- [x] Store exact source SHA/dimensions/bounds/split, motion driver SHA and five transforms, source frame hashes and renderer version in a manifest. Generate fresh candidate artifacts using existing code.
- [x] Run `node --test tests/examples/creator-studio-canonical-support-rig.test.js tests/examples/creator-studio-action-video-task.test.js` and inspect pixels/QA.

## 2. Production fallback, persistence and official provenance

Files: `lib/host-model-bridge.js`, `lib/sprite-candidate-store.js`, `lib/full-pet-row-contract.js`, `lib/full-pet-basic-actions.js`, `lib/real-atlas-builder.js`, existing host/checkpoint/atlas tests.

- [x] Write failing host regression: two failed supported video candidates followed by rig repair must call no extra video bridge, evaluate/persist the new frames and retain previous failures. No rig replay for ambiguous submission, exhausted reads, cancellation or budget failures.
- [x] Add rig dispatch on the existing reason-directed repair branch, only for supported actions/asset classes. Keep candidate count/selection/quality gates unchanged. Rig still passes sprite and temporal QA before Vision.
- [x] Carry a bounded provenance object and hashed rig manifest artifact through candidate records, checkpoints, reuse and package metadata. Revalidate retained artifacts before reuse; preserve Provider checkpoints without regenerating accepted actions.
- [x] Add `approved-rig` official row quality with manifest validation and original row QA. Reject a rig label without valid source manifest. Include per-action generation origin in final pet metadata.
- [x] Update `docs/pet-character-generation.md` to permit audited canonical rigs for official rows while copied idle/transform-only preview placeholders remain excluded. Document supported renderers honestly.
- [x] Initial rig core/UI and CI completed before PR125/126 merge. Current sampling/budget changes require a fresh final-source pass. Focused regressions pass165 (one local ffmpeg skip), Guangzhou host suite passes39 with no skip, and contracts/API/typecheck/syntax/docs gates pass.

## 3. Real evidence and remaining actions

- [x] Use the fresh renderer on Guangzhou's canonical in an isolated candidate root and call evaluator once; preserve manifest/video-free provenance, technical results and score. Do not rescore the same board to fish for pass.
- [ ] Iterate defects at their source. Implement further local rigs or model-driven action poses for running-right/failed/waiting/running/review and mirror running-left from the accepted source. Keep idle/waving accepted evidence.
- [x] Merge passing code after rebase and deploy through shadow/SQLite-snapshot/atomic activation; PR141/main3c563fa4,19 source hashes and unchanged formal JSON hashes verified. Formal retries remain separate below.
- [ ] Complete all nine action gates and final atlas/package/visual gates. Verify web-control API exposes retained complete output. Human art approval and desktop import stay separate.
- [ ] Update current TODO/handoff/evidence and canonical Obsidian/router/MOC; scan and push. Keep goal active if any required action or final gate is incomplete.

## Verification checkpoint (2026-11-07)

- Fresh red evidence: padded composite pixel mismatch (22 RGB channels differ by one), retained selection rescaling audited frames, and missing portable export. Fixed with separate whole padded hashes, manifest-based restoration and complete export.
- Local rig tests: 11 pass, one ffmpeg-dependent integration skipped because no workstation codec binary is installed.
- Guangzhou isolated production-host integration: pass with the existing ffmpeg/ffprobe, native MPEG-4 fixture, mocked Provider/evaluator responses and real downstream rendering, row QA, packaging, checkpoint and archive selection. No real API spend for this regression.
- Earlier fresh general renderer probe: real evaluator identity98/readability92/crossFrame97/crossAction97/smallScale96/style98/overall96, technical and row gates pass, zero Provider + one evaluator. This is isolated evidence only; formal Pip was 2/9 at that earlier checkpoint; the latest checkpoint is6/9.

- Fresh Guangzhou host/candidate suite: 39/39, zero skipped; local focused QA/candidate/checkpoint/atlas/video suites: 165 passed, one codec skip. Contracts build, API/channel reconciliation, documentation drift, JavaScript syntax, TypeScript and Control Center build all pass. Full core/UI CI is pending.

- Review found that the first rig implementation hashed `subtle` intensity without changing pixels. A red regression proved it; motion amplitude now follows the registered intensity, with the same technical QA. Local rig suite passes12 plus one codec skip.

## Final package evidence fidelity (2026-11-08)

Observed failure: the formal nine-action atlas has no omitted rows, but the final board scores distinctness81/crossAction85. The board independently crops/scales every row and independently trims each summary frame, introducing size differences and suppressing airborne displacement. The final request also drops the motion intent available to single-action evaluations. Fix this evidence boundary before spending on further source generation; keep the original atlas and all quality thresholds.

- [x] Add failing pixel regressions: equal-size subjects in different rows retain equal scale, summary airborne offsets survive, and real size mismatches stay visible.
- [x] Share one alpha crop and scale across all official used frames in each board region. Remove the replaced per-frame trim path.
- [x] Carry registered action intents with row coordinates into the final evaluator, including work/inspection semantics, and keep required scores unchanged. Test the host-to-request boundary.
- [x] Run focused code/codec regressions. Render and inspect a fresh board over the exact unchanged formal atlas, then use the existing real evaluator once with the retained ledger.
- [ ] If real final quality passes, merge after rebasing, deploy with rollback, run the formal supported workflow to persist its package verdict, verify web API and update canonical records. If it rejects a specific source defect, repair that source and verify again within the authorized budget.

The real corrected-board evaluation remains rejected (work/inspection major); see the latest recovery section above. Only the local focused board/evaluator/host codec slice has passed; the full remote codec/CI matrix and final formal verdict remain open.

## Source gesture repair (2026-11-09)

The previous turn made progress: recovered source was committed as9ef55ae4/PR141 and CI42496576320 passed (Node3601/core2421/UI82; four Node/core skips), with both platform builds passing. Fresh SSH confirms the same formal atlas and131/132 evaluator usage. Its corrected-board evaluation still identifies work/inspection as major unreadable actions. The accepted work video closes both eyes and moves both appendages, despite requesting a single-side gesture. A final-board presentation fix cannot repair those source pixels.

Continue inline through the existing audited-rig architecture. `review` already has a head-only inspection renderer; add a separate local work renderer for compact grounded characters, preserving the head, feet and opposite side while the lead-side appendage makes two visible working beats. Keep video as the initial route and all visual gates mandatory. No paid call, cap change or formal-state mutation in this implementation loop.

- [x] Add failing pixel and provenance tests for six work phases, identical neutral endpoints, head/feet/opposite-side preservation, mirrored lead-side behavior, subtle amplitude, deterministic rerender, cancellation and manifest/row export.
- [x] Implement `lib/canonical-working-rig.js` with a bounded continuous inverse map and premultiplied interpolation, source-relative coordinates and no generated replacement pixels; connect it to `canonical-support-rig.js` and the existing reason-directed repair slot.
- [x] Test host video-failure → rig → evaluation → checkpoint → package/export → retained selection with the existing codec fixture. Fresh diagnostics exposed an additional normalization defect: per-frame silhouette centering shifts fixed head/feet. Work/review now share one source envelope and placement; only work15→16 and review16→17 bindings advance, preserving other accepted actions and idle scale.
- [x] Render work and existing inspection rigs from the exact formal canonical into isolated local diagnostic output; inspect all detail and128px runtime phases, technical QA and hashes without evaluation spend or probe promotion.
- [x] Run focused regressions and required CI, update this plan and current handoff with actual results. Runtimeea2cbce4 passed PR CI42521149307 and branch CI42521145070 (Node3609/core2429, five skips each; UI82), with both platform builds42521149316 passing.
- [x] Rebase/merge PR141, pass main CI42523040762 and deploy main3c563fa4 under the1GiB guard with shadow health, consistent SQLite snapshot and rollback. Exact-deployed-source115/115 and authenticated web/preview checks pass; all formal hashes stay unchanged.
- [ ] Complete formal action/final visual acceptance after the explicit evaluator-cap decision; never infer extra budget from the persistent goal. Deployed code is ready for the supported retry workflow, but the original package remains rejected.

Fresh three-test red→green evidence covers belly preservation and fixed work/review coordinates. Local focused111 pass/four codec skips; VPS113 pass/no skips plus five final pixel/cancellation/input checks. Final exact-canonical diagnostics retain five unique phases, exact neutral endpoints, fixed128px work head/feet and review feet, positive work Jacobian bound0.143466 and passing technical/temporal QA. Four renderer/normalizer source hashes match VPS. Detailed manifest hashes and local evidence location are in the [existing release record](../../release-evidence/remote-backend/2026-11-07-locomotion-budget-admission.md). No paid calls or formal-state changes; passing runtime CI does not satisfy formal art acceptance.
