# Plugin Developer Experience Design

**Goal:** Make OpenPet's plugin ecosystem feel welcoming and creator-friendly while keeping the current safety model intact, so third-party authors can start from approachable examples and grow toward shareable plugins with clear guidance.

**Architecture:** Keep the existing plugin runtime model intact: manifest-driven packages, command-style activation, permission-gated SDK calls, install/update review, and disabled-by-default enablement. Improve developer experience by defining a friendlier layered contract: an example-driven author guide, a clear path from local experiment to shareable plugin, a maintainer appendix for ecosystem evolution, and a stable submission/testing path that reuses the existing `PluginInstallService`, `PluginService`, example plugins, and review tooling.

**Primary audience:** Third-party plugin authors first, with an explicit maintainer appendix for repository contributors and ecosystem operators.

## 1. Problem Statement

OpenPet's plugin runtime is already more mature than its developer-facing story.

The current repository proves that plugins can be:

- packaged and inspected safely
- installed and updated through review
- executed in an isolated short-lived runner
- limited by manifest permissions and network allowlists
- validated through submission tooling

What is still fragmented is the developer experience surface:

- Author guidance is split across README, plugin-development docs, phase records, tests, and example plugins.
- The difference between "locally acceptable", "catalog-ready", and "future-platform feature" is easy to misunderstand.
- Third-party authors can follow the happy path, but they do not yet get one clear design contract that explains the host model, adaptation rules, and compatibility expectations in one place.
- Repository maintainers have strong implicit rules in tests and service code, but the evolution contract for future plugin capabilities is not yet explicit enough.

The goal of this design is to make plugin development feel guided and welcoming rather than guarded or opaque, without making the platform more permissive than it already is.

## 2. Scope

This design covers:

- developer-facing plugin contract clarity
- author guidance for adaptation to the current SDK
- testing and submission flow expectations
- maintainer rules for evolving plugin capabilities
- documentation layering for plugin ecosystem guidance

This design does not cover:

- changing the runtime sandbox implementation
- adding new permissions immediately
- adding plugin secrets support in this phase
- adding background jobs, schedulers, or long-lived plugin processes
- adding a remote marketplace backend

## 3. Design Principles

The plugin developer experience should follow these principles:

1. **Contract before convenience**
   Developer ergonomics must not bypass manifest review, permission gating, or install safety checks.

2. **One obvious path**
   Third-party authors should have one clear path for package shape, command shape, testing, validation, and submission.

3. **Stable public surface, private implementation freedom**
   Plugin authors should code against `plugin.json`, `activate(ctx)`, and the SDK only. Maintainers should be free to evolve internals as long as that contract holds.

4. **Minimal host assumptions**
   Plugins should assume short-lived execution, explicit commands, JSON-serializable state, and no ambient privileges.

5. **Examples are executable policy**
   Official example plugins should remain the most trustworthy source of runtime behavior, not decorative samples.

6. **Growth path over gatekeeping tone**
   A plugin may start as a local experiment, then become shareable, then become catalog-ready. The docs must make that path obvious without framing every new author as a review problem.

## 4. Target Experience

### 4.1 Third-Party Author Experience

A third-party author should be able to:

1. read one author-facing guide
2. choose a tested example plugin close to their use case
3. start from a small, working template instead of a blank package
4. implement commands using the current SDK contract
5. validate the package locally
6. understand how to turn a personal experiment into a shareable plugin
7. generate reviewer artifacts only when they decide to share more broadly

They should not need to:

- read service internals to know what is supported
- infer policy from tests alone
- guess whether plugin config may contain secrets
- guess whether update review will disable the plugin
- feel like they must understand ecosystem operations before building their first useful plugin

### 4.2 Repository Maintainer Experience

A maintainer should be able to:

1. review whether a proposed plugin feature fits the current platform
2. reject feature requests that require unsupported runtime assumptions
3. extend docs, examples, and submission tooling together when the contract changes
4. preserve compatibility intentionally rather than accidentally
5. keep the public plugin story welcoming even when the underlying runtime policy stays strict

## 5. Proposed Documentation Model

The plugin ecosystem guidance should be intentionally layered.

### Layer A: Authoritative Rulebook

Purpose:

- define hard boundaries
- define compatibility rules
- define review expectations

Primary document:

- `docs/plugin-ecosystem-rules.md`

This document should answer:

- what a plugin is allowed to do
- what a plugin must never assume
- what makes a plugin review-risky
- what makes a plugin a poor fit for the current platform
- how a local experiment grows into a broadly shareable plugin

### Layer B: Build Guide

Purpose:

- teach plugin authors how to build within the rules
- show the shortest path from idea to first working plugin

Primary document:

- `docs/plugin-development.md`

This document should answer:

- package layout
- manifest shape
- `activate(ctx)` entry model
- configuration schema support
- SDK usage patterns
- validation and submission commands
- beginner-friendly starting points

### Layer C: Executable Examples

Purpose:

