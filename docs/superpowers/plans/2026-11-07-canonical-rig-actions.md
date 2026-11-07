# Canonical Rig Actions Implementation Plan

> Execute inline in the existing isolated branch/worktree. User's persistent completion goal authorizes implementing the documented deterministic-rig route; do not promote research probe artifacts. No workstation UI and no unapproved snapshot deletion.

**Goal:** Deliver all nine official actions and a quality-passing final pet through the production Creator workflow, retaining video as the primary route and adding source-faithful deterministic rigs where generation drifts.

**Architecture:** A hash-bound canonical support-rig renderer produces transparent action frames from source pixels and code-owned motion phases. The existing normalization/artifact/technical/visual gates remain mandatory. The host offers one rig repair candidate after supported video quality failures, persists its manifest and source hashes, and carries explicit `approved-rig` provenance through checkpoints, coverage and final metadata. Unsupported anatomy/actions remain rejected until their renderer and evidence are implemented.

**Tech Stack:** Existing Node, sharp, native test runner, Creator bridge and QA; no new dependencies or model downloads.

## Current checkpoint (2026-11-07)

当前广州已部署main `cf9a0b35`（PR129，main CI42375000156成功）。正式Pip idle/waving/jumping/failed已接受（4/9），failed通过checkpoint验证后复用，未增加Provider用量。用户已授权Evaluator100，Provider144保持，历史92/1/69保留；waiting恢复待终态。右跑画质与其他五动作及最终门尚未完成。root约1.7GiB，无新增删除。后续状态以[当前证据](../../release-evidence/remote-backend/2026-11-07-locomotion-budget-admission.md)为准，以下早期检查点保留历史。

## Global constraints

### Evaluator configuration recovery

- [x] Reproduce rejected evaluator top-up through authenticated API (HTTP400) and service normalization (100→68).
- [x] Add bounded integer evaluator-total configuration to existing API/bridge/service/types/Control Center and demo; keep default68, historical counters and Provider limits.
- [x] Verify real route/service behavior, strict request validation and VPS UI save/reload.
- [ ] Merge after green CI, deploy, configure the authorized cap100 through the existing API, then recover missing formal actions and evaluate the final package within the32 additional calls.

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
- Earlier fresh general renderer probe: real evaluator identity98/readability92/crossFrame97/crossAction97/smallScale96/style98/overall96, technical and row gates pass, zero Provider + one evaluator. This is isolated evidence only; formal Pip was 2/9 at that earlier checkpoint; it is now3/9.

- Fresh Guangzhou host/candidate suite: 39/39, zero skipped; local focused QA/candidate/checkpoint/atlas/video suites: 165 passed, one codec skip. Contracts build, API/channel reconciliation, documentation drift, JavaScript syntax, TypeScript and Control Center build all pass. Full core/UI CI is pending.

- Review found that the first rig implementation hashed `subtle` intensity without changing pixels. A red regression proved it; motion amplitude now follows the registered intensity, with the same technical QA. Local rig suite passes12 plus one codec skip.
