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

## Creator Studio Plugin Responsibilities

- Keep a stable backend adapter contract that can call fixture, cloud, or local generation implementations.
- Persist per-run backend choice, backend status, artifacts, QA, logs, and user approval state.
- Produce standard `codex-pet` output and ask OpenPet to inspect/import it through `PetPackService`.
- Report missing host model settings or missing local endpoint as explicit run errors instead of silently falling back to fixture generation.

## First Plugin Slice Boundary

The plugin slice should implement backend selection and honest `cloud` / `local` unavailable states only. It should not add model settings UI, secret storage, provider SDK calls, or host model bridge APIs. Those are main UI / host backlog items.