- show real plugin packages that pass current review and runtime expectations

Primary examples:

- `examples/plugins/focus-timer`
- `examples/plugins/weather-status`
- `examples/plugins/rss-reader`

Each example should represent a distinct capability pattern:

- local state and pet speech
- public network fetch plus storage
- public feed parsing plus caching

### Layer D: Maintainer Evolution Notes

Purpose:

- explain what maintainers may evolve and what they must preserve

This may live as a section inside the rules doc at first, rather than a separate top-level document, to avoid splitting truth too early.

## 6. Current Public Plugin Contract

The current plugin contract should be documented as stable at this level.

### 6.1 Package Contract

Plugins are local JavaScript packages with:

- `plugin.json` at package root
- `index.js` or other declared `main`
- optional `config.schema.json`
- optional `signature.json`

Accepted package sources:

- plugin directory
- `.openpet-plugin.zip`
- legacy `.ibot-plugin.zip` for compatibility only

### 6.2 Runtime Contract

Plugins are command-driven and short-lived.

That means:

- the host invokes a command explicitly
- the plugin activates through `activate(ctx)`
- the handler runs in isolation
- results must be JSON-serializable
- durable state must live in `ctx.storage`

This is an intentional design choice, not an implementation detail.

It should be framed to authors as a lightweight creator model: do one clear thing, store a little state, and let the pet express it.

### 6.3 Permission Contract

Only these permissions are public:

- `pet:say`
- `pet:action`
- `pet:event`
- `ai:chat`
- `storage`
- `network`
- `commands`

No plugin should rely on undeclared or future permissions.

### 6.4 Network Contract

The public network model is:

- HTTPS only
- host allowlist only
- public DNS hosts only
- `GET` and `POST` only
- no sensitive credential headers
- bounded request and response sizes

### 6.5 Enablement Contract

Install and update do not equal trust.

The host contract is:

- install may succeed while still being risky or unsigned
- update may require review
- install/update leave the plugin disabled by default
- user or operator enablement is explicit

That behavior should be treated as part of the public lifecycle contract.

## 7. Author-Facing Adaptation Rules

This design proposes that the author-facing guide should frame adaptation around plugin shape rather than host internals.

The author journey should be presented in two stages:

1. **Local experiment**
   Start from an example, make something fun or useful for yourself, keep the scope small, and confirm it works.

2. **Shareable plugin**
   Clean up naming, permissions, config defaults, and validation artifacts so someone else can inspect, install, and understand it.

### 7.1 Command Design

Plugin commands should be:

- small
- user-meaningful
- repeatable
- explicit in payload shape

Recommended pattern:

- one command equals one user-recognizable action
- one plugin equals one cohesive capability area
- one example equals one obvious starting shape for new authors

Authors should avoid:

- vague command names
- mixing unrelated features in one plugin
- requiring hidden setup steps outside Control Center

### 7.2 State Design

Authors should treat `ctx.storage` as a small normalized cache, not as a database.

Recommended storage shape:

- counters
- last successful snapshot
- lightweight settings-derived state
- migration-friendly objects

Discouraged patterns:

- large historical archives
- raw upstream payload hoarding
- secret material
- long AI transcript storage

For new authors, the easiest successful plugins are usually the ones that remember one small fact and make the pet do one visible thing.

### 7.3 Network Design

Authors should design network plugins around narrow public endpoints.

Recommended pattern:

- one allowlisted upstream host
- one or two predictable routes
- normalized response storage
- graceful behavior when the fetch fails

This keeps network plugins approachable: a small utility with one dependency is easier to build, test, explain, and share.

Discouraged patterns:

- broad multi-host dependencies
- hidden redirect chains
- opaque relay services used only to dodge allowlist clarity
- plugins that cannot function without private credentials

### 7.4 AI Design

Authors should use `ai:chat` only when model reasoning is core to the plugin's user value.

Good fits:

- summarization
- rewriting
- encouragement or lightweight assistant behaviors

AI plugins should feel like helpers with personality, not like attempts to embed a second standalone AI product inside OpenPet.

Poor fits:

- reproducing a full standalone chatbot
- building secret-bearing AI workflows
- persisting large conversation logs in plugin storage

### 7.5 Config Design

Authors should treat plugin config as ordinary UI-managed settings, not as secure storage.

Therefore:

- defaults should enable immediate use
- enums should constrain ambiguity
- booleans should be preferred over text flags where possible
- secret-bearing config should be treated as unsupported by current platform design

## 8. Example Plugin Strategy

The example plugin set should become the reference taxonomy for supported plugin shapes.

Examples are the main welcome mat for new authors. They should invite experimentation first, then teach the path to a cleaner, shareable package.

### Focus Timer

Represents:

- `storage`
- `pet:say`
- local-only command execution

Recommended as the first plugin for authors who want the fastest route to "something working".

### Weather Status

Represents:

- `network`
- `storage`
- `pet:say`
- public JSON fetch pattern

