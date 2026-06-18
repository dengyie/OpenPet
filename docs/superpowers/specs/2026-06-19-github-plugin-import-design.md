# GitHub Plugin Import Design

**Goal:** Add a one-click third-party plugin import flow that accepts a GitHub repository homepage URL, downloads the repository default-branch archive, reviews it with the existing plugin package inspection pipeline, installs it disabled by default, and leaves plugin startup under existing user-controlled enable/service actions.

**Architecture:** Keep remote-source acquisition separate from plugin package review and installation. A new main-process GitHub import service should validate repository URLs, resolve the default branch through GitHub, download and extract the archive into a temporary directory, assert that the repository root directly contains `plugin.json`, and then hand the extracted directory to the existing `pluginInstallService.inspectPluginPackage()` workflow. Control Center should add a URL-driven entrypoint that feeds the existing review panel instead of introducing a second install confirmation surface.

**Tech Stack:** Electron main process services, existing CommonJS modules, built-in `fetch`, filesystem temp directories, existing ZIP extraction approach via `unzip`, shared IPC contracts, React Control Center hooks/components, Node native test runner.

---

## Problem

OpenPet already has a solid local third-party plugin flow:

- the Plugins pane can inspect a selected plugin directory or zip package;
- `pluginInstallService` validates manifests, config schemas, asset references, symlink safety, signature metadata, permission diffs, and install/update mode;
- confirmed installs are copied into the user plugin directory and saved as disabled by default;
- `pluginService` continues to own discovery, enablement, command execution, setup execution, dashboard opening, and service lifecycle.

What is missing is a remote convenience path for community plugins hosted on GitHub. Today a user has to manually clone or download a repository first, then go through the local package picker. That creates friction for exactly the kind of third-party plugin ecosystem this project is building.

The requested feature is narrower than a general remote plugin marketplace:

- it only needs to accept GitHub repository homepage URLs;
- it should automatically fetch the repository default branch archive;
- it should only support repositories whose root directory directly contains `plugin.json`;
- it should reuse the current review-and-install flow instead of bypassing it;
- it should not auto-enable or auto-start installed plugins.

## Scope

In scope:

- accept GitHub repository homepage URLs in the Plugins pane;
- validate URLs strictly as `https://github.com/<owner>/<repo>`;
- resolve the repository default branch through GitHub;
- download the default-branch source archive to a temporary location;
- extract the archive and locate the repository root directory;
- require `plugin.json` to exist directly in that extracted repository root;
- pass the extracted repository root into `pluginInstallService.inspectPluginPackage()`;
- return the existing `PluginPackageReviewViewState` shape so the current review panel can render it;
- install or update through the existing `installPlugin(selectionId)` and `updatePlugin(selectionId)` path;
- keep the plugin disabled by default after install, matching the current local-package behavior;
- show explicit user-facing errors for invalid URL, inaccessible repository, download failure, missing root `plugin.json`, and ordinary package review failures;
- add automated tests for the service, IPC, and Control Center integration points.

Out of scope:

- GitHub release asset links;
- arbitrary archive URLs;
- GitHub subdirectory plugin discovery;
- repositories that contain multiple plugins;
- auto-enabling or auto-starting a plugin immediately after install;
- running repository install scripts such as `npm install`, `pnpm install`, or shell scripts during import;
- bypassing the existing plugin review panel;
- generic remote plugin source abstraction beyond this GitHub homepage case.

## Existing System Fit

This feature should fit the current plugin layering rather than cut across it.

### Main process responsibilities

`main.js` already composes:

- `pluginInstallService` for package review/install/update/uninstall;
- `pluginService` for runtime behavior and lifecycle;
- `registerIpcHandlers()` for Control Center exposure.

The GitHub import path should be added as a new injected service in this same assembly layer.

### Installation boundary

`pluginInstallService` already owns the critical review and persistence logic:

- normalizing source roots from directories and zip packages;
- rejecting unsafe archive paths;
- rejecting symlinks;
- validating `plugin.json`, `config.schema.json`, and declared assets;
- computing file hashes and signature review state;
- determining install vs update mode;
- recording installed-package metadata in settings;
- copying the reviewed source into the installed plugin directory;
- disabling the plugin by default after install/update.

