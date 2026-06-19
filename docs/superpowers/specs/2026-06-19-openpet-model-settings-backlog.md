# OpenPet Model Settings Backlog

Date: 2026-06-19
Status: Backlog handoff for main UI / host work
Scope: Capabilities intentionally not implemented inside the Creator Studio plugin slice

## Goal

OpenPet should eventually provide first-class model configuration that Creator Studio and other extensions can consume without each plugin inventing incompatible settings screens.

## Host / Main UI Responsibilities

- Add a Control Center model settings surface for selecting default image-generation backend, provider, model name, base URL, and local endpoint.
- Store API keys and provider secrets through `SecretService`; never expose raw secrets to renderers or ordinary plugin code.
- Provide a safe host-mediated model bridge or documented local service contract for plugins that opt into host-managed generation.
- Show provider health, local endpoint reachability, and actionable setup errors.
- Keep global settings separate from plugin run state: OpenPet owns credentials and defaults, Creator Studio owns per-run prompt/artifact state.
- Decide whether cloud generation is host-mediated, plugin-managed, or both. If both are supported, the UI must make that trust boundary visible.

## Main UI Feature Request

Add a new Control Center model settings area, likely under the existing AI or Service surface, with these sections:

- Default backend: `fixture`, `cloud`, or `local`.
- Cloud provider: provider id, display name, base URL, model id, API key secret ref, and optional organization/project fields.
- Local provider: endpoint URL, health URL, model id, timeout, and max concurrent jobs.
- Safety copy: explain whether generation is host-mediated or plugin-managed, and whether credentials stay in OpenPet secret storage.
- Health check action: validates cloud credential presence or local endpoint reachability without starting a pet generation run.

Recommended setting shape:

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

## Host Model Bridge Request

Creator Studio can use either a future host bridge or a plugin-managed local service. If the host bridge is chosen, expose a short-lived command bridge route only during explicit plugin command execution:

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

- A user can configure cloud and local image-generation defaults in Control Center.
- A user can store, replace, and clear an API key without exposing it to renderer state.
- A health check shows actionable status for missing key, invalid key, unreachable local endpoint, and healthy endpoint.
- Creator Studio can read non-secret model availability and fail with a clear setup message when unavailable.
- If host-mediated generation is implemented, Creator Studio can request one bounded image generation and receive host-owned output references.
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