Recommended as the first network plugin template.

### RSS Reader

Represents:

- `network`
- `storage`
- `pet:say`
- public XML/content normalization pattern

Recommended for authors who want to adapt public content into pet-friendly summaries.

Future examples should only be added when they introduce a new supported pattern, such as:

- `ai:chat` with bounded usage
- `pet:action` plus graceful fallback behavior
- update review behavior or migration handling

Examples should not be added just to increase plugin count.
The example set should stay small enough that a new author can read it in one sitting and immediately choose a direction.

## 9. Submission And Review Experience

The plugin developer experience should clearly separate four stages:

1. **Authoring**
   Write the plugin package to the current contract.

2. **Local validation**
   Use `validate:plugin` to prove package safety and review surface.

3. **Reviewer artifact generation**
   Generate report, PR packet, and submission bundle.

4. **Human review and catalog readiness**
   Decide whether the plugin is acceptable for broader distribution.

These stages should be described as a growth path, not a gatekeeping ladder.

The docs should explicitly state:

- `validate:plugin` does not approve publication
- unsigned packages may still be structurally valid
- signature metadata currently proves hash coverage, not signer trust
- catalog metadata does not bypass install review

## 10. Maintainer Evolution Contract

This section is for repository maintainers, not ordinary third-party authors.

### 10.1 What Must Stay Stable

Maintainers should preserve these public assumptions unless intentionally versioning the plugin contract:

- root `plugin.json`
- command-driven `activate(ctx)` model
- manifest-declared permissions
- disabled-by-default install/update lifecycle
- config through Control Center-managed schema values
- `ctx.storage` as the durable state mechanism
- network allowlist review model

### 10.2 What May Evolve Internally

Maintainers may change:

- sandbox implementation details
- child process mechanics
- internal validation structure
- Control Center presentation details
- submission artifact formatting

As long as the public contract and review semantics remain intact.

### 10.3 What Requires Explicit Design Before Shipping

These ideas should not be introduced casually:

- plugin secrets support
- background scheduling
- broader network methods
- multi-host or wildcard allowlists
- filesystem access
- Electron or OS automation APIs
- remote code loading

Each of these would change the trust model and would require a new ecosystem design phase.

## 11. Testing Contract

The plugin developer experience should present testing as part of the contract, not as optional polish.

### 11.1 Third-Party Author Minimum

Recommended minimum:

- `node --check` on plugin entry files
- `npm run validate:plugin -- <plugin>`

This minimum should stay lightweight so authors can get to a working local plugin quickly before investing in packaging and review assets.

### 11.2 Repository Or Official Plugin Minimum

Required for first-party or repository-shipped examples:

- inspect/install test through `PluginInstallService`
- disabled-by-default lifecycle assertion
- runtime command test through `PluginService`
- storage assertions for persistent state
- fake fetch-based tests for network plugins
- emitted pet payload assertions where pet behavior is user-visible

### 11.3 Maintainer Rule

When a new plugin capability pattern is officially endorsed, docs, example coverage, and tests should land together.

No capability should become "official by folklore".

## 12. UX Improvements This Design Enables

Without changing runtime permissions, this design improves developer experience by making these truths obvious:

- what a plugin can build today
- what is unsupported by design
- how to structure commands and state
- how to start from a tested example instead of a blank page
- how to move from a personal experiment to something others can install
- how to validate before asking for review
- how maintainers decide whether a plugin belongs in the ecosystem

The immediate outcome is lower author confusion and lower maintainer review overhead.

## 13. Risks And Trade-Offs

### Risk: Too much policy scares off authors

Trade-off:

OpenPet is a constrained plugin platform, not a general local automation environment. Clear boundaries are more valuable than permissive but ambiguous guidance.

### Risk: Docs become stricter than code

Trade-off:

That is acceptable temporarily if the docs are expressing intended policy already supported by review and maintainer judgment. Over time, code should catch up to policy where possible.

### Risk: Maintainers add features that invalidate the doc

Trade-off:

That is precisely why the maintainer evolution contract must exist. New plugin powers should trigger explicit doc and example updates.

## 14. Success Criteria

This design is successful when:

- a third-party author can build a simple plugin without reading service internals
- maintainers can point to one rulebook for plugin fit and review boundaries
- the examples read like supported capability patterns rather than ad hoc demos
- submission tooling is understood as a review pipeline, not a publication shortcut
- future plugin capability proposals have a clear baseline to compare against

## 15. Recommended Next Step

The next implementation phase should operationalize this design by tightening the plugin documentation set around two living entry points:

- `docs/plugin-ecosystem-rules.md` as the rulebook
- `docs/plugin-development.md` as the build guide

If future developer pain remains high after that, the next design iteration should focus on one of these, in order:

1. first-party AI plugin example and bounded `ai:chat` guidance
2. plugin compatibility/version signaling for future SDK evolution
3. plugin secret-handling design, only if the platform is ready to support it safely