That service should remain the only component that decides whether a plugin package is valid and installable.

### Runtime boundary

`pluginService` and `local-plugin-runner.js` already protect the runtime execution model. GitHub import should not change those boundaries at all. Imported plugins become ordinary installed local plugins after review and copy.

### Control Center boundary

`usePluginsPane()` and `PluginsPane.tsx` already model a two-step install flow:

1. inspect a source package;
2. review and confirm install/update.

The GitHub import entry should produce the same review object so the existing `PluginReviewPanel` stays the single confirmation surface.

## Design

### New main-process service

Add a new service:

- `src/main/services/plugin-github-import-service.js`

Responsibilities:

- validate and parse repository homepage URLs;
- resolve the repository default branch;
- download the default-branch archive;
- extract the archive into a temporary working directory;
- locate the extracted repository root;
- assert that repository root directly contains `plugin.json`;
- pass that root path into `pluginInstallService.inspectPluginPackage()`;
- clean up temporary state if inspection fails before `pluginInstallService` takes ownership of any temporary extracted selection;
- return the existing review payload unchanged except for the fact that it originated from GitHub.

Non-responsibilities:

- package manifest validation;
- permission diffing;
- signature verification;
- install/update persistence;
- runtime enablement;
- service startup;
- user-facing renderer state management.

### Service interface

The service should expose one narrow method:

```js
inspectRepositoryUrl(repositoryUrl)
```

Expected behavior:

- returns the same review shape currently returned by `pluginInstallService.inspectPluginPackage()`;
- throws clear errors for URL validation, GitHub lookup, archive download, extraction failure, or missing root `plugin.json`.

The service should depend on injected collaborators so tests can stub network and filesystem edge cases:

- `fetchImpl`;
- `downloadArchive` or equivalent internal helper boundaries;
- `pluginInstallService`;
- optional temp-root helpers if needed.

### URL validation

Accepted form:

```text
https://github.com/<owner>/<repo>
```

Validation rules:

- protocol must be `https`;
- host must be exactly `github.com`;
- pathname must contain exactly two non-empty segments: owner and repo;
- reject extra path segments such as `/tree/main/plugin`;
- reject query strings and fragments to keep the contract explicit;
- normalize trailing slash by ignoring it.

Rejected examples:

- `http://github.com/user/repo`
- `https://github.com/user/repo/tree/main`
- `https://github.com/user/repo?tab=readme`
- `https://gist.github.com/user/repo`

Recommended error:

- `Please enter a GitHub repository homepage URL`

### GitHub metadata lookup

The service should call the repository API first:

```text
GET https://api.github.com/repos/<owner>/<repo>
```

Needed field:

- `default_branch`

Behavior:

- if the API returns 404 or 403, treat the repository as inaccessible;
- if `default_branch` is missing or empty, fail clearly instead of guessing;
- do not require authentication for the first version.

Recommended user-facing error:

- `Unable to read the repository default branch. Check that the repository exists and is publicly accessible.`

### Archive download

Once the default branch is known, the service should download:

```text
https://codeload.github.com/<owner>/<repo>/zip/refs/heads/<default_branch>
```

Design choices:

- download the zip into a temporary directory;
- reuse the same extraction posture the codebase already uses for plugin zip handling, namely `unzip`;
- keep all work inside temp directories, never inside the installed plugin directory;
- remove the temporary zip and extraction root when inspection fails before a plugin selection is created.

This feature must not execute repository-provided install scripts or any file contents during the download/review phase.

### Extracted repository root detection

GitHub branch archives typically extract into a single top-level folder named like `<repo>-<branch>`.

The import service should:

- extract into a temp directory;
- require exactly one top-level extracted directory;
- treat that directory as the repository root candidate;
- assert that `plugin.json` exists directly inside that root;
- reject repositories that only place `plugin.json` in a nested subdirectory.

Recommended error:

