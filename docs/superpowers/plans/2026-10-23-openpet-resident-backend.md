# OpenPet Resident Backend Implementation Plan

> **For agentic workers:** Execute this plan inline in the current isolated worktree. Preserve all pre-existing uncommitted changes.

**Goal:** Keep the Guangzhou OpenPet Backend online without a desktop SSH session, with Provider credentials stored in a protected server file and server-side Creator generation available from Web Control.

**Architecture:** Add an explicit resident mode to the existing loopback Backend host. In resident mode the host loads provider keys from a permission-checked file, starts the Backend child at boot, persists key changes atomically, and answers only the small set of Shell bridge requests required by server-side AI and Creator operations. The existing desktop session mode remains unchanged, and desktop-only operations return a clear unavailable response.

**Tech Stack:** Node.js 24, native HTTP, child process IPC, systemd, OpenAI-compatible Provider API, existing OpenPet Backend and Creator Job services.

## Global Constraints

- Keep the primary worktree protected; implement in the existing `codex/image-retry-candidate-lifecycle` linked worktree.
- Keep Host, reverse bridge, and child Backend listeners loopback-only.
- Do not expose plaintext Provider keys in logs, HTTP responses, test output, Git, or Obsidian.
- Provider keys may be stored only in a server-owned file with mode `0600`; validate permissions and ownership at startup.
- Do not start Electron on the workstation or perform workstation acceptance.
- Keep the current desktop session mode and its reverse SSH bridge behavior.
- Exercise real Provider calls only from Guangzhou, using the user-authorized test credential and bounded smoke requests.

---

### Task 1: Add a secure resident configuration and key store

**Files:**
- Modify: `services/backend/host.js`
- Modify: `tests/backend/host.test.js`
- Modify: `deploy/openpet-backend-host.service`
- Modify: `scripts/install-openpet-backend-host.sh`

**Deliverable:** The service can enable resident mode at boot, read a validated key file without logging values, reject insecure file permissions, and persist key updates via same-directory atomic replacement with `0600` permissions.

- [ ] Cover absent, malformed, and insecure key files plus redacted persistence behavior.
- [ ] Verify resident child startup, stable ready status, and orderly shutdown through the host fixture.

### Task 2: Make Backend AI and Creator operations independent of desktop Shell

**Files:**
- Modify: `services/backend/index.js`
- Modify: `services/backend/host.js`
- Modify: `services/backend/domains/creator/index.js`
- Modify: focused Backend tests.

**Deliverable:** Resident mode supplies a server-owned default pack context, reports AI state locally, serves backend-owned Creator runs and previews, and keeps shell-only import/activation and local UI capabilities unavailable with explicit errors.

- [ ] Cover AI context resolution in resident mode and keep desktop-session regression coverage.
- [ ] Cover backend Creator state, generated image workflow, retry/review, and shell-only import rejection.

### Task 3: Configure Guangzhou and verify the complete server path

**Files:**
- Modify: `docs/deployment/openpet-mesh-backend.md`
- Create or update: sanitized deployment evidence under `docs/release-evidence/remote-backend/`.

**Deliverable:** Deploy the reviewed build, install the user-authorized Provider key through a non-echoing channel, configure language and image models from the canonical Obsidian account note, and verify public mesh Web Control auth, Backend readiness, Provider connectivity, image generation, and Creator workflow without launching Electron.

- [ ] Verify key file ownership/mode and confirm key absence from logs and Git tree.
- [ ] Verify image Provider request and bounded Creator avatar generation on Guangzhou.
- [ ] Verify desktop-only import/activation reports its actual capability boundary.

### Task 4: Merge, deploy, and update Obsidian

**Files:**
- Update canonical note: `Note/Infra/OpenPet mesh Backend 运维手册.md`
- Update route entry: `00.MOC/AI-DOC-ROUTER.md`

**Deliverable:** Rebase the feature branch onto current GitHub `main`, run required checks, merge to `main`, deploy the merged revision to Guangzhou with a rollback snapshot, record sanitized production results, and update the Obsidian router and canonical manual while preserving existing vault changes.

- [ ] Verify GitHub CI and production service after deployment.
- [ ] Run Obsidian stale-doc scan and inspect the exact vault diff.
