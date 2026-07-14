# Provider Owner Closure Design

> Date: 2026-07-14
> Status: approved
> Scope: host-owned chat, Vision, and image Provider configuration, model resolution, secrets, discovery, generation, and diagnostics

## Goal

Make the saved OpenPet Provider configuration the only runtime source of truth for every host and plugin consumer. A consumer may describe a task, but it may not select or persist a Provider endpoint, secret reference, or model.

## Owner Boundaries

`AiService` owns chat and Vision:

- chat Provider, Base URL, model, and the fixed `ai.default` secret reference;
- Vision follow-chat resolution and the fixed `ai.vision` override secret reference;
- chat and Vision model discovery, connection requests, and model catalogs.

`ImageGenerationModelService` owns image generation:

- image Provider, Base URL, model, and the fixed `secret:model.image.openai.apiKey` secret reference;
- image model discovery, health checks, concurrency, timeouts, and generation requests.

`PluginService`, Creator Studio, renderers, scripts, and future consumers are clients. They must not override `provider`, `baseUrl`, `apiKeyRef`, or `model` for a runtime request.

## Runtime Rules

1. Chat and image config saves accept explicit allowlisted fields only.
2. Secret references are host constants and cannot be changed through IPC, renderer payloads, persisted legacy values, or plugins.
3. Creator Studio reads the active image config for display only. Generation always uses the active image owner model.
4. Creator Studio automatic model fallback is removed. A failed configured model produces one failed request and actionable diagnostics.
5. Vision in `follow-chat` mode uses the effective chat Provider for requests, discovery, cache display, and readiness.
6. Vision in `override` mode uses its own host-owned configuration and fixed secret reference.
7. Model discovery remains optional. A missing `/models` endpoint does not block manual model configuration.

## Shared Provider Policy

Create a focused main-process helper for behavior shared by both owners:

- validate OpenAI-compatible Provider identifiers;
- validate HTTP(S) Base URLs without credentials, query, or fragment;
- normalize non-empty model identifiers;
- return immutable capability secret references;
- build sanitized operation log details.

The helper does not store state, call the network, or know about renderer components.

## Logging Contract

Every Provider operation records a start event and exactly one terminal event where practical. Common fields are:

- `requestId`
- `capability`: `chat`, `vision`, or `image`
- `operation`: `save-config`, `save-secret`, `clear-secret`, `discover-models`, `health-check`, `complete`, `stream`, or `generate`
- `provider`
- `model`
- `endpointHost`
- `configSource`: `chat`, `vision-follow-chat`, `vision-override`, or `image`
- `outcome`
- `durationMs` for network operations
- `errorCode` and sanitized `errorMessage` on failure

Logs must never include API key values, Authorization headers, prompts, user messages, provider response bodies, URL credentials, query strings, fragments, or private output paths.

Rejected attempts to override owner-controlled fields are recorded as warning events with field names only.

## Failure Behavior

- Invalid save payloads fail before settings are persisted.
- Rejected owner-field overrides do not partially mutate configuration.
- Discovery and health requests use bounded timeouts.
- Vision follow-chat discovery uses chat credentials and endpoint without copying chat config into Vision storage.
- Provider errors retain safe status/code metadata while redacting remote response text from renderer-facing failures and logs.

## Testing

Regression tests must prove:

- chat and Vision secret refs cannot be retargeted;
- malformed Provider config is rejected in the main process;
- image generation ignores consumer `model`, `provider`, `baseUrl`, and `apiKeyRef` fields;
- plugin bridges strip owner-controlled fields;
- Creator Studio performs no hidden model fallback;
- Vision follow-chat discovery uses chat config and times out;
- owner rejection and Provider lifecycle logs contain required fields and no secrets or prompts;
- existing chat, image, Creator Studio, plugin, and Control Center flows remain green.

## Non-Goals

- adding non-OpenAI-compatible protocols;
- introducing a monolithic ProviderHub service;
- exposing fallback controls in the user UI;
- moving diagnostics or business logic into the renderer.