- `This GitHub repository is not supported yet. plugin.json must exist at the repository root.`

### Inspection handoff

After locating the repository root, the service should call:

```js
pluginInstallService.inspectPluginPackage(extractedRepositoryRoot)
```

This is the key design choice. It ensures the GitHub import path inherits:

- symlink rejection;
- manifest/schema/asset validation;
- signature metadata review;
- permission and network allowlist diffing;
- install/update mode detection;
- installed-version comparison;
- blocked-plugin checks;
- the same `selectionId` lifecycle used by the existing install confirmation flow.

No alternative review model should be introduced for GitHub imports.

### Installation behavior

Installation after review should stay unchanged:

- confirm install in the current review panel;
- call existing `installPlugin(selectionId)` or `updatePlugin(selectionId)`;
- leave the plugin disabled by default;
- let the user decide whether to enable the plugin or start services afterwards.

This keeps the current trust boundary intact: import convenience does not imply execution consent.

## IPC Design

Add a new IPC channel:

- `PLUGINS_INSPECT_GITHUB_REPOSITORY`

Suggested contract:

```ts
inspectPluginGithubRepository: (repositoryUrl: string) => Promise<PluginPackageInspectionResult>
```

Main-process handler behavior:

- call the new GitHub import service;
- wrap the response like the local package inspection flow does today;
- return `{ canceled: false, ...review }` on success;
- throw errors directly so renderer error handling can continue using `messageFromError()`.

This IPC should sit next to:

- `PLUGINS_INSPECT_PACKAGE`
- `PLUGINS_CLEAR_SELECTION`
- `PLUGINS_INSTALL`
- `PLUGINS_UPDATE`

The install/update IPC channels do not need a parallel GitHub-specific variant because the reviewed selection should already be in the ordinary install queue owned by `pluginInstallService`.

## Control Center Design

### UI entrypoint

Keep the current local-package button and add a second entrypoint in the Plugins pane:

- existing: `Install plugin`
- new: `Import from GitHub`

Recommended UX:

- a compact text input for repository URL;
- an action button that triggers inspection;
- helper text: `Only repositories with plugin.json at the repository root are supported.`

The feature does not need a separate page or modal in the first version.

### Hook behavior

`usePluginsPane()` should add:

- `githubRepositoryUrl` state;
- `inspectingGithubPlugin` state or reuse a generalized inspection pending state if the code stays simple;
- `onInspectGithubPluginRepository()` handler.

Handler flow:

1. clear status;
2. call new API method with the URL;
3. set `pluginReview` from the response;
4. preserve the existing install confirmation path.

Error handling should continue using `messageFromError(error, '插件导入失败')` or a similarly specific message.

### Review surface reuse

The existing `PluginReviewPanel` should stay the single review surface. GitHub import should not create a second review component.

That gives the user the same information they already see for local packages:

- permissions diff;
- network diff;
- signature state;
- install vs update mode;
- file count / size / package hash;
- command/service/dashboard declarations.

## Error Handling

Errors should be explicit and user-actionable.

### Validation errors

- invalid URL format:
  - `Please enter a GitHub repository homepage URL`

### Remote lookup errors

- repository not found or inaccessible:
  - `Unable to read the repository default branch. Check that the repository exists and is publicly accessible.`

### Download/extract errors

- archive download failure:
  - `Failed to download the repository source archive`
- archive extraction failure:
  - `Failed to extract the repository source archive`

### Repository layout errors

- no root `plugin.json`:
  - `This GitHub repository is not supported yet. plugin.json must exist at the repository root.`
- unexpected extraction layout:
  - `Failed to locate the repository root in the downloaded archive`

### Package review errors

Package review errors from `pluginInstallService.inspectPluginPackage()` should be preserved as-is. Those messages already describe problems like:

- invalid manifest JSON;
- missing main file or extension entries;
- invalid config schema;
- invalid asset paths;
- unsafe folder structure;
- signature metadata mismatches.

## Security Posture

This feature should remain conservative.

### What it allows

- downloading a public GitHub repository source archive;
- extracting that archive into a temp directory;
- reviewing it through the existing plugin package checks.

