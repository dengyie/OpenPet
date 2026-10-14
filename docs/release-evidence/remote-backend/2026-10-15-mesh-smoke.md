# OpenPet Mesh Backend Smoke — 2026-10-15

This record contains sanitized results only. No provider key, session token, bridge token, or Telegram token is stored here.

## Environment

- Target: Guangzhou CVM through the existing EasyTier SSH alias `gz-cvm` (`10.144.144.8`).
- Service: `openpet-backend-host.service`, running as `openpet`.
- Revision: `cf1ad19d`.
- Source archive SHA-256: `536ce1b5061f065316651f100d8158660a994eb74747dbd473fab7477cd38974`.
- Deployment snapshot: `/var/backups/openpet/20261014T213424Z-2123086`.
- Listener while idle: only `127.0.0.1:48330`; child and reverse bridge ports close with the session.

## Results

- systemd state: `active`.
- Idle `GET /__openpet/health`: HTTP 200, `status=idle`, API `v1`.
- SSH `-L`/`-R` session startup: succeeded.
- Authenticated `GET /api/v1/health`: HTTP 200.
- Unauthenticated `GET /api/v1/health`: HTTP 401.
- Read-only `GET /api/v1/plugins/openpet.im-gateway/config?operation=secret-state`: HTTP 200, `configured=false`.
- Reverse bridge: a `plugin.production.request` for `secret.state` crossed the `-R` bridge and received a correlated in-memory fixture reply.
- Remote child Backend applied SQLite migrations, reached `ready`, and closed cleanly on session end.
- After session close, the host returned to idle and only `127.0.0.1:48330` remained listening.
- The deployed application tree contained no `._*` or `.DS_Store` files.
- No Electron launch, model generation, workstation UI acceptance, real Provider/Telegram credential use, or public port/DNS/security-group change was performed.

## Root cause fixed in this release

The first authenticated smoke exposed a macOS AppleDouble file (`._001_init.sql`) in the migration directory. The migration scanner now ignores hidden AppleDouble files, and the backend installer removes `._*` and `.DS_Store` after extraction. A regression test covers both ignoring AppleDouble metadata and rejecting ordinary invalid migration names.
