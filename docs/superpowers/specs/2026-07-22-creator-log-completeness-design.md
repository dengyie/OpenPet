# Creator Log Completeness Design

## Goal

Make a Creator full-pet run diagnosable from one run id without exposing prompts, credentials, absolute paths, or image bytes.

## Scope

- Propagate a bounded `traceContext` containing `runId`, `actionId`, `stage`, and `candidateId` from Creator Studio through the host bridge into the image-generation service.
- Emit the Provider `requestId` in every Provider event and persist it in generation attempts, stages, candidates, and action checkpoints.
- Keep important app events when the bounded JSONL log compacts, while reducing high-volume debug eviction of workflow evidence.
- Compact app logs through a temporary file and atomic rename.
- Add explicit started/completed/failed run events for identity and action work.
- Read Creator run journals line-by-line and preserve valid entries when a trailing line is truncated.

## Contracts

`traceContext` is main-process/plugin-internal data. Each field is a bounded safe identifier. It never contains prompt text, file paths, API keys, URLs, or image data. Existing callers may omit it.

The app log retains at most `maxEntries` records. When compacting, non-debug records are retained first, then the newest debug records fill the remaining capacity. Compaction writes a temporary file and renames it only after the complete serialized content is written.

Creator run log reads return valid entries plus a bounded diagnostic entry with event `run.log-corrupt-line` for malformed lines. A malformed line must not turn a valid run into a 404.

## Failure Semantics

- Provider request failures continue to use existing generic, sanitized messages and error codes.
- Trace metadata is best effort for legacy callers but is present on all Creator Provider calls.
- A log write failure must not change generation behavior where the existing caller already treats diagnostics as best effort.
- Run state and checkpoint writes remain the source of truth for recovery; journal entries are supplementary evidence.

## Verification

- Unit tests assert trace propagation and request-id persistence.
- App-log tests assert priority retention and atomic-compaction failure safety.
- Run-store tests assert identity/action failure events and malformed-line tolerance.
- Existing syntax, core, Control Center, and focused Creator/Provider suites remain green.