### What it does not allow

- arbitrary URL downloads;
- release assets or non-GitHub hosts;
- nested subdirectory plugin discovery;
- execution of repository build/install scripts during import;
- bypassing current review/install rules;
- auto-enabling or auto-starting imported plugins.

This preserves the project constraints that plugins must not gain unrestricted Node/Electron access and that installation should remain reviewable through Control Center.

## File-Level Changes

New files:

- `src/main/services/plugin-github-import-service.js`

Modified files:

- `main.js`
  - construct and inject the new service
- `src/main/ipc.js`
  - register the new inspection IPC handler
- `src/shared/ipc-channels.js`
  - define the new channel constant
- `src/shared/openpet-contracts.ts`
  - expose the new renderer API method in `ControlCenterApi`
- `src/control-center/src/api/control-center-api.ts`
  - bridge the new IPC call and update demo API behavior
- `src/control-center/src/hooks/usePluginsPane.ts`
  - add GitHub URL state and inspection action
- `src/control-center/src/panes/PluginsPane.tsx`
  - add the GitHub import input/button/helper text

New tests:

- `tests/services/plugin-github-import-service.test.js`

Modified tests:

- `tests/main/ipc-plugin-install.test.js`
- `tests/control-center/...` or an equivalent Control Center hook/component test file covering the new GitHub import interaction

## Testing Strategy

### Service tests

`tests/services/plugin-github-import-service.test.js` should cover:

- valid repository homepage URL parsing;
- rejection of non-homepage or non-HTTPS URLs;
- successful default-branch lookup and archive handoff to `pluginInstallService.inspectPluginPackage()`;
- repository API failure;
- archive download failure;
- extracted archive missing a root `plugin.json`;
- cleanup behavior on failure where the service owns temporary directories.

These tests should stub network and avoid hitting the real GitHub API.

### IPC tests

`tests/main/ipc-plugin-install.test.js` should cover:

- the new IPC handler calling the GitHub import service with the provided URL;
- success response shape matching the existing inspection flow;
- failure propagation preserving renderer-visible errors.

### Control Center tests

The Control Center test coverage should verify:

- the Plugins pane renders a GitHub repository URL input and action button;
- entering a URL and triggering import calls the new API method;
- successful import populates the existing review panel;
- errors appear in the pane status area.

## Decisions

### Decision 1: add a separate GitHub import service instead of teaching `pluginInstallService` about URLs

Problem: the new feature needs remote lookup, archive download, and temporary extraction, but `pluginInstallService` currently owns review and persistence for already-local sources.

Choice: add a thin GitHub-specific acquisition service and keep `pluginInstallService` focused on local source review/install.

Why:

- preserves single responsibility;
- keeps the existing installation boundary stable;
- makes the GitHub-specific network logic easier to test independently;
- leaves room for future remote-source types without turning the installer into a downloader.

### Decision 2: only support repository-root plugins in v1

Problem: many repositories can contain nested examples, multiple packages, or plugins in subdirectories.

Choice: only support repositories whose root directory directly contains `plugin.json`.

Why:

- matches the user-approved scope;
- removes ambiguity from repository layout detection;
- avoids inventing a plugin-subdirectory selection UX;
- keeps error messaging clear and predictable.

### Decision 3: reuse the existing review panel and install confirmation flow

Problem: a remote convenience path could be implemented as a one-click install that bypasses review, but that would weaken the current trust model.

Choice: GitHub import ends at the same `PluginReviewPanel` used for local packages.

Why:

- preserves permission visibility and signature warnings;
- avoids duplicate confirmation UI;
- keeps install/update behavior identical across local and GitHub-originated sources.

### Decision 4: do not auto-enable or auto-start after GitHub import

Problem: “一键导入” could be interpreted as download plus immediate execution.

Choice: the feature only automates retrieval plus installation; execution remains an explicit user action after review.

Why:

- matches the current plugin install policy;
- keeps remote acquisition separate from execution consent;
- reduces the risk of accidentally running newly imported third-party code.
