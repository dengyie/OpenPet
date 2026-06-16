# Plugin Developer Experience Design

**Goal:** Make OpenPet's plugin ecosystem welcoming, capable, and creator-friendly by expanding the practical power available to third-party developers while preserving a safe reviewable core.

**Architecture:** Keep one shared plugin platform core for packaging, install/update review, signatures, storage, network, logs, and settings integration. On top of that core, expose two plugin capability layers under one ecosystem model: a `runtime` layer for plugins that affect pet behavior and conversation, and a `creator-tools` layer for plugins that help build, edit, validate, and generate pet/action assets. The same manifest and lifecycle remain shared, but capability profiles and review expectations differ by layer.

**Primary audience:** Third-party plugin authors first, with a maintainer appendix for ecosystem evolution and platform governance.

## 1. Problem Statement

OpenPet already has a serious plugin foundation:

- manifest-based packages
- install/update inspection
- isolated execution
- permission-gated SDK access
- submission and review tooling

But the ecosystem still feels narrower than the product vision.

Today, a third-party author can build simple helpers, but many natural plugin ideas still feel underpowered or awkward:

- weather and status announcers should be richer than plain speech
- plugins should be able to steer pet actions and behavior more intentionally
- conversation plugins should be able to shape tone, persona, and response style
- creators should be able to edit action configuration and pet behavior assets with plugin help
- asset-oriented plugins should be able to support action generation and pack authoring workflows

The current developer experience problem is not only that the rules are scattered. It is also that the available capability surface is too small for the kind of ecosystem OpenPet wants.

The design challenge is therefore twofold:

1. make the ecosystem feel more welcoming to third-party developers
2. expand useful capability without collapsing the safety model into unrestricted local code execution

## 2. Scope

This design covers:

- a more welcoming third-party author story
- expanded plugin capability for both runtime and creator-tool use cases
- one shared plugin core with layered capability profiles
- SDK and permission expansion strategy
- documentation and example strategy for the broader ecosystem
- maintainer rules for evolving this capability safely

This design does not cover:

- replacing the sandbox implementation in this phase
- granting unrestricted filesystem or Electron access
- allowing arbitrary secret access in plugins
- adding remote marketplace backend infrastructure
- adding fully autonomous long-lived background processes

## 3. Design Principles

The expanded plugin ecosystem should follow these principles:

1. **Welcome experimentation**
   A third-party author should be able to start from examples, build something locally useful, and only later worry about shareability and review polish.

2. **One core, multiple profiles**
   OpenPet should not split into unrelated plugin systems. The ecosystem should share one platform core and differentiate capability through layered profiles.

3. **Power should map to product value**
   New powers should be added because they unlock meaningful pet or creator experiences, not because “plugins should be able to do anything.”

4. **Capabilities before loopholes**
   If authors keep wanting the same kind of workaround, the platform should expose a supported capability rather than forcing hacks.

5. **Reviewable by design**
   New capability should remain legible in manifest permissions, Control Center review, tests, and submission artifacts.

6. **Examples are the real onboarding**
   The examples should define what the ecosystem feels capable of.

7. **Separation of runtime impact and authoring impact**
   A plugin that changes live pet behavior and a plugin that edits pet/action assets are both valuable, but they should not be documented or reviewed as if they were the same kind of risk.

## 4. Target Ecosystem Experience

### 4.1 Third-Party Author Experience

A third-party author should be able to:

1. pick a clear starting example
2. decide whether they are building a runtime plugin, a creator-tool plugin, or both
3. build a local experiment quickly
4. use supported APIs for weather, action control, dialogue shaping, personality injection, config editing, and asset workflows
5. grow the plugin into something shareable with explicit validation and review tooling

They should not feel:

- blocked at the idea stage because the host is too restrictive
- forced to read service internals to know what is possible
- forced into unsafe workarounds to do common pet-platform tasks
- treated as a security problem before they even build their first plugin

### 4.2 Maintainer Experience

