# OpenPet Mesh Backend Deployment Implementation Plan

> **For agentic workers:** Execute this plan inline in the current isolated worktree. Preserve all pre-existing uncommitted changes.

**Goal:** Run OpenPet's Backend, SQLite data, plugin runtime, and Jobs on the Guangzhou CVM, with the local Electron Shell connected over EasyTier SSH forwarding.

**Architecture:** A loopback-only systemd host on the CVM starts the existing Backend sidecar on demand and proxies its API. The desktop coordinator opens one strict SSH session with local and reverse loopback forwards; Shell messages and provider-secret operations traverse an authenticated reverse bridge and are handled by the existing allowlisted message handler. Provider keys remain persisted by the local Shell SecretService and exist on the CVM only in Backend process memory.

**Tech Stack:** Node.js 24, systemd, Electron main process, Node HTTP, existing OpenPet v1 bridge envelopes, OpenSSH, EasyTier mesh.

## Global Constraints

- Keep the primary worktree protected; implement only in `codex/openpet-docs-review-20261004`.
- Preserve all existing dirty files and untracked evidence.
- Do not start Electron on the workstation or perform workstation acceptance.
- Keep CVM listeners bound to `127.0.0.1`; use `ssh gz-cvm` over EasyTier; do not change the security group or public DNS.
- Provider keys remain in local Shell SecretService at rest and may cross SSH only into remote process memory; never persist, log, or return plaintext keys from the CVM.
- Keep local Backend mode as the default; remote mode is configurable through Control Center.
- Verify with code-level tests/smoke and a tunneled remote health check; do not issue billable generation requests.

---

### Task 1: Build the loopback-only remote host and session protocol

**Files:**
- Create: `services/backend/host.js`
- Modify: `services/backend/index.js`
- Create: `tests/backend/host.test.js`
- Modify: `package.json`

**Deliverable:** The systemd host exposes an idle health endpoint and a private session API on a fixed loopback port, starts the existing Backend child with server-owned data paths, proxies authenticated API/SSE traffic, forwards child-to-Shell messages through the reverse SSH connection, and shuts down the child on session close or bridge loss.

- [x] Extend Backend startup to honor a validated fixed port when requested, while retaining ephemeral port `0` for local sidecar mode.
- [x] Implement strict host options, one-session-at-a-time startup, ready-message validation, startup timeout, redacted logs, body limits, API streaming proxy, and graceful/forced shutdown.
- [x] Implement authenticated Shell/Backend message correlation through `/__openpet/shell` and the reverse SSH bridge.
- [x] Keep `providerKeys` only in request/child memory and remove the host request reference after IPC transfer; enforce server-owned `userDataDir`.
- [x] Cover duplicate sessions, API auth, fixed storage path, provider-key log redaction, Shell correlation, and child shutdown in host tests; the bridge receiver suite also covers wrong bearer tokens.
- [x] Run host tests and syntax checks; fresh focused results are recorded in the deployment evidence.

### Task 2: Implement the desktop reverse Shell bridge and SSH connector

**Files:**
- Create: `apps/desktop/src/sidecar/remote-shell-bridge.js`
- Create: `apps/desktop/src/sidecar/remote-backend.js`
- Modify: `apps/desktop/src/sidecar/runtime-coordinator.js`
- Create: `tests/main/remote-shell-bridge.test.js`
- Create: `tests/main/remote-backend.test.js`

**Deliverable:** A strict loopback HTTP receiver validates envelopes and the per-session random token, invokes `createMessageHandler`, and returns only correlated replies. The connector runs `ssh` with strict host-key checking and loopback `-L`/`-R` forwards, bootstraps remote memory with the current settings and local SecretService keys, and exposes an adapter compatible with the existing coordinator.

