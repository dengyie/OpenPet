# Canonical Rig Actions Implementation Plan

### 2026-11-08 current verification

- Guangzhou now runs main `168495acc01d84ea2f2375de6ccedd570bd12741` (PR138), ready/resident. Main CI42417936153 succeeded. Archive SHA256 `814348cd87415f46800f9760a45bca959901bd2d49739ab745ab891aefdb7d4e`; all17 recorded source hashes match that exact main. Shadow/build/API checks passed before atomic activation; SQLite backup integrity is `ok`. Current rollback is `/var/backups/openpet/20261107T221242Z-168495ac`; the preceding rollback is also retained.
- The deletion rule now permits necessary, verified low-risk cleanup without repeated confirmation; risky or uncertain deletions still require confirmation. The two obsolete code/runtime snapshots `20261030T181145Z-3300861` and `20261031T100520Z-3552725` were removed separately, after their complete historical data directories were moved to `/var/backups/openpet-data-preserved/<same stamp>`. This recovered roughly980MiB; free space rose from688 to1668MiB before staging. No generation evidence was deleted and the1GiB deployment guard was preserved.
- Exact-production real-codec support-rig regressions passed19/19, including right rig, mirror/package, source snapshot, checkpoint resume and export. HTTPS static/Creator/preview requests passed; unauthenticated/revoked sessions401 and settings authorization403 passed. Four formal JSON hashes were unchanged across deployment. After the real retry, all seven previously accepted checkpoint entries and41 frame hashes still match the baseline; normal run/budget/invalidation metadata changed.
- Formal retry Job `creator.workflow:02bcb5ee-7e98-4c6b-b288-b1adef319892` finished successfully as a Job but rejected every new right-running candidate. Three fresh videos scored84/85/81; the production articulated rig scored identity92/readability82/crossFrame83/crossAction90/smallScale87/style89/overall85, with major unreadable phases3/7. Its new poseSHA is `429852b1f934d5ae85047bc7a707688cccfe518c7a9230984c5e25e4019b4b28`; boardSHA `e26a1b8bfbfeb92176ebd2099be701ffb44d44af24af5beb86d45d1110fdeed2`. The earlier isolated pose/probe passing92 did not establish reliable acceptance for a fresh generated pose. No probe was promoted and no score or gate was overridden.
- Formal Pip remains7/9: idle/waving/jumping/failed/waiting/running/review accepted; right/left and final nine-action visual acceptance remain open. Existing seven-action package still fails its original final gate; spriteSHA `42e2e94f0dee2b535eaf7e4228c65c85dfc8696be47aa5fb7cf2444b5514500f`, bundleSHA `99483d7fdeb4e08f795b644f534ccfb7d661ef1fb8f266309d0318799dfe94e5`. HTTPS exposes that same partial package and both previews. The unchanged package was not rescored.
- Authorized caps remain Provider144/Planner34/Evaluator132. Usage is now133/1/123, no reservations, providerFailures32; history was preserved. Next work is to diagnose the rejected rig phases against its actual pose before any changed candidate is evaluated. Repeating an unchanged board, copying the passing probe into formal state, or claiming9/9 from technical QA is prohibited. All checks use code/SSH/API/VPS; no workstation UI.

Earlier checkpoint records below are historical; this section is authoritative.


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
- [ ] Merge passing code after rebase, deploy through shadow/SQLite-snapshot/atomic activation, verify hashes, then retry formal actions via supported API.
- [ ] Complete all nine action gates and final atlas/package/visual gates. Verify web-control API exposes retained complete output. Human art approval and desktop import stay separate.
- [ ] Update current TODO/handoff/evidence and canonical Obsidian/router/MOC; scan and push. Keep goal active if any required action or final gate is incomplete.

## Verification checkpoint (2026-11-07)

- Fresh red evidence: padded composite pixel mismatch (22 RGB channels differ by one), retained selection rescaling audited frames, and missing portable export. Fixed with separate whole padded hashes, manifest-based restoration and complete export.
- Local rig tests: 11 pass, one ffmpeg-dependent integration skipped because no workstation codec binary is installed.
- Guangzhou isolated production-host integration: pass with the existing ffmpeg/ffprobe, native MPEG-4 fixture, mocked Provider/evaluator responses and real downstream rendering, row QA, packaging, checkpoint and archive selection. No real API spend for this regression.
- Earlier fresh general renderer probe: real evaluator identity98/readability92/crossFrame97/crossAction97/smallScale96/style98/overall96, technical and row gates pass, zero Provider + one evaluator. This is isolated evidence only; formal Pip was 2/9 at that earlier checkpoint; the latest checkpoint is6/9.

- Fresh Guangzhou host/candidate suite: 39/39, zero skipped; local focused QA/candidate/checkpoint/atlas/video suites: 165 passed, one codec skip. Contracts build, API/channel reconciliation, documentation drift, JavaScript syntax, TypeScript and Control Center build all pass. Full core/UI CI is pending.

- Review found that the first rig implementation hashed `subtle` intensity without changing pixels. A red regression proved it; motion amplitude now follows the registered intensity, with the same technical QA. Local rig suite passes12 plus one codec skip.
