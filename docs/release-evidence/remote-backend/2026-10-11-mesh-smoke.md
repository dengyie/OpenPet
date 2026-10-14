# OpenPet Mesh Backend Smoke — 2026-10-11

This record contains sanitized results only. No provider key, session token, bridge token, or Telegram token is stored here.

## Environment

- Target: Guangzhou CVM through the existing EasyTier SSH alias `gz-cvm`.
- `ssh -G gz-cvm` resolved to `10.144.144.8`; the target confirmed that address on its `tun0` interface.
- Service: `openpet-backend-host.service`, running as `openpet`.
- Node: `v24.11.1` at `/opt/openpet/node`.
- Listener: only `127.0.0.1:48330` while idle; child and reverse bridge ports close with the session.
- Installed host source SHA-256: `3af6d6e1fa4b322d9758304f57050fe008e4e7ff7959aed764ef9a43e1deb21e`.
- Installed archive SHA-256: `97991ab8505820e6f3e9ea0dd61a928b916cec544860cb7c2bb373644ec3ef1d`.

## Results

- systemd state: `active`.
- Idle `GET /__openpet/health`: HTTP 200, `status=idle`, API `v1`.
- SSH `-L`/`-R` session startup over `ssh gz-cvm`: succeeded.
- Authenticated `GET /api/v1/health`: HTTP 200, `ok=true`, API `v1`.
- Unauthenticated `GET /api/v1/health`: HTTP 401.
- Reverse bridge: a read-only Plugin secret-state request crossed the `-R` bridge and received a correlated in-memory test-handler reply. The handler returned only a boolean fixture; this did not inspect or change a Telegram token.
- After session close, the host returned to idle and only `127.0.0.1:48330` remained listening.
- No model generation, Electron launch, workstation UI acceptance, or public port/DNS/security-group change was performed.

## Rollback

Stop the unit, restore files from `/var/backups/openpet/20261010T212121Z`, run `systemctl daemon-reload`, and restart `openpet-backend-host.service`. The installer creates a new snapshot before each later deployment.