A maintainer should be able to:

1. reason about plugin power through explicit capability layers
2. decide whether a proposed new permission belongs to runtime behavior, creator tooling, or neither
3. keep install/review UX understandable even as plugin power grows
4. preserve one ecosystem identity instead of managing multiple incompatible plugin systems

## 5. Core Design: One Platform, Layered Capability Profiles

This design recommends `same core, layered profiles`.

### 5.1 Shared Core

All plugins continue to share:

- `plugin.json`
- install/update inspection
- package hash/signature metadata flow
- settings-backed config
- scoped storage
- allowlisted network access
- logs
- disabled-by-default install/update lifecycle
- submission validation and review artifacts

This keeps the ecosystem coherent.

### 5.2 Capability Profiles

On top of the shared core, the host should expose two first-class plugin profiles:

- `runtime`
- `creator-tools`

These are not separate packaging systems. They are different ways a plugin can participate in the same ecosystem.

### 5.3 Runtime Profile

The runtime profile is for plugins that affect live pet behavior, conversation, or status expression.

Example use cases:

- weather announcers
- action orchestration plugins
- mood or personality injectors
- richer AI-assisted pet dialogue behaviors
- live event/status plugins

### 5.4 Creator-Tools Profile

The creator-tools profile is for plugins that help authors build or modify pet assets, action configs, and pack content.

Example use cases:

- action list editors
- config manipulators
- frame-folder inspectors
- action metadata generators
- sprite or prompt-assisted image generation workflows
- pet-pack authoring helpers

### 5.5 Hybrid Plugins

Some plugins may legitimately span both profiles.

Example:

- a tool that helps an author generate a new action, install it into a pack, then trigger it live on the pet for preview

Hybrid plugins should be supported, but their manifest and review should make the breadth of power obvious.

## 6. Expanded Public Plugin Contract

The public contract should stay simple to understand, but it needs to become more capable.

### 6.1 Package Contract

Plugins remain manifest-driven JavaScript packages with:

- root `plugin.json`
- declared `main`
- optional config schema
- optional signature metadata

Accepted package forms remain:

- directory
- `.openpet-plugin.zip`
- legacy `.ibot-plugin.zip` for compatibility only

### 6.2 Runtime Model

Plugins remain command-driven and short-lived by default.

That stays the right base model because it is:

- easy to explain
- easy to test
- easy to review
- aligned with Control Center command execution

But the command surface should become richer so a plugin can do more meaningful work per invocation.

### 6.3 Profile Declaration

The manifest should conceptually distinguish profile intent, even if initial implementation begins as documentation and validation conventions.

Recommended model:

- `profile: "runtime"`
- `profile: "creator-tools"`
- `profile: "hybrid"`

This helps:

- documentation routing
- Control Center presentation
- review expectations
- future capability auditing

## 7. Capability Expansion for Runtime Plugins

The runtime layer should expand beyond basic speech and generic command execution.

### 7.1 Richer Pet Control

Runtime plugins should be able to:

- trigger pet speech
- trigger pet actions explicitly
- queue or recommend actions with clearer semantics
- set richer pet events/status
- contribute lightweight behavior hints or mood signals

This supports:

- weather broadcast with matching action
- “happy when user finishes a focus session”
- “sleepy on late-night greeting”
- contextual pet reactions

### 7.2 Conversation And Personality Shaping

Runtime plugins should be able to influence pet dialogue more intentionally.

Supported direction should include:

- injecting personality presets
- contributing response style hints
- adding contextual memory-like summaries
- shaping response tone for specific commands or modes

Examples:

- “sarcastic assistant cat”
- “gentle study companion”
- “energetic coach”
- “quiet nighttime mode”

This should not mean unrestricted rewriting of the AI system. It should mean bounded hooks that let plugins shape pet expression in supported ways.

### 7.3 Runtime Data Adapters

Plugins like weather, feed, and status plugins should be able to do more than speak raw text.

