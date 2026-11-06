# Video Task Retry Safety Implementation Plan

> Execute inline in the existing isolated worktree. Preserve production quality gates and paid evidence.

**Goal:** Prevent a transient poll/content failure or an ambiguous submission timeout from creating another paid video task.

**Architecture:** Retry bounded, idempotent reads inside the Grok adapter using the accepted task ID. Disable whole-generation retries after ambiguous submission or exhausted task reads; retain the task ID and stage in sanitized diagnostics. Explicit terminal failures retain their existing retry policy.

**Tech Stack:** Node native tests, fetch/AbortSignal, the existing Creator bridge and provider.

## Evidence and boundaries

Formal Pip b1f repair returned HTTP524 with no corresponding new task in Mango/Grok audit. The adapter currently exposes retryable HTTP/network errors at every stage; `runVideoAction` retries the entire bridge call, including POST. Automated regressions must demonstrate the unintended second POST before the fix. No inference that this particular524 created a duplicate is made.

The canonical continuous-deformation probe passes visual QA96, but transform-only frames remain preview research under the product contract. They will not be promoted into formal candidates or shipped as official-quality rows.

## Task 1: Retry task reads without resubmission

Files: `examples/plugins/creator-studio/lib/grok-video-provider.js`, `tests/examples/grok-video-provider.test.js`.

- [x] Add failing integrated tests that use the real `runVideoAction` bridge retry boundary: a successful POST followed by transient polling or content failure must issue exactly one POST, retry the same GET once, and return the paid output.
- [x] Add exhausted GET tests asserting `retryable=false`, original error code/status, accepted `taskId`, and stage; no new POST.
- [x] Add submission524/network/timeout tests asserting no automatic resubmission; explicit terminal `failed` retryability remains intact.
- [x] Use one helper inside `generateVideo`: catch retryable read failure, wait once using the existing cancel-aware delay, repeat the exact read, then mark errors unsafe for whole-generation replay. POST receives no automatic replay on an ambiguous error.
- [x] Verify caller cancellation during the read backoff does not retry or call POST.

## Task 2: Diagnostics and verification

Files: `apps/desktop/src/services/video-generation-model-service.js`, its test, current handoff/TODO/evidence.

- [x] Log only bounded taskId and a code-owned stage with the existing model/run/error code fields. Never log raw errors or credentials.
- [x] Run focused Provider/service/runner tests, contracts/API/docs/syntax, then full core/UI in CI or the existing VPS verification checkout. Do not launch workstation UI or download browsers there.
- [x] Rebase on latest main, merge passing PR, verify main CI, deploy through existing shadow/snapshot script if capacity permits, and verify running source hashes.
- [x] Prefer the already documented EasyTier Mango route for server-side video requests after an authenticated model-list check, configuration snapshot and supported settings API update. Keep image/text configuration and global Mango routing unchanged.
- [x] Perform one real Provider call and preserve its task/video audit. Formal nine-action acceptance remains a separate open result until all actions pass.

## Verification outcome

PR #123 merged as `92fae2a95972e85a32b3969d49a03925a5a2009e` after rebasing against current main. PR/branch CI and both platform builds passed; main CI `42312170898` passed3543 Node,2366 core (each one skip) and81 UI cases. The shadow/snapshot deployment and running hashes passed; the deployed focused suite passes74/74. The real EasyTier Mango smoke issued exactly1 POST,8 task polls and1 content request, produced a364056-byte MP4 and passed the technical pipeline. It reached a scored visual rejection (style80/overall88), without `cannot-evaluate`. This verifies transport and task ownership, not formal nine-action acceptance. Formal state and78/53 usage are unchanged; the isolated smoke records one Provider and one evaluator call separately. See the linked recovery evidence in the current handoff for hashes and rollback paths.
