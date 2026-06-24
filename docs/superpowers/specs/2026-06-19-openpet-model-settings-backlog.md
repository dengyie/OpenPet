# OpenPet Model Settings Backlog

Date: 2026-06-19
Last updated: 2026-06-23
Status: Partially implemented; remaining backlog handoff for main UI / host polish
Scope: Capabilities intentionally not implemented inside the Creator Studio plugin slice

## Goal

OpenPet should provide first-class model configuration that Creator Studio and other extensions can consume without each plugin inventing incompatible settings screens.

The first host slice is now implemented. OpenPet owns unified OpenAI-compatible image Provider settings, API key storage, model health checks, provider calls, output writing, and Creator Studio host bridge access. Creator Studio can still label run backends as `fixture` / `cloud` / `local`, but the main UI credential boundary is the host-owned Provider config. The remaining work is product/UI polish and broader provider ergonomics, not the initial security boundary.

## Implemented Host Slice

- Control Center AI pane exposes unified image Provider settings for Base URL, model, timeout, concurrency, and host-owned API key storage.
- `ImageGenerationModelService` stores non-secret settings in `settings.models.imageGeneration`.
- Image Provider API keys are stored through `SecretService` and renderer responses expose only `hasApiKey` / masked preview metadata.
- Provider calls are host-owned and write generated images under the allowed Creator Studio data directory.
- Local/proxy providers use the same OpenAI-compatible Provider shape and rely on URL validation plus health checks.
- Host model bridge routes support non-secret model settings reads, model health checks, and bounded image-generation requests during explicit plugin execution.
- Creator Studio can fail clearly when `cloud` or `local` is not configured instead of silently falling back to fixture.

## Remaining Host / Main UI Responsibilities

- Refine the current AI pane image-generation card into a clearer Control Center model settings surface for selecting provider, model name, base URL, timeout, and concurrency. First-pass inline summary, host-boundary copy, and dedicated health status are implemented in the AI pane.
- Store API keys and provider secrets through `SecretService`; never expose raw secrets to renderers or ordinary plugin code.
- Preserve the safe host-mediated model bridge for plugins that opt into host-managed generation.
- Improve provider health, local endpoint reachability, and actionable setup errors.
- Keep global settings separate from plugin run state: OpenPet owns credentials and defaults, Creator Studio owns per-run prompt/artifact state.
- Keep cloud generation host-mediated by default. If plugin-managed generation is later allowed, the UI must make that trust boundary visible.

## Main UI Feature Request

Refine the current Control Center AI image-generation card, or move it into a dedicated model settings area, with these sections:

- Provider preset: OpenAI, OpenAI-compatible gateway, local/proxy endpoint, or custom.
- Provider fields: provider id, display name, base URL, model id, API key secret ref, timeout, max concurrent jobs, and optional organization/project fields if needed.
- Safety copy: explain whether generation is host-mediated or plugin-managed, and whether credentials stay in OpenPet secret storage.
- Health check action: validates credential presence and endpoint reachability without starting a pet generation run.

Historical target shape before unification:

```json
{
  "models": {
    "imageGeneration": {
      "defaultBackend": "fixture",
      "cloud": {
        "provider": "openai",
        "baseUrl": "https://api.openai.com/v1",
        "model": "gpt-image-1",
        "apiKeyRef": "secret:model.image.openai.apiKey"
      },
      "local": {
        "endpoint": "http://127.0.0.1:7860",
        "healthUrl": "http://127.0.0.1:7860/health",
        "model": "local-pet-sprite",
        "timeoutMs": 120000
      }
    }
  }
}
```

Renderer must never receive raw API keys. It can receive booleans such as `hasApiKey` and masked labels such as `••••abcd`.

Current saves should preserve the unified Provider shape rather than reintroducing separate `cloud` and `local` settings in the main UI.

## Host Model Bridge Status

Creator Studio now uses the host-mediated model bridge during explicit plugin execution. The bridge should remain short-lived, token-gated, permission-gated, and JSON-only:

- `GET /creator/model-settings`
- `POST /creator/model-health-check`
- `POST /creator/model-image-generate`

The route should require a new permission such as `model:image-generate`. The payload should be bounded and JSON-only. Large images should be returned as host-owned data references or written into `OPENPET_DATA_DIR` by the host, not streamed through arbitrary plugin paths.

Suggested `model-image-generate` request:

```json
{
  "backend": "cloud",
  "prompt": "small mint helper cat, transparent background",
  "output": {
    "dataRelativeDir": "runs/2026-06-19-sprout-cat/frames/base"
  },
  "constraints": {
    "width": 1024,
    "height": 1024,
    "transparent": true
  }
}
```

Suggested response:

```json
{
  "ok": true,
  "backend": "cloud",
  "model": "gpt-image-1",
  "outputs": [
    {
      "dataRelativePath": "runs/2026-06-19-sprout-cat/frames/base/0001.png",
      "mimeType": "image/png",
      "sha256": "..."
    }
  ],
  "usage": {
    "estimatedCostUsd": 0.04
  }
}
```

## Security Requirements

- Secrets are stored by `SecretService` and referenced by stable secret refs.
- Renderer and ordinary plugin contexts never receive raw secret values.
- Host bridge routes are loopback-only, token-gated, command-scoped, and permission-gated.
- Local endpoint URLs must be loopback-only unless a future explicit trust prompt allows remote hosts.
- Generated file writes must stay under `OPENPET_DATA_DIR` or another host-approved directory.
- Logs must avoid prompts only if user opts into private logging mode; secrets must never be logged.

## Acceptance Criteria

- A user can configure cloud and local image-generation defaults in Control Center. Implemented in the current AI pane; UI polish remains.
- A user can store, replace, and clear an API key without exposing it to renderer state. Implemented through `SecretService`.
- A health check shows actionable status for missing key, invalid key, unreachable local endpoint, healthy endpoint, and providers where optional `/models` probing is unavailable. Implemented; dedicated navigation remains future polish.
- Creator Studio can read non-secret model availability and fail with a clear setup message when unavailable. Implemented.
- Creator Studio can request one bounded host-mediated image generation and receive host-owned output references. Implemented.
- Existing `fixture` backend remains available for tests and offline demos.

## Creator Studio Plugin Responsibilities

- Keep a stable backend adapter contract that can call fixture, cloud, or local generation implementations.
- Persist per-run backend choice, backend status, artifacts, QA, logs, and user approval state.
- Produce standard `codex-pet` output and ask OpenPet to inspect/import it through `PetPackService`.
- Report missing host model settings or missing local endpoint as explicit run errors instead of silently falling back to fixture generation.

## First Plugin Slice Boundary

The plugin slice should implement backend selection and honest `cloud` / `local` unavailable states only. It should not add model settings UI, secret storage, provider SDK calls, or host model bridge APIs. Those are main UI / host backlog items.

## Current Plugin-Side Progress

Creator Studio now has:

- backend adapter dispatch for `fixture`, `cloud`, and `local`;
- append-only run logs under each run workspace;
- run list, run detail, and run log APIs in the Creator Studio service;
- persisted `backendStatus` for idle, running, ready, failed, and not-configured states;
- explicit `not_configured` failures for `cloud` and `local`, with no fixture fallback.
- host-mediated model generation through OpenPet when configured;
- OpenPet-specific prompt-builder design for desktop-pet-safe image generation prompts.

## Remaining Backlog

- Dedicated model settings navigation and copy, separate from chat provider settings if the AI pane becomes too dense.
- Provider presets for common OpenAI-compatible image backends.
- Optional model discovery where providers support `/models`.
- Better per-provider compatibility hints, including models that do not support transparent `background` parameters.
- User-visible generation cost/usage summaries when providers expose enough metadata.
- Explicit trust copy if OpenPet later allows plugin-managed provider credentials in addition to host-managed generation.