The runtime layer should support:

- turning structured external data into pet-friendly summaries
- mapping data conditions to actions
- mapping data conditions to mood/personality variations
- persisting last-known snapshots for repeated use

This turns “weather plugin” from a toy command into a real behavior extension.

## 8. Capability Expansion for Creator-Tool Plugins

This is the biggest missing area today.

OpenPet should explicitly welcome plugins that help people create pets and actions, not only consume them.

### 8.1 Action Configuration Editing

Creator-tool plugins should be able to work with action configuration in a supported way.

Target capabilities:

- read action lists
- propose new actions
- edit action metadata
- update default/click action mappings
- validate action naming and completeness

This should happen through host-mediated APIs, not arbitrary direct file editing.

### 8.2 Frame And Sprite Workflow Support

Creator-tool plugins should be able to help with:

- frame-folder inspection
- frame consistency validation
- action preview generation
- metadata generation for imported actions
- asset preparation workflows

Example plugin ideas:

- “frame sequence inspector”
- “idle action validator”
- “sprite pack normalizer”

### 8.3 Asset Generation Support

The ecosystem should make room for creator plugins that assist with generating new visual assets.

Examples:

- prompt-driven action image generation
- style-consistent frame suggestions
- expression sheet generation helpers
- action thumbnail generation

This does not require immediate unrestricted image tooling inside plugins. But the platform should recognize this as a first-class creator need and design supported hooks for it.

### 8.4 Pack Authoring Helpers

Creator-tool plugins should also be able to support pet-pack authoring flows such as:

- manifest scaffolding
- pack validation
- atlas guidance
- action checklist generation
- migration from loose assets to pack structure

## 9. SDK Expansion Strategy

The SDK should grow by exposing higher-level pet-platform capabilities, not lower-level system escape hatches.

### 9.1 Runtime-Focused SDK Direction

Potential supported runtime-facing families:

- `ctx.pet.*` expanded for richer action/event semantics
- `ctx.dialogue.*` for personality/tone/context shaping
- `ctx.behavior.*` for bounded behavior hints or orchestration
- `ctx.pack.*` read-only access to active pack/action metadata when needed

### 9.2 Creator-Tools SDK Direction

Potential supported creator-tool families:

- `ctx.actions.*` for host-mediated action config reads/writes
- `ctx.assets.*` for inspection/validation/generation requests
- `ctx.petPack.*` for pack authoring helpers and validation flows
- `ctx.preview.*` for preview/render-oriented helper requests

### 9.3 Host-Mediated Writes

Important design rule:

Creator-tool plugins should not get raw unrestricted write access to project files or user data trees.

Instead, writable operations should be:

- host-mediated
- typed
- narrow
- reviewable
- reversible where practical

This is how OpenPet can support real creator tooling without turning plugins into unrestricted filesystem scripts.

## 10. Permission Model Direction

The permission surface needs to expand, but in a structured way.

### 10.1 Keep Existing Baseline

Current permissions remain valid:

- `pet:say`
- `pet:action`
- `pet:event`
- `ai:chat`
- `storage`
- `network`
- `commands`

### 10.2 Add New Powers As Product Permissions

Future powers should be introduced as explicit product-level permissions such as:

- `dialogue:persona`
- `behavior:hint`
- `actions:read`
- `actions:write`
- `assets:inspect`
- `assets:generate`
- `pet-pack:read`
- `pet-pack:write`
- `preview:render`

These names are directional, not final.

What matters is the model:

- permissions should describe product intent
- permissions should map to reviewable capabilities
- permissions should avoid vague “superuser” buckets

### 10.3 Profile-Sensitive Review

Runtime and creator-tool powers should be reviewed differently.

Examples:

- a `dialogue:persona` plugin is mostly a behavioral/reputational concern
- an `actions:write` or `assets:generate` plugin is more of a creator integrity concern

The review UX should surface those differences clearly.

## 11. Documentation Model For the Expanded Ecosystem

