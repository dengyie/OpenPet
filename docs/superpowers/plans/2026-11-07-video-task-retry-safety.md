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
- [ ] Run focused Provider/service/runner tests, contracts/API/docs/syntax, then full core/UI in CI or the existing VPS verification checkout. Do not launch workstation UI or download browsers there.
- [ ] Rebase on latest main, merge passing PR, verify main CI, deploy through existing shadow/snapshot script if capacity permits, and verify running source hashes.
- [ ] Prefer the already documented EasyTier Mango route for server-side video requests after an authenticated model-list check, configuration snapshot and supported settings API update. Keep image/text configuration and global Mango routing unchanged.
- [ ] Perform one real Provider call and preserve its task/video audit. Formal nine-action acceptance remains a separate open result until all actions pass.
