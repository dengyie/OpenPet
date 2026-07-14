# Provider Owner Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make host-owned chat, Vision, and image Provider settings the only runtime Provider and model source while adding complete sanitized lifecycle diagnostics.

**Architecture:** Keep `AiService` and `ImageGenerationModelService` as separate capability owners. Add a small stateless Provider policy helper for shared validation, immutable secret references, override rejection, and log metadata; remove consumer-level model fallback and route Vision discovery through effective config.

**Tech Stack:** Electron main process, Node.js CommonJS, React/TypeScript Control Center contracts, Node native test runner.

## Global Constraints

- API key values never enter renderer config, plugin context, logs, or model catalogs.
- Consumers cannot override `provider`, `baseUrl`, `apiKeyRef`, or `model` per request.
- Creator Studio performs no implicit model fallback.
- Provider network operations use bounded timeouts and sanitized structured logs.
- Existing settings migration remains readable, but new saves persist only canonical owner fields.

---

### Task 1: Enforce AI Provider Owner Input Boundaries

**Files:**
- Create: `src/main/services/provider-owner-policy.js`
- Modify: `src/main/services/ai-service.js`
- Modify: `src/shared/openpet-contracts.ts`
- Test: `tests/services/ai-service.test.js`

**Interfaces:**
- Produces: `validateProviderConfigInput`, `getCapabilitySecretRef`, `findOwnerFieldOverrides`, and `createProviderOperationDetails`.
- `AiService.saveConfig(partialConfig)` accepts only user-editable chat/Vision fields and preserves fixed secret refs.

- [ ] Add failing tests that inject chat and Vision `apiKeyRef`, malformed URLs, unsupported providers, and derived renderer fields.
- [ ] Run `node --test tests/services/ai-service.test.js` and confirm the new tests fail for accepted overrides or missing validation.
- [ ] Implement the policy helper and use it from `AiService.saveConfig` without changing conversation, memory, or behavior ownership.
- [ ] Add sanitized warning logs for rejected owner-controlled fields.
- [ ] Re-run the AI service tests and confirm all pass.

### Task 2: Make Image Model Selection Owner-Only

**Files:**
- Modify: `src/main/services/image-generation-model-service.js`
- Modify: `src/main/services/plugin-service.js`
- Modify: `examples/plugins/creator-studio/lib/host-model-bridge.js`
- Modify: `src/shared/openpet-contracts.ts`
- Test: `tests/services/image-generation-model-service.test.js`
- Test: `tests/services/plugin-service.test.js`
- Test: `tests/examples/creator-studio-host-model-bridge.test.js`

**Interfaces:**
- `ImageGenerationModelService.generateImage(request)` ignores or rejects all owner-controlled Provider fields and always resolves the saved model internally.
- Plugin bridge generation payload contains task fields only: prompt, output relative directory, constraints, timeout, and reference images.

- [ ] Replace existing override/fallback expectations with failing owner-only tests.
- [ ] Run the three focused test files and confirm failures demonstrate model override and fallback behavior.
- [ ] Remove runtime model override support and strip owner-controlled bridge fields with a warning log containing field names only.
- [ ] Remove Creator Studio candidate-list and retry logic; perform one host generation request with the configured model.
- [ ] Re-run the focused tests and confirm all pass.

### Task 3: Align Vision Discovery And Provider Logs

**Files:**
- Modify: `src/main/services/ai-service.js`
- Modify: `src/main/services/image-generation-model-service.js`
- Modify: `src/main/services/plugin-service.js`
- Test: `tests/services/ai-service.test.js`
- Test: `tests/services/image-generation-model-service.test.js`
- Test: `tests/services/plugin-service.test.js`

**Interfaces:**
- `AiService.discoverVisionModels()` resolves `getEffectiveVisionConfig()` and uses the shared request timeout.
- All owner operations emit common sanitized operation fields.

- [ ] Add failing tests for Vision follow-chat discovery, discovery timeout, warning logs, terminal lifecycle logs, and secret/prompt redaction.
- [ ] Run focused tests and confirm the new cases fail for the expected missing behavior.
- [ ] Implement effective Vision discovery, bounded timeout, and shared log metadata in all touched operations.
- [ ] Re-run focused tests and confirm all pass.

### Task 4: Production Verification And Review

**Files:**
- Modify only if a verified blocking defect is found.

**Interfaces:**
- Produces fresh verification evidence and a merge-readiness decision.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run check:syntax`.
- [ ] Run `npm run test:core:all`.
- [ ] Run `npm run test:control-center`.
- [ ] Review the final diff with `production-code-quality-review` and fix P0/P1 findings through another failing-test loop.
- [ ] Commit the verified implementation on `codex/dev` with an atomic Provider owner closure commit.