The plugin documentation model should reflect this broader platform story.

### Layer A: Welcome Path

Primary purpose:

- invite creators in
- help them choose a plugin shape
- show what kinds of plugins are now possible

### Layer B: Build Guide

Primary purpose:

- teach the package and SDK model
- explain runtime vs creator-tool profiles
- route authors to the right examples

### Layer C: Rulebook

Primary purpose:

- define hard boundaries
- define review expectations
- define unsupported assumptions

### Layer D: Maintainer Contract

Primary purpose:

- preserve coherence as capability expands

The tone should be:

- welcoming in the first layers
- strict in the rulebook layer
- architectural in the maintainer layer

## 12. Example Strategy For the Broader Ecosystem

The examples should expand with the platform.

### Current Examples

- `focus-timer`: local runtime helper
- `weather-status`: public data runtime helper
- `rss-reader`: public content runtime helper

### Recommended New Example Categories

- personality-injection runtime plugin
- action-preview runtime plugin
- creator-tool action-config editor
- frame inspection/validation tool plugin
- asset-generation assistant plugin

Each new example should justify a real supported capability pattern, not just pad the repo.

The example set should still remain curated and readable in one sitting.

## 13. Lifecycle: From Experiment to Shareable Plugin

The ecosystem should clearly describe a growth path:

### Stage 1: Local Experiment

The author:

- starts from an example
- builds something useful for themselves
- keeps permissions narrow
- confirms it works locally

### Stage 2: Shareable Plugin

The author:

- cleans up naming and config defaults
- removes accidental extra permissions
- validates install/update review behavior
- generates reviewer artifacts

### Stage 3: Ecosystem-Ready Plugin

The author and maintainer:

- confirm the plugin fits the platform contract
- confirm the permission story is understandable
- confirm the plugin is documented and testable enough for broader sharing

This growth path should feel like support, not bureaucracy.

## 14. Maintainer Evolution Contract

### 14.1 What Must Stay Stable

Maintainers should preserve:

- one shared plugin ecosystem core
- manifest-declared capabilities
- disabled-by-default install/update lifecycle
- host-mediated reviewable power
- submission tooling as part of the ecosystem contract

### 14.2 What May Evolve

Maintainers may change:

- sandbox implementation details
- internal SDK plumbing
- Control Center presentation
- validation/report formatting

As long as the public plugin story remains coherent.

### 14.3 What Requires Explicit Design

These still require dedicated design before shipping:

- unrestricted file access
- unrestricted system automation
- arbitrary secret injection
- fully autonomous background plugin execution
- remote code loading

Those are trust-model changes, not simple DX upgrades.

## 15. Risks And Trade-Offs

### Risk: Capability expansion makes review harder

Trade-off:

That is why one shared core and explicit profile/permission layers matter. The answer is clearer capability modeling, not keeping the ecosystem artificially weak.

### Risk: Creator-tool plugins push toward filesystem power

Trade-off:

That pressure is real, but the right answer is host-mediated typed operations, not raw unrestricted file writes.

### Risk: Runtime personality and behavior hooks make the pet feel inconsistent

Trade-off:

That is acceptable if the host provides bounded hooks and reviewable semantics rather than unstructured system takeover.

## 16. Success Criteria

This design is successful when:

- third-party authors can point to multiple meaningful plugin ideas that are clearly supported
- the ecosystem supports both runtime extensions and creator tools
- authors can build weather, action, dialogue, personality, and asset-helper plugins without hacks
- maintainers can still explain plugin power through one coherent manifest/review model
- new capability is added through explicit product permissions instead of hidden loopholes

## 17. Recommended Next Step

The next implementation/design phase should translate this spec into:

1. a revised public plugin rulebook with a welcoming opening and layered capability story
2. a revised plugin development guide organized by `runtime` and `creator-tools` paths
3. a concrete permission and SDK proposal for the first wave of capability expansion
4. at least one new runtime example and one new creator-tool example