- [x] Reuse the existing Shell message allowlist/parser and response validation; enforce request size, method/path, and session-token checks.
- [x] Start the receiver before opening SSH; use `spawn` with an argument array (`shell: false`), BatchMode, ExitOnForwardFailure, strict host-key checking, and keepalives.
- [x] Create a session-scoped random bridge token in memory; never put it in SSH arguments, persisted settings, logs, or renderer state.
- [x] Add startup timeout, unexpected SSH exit degradation, explicit remote session shutdown, and tunnel cleanup; reconnection occurs on a later start/save rather than a retry loop.
- [x] Keep local spawn behavior and PID-ledger handling unchanged.
- [x] Add focused bridge, connector, and coordinator regressions.
- [x] Run focused tests and Control Center type/build checks without launching Electron.

### Task 3: Add Control Center configuration for local/remote Backend mode

**Files:**
- Modify: `src/main/settings.js`
- Modify: `src/main/shared/ipc-channels.js`
- Modify: `src/main/ipc/register-service-ipc.js`
- Modify: `src/main/bootstrap/create-openpet-runtime.js`
- Modify: `src/control-center/src/panes/ServicePane.tsx`
- Modify: `src/control-center/src/hooks/useServicePane.ts`
- Modify: `control-center-preload.js` and its bridge types/API as required
- Modify: `tests/main/sidecar-runtime-coordinator.test.js` and relevant Control Center tests

**Deliverable:** The Service pane lets the user choose local or remote Backend mode and edit the SSH alias/remote host port. Local remains the default. Saving remote configuration restarts the coordinator and reports connection state without exposing SSH/session/provider secrets.

- [x] Add validated defaults (`local`, `gz-cvm`, remote host port `48330`) to local Shell settings.
- [x] Save and reconnect through Service IPC; reject shell metacharacters and invalid ports before spawning SSH.
- [x] Select local or remote startup from main-process settings and construct the message handler for the selected transport.
- [x] Keep provider credentials and random bridge/session tokens in the main process only.
- [x] Add UI configuration, save/error status, remote Backend readiness, and reconnection on save.
- [x] Run focused service IPC/coordinator tests, typecheck, and Control Center build without launching Electron.

### Task 4: Add deployment assets and install the CVM service

**Files:**
- Create: `scripts/install-openpet-backend-host.sh`
- Create: `deploy/openpet-backend-host.service`
- Create: `docs/deployment/openpet-mesh-backend.md`
- Modify: `README.md` and `docs/README.md`

**Deliverable:** A dedicated unprivileged systemd service runs a reviewed repository snapshot under `/opt/openpet`, with state under `/var/lib/openpet`, Node.js 24, loopback port `48330`, restricted filesystem permissions, and no public listener.

- [x] Pin Node 24 and install it under `/opt/openpet/node`; install lockfile dependencies and build/copy the contracts package.
- [x] Snapshot target paths before writing; preserve existing contents.
- [x] Create the `openpet` account and 0700 data directory; install a hardened systemd unit with only required writable paths.
- [x] Deploy the reviewed repository snapshot and start the service on `gz-cvm`; Tencent Cloud security group rules were not changed.
- [x] Verify systemd state, idle health, loopback listener, and service account ownership.
- [x] Record deployed source/bundle hashes and rollback snapshot in the deployment guide.

### Task 5: Verify the end-to-end mesh path and document handoff

**Files:**
- Modify: `docs/deployment/openpet-mesh-backend.md`
- Create: sanitized evidence under `docs/release-evidence/remote-backend/`

**Deliverable:** Code-level tests prove the Shell bridge and Backend host protocol, and an SSH tunnel smoke proves authenticated API health plus unauthenticated rejection. Evidence contains no secret values.

- [x] Run focused tests, syntax/type/build checks, and `git diff --check`.
- [x] Open SSH `-L`/`-R` through the EasyTier alias; verify authenticated API health through the forwarded loopback port.
- [x] Confirm unauthenticated requests fail and verify the CVM listener remains loopback-only.
- [x] Verify a read-only API route and reverse Shell request/reply with an in-memory test handler; no model generation or Electron launch.
- [x] Save sanitized results and deployment/rollback details in `docs/release-evidence/remote-backend/` and the deployment guide.
- [x] Re-read the plan. Pet Pack/Actions operations requiring a local file picker still need Shell mediation; packaged/UI acceptance was intentionally not run.
