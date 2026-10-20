# OpenPet Mesh Web Control Implementation Plan

> **For agentic workers:** Execute this plan inline with review checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser control panel for the existing OpenPet Creator workflow, serve it from the Guangzhou Backend host through a private mesh-only HTTPS domain, and preserve the existing desktop bridge and secret boundaries.

**Architecture:** The Backend host serves a separately built web app and exchanges a short-lived browser token for the active Backend session token. The browser submits bounded reference image bytes to the Backend Creator Job, where the official Creator Studio plugin generates and reviews the full pet. The active desktop session supplies Provider keys and Shell bridge; local pet-library import and activation remain Shell-owned. The domain terminates HTTPS on the CVM's EasyTier address, while the Backend host remains loopback-only behind Nginx.

**Tech Stack:** Node.js native HTTP, React, Vite, existing OpenPet contracts, Nginx, Cloudflare DNS-01 certificate issuance, EasyTier mesh.

## Global Constraints

- Keep the Backend host HTTP listener on `127.0.0.1:48330`.
- Bind the public-facing Nginx listener only to EasyTier `10.144.144.8`.
- Do not expose the Backend or web control to the public Internet or modify cloud security groups.
- Do not store Provider keys, Shell bridge tokens, session tokens, or web login passwords in Git or Obsidian documentation.
- Execute explicit web-mode Creator orchestration in the official Backend plugin; keep Provider keys session-scoped and native pet import/activation behind the existing Shell authority.
- Do not modify `cat_anime/` or add adapters under `examples/plugins/im-gateway/`.
- Do not launch Electron or perform workstation UI acceptance.

---

### Task 1: Add authenticated web delivery to the Backend host

**Files:**
- Modify: `services/backend/host.js`
- Create: `tests/backend/host-web-control.test.js`
- Modify: `scripts/install-openpet-backend-host.sh`
- Modify: `deploy/openpet-backend-host.service`

**Interfaces:**
- `POST /__openpet/web/login` accepts `{ password }` and returns a random, short-lived web token only when the configured password matches. Business proxy requests still require an active Backend session.
- Same-origin `/api/v1/*` requests may authenticate with the web token; the host substitutes the active child session token before proxying.
- `GET /` and static asset paths serve only files contained beneath `dist/web-control`.
- Web tokens are memory-only, expire after four hours, and are revoked when the Backend session ends.

- [x] Implement constant-time password validation, web-token issuance, expiry, session revocation, static asset containment, and the authenticated proxy path.
- [x] Add host tests for rejected passwords, idle sessions, valid proxy auth, expired/revoked tokens, and path traversal attempts.
- [x] Make the installer build the web bundle after dependency installation; load the web password from a root-managed systemd environment file.
- [x] Run focused host and remote-session regressions.

### Task 2: Add browser reference-image upload to Creator

**Files:**
- Modify: `packages/contracts/src/bridge.ts`
- Modify: `apps/desktop/src/sidecar/message-handler.js`
- Modify: `apps/desktop/src/bootstrap/create-openpet-runtime.js`
- Modify: `apps/desktop/src/services/creator-workflow-service.js`
- Modify: `services/backend/domains/creator/index.js`
- Modify: `services/backend/routes/creator.js`
- Create: `tests/services/creator-reference-upload.test.js`
- Create: `tests/backend/creator-reference-upload.test.js`

**Interfaces:**
- `POST /api/v1/creator/references/upload` accepts `{ targetType, targetId, fileName, mimeType, dataBase64 }`.
- The request is limited to 1 MiB decoded data, PNG/JPEG/WebP, and validated image bytes; it returns the existing one-use `referenceToken` format plus safe file metadata.
- The Shell writes the upload beneath its app-owned temporary directory and delegates approval to `creatorWorkflowService`; the normal Creator bind flow then copies it into the managed reference store.

- [x] Add one `creator.upload-reference` bridge operation and validate its exact fields on both sides.
- [x] Decode strictly, validate declared MIME against image bytes, use a safe generated filename, and remove the temporary file after token consumption or expiry.
- [x] Add route/domain/Shell service regression tests for supported images, size/type rejection, path traversal resistance, and one-use tokens.
- [x] Run focused Creator reference, workflow, domain, and route regressions.

### Task 3: Build the web Creator control panel

**Files:**
- Create: `apps/web-control/index.html`
- Create: `apps/web-control/vite.config.js`
- Create: `apps/web-control/src/main.tsx`
- Create: `apps/web-control/src/main.tsx`
- Create: `apps/web-control/src/api.mjs`
- Create: `apps/web-control/src/styles.css`
- Modify: `package.json`
- Create: `tests/web-control/api.test.js`

**Interfaces:**
- The app logs in through `POST /__openpet/web/login`, keeps the returned token in memory, and sends it as `Authorization: Bearer` for Backend requests.
- The UI exposes Backend full-pet generation from a browser reference, job progress, latest Backend Creator run details, identity/action decisions, retries, recovery verification, and the Shell-owned import/activation handoff.
- The UI clearly reports when the remote desktop Shell bridge is offline and keeps Provider secrets out of browser persistence and request logs.

- [x] Add the Vite build target with output `dist/web-control` and a root `build:web-control` script.
- [x] Implement same-origin API helpers for health, Creator, Jobs, reference upload, asset preview, candidate approval, import, and recovery export.
- [x] Implement the browser workflow with bounded image upload, accessible progress/error states, candidate preview, and human review before approval/import.
- [x] Add API tests and run `npm run build:web-control` plus `node --test tests/web-control/api.test.js`.

### Task 4: Configure mesh-only HTTPS delivery and update canonical docs

**Files:**
- Create: `deploy/openpet-web-control.nginx.conf`
- Create: `scripts/configure-openpet-web-control.sh`
- Modify: `services/backend/README.md`
- Modify: `docs/release-evidence/README.md`
- Modify: Obsidian canonical `Note/Infra/OpenPet mesh Backend 运维手册.md`
- Modify: Obsidian `00.MOC/AI-DOC-ROUTER.md`
- Modify: Obsidian `00.MOC/项目索引.md`

**Interfaces:**
- Domain: `openpet.mangoqwq.com` (candidate; confirm before certificate issuance), DNS-only A record to the CVM EasyTier address `10.144.144.8`.
- Nginx listens on `10.144.144.8:443`, proxies to `127.0.0.1:48330`, and rejects requests whose Host header does not match the OpenPet domain.
- TLS uses a publicly trusted certificate issued with DNS-01; the DNS API credential remains in a mode-0600 host file and is not committed or documented.

- [x] Add an idempotent setup script that installs the Nginx site and verifies mesh binding, trusted domain certificate, backend service, and listeners. Certificate issuance remains an operator DNS-01 step.
- [ ] Update the canonical Obsidian Backend manual and router/MOC mounts after the domain is confirmed; record the actual certificate paths and deployment revision only after the server change.
- [x] Run `npm run check:syntax` plus focused web/backend tests from the worktree.
- [ ] Deploy the reviewed build to `gz-cvm`, create the DNS-only record, issue a free publicly trusted DNS-01 certificate, install Nginx, and verify HTTPS/API health only from a mesh-connected host; do not start Electron on the workstation.

## Review Boundary

The code and local smoke checks are complete for this branch. Online deployment remains a separate operator step because the domain is not yet confirmed and the trusted certificate/DNS record do not exist on the CVM. The setup script intentionally refuses to create self-signed HTTPS certificates.
