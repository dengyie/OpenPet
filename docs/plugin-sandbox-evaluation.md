# Plugin Sandbox Evaluation

> Date: 2026-06-12  
> Phase: 3 plugin ecosystem productization

## Summary

ibot should keep the current local plugin runner as the near-term default: a short-lived child process with Node permission model flags, VM execution, and a parent-mediated SDK. It is already integrated, testable, and fits the product goal of small user-installed JavaScript plugins.

This is not an absolute security boundary. Product wording and UI should describe third-party plugins as permission reviewed and isolated, not as mathematically safe. The install flow therefore defaults plugins to disabled, shows unsigned/signed state, and requires the user to enable a plugin after review.

## Threat Model

Primary risks:

- Local plugin reads arbitrary user files.
- Local plugin reaches Electron or Node APIs directly.
- Plugin package writes files outside `userData/plugins/<plugin-id>`.
- Plugin update silently gains new permissions or network hosts.
- Plugin network code leaks secrets through headers or arbitrary hosts.
- Plugin storage consumes unbounded settings space.

Current mitigations:

- Local runner does not inject `require`, `process`, Electron, or `fs` into plugin VM context.
- Child process uses Node permission model read allowlist for runner and plugin entry only.
- SDK operations are checked in the parent process against manifest permissions.
- Network calls require `network` permission, HTTPS, public DNS allowlist, no sensitive headers, and request/response byte limits.
- Storage requires `storage` permission, safe keys, per-value and per-plugin byte limits.
- Install service rejects path traversal, symlinks, unsafe ids, unknown permissions, and non-HTTPS network allowlist entries.

## Options

| Option | Strengths | Weaknesses | Recommendation |
|--------|-----------|------------|----------------|
| Current child process runner | Clear process boundary, short-lived, parent-mediated SDK, already covered by tests | Node permission model is still young; VM is not a complete sandbox by itself | Keep as default for Phase 3 |
| Worker thread | Lower overhead, simpler messaging | Same-process resource sharing and weaker isolation for untrusted code | Do not use for untrusted plugins |
| SES / lockdown | Stronger object capability discipline for JavaScript | Integration and compatibility cost; needs deeper package audit | Prototype later for higher-risk plugins |
| Electron utilityProcess | Native Electron process boundary and packaging fit | More platform/package complexity; needs additional IPC hardening | Medium-term candidate |
| WASM plugin ABI | Strong sandbox and capability boundary | Higher developer burden; JS plugin ecosystem becomes harder | Long-term exploration |

## Phase 3 Decision

Use the current runner plus the new install review flow:

- Treat unsigned plugins as installable but visibly risky.
- Treat signature metadata as hash verification only unless a future certificate trust chain is added.
- Disable plugins after install and update.
- Show added permissions and network hosts before update.
- Keep all privileged actions behind parent-validated SDK calls.

## Follow-Ups

- Add a SES proof of concept for one simple command plugin.
- Evaluate Electron `utilityProcess` for long-running plugins.
- Add catalog-level blocklist checks before install in Phase 7.
- Document plugin authoring rules and the limits of the sandbox before public plugin distribution.
